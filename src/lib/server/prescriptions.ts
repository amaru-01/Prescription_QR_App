import {
  FieldPath,
  FieldValue,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import { MAX_LIST_LIMIT } from "@/lib/schemas";
import type { DashboardStats } from "@/lib/stats";
import { BackendError } from "./errors";
import { getDb } from "./firebase";
import type {
  HealthResponse,
  Prescription,
  PrescriptionInput,
  PrescriptionStatus,
  PrescriptionUpdate,
  PrescriptionVerification,
  RxCheck,
} from "@/types/prescription";
import { logger } from "./logger";
import { getCronStatus, readReminder, stageReminderDelete, stageReminderStatusChange } from "./reminders";
import { MAX_PIN_ATTEMPTS, pinMatches } from "./rx-pin";
import { securityEvent } from "./security-log";
import { RX_RECORD_RETENTION_SECONDS, type RxPayload } from "./rx-signing";

export { MAX_LIST_LIMIT };

/** Firestore gRPC status code for a missing document. */
const NOT_FOUND_CODE = 5;

/**
 * Prescriptions are stored per user at `users/{uid}/prescriptions/{id}`, so
 * every query is scoped to its owner by path and one user can never reach
 * another user's records by guessing an id.
 */
function userPrescriptions(uid: string) {
  if (!uid) throw new BackendError("Please log in to continue.", 401);
  return getDb().collection("users").doc(uid).collection("prescriptions");
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date; _seconds?: number };
  if (typeof timestamp.toDate === "function") return timestamp.toDate().toISOString();
  if (typeof timestamp._seconds === "number") return new Date(timestamp._seconds * 1000).toISOString();
  return null;
}

export function toPrescription(id: string, data: DocumentData | undefined): Prescription {
  return {
    id,
    med: data?.med || "",
    dose: data?.dose || "",
    duration: data?.duration || "",
    createdAt: toIso(data?.created_at),
    status: (data?.status || "active") as PrescriptionStatus,
    source: (data?.source || "scan") as Prescription["source"],
    notes: data?.notes || null,
    verification: toVerification(data?.verification),
  };
}

function toVerification(value: unknown): PrescriptionVerification | null {
  const v = value as { rx_id?: unknown; prescriber_name?: unknown; issued_at?: unknown } | undefined;
  if (!v || typeof v.rx_id !== "string") return null;
  return {
    rxId: v.rx_id,
    prescriberName: typeof v.prescriber_name === "string" ? v.prescriber_name : "Prescriber",
    issuedAt: toIso(v.issued_at) ?? "",
  };
}

/** How long a health check waits for Firestore before calling it unreachable. */
const HEALTH_TIMEOUT_MS = 2_000;

/** Reject if `work` takes longer than `ms`, without leaving the timer running. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Health status. `ok` means Firestore actually answered a read within a couple
 * of seconds (not merely that the client could be constructed); it exposes no
 * configuration details. With `includeCron`, also reports whether the reminder
 * scheduler has run recently, which is kept out of `ok` so a stalled scheduler
 * never shows users "connection unavailable".
 */
export async function getHealth({ includeCron = false } = {}): Promise<HealthResponse> {
  const timestamp = new Date().toISOString();
  try {
    const db = getDb();
    await withTimeout(db.collection("_health").doc("ping").get(), HEALTH_TIMEOUT_MS);
    const healthy: HealthResponse = { ok: true, status: "healthy", firebase: "connected", timestamp, storage: "firebase" };
    if (includeCron) healthy.reminders = await withTimeout(getCronStatus(), HEALTH_TIMEOUT_MS);
    return healthy;
  } catch (error) {
    logger.warn("Health check failed", { error });
    return { ok: false, status: "unhealthy", firebase: "disconnected", timestamp, storage: "firebase" };
  }
}

export interface PrescriptionPage {
  prescriptions: Prescription[];
  /** Pass back as `cursor` to fetch the next page; null when there are no more. */
  nextCursor: string | null;
}

/**
 * One page of the user's prescriptions, newest first. `cursor` is the id of
 * the last record of the previous page; anchoring on the document (not its
 * timestamp) keeps paging stable when two records share a timestamp.
 */
export async function listPrescriptionPage(
  uid: string,
  { limit = 100, cursor }: { limit?: number; cursor?: string } = {}
): Promise<PrescriptionPage> {
  const collection = userPrescriptions(uid);
  const pageSize = Math.min(Math.max(1, limit), MAX_LIST_LIMIT);

  let query = collection.orderBy("created_at", "desc");
  if (cursor) {
    const anchor = await collection.doc(cursor).get();
    if (!anchor.exists) throw new BackendError("That page is no longer available. Refresh to start again.", 400);
    query = query.startAfter(anchor);
  }

  // Fetch one extra record to learn whether another page exists.
  const snapshot = await query.limit(pageSize + 1).get();
  const docs = snapshot.docs.slice(0, pageSize);

  return {
    prescriptions: docs.map((doc) => toPrescription(doc.id, doc.data())),
    nextCursor: snapshot.docs.length > pageSize ? docs[docs.length - 1].id : null,
  };
}

/**
 * List the user's most recent prescriptions, newest first.
 */
export async function listPrescriptions(uid: string, limit = 100): Promise<Prescription[]> {
  return (await listPrescriptionPage(uid, { limit })).prescriptions;
}

/** Per-user dashboard totals are cached briefly: the home page asks for them on every visit. */
const STATS_TTL_MS = 30_000;
const statsCache = new Map<string, { at: number; stats: DashboardStats }>();

/** Drop a user's cached totals after their records change on this instance. */
export function invalidateStatsCache(uid: string): void {
  statsCache.delete(uid);
}

/** Cap on how many records are scanned to count distinct medications. */
const UNIQUE_MEDS_SCAN_LIMIT = 10_000;
const SCAN_PAGE_SIZE = 1_000;

/** Distinct medication names across all of a user's records, reading only the `med` field. */
async function countUniqueMeds(collection: CollectionReference): Promise<number> {
  const names = new Set<string>();
  let last: QueryDocumentSnapshot | undefined;
  for (let scanned = 0; scanned < UNIQUE_MEDS_SCAN_LIMIT; ) {
    let query = collection.select("med").orderBy(FieldPath.documentId()).limit(SCAN_PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    for (const doc of page.docs) {
      const name = String(doc.get("med") ?? "").trim().toLowerCase();
      if (name) names.add(name);
    }
    scanned += page.size;
    if (page.size < SCAN_PAGE_SIZE) break;
    last = page.docs[page.docs.length - 1];
  }
  return names.size;
}

/**
 * Dashboard totals for all of the user's records. Counts use Firestore
 * aggregations (one read per 1,000 records); distinct medications need a scan
 * of the `med` field because Firestore cannot count distinct values.
 */
export async function getPrescriptionStats(uid: string): Promise<DashboardStats> {
  const cached = statsCache.get(uid);
  if (cached && Date.now() - cached.at < STATS_TTL_MS) return cached.stats;

  const collection = userPrescriptions(uid);
  const weekAgo = Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = async (query: Query) => (await query.count().get()).data().count;

  const [total, active, completed, archived, thisWeek, uniqueMeds] = await Promise.all([
    count(collection),
    count(collection.where("status", "==", "active")),
    count(collection.where("status", "==", "completed")),
    count(collection.where("status", "==", "archived")),
    count(collection.where("created_at", ">=", weekAgo)),
    countUniqueMeds(collection),
  ]);

  const stats = { total, active, completed, archived, thisWeek, uniqueMeds };
  statsCache.set(uid, { at: Date.now(), stats });
  return stats;
}

/**
 * Save a prescription for the user.
 *
 * With `rx` (a signed QR payload the route has already verified and matched
 * against the reviewed fields) the save also claims the prescription, in one
 * transaction: the first account to save it gets a verified record; the same
 * account saving it again gets a 409; anyone else's copy is stored unverified.
 *
 * The transaction also enforces what the signature cannot know: the prescriber
 * may have revoked the code, it may be locked after too many wrong PINs, and a
 * PIN-protected code needs the right `pin`. A wrong PIN is counted (even though
 * nothing is saved) and the save is refused so the patient can try again.
 */
export async function savePrescription(
  uid: string,
  input: PrescriptionInput,
  options?: {
    source?: Prescription["source"];
    notes?: string | null;
    rx?: RxPayload;
    /** The one-time PIN, for codes the prescriber protected with one. */
    pin?: string;
  }
): Promise<{ documentId: string; prescription: Prescription; rx: RxCheck }> {
  const db = getDb();
  const docRef = userPrescriptions(uid).doc();
  const rx = options?.rx;

  const base = {
    med: input.med,
    dose: input.dose,
    duration: input.duration,
    status: "active" as PrescriptionStatus,
    source: options?.source || "scan",
    notes: options?.notes || null,
    created_at: FieldValue.serverTimestamp(),
  };

  // A refusal is returned, not thrown, so the failed-PIN counter still commits.
  type Outcome = { check: RxCheck } | { refuse: BackendError; event?: "pin_failed" | "pin_locked" };
  const outcome = await db.runTransaction(async (tx): Promise<Outcome> => {
    if (!rx) {
      tx.set(docRef, { ...base, verification: null });
      return { check: { status: "none" } };
    }

    const claimRef = db.collection("rx_claims").doc(rx.jti);
    const issuedRef = db.collection("users").doc(rx.iss).collection("issued").doc(rx.jti);
    const [claim, issued] = await Promise.all([tx.get(claimRef), tx.get(issuedRef)]);

    const saveUnverified = (reason: "claimed" | "revoked" | "locked"): Outcome => {
      tx.set(docRef, { ...base, verification: null });
      return { check: { status: "invalid", reason } };
    };

    if (claim.exists) {
      if (claim.get("uid") === uid) {
        throw new BackendError("You've already saved this prescription.", 409);
      }
      return saveUnverified("claimed");
    }
    // No issued record means the prescriber's account (and codes) were deleted: treat as withdrawn.
    if (!issued.exists || issued.get("revoked_at")) return saveUnverified("revoked");
    if (issued.get("locked_at")) return saveUnverified("locked");

    if (rx.pin) {
      const pin = options?.pin;
      if (!pin) {
        return { refuse: new BackendError("Enter the 6-digit PIN your prescriber gave you to save this prescription.", 422) };
      }
      if (!pinMatches(rx.jti, pin, issued.get("pin_hash"))) {
        const attempts = Number(issued.get("pin_attempts") ?? 0) + 1;
        const locked = attempts >= MAX_PIN_ATTEMPTS;
        tx.update(issuedRef, { pin_attempts: attempts, ...(locked ? { locked_at: FieldValue.serverTimestamp() } : {}) });
        const left = MAX_PIN_ATTEMPTS - attempts;
        return {
          event: locked ? "pin_locked" : "pin_failed",
          refuse: locked
            ? new BackendError("Too many wrong PINs. This code is now locked; ask your prescriber for a new one.", 403)
            : new BackendError(`That PIN doesn't match. ${left} ${left === 1 ? "attempt" : "attempts"} left.`, 403),
        };
      }
    }

    const issuedAt = Timestamp.fromMillis(rx.iat * 1000);
    tx.create(claimRef, {
      uid,
      prescription_id: docRef.id,
      prescriber_uid: rx.iss,
      purge_at: Timestamp.fromMillis((rx.exp + RX_RECORD_RETENTION_SECONDS) * 1000),
      claimed_at: FieldValue.serverTimestamp(),
    });
    tx.set(issuedRef, { claimed_at: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(docRef, {
      ...base,
      verification: { rx_id: rx.jti, prescriber_uid: rx.iss, prescriber_name: rx.isn, issued_at: issuedAt },
    });
    return {
      check: {
        status: "verified",
        prescriberName: rx.isn,
        issuedAt: issuedAt.toDate().toISOString(),
        matches: true,
        pinRequired: Boolean(rx.pin),
      },
    };
  });

  if ("refuse" in outcome) {
    if (outcome.event) securityEvent(outcome.event, { rxId: rx?.jti });
    throw outcome.refuse;
  }
  const rxCheck = outcome.check;
  if (rx && rxCheck.status === "invalid") securityEvent("claim_conflict", { rxId: rx.jti, reason: rxCheck.reason });

  invalidateStatsCache(uid);
  return {
    documentId: docRef.id,
    rx: rxCheck,
    prescription: {
      id: docRef.id,
      med: base.med,
      dose: base.dose,
      duration: base.duration,
      createdAt: new Date().toISOString(),
      status: base.status,
      source: base.source,
      notes: base.notes,
      verification:
        rxCheck.status === "verified" && rx
          ? { rxId: rx.jti, prescriberName: rx.isn, issuedAt: rxCheck.issuedAt }
          : null,
    },
  };
}

/**
 * Get one of the user's prescriptions by ID.
 */
export async function getPrescriptionById(uid: string, id: string): Promise<Prescription> {
  const doc = await userPrescriptions(uid).doc(id).get();

  if (!doc.exists) {
    throw new BackendError("Prescription not found.", 404);
  }

  return toPrescription(doc.id, doc.data());
}

/**
 * Update the supported editable prescription fields. A status change updates
 * the prescription's reminder in the same transaction.
 */
export async function updatePrescription(uid: string, id: string, updates: PrescriptionUpdate): Promise<void> {
  const ref = userPrescriptions(uid).doc(id);
  try {
    await getDb().runTransaction(async (tx) => {
      const reminder = updates.status ? await readReminder(tx, uid, id) : null;
      tx.update(ref, { ...updates, updated_at: FieldValue.serverTimestamp() });
      if (reminder && updates.status) stageReminderStatusChange(tx, uid, id, reminder, updates.status);
    });
    invalidateStatsCache(uid);
  } catch (error) {
    if ((error as { code?: unknown })?.code === NOT_FOUND_CODE) {
      throw new BackendError("Prescription not found.", 404);
    }
    throw error;
  }
}

/**
 * Delete one of the user's prescriptions, and its reminder, atomically.
 */
export async function deletePrescription(uid: string, id: string): Promise<void> {
  const ref = userPrescriptions(uid).doc(id);
  await getDb().runTransaction(async (tx) => {
    if (!(await tx.get(ref)).exists) throw new BackendError("Prescription not found.", 404);
    tx.delete(ref);
    stageReminderDelete(tx, uid, id);
  });
  invalidateStatsCache(uid);
}

/**
 * Quote a CSV field per RFC 4180 and neutralise spreadsheet formulas, so a
 * crafted QR payload like `=HYPERLINK(...)` is shown as text, not executed.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const CSV_HEADERS = ["ID", "Medication", "Dosage", "Duration", "Status", "Source", "Notes", "Created At"];

const csvRow = (p: Prescription): string =>
  [p.id, p.med, p.dose, p.duration, p.status, p.source, p.notes || "", p.createdAt || ""].map(csvField).join(",");

/** Render prescriptions as a CSV document (CRLF line endings, header row first). */
export function toCsv(prescriptions: Prescription[]): string {
  return [CSV_HEADERS.map(csvField).join(","), ...prescriptions.map(csvRow)].join("\r\n");
}

/** Most records one export will contain; a note row says so when it is reached. */
export const EXPORT_ROW_LIMIT = 20_000;
const EXPORT_PAGE_SIZE = 200;

/** Walk every prescription of a user, newest first, one page at a time. */
async function* eachPrescription(uid: string, limit: number): AsyncGenerator<Prescription> {
  const collection = userPrescriptions(uid);
  let last: QueryDocumentSnapshot | undefined;
  let yielded = 0;
  while (yielded < limit) {
    let query = collection.orderBy("created_at", "desc").limit(Math.min(EXPORT_PAGE_SIZE, limit - yielded));
    if (last) query = query.startAfter(last);
    const page = await query.get();
    for (const doc of page.docs) {
      yield toPrescription(doc.id, doc.data());
      yielded += 1;
    }
    if (page.size < EXPORT_PAGE_SIZE) return;
    last = page.docs[page.docs.length - 1];
  }
}

/**
 * Export all of the user's prescriptions as a CSV stream, so large histories
 * are never held in memory at once. Capped at EXPORT_ROW_LIMIT records; when
 * the cap is hit a final note row says the export is incomplete.
 */
export function exportPrescriptionsStream(uid: string, limit = EXPORT_ROW_LIMIT): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const records = eachPrescription(uid, limit + 1); // one extra tells us whether we hit the cap
  let rows = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(CSV_HEADERS.map(csvField).join(",")));
    },
    async pull(controller) {
      try {
        const next = await records.next();
        if (next.done) return controller.close();
        if (rows >= limit) {
          controller.enqueue(
            encoder.encode(`\r\n${csvField(`Export limited to the newest ${limit} records.`)}`)
          );
          await records.return(undefined);
          return controller.close();
        }
        rows += 1;
        controller.enqueue(encoder.encode(`\r\n${csvRow(next.value)}`));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await records.return(undefined);
    },
  });
}

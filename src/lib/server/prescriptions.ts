import admin from "firebase-admin";

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
} from "@/types/prescription";

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

export function toPrescription(id: string, data: admin.firestore.DocumentData | undefined): Prescription {
  return {
    id,
    med: data?.med || "",
    dose: data?.dose || "",
    duration: data?.duration || "",
    createdAt: toIso(data?.created_at),
    status: (data?.status || "active") as PrescriptionStatus,
    source: (data?.source || "scan") as Prescription["source"],
    notes: data?.notes || null,
  };
}

/**
 * Health status. Reports whether the Admin SDK could be initialised; it does
 * not expose any configuration details.
 */
export async function getHealth(): Promise<HealthResponse> {
  const timestamp = new Date().toISOString();
  try {
    getDb();
    return { ok: true, status: "healthy", firebase: "connected", timestamp, storage: "firebase" };
  } catch {
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

/**
 * Dashboard totals for all of the user's records, using Firestore count
 * aggregations (billed at one read per 1,000 records) instead of loading them.
 */
export async function getPrescriptionStats(uid: string): Promise<DashboardStats> {
  const collection = userPrescriptions(uid);
  const weekAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = async (query: admin.firestore.Query) => (await query.count().get()).data().count;

  const [total, active, completed, archived, thisWeek, meds] = await Promise.all([
    count(collection),
    count(collection.where("status", "==", "active")),
    count(collection.where("status", "==", "completed")),
    count(collection.where("status", "==", "archived")),
    count(collection.where("created_at", ">=", weekAgo)),
    // Firestore cannot count distinct values; read only the `med` field.
    collection.select("med").limit(MAX_LIST_LIMIT).get(),
  ]);

  const uniqueMeds = new Set(
    meds.docs.map((doc) => String(doc.get("med") ?? "").trim().toLowerCase()).filter(Boolean)
  ).size;

  return { total, active, completed, archived, thisWeek, uniqueMeds };
}

/**
 * Save a prescription for the user.
 */
export async function savePrescription(
  uid: string,
  input: PrescriptionInput,
  options?: {
    source?: Prescription["source"];
    notes?: string | null;
  }
): Promise<{ documentId: string; prescription: Prescription }> {
  const prescriptionData = {
    med: input.med,
    dose: input.dose,
    duration: input.duration,
    status: "active" as PrescriptionStatus,
    source: options?.source || "scan",
    notes: options?.notes || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await userPrescriptions(uid).add(prescriptionData);

  return {
    documentId: docRef.id,
    prescription: {
      id: docRef.id,
      med: prescriptionData.med,
      dose: prescriptionData.dose,
      duration: prescriptionData.duration,
      createdAt: new Date().toISOString(),
      status: prescriptionData.status,
      source: prescriptionData.source,
      notes: prescriptionData.notes,
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

/** Update the supported editable prescription fields. */
export async function updatePrescription(uid: string, id: string, updates: PrescriptionUpdate): Promise<void> {
  try {
    await userPrescriptions(uid).doc(id).update({
      ...updates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === NOT_FOUND_CODE) {
      throw new BackendError("Prescription not found.", 404);
    }
    throw error;
  }
}

/**
 * Delete one of the user's prescriptions.
 */
export async function deletePrescription(uid: string, id: string): Promise<void> {
  const ref = userPrescriptions(uid).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new BackendError("Prescription not found.", 404);
  }
  await ref.delete();
}

/**
 * Quote a CSV field per RFC 4180 and neutralise spreadsheet formulas, so a
 * crafted QR payload like `=HYPERLINK(...)` is shown as text, not executed.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Render prescriptions as a CSV document (CRLF line endings, header row first). */
export function toCsv(prescriptions: Prescription[]): string {
  const headers = ["ID", "Medication", "Dosage", "Duration", "Status", "Source", "Notes", "Created At"];
  const rows = prescriptions.map((p) => [
    p.id,
    p.med,
    p.dose,
    p.duration,
    p.status,
    p.source,
    p.notes || "",
    p.createdAt || "",
  ]);

  return [headers, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}

/**
 * Export the user's prescriptions as CSV.
 */
export async function exportPrescriptions(uid: string): Promise<string> {
  return toCsv(await listPrescriptions(uid, MAX_LIST_LIMIT));
}

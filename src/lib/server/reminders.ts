import crypto from "node:crypto";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";

import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS } from "@/lib/push-hosts";
import { isValidTime, isValidTimeZone, localDayKey, nextOccurrence } from "@/lib/schedule";
import type { PrescriptionStatus } from "@/types/prescription";
import { BackendError } from "./errors";
import { getDb } from "./firebase";
import { logger } from "./logger";

/**
 * Server-side reminders, one document per prescription:
 *
 *   users/{uid}/reminders/{prescriptionId}
 *     time "HH:MM", timezone (IANA), notify (push on/off),
 *     taken_days ["YYYY-MM-DD", ...], next_due_at (Timestamp | null)
 *
 * `next_due_at` is only set while notifications are on and the prescription
 * is active, so the cron query (a collection-group range on next_due_at)
 * never sees anything else.
 */

export const DEFAULT_REMINDER_TIME = "08:00";
/** Dose history kept per prescription. */
export const MAX_TAKEN_DAYS = 120;
/** Reminders more overdue than this (e.g. after an outage) are skipped, not sent late. */
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReminderState {
  time: string;
  timezone: string;
  notify: boolean;
  takenDays: string[];
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const userDoc = (uid: string) => getDb().collection("users").doc(uid);
const reminderRef = (uid: string, prescriptionId: string) =>
  userDoc(uid).collection("reminders").doc(prescriptionId);
const subscriptionsOf = (uid: string) => userDoc(uid).collection("push_subscriptions");
const subscriptionId = (endpoint: string) => crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 40);

function toState(data: DocumentData | undefined): ReminderState {
  return {
    time: isValidTime(data?.time) ? data!.time : DEFAULT_REMINDER_TIME,
    timezone: typeof data?.timezone === "string" && isValidTimeZone(data.timezone) ? data.timezone : "UTC",
    notify: Boolean(data?.notify),
    takenDays: Array.isArray(data?.taken_days) ? data!.taken_days.filter((d: unknown) => typeof d === "string") : [],
  };
}

function nextDueAt(state: Pick<ReminderState, "time" | "timezone" | "notify">, active: boolean, now = new Date()) {
  if (!state.notify || !active) return null;
  return Timestamp.fromDate(nextOccurrence(state.time, state.timezone, now));
}

async function requirePrescription(uid: string, prescriptionId: string): Promise<{ active: boolean }> {
  const doc = await userDoc(uid).collection("prescriptions").doc(prescriptionId).get();
  if (!doc.exists) throw new BackendError("Prescription not found.", 404);
  return { active: (doc.get("status") ?? "active") === "active" };
}

export async function listReminders(uid: string): Promise<Record<string, ReminderState>> {
  const snapshot = await userDoc(uid).collection("reminders").get();
  return Object.fromEntries(snapshot.docs.map((doc) => [doc.id, toState(doc.data())]));
}

/** Create or change a reminder's time, timezone and notification switch. */
export async function updateReminder(
  uid: string,
  prescriptionId: string,
  changes: { time?: string; timezone: string; notify?: boolean }
): Promise<ReminderState> {
  const { active } = await requirePrescription(uid, prescriptionId);
  const ref = reminderRef(uid, prescriptionId);

  return getDb().runTransaction(async (tx) => {
    const current = toState((await tx.get(ref)).data());
    const next: ReminderState = {
      ...current,
      time: changes.time ?? current.time,
      timezone: changes.timezone,
      notify: changes.notify ?? current.notify,
    };
    tx.set(
      ref,
      {
        time: next.time,
        timezone: next.timezone,
        notify: next.notify,
        taken_days: next.takenDays,
        next_due_at: nextDueAt(next, active),
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return next;
  });
}

/** Days a dose may be logged for: up to 30 days back, and "today" in any timezone. */
function assertLoggableDay(day: string, now = new Date()): void {
  if (!DAY_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new BackendError("Day must be a date in YYYY-MM-DD format.", 422);
  }
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const earliest = now.getTime() - 31 * 24 * 60 * 60 * 1000;
  const latest = now.getTime() + 24 * 60 * 60 * 1000;
  if (dayStart < earliest || dayStart > latest) {
    throw new BackendError("Doses can only be logged for the last 30 days.", 422);
  }
}

export async function setDoseTaken(
  uid: string,
  prescriptionId: string,
  day: string,
  taken: boolean
): Promise<ReminderState> {
  assertLoggableDay(day);
  await requirePrescription(uid, prescriptionId);
  const ref = reminderRef(uid, prescriptionId);

  return getDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = toState(snapshot.data());
    const days = new Set(current.takenDays);
    if (taken) days.add(day);
    else days.delete(day);
    const takenDays = [...days].sort().slice(-MAX_TAKEN_DAYS);

    tx.set(
      ref,
      snapshot.exists
        ? { taken_days: takenDays, updated_at: FieldValue.serverTimestamp() }
        : {
            time: current.time,
            timezone: current.timezone,
            notify: false,
            taken_days: takenDays,
            next_due_at: null,
            updated_at: FieldValue.serverTimestamp(),
          },
      { merge: true }
    );
    return { ...current, takenDays };
  });
}

/**
 * One-time import of reminders kept in the browser before they moved to the
 * server. Only fills prescriptions that have no server reminder yet, and
 * only for prescriptions the user actually owns.
 */
export async function importReminders(
  uid: string,
  entries: Record<string, { time: string; log: string[] }>,
  timezone: string
): Promise<number> {
  const db = getDb();
  const ids = Object.keys(entries).slice(0, 200);
  if (ids.length === 0) return 0;

  const [prescriptions, existing] = await Promise.all([
    db.getAll(...ids.map((id) => userDoc(uid).collection("prescriptions").doc(id))),
    db.getAll(...ids.map((id) => reminderRef(uid, id))),
  ]);

  const batch = db.batch();
  let imported = 0;
  ids.forEach((id, index) => {
    if (!prescriptions[index].exists || existing[index].exists) return;
    const entry = entries[id];
    batch.set(reminderRef(uid, id), {
      time: isValidTime(entry.time) ? entry.time : DEFAULT_REMINDER_TIME,
      timezone,
      notify: false,
      taken_days: entry.log.filter((day) => DAY_RE.test(day)).sort().slice(-MAX_TAKEN_DAYS),
      next_due_at: null,
      updated_at: FieldValue.serverTimestamp(),
    });
    imported += 1;
  });
  if (imported > 0) await batch.commit();
  return imported;
}

/**
 * Keep reminders in step with the prescription lifecycle. These helpers take
 * part in the caller's transaction, so a prescription and its reminder always
 * change together (never an archived prescription with a live reminder).
 *
 * Firestore requires every read in a transaction before any write, so call
 * `readReminder` first, then the `stage...` functions.
 */
export const readReminder = (tx: Transaction, uid: string, prescriptionId: string) =>
  tx.get(reminderRef(uid, prescriptionId));

export function stageReminderStatusChange(
  tx: Transaction,
  uid: string,
  prescriptionId: string,
  reminder: DocumentSnapshot,
  status: PrescriptionStatus
): void {
  if (!reminder.exists) return;
  tx.update(reminderRef(uid, prescriptionId), { next_due_at: nextDueAt(toState(reminder.data()), status === "active") });
}

export function stageReminderDelete(tx: Transaction, uid: string, prescriptionId: string): void {
  tx.delete(reminderRef(uid, prescriptionId));
}

/**
 * Register (or refresh) a browser's push subscription. An account keeps at
 * most MAX_PUSH_SUBSCRIPTIONS; registering another evicts the oldest ones, so
 * one account cannot multiply the cron's outgoing requests.
 */
export async function savePushSubscription(uid: string, subscription: PushSubscriptionInput): Promise<void> {
  const collection = subscriptionsOf(uid);
  const id = subscriptionId(subscription.endpoint);
  const db = getDb();

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(collection.orderBy("created_at", "asc"));
    const others = existing.docs.filter((doc) => doc.id !== id);
    const overflow = others.length - (MAX_PUSH_SUBSCRIPTIONS - 1);
    for (const doc of others.slice(0, Math.max(0, overflow))) tx.delete(doc.ref);

    tx.set(collection.doc(id), {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      created_at: FieldValue.serverTimestamp(),
    });
  });
}

export async function deletePushSubscription(uid: string, endpoint: string): Promise<void> {
  await subscriptionsOf(uid).doc(subscriptionId(endpoint)).delete();
}

export async function hasPushSubscription(uid: string): Promise<boolean> {
  return !(await subscriptionsOf(uid).limit(1).get()).empty;
}

/** Push delivery, injected so the cron logic can be tested without a push service. */
export type PushSender = (
  subscription: PushSubscriptionInput,
  payload: string
) => Promise<"sent" | "gone" | "failed">;

export interface CronResult {
  /** Due reminders picked up in this run. */
  due: number;
  /** Reminders delivered to at least one device. */
  sent: number;
  /** Individual device notifications delivered (a reminder can reach several). */
  sentSubscriptions: number;
  /** Not sent: stale, already taken, inactive, no devices, or claimed by another run. */
  skipped: number;
  /** Delivery failed on every device and no retry is left. */
  failed: number;
  /** Delivery failed on every device; scheduled to try again shortly. */
  retried: number;
}

/** Reminders loaded per Firestore query. */
const PAGE_SIZE = 200;
/** Reminders processed in parallel. */
const CONCURRENCY = 15;
/** Stop starting new pages after this long, leaving headroom under the route's 60 s limit. */
const TIME_BUDGET_MS = 45_000;
/** A reminder whose every push failed is retried this much later... */
export const RETRY_DELAY_MS = 5 * 60 * 1000;
/** ...up to this many times, and never past the staleness window. */
export const MAX_RETRIES = 2;

/** Run `fn` over `items` with at most `limit` in flight. `fn` must not throw. */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Send every reminder that is due. Each reminder is advanced to its next
 * occurrence *before* sending, with a precondition on the document's update
 * time, so overlapping cron runs never notify the same dose twice.
 *
 * Because processed reminders move into the future, simply re-running the
 * same query yields the next page, so a backlog is drained in one invocation
 * (until the time budget ends) instead of waiting for later runs.
 *
 * If a notification fails on every device (network error, push service 5xx),
 * the reminder is rescheduled RETRY_DELAY_MS later, at most MAX_RETRIES times
 * and never beyond the staleness window, instead of silently losing the dose.
 */
export async function runDueReminders(
  send: PushSender,
  now = new Date(),
  { budgetMs = TIME_BUDGET_MS }: { budgetMs?: number } = {}
): Promise<CronResult> {
  const db = getDb();
  const startedAt = Date.now();
  const result: CronResult = { due: 0, sent: 0, sentSubscriptions: 0, skipped: 0, failed: 0, retried: 0 };
  const seen = new Set<string>();
  const subscriptionCache = new Map<string, Promise<QueryDocumentSnapshot[]>>();
  const devicesOf = (uid: string) => {
    let cached = subscriptionCache.get(uid);
    if (!cached) {
      cached = subscriptionsOf(uid)
        .get()
        .then((snapshot) => snapshot.docs);
      subscriptionCache.set(uid, cached);
    }
    return cached;
  };

  while (Date.now() - startedAt < budgetMs) {
    const page = await db
      .collectionGroup("reminders")
      .where("next_due_at", "<=", Timestamp.fromDate(now))
      .limit(PAGE_SIZE)
      .get();

    // A reminder we could not advance would otherwise be fetched forever.
    const fresh = page.docs.filter((doc) => !seen.has(reminderKey(doc)));
    if (fresh.length === 0) break;
    for (const doc of fresh) seen.add(reminderKey(doc));
    result.due += fresh.length;

    // One batched read for every prescription's status instead of one round trip each.
    const prescriptionRefs = fresh.map((doc) => {
      const uid = doc.ref.parent.parent?.id;
      return uid ? userDoc(uid).collection("prescriptions").doc(doc.id) : null;
    });
    const wanted = prescriptionRefs.filter((ref): ref is NonNullable<typeof ref> => ref !== null);
    const loaded = wanted.length > 0 ? await db.getAll(...wanted) : [];
    const prescriptionByPath = new Map(loaded.map((snapshot) => [snapshot.ref.path, snapshot]));

    await mapPool(
      fresh.map((doc, index) => ({ doc, ref: prescriptionRefs[index] })),
      CONCURRENCY,
      async ({ doc, ref }) => {
        const uid = doc.ref.parent.parent?.id;
        if (!uid || !ref) return;
        try {
          await processReminder(doc, uid, prescriptionByPath.get(ref.path), now, send, devicesOf, result);
        } catch (error) {
          result.skipped += 1;
          logger.error("Reminder processing failed", { reminderId: doc.id, error });
        }
      }
    );
  }

  if (result.due > 0) logger.info("Reminder cron finished", { ...result });
  return result;
}

const reminderKey = (doc: QueryDocumentSnapshot) => `${doc.ref.parent.parent?.id}/${doc.id}`;

async function processReminder(
  doc: QueryDocumentSnapshot,
  uid: string,
  prescription: DocumentSnapshot | undefined,
  now: Date,
  send: PushSender,
  devicesOf: (uid: string) => Promise<QueryDocumentSnapshot[]>,
  result: CronResult
): Promise<void> {
  const state = toState(doc.data());
  // On a retry, `next_due_at` is the retry time; the dose's real due time is kept in `retry_origin`.
  const origin = ((doc.get("retry_origin") ?? doc.get("next_due_at")) as Timestamp).toDate();
  const attempts = Number(doc.get("attempts") ?? 0);
  const active = Boolean(prescription?.exists) && (prescription?.get("status") ?? "active") === "active";

  let advanced;
  try {
    advanced = await doc.ref.update(
      {
        next_due_at: nextDueAt(state, active, now),
        retry_origin: FieldValue.delete(),
        attempts: FieldValue.delete(),
      },
      { lastUpdateTime: doc.updateTime }
    );
  } catch {
    result.skipped += 1; // Another run claimed this reminder first.
    return;
  }

  const stale = now.getTime() - origin.getTime() > STALE_AFTER_MS;
  const alreadyTaken = state.takenDays.includes(localDayKey(origin, state.timezone));
  if (!active || stale || alreadyTaken) {
    result.skipped += 1;
    return;
  }

  // Deliberately generic: lock screens are visible to others, so no medication names.
  const payload = JSON.stringify({
    title: "VeriDose reminder",
    body: `It's time for your ${state.time} dose. Tap to check in.`,
    url: "/reminders",
    tag: `reminder-${doc.id}`,
  });

  let delivered = 0;
  let failures = 0;
  for (const sub of await devicesOf(uid)) {
    // Rows saved before the host allowlist existed: never send to them, and clean them up.
    if (!isAllowedPushEndpoint(String(sub.get("endpoint") ?? ""))) {
      await sub.ref.delete();
      continue;
    }
    const outcome = await send({ endpoint: sub.get("endpoint"), keys: sub.get("keys") }, payload);
    if (outcome === "sent") delivered += 1;
    else if (outcome === "gone") await sub.ref.delete();
    else failures += 1;
  }

  if (delivered > 0) {
    result.sent += 1;
    result.sentSubscriptions += delivered;
    return;
  }
  if (failures === 0) {
    result.skipped += 1; // No devices to notify.
    return;
  }

  // Every delivery failed: try again soon, unless out of retries or the dose would be stale by then.
  const retryAt = new Date(now.getTime() + RETRY_DELAY_MS);
  if (attempts >= MAX_RETRIES || retryAt.getTime() - origin.getTime() > STALE_AFTER_MS) {
    result.failed += 1;
    logger.warn("Reminder could not be delivered", { reminderId: doc.id, attempts: attempts + 1 });
    return;
  }
  try {
    // Only if nobody (e.g. the user turning reminders off) changed it since we advanced it.
    await doc.ref.update(
      { next_due_at: Timestamp.fromDate(retryAt), retry_origin: Timestamp.fromDate(origin), attempts: attempts + 1 },
      { lastUpdateTime: advanced?.writeTime }
    );
    result.retried += 1;
  } catch {
    result.failed += 1;
  }
}

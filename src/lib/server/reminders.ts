import crypto from "node:crypto";

import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";

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

/** Keep reminders in step with the prescription lifecycle. */
export async function onPrescriptionStatusChanged(uid: string, prescriptionId: string, status: PrescriptionStatus) {
  const ref = reminderRef(uid, prescriptionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  await ref.update({ next_due_at: nextDueAt(toState(snapshot.data()), status === "active") });
}

export async function onPrescriptionDeleted(uid: string, prescriptionId: string) {
  await reminderRef(uid, prescriptionId).delete();
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
  due: number;
  sent: number;
  skipped: number;
}

/**
 * Send every reminder that is due. Each reminder is advanced to its next
 * occurrence *before* sending, with a precondition on the document's update
 * time, so overlapping cron runs never notify the same dose twice.
 */
export async function runDueReminders(send: PushSender, now = new Date()): Promise<CronResult> {
  const db = getDb();
  const due = await db
    .collectionGroup("reminders")
    .where("next_due_at", "<=", Timestamp.fromDate(now))
    .limit(500)
    .get();

  const result: CronResult = { due: due.size, sent: 0, skipped: 0 };

  for (const doc of due.docs) {
    const uid = doc.ref.parent.parent?.id;
    const state = toState(doc.data());
    const dueAt = (doc.get("next_due_at") as Timestamp).toDate();
    if (!uid) continue;

    const prescription = await userDoc(uid).collection("prescriptions").doc(doc.id).get();
    const active = prescription.exists && (prescription.get("status") ?? "active") === "active";

    try {
      await doc.ref.update({ next_due_at: nextDueAt(state, active, now) }, { lastUpdateTime: doc.updateTime });
    } catch {
      result.skipped += 1; // Another run claimed this reminder first.
      continue;
    }

    const stale = now.getTime() - dueAt.getTime() > STALE_AFTER_MS;
    const alreadyTaken = state.takenDays.includes(localDayKey(dueAt, state.timezone));
    if (!active || stale || alreadyTaken) {
      result.skipped += 1;
      continue;
    }

    // Deliberately generic: lock screens are visible to others, so no medication names.
    const payload = JSON.stringify({
      title: "VeriDose reminder",
      body: `It's time for your ${state.time} dose. Tap to check in.`,
      url: "/reminders",
      tag: `reminder-${doc.id}`,
    });

    const subscriptions = await subscriptionsOf(uid).get();
    for (const sub of subscriptions.docs) {
      // Rows saved before the host allowlist existed: never send to them, and clean them up.
      if (!isAllowedPushEndpoint(String(sub.get("endpoint") ?? ""))) {
        await sub.ref.delete();
        continue;
      }
      const outcome = await send({ endpoint: sub.get("endpoint"), keys: sub.get("keys") }, payload);
      if (outcome === "sent") result.sent += 1;
      else if (outcome === "gone") await sub.ref.delete();
    }
  }

  if (result.due > 0) logger.info("Reminder cron finished", { ...result });
  return result;
}

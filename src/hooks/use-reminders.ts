"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { remindersApi, type ReminderState } from "@/lib/api";
import { dayKey } from "@/lib/format";

export interface ReminderEntry {
  time: string;
  notify: boolean;
  /** Local day keys (YYYY-MM-DD) when a dose was marked as taken. */
  log: string[];
}

/** Where reminders lived before they moved to the account. */
const LEGACY_STORAGE_KEY = "veridose.reminders";
const DEFAULT_TIME = "08:00";

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Move reminders kept on this device into the account, once. */
async function importLegacyReminders(timezone: string): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;

  let entries: Record<string, { time: string; log: string[] }>;
  try {
    const parsed = JSON.parse(raw) as Record<string, { time?: unknown; log?: unknown }>;
    entries = Object.fromEntries(
      Object.entries(parsed ?? {}).map(([id, entry]) => [
        id,
        {
          time: typeof entry?.time === "string" ? entry.time : DEFAULT_TIME,
          log: Array.isArray(entry?.log) ? entry.log.filter((d): d is string => typeof d === "string") : [],
        },
      ]),
    );
  } catch {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY); // Unreadable: nothing worth keeping.
    return false;
  }

  try {
    await remindersApi.import(entries, timezone);
  } catch {
    return false; // Keep the local copy and retry on the next visit.
  }
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return true;
}

/** Server-backed reminder times, notification switches and dose check-ins. */
export function useReminders() {
  const [reminders, setReminders] = useState<Record<string, ReminderState>>({});
  const [push, setPush] = useState({ configured: false, subscribed: false });
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezone = useMemo(() => browserTimeZone(), []);

  const reload = useCallback(
    () =>
      remindersApi.list().then((data) => {
        setReminders(data.reminders);
        setPush(data.push);
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    importLegacyReminders(timezone)
      .then(() => reload())
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load reminders.");
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, timezone]);

  /** Apply a change locally at once, send it, and roll back if the server refuses. */
  const optimistic = useCallback(
    async (id: string, patch: (current: ReminderState) => ReminderState, send: () => Promise<ReminderState>) => {
      let previous: ReminderState | undefined;
      setReminders((all) => {
        previous = all[id];
        const current = all[id] ?? { time: DEFAULT_TIME, timezone, notify: false, takenDays: [] };
        return { ...all, [id]: patch(current) };
      });
      setError(null);
      try {
        const saved = await send();
        setReminders((all) => ({ ...all, [id]: saved }));
      } catch (cause) {
        setReminders((all) => {
          const next = { ...all };
          if (previous) next[id] = previous;
          else delete next[id];
          return next;
        });
        setError(cause instanceof Error ? cause.message : "Could not save that change.");
      }
    },
    [timezone],
  );

  const entryFor = useCallback(
    (id: string): ReminderEntry => {
      const state = reminders[id];
      return { time: state?.time ?? DEFAULT_TIME, notify: state?.notify ?? false, log: state?.takenDays ?? [] };
    },
    [reminders],
  );

  const setTime = useCallback(
    (id: string, time: string) =>
      optimistic(id, (current) => ({ ...current, time }), () => remindersApi.update(id, { time, timezone })),
    [optimistic, timezone],
  );

  const setNotify = useCallback(
    (id: string, notify: boolean) =>
      optimistic(id, (current) => ({ ...current, notify }), () => remindersApi.update(id, { notify, timezone })),
    [optimistic, timezone],
  );

  const toggleTaken = useCallback(
    (id: string, date = dayKey()) => {
      const taken = !(reminders[id]?.takenDays ?? []).includes(date);
      return optimistic(
        id,
        (current) => ({
          ...current,
          takenDays: taken ? [...current.takenDays, date] : current.takenDays.filter((day) => day !== date),
        }),
        () => remindersApi.setDose(id, date, taken),
      );
    },
    [optimistic, reminders],
  );

  return {
    reminders,
    push,
    hydrated,
    error,
    timezone,
    entryFor,
    setTime,
    setNotify,
    toggleTaken,
    refreshPushStatus: reload,
  };
}

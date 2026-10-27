"use client";

import { useCallback } from "react";

import { useLocalStorage } from "@/hooks/use-local-storage";
import { dayKey } from "@/lib/format";

export interface ReminderEntry {
  time: string;
  /** ISO day keys (YYYY-MM-DD) when a dose was marked as taken. */
  log: string[];
}

export type ReminderMap = Record<string, ReminderEntry>;

const STORAGE_KEY = "veridose.reminders";
const DEFAULT_TIME = "08:00";

export function useReminders() {
  const { value, setValue, hydrated } = useLocalStorage<ReminderMap>(STORAGE_KEY, {});

  const entryFor = useCallback(
    (id: string): ReminderEntry => value[id] ?? { time: DEFAULT_TIME, log: [] },
    [value],
  );

  const setTime = useCallback(
    (id: string, time: string) => {
      setValue((current) => ({
        ...current,
        [id]: { time, log: current[id]?.log ?? [] },
      }));
    },
    [setValue],
  );

  const toggleTaken = useCallback(
    (id: string, date = dayKey()) => {
      setValue((current) => {
        const entry = current[id] ?? { time: DEFAULT_TIME, log: [] };
        const log = entry.log.includes(date)
          ? entry.log.filter((day) => day !== date)
          : [...entry.log, date];
        return { ...current, [id]: { ...entry, log } };
      });
    },
    [setValue],
  );

  const isTaken = useCallback(
    (id: string, date = dayKey()) => entryFor(id).log.includes(date),
    [entryFor],
  );

  const takenDays = useCallback(
    (id: string, days: string[]) => {
      const entry = entryFor(id);
      return days.filter((day) => entry.log.includes(day)).length;
    },
    [entryFor],
  );

  return { reminders: value, hydrated, entryFor, setTime, toggleTaken, isTaken, takenDays };
}

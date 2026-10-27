"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * SSR-safe localStorage state. Starts from `initialValue` on the server and
 * hydrates from storage after mount, so renders never mismatch.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): { value: T; setValue: Dispatch<SetStateAction<T>>; hydrated: boolean; reset: () => void } {
  const [value, setValue] = useState<T>(initialValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration from browser storage happens once per key
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore malformed storage */
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage can be full or blocked */
    }
  }, [hydrated, key, value]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key || event.newValue === null) return;
      try {
        setValue(JSON.parse(event.newValue) as T);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const reset = useCallback(() => setValue(initialValue), [initialValue]);

  return { value, setValue, hydrated, reset };
}

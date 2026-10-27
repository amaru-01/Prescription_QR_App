"use client";

import { useCallback, useEffect, useState } from "react";

export interface LocalProfile {
  name: string;
  email: string;
  signedIn: boolean;
}

export const DEFAULT_PROFILE: LocalProfile = {
  name: "Guest tester",
  email: "",
  signedIn: false,
};

const STORAGE_KEY = "veridose.profile";
const CHANGE_EVENT = "veridose:profile-changed";

function readProfile(): LocalProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : DEFAULT_PROFILE.name,
      email: typeof parsed.email === "string" ? parsed.email : "",
      signedIn: Boolean(parsed.signedIn),
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

/** Demo profile shell — ready to be swapped for Firebase Auth later. */
export function useProfile() {
  const [profile, setProfile] = useState<LocalProfile>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage
    setProfile(readProfile());
    setHydrated(true);
    const sync = () => setProfile(readProfile());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const saveProfile = useCallback((next: LocalProfile) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setProfile(next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { profile, hydrated, saveProfile };
}

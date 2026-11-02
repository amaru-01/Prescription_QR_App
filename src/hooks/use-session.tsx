"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";

import type { SessionUser } from "@/types/auth";

const SessionContext = createContext<SessionUser | null>(null);

/** Pre-Firebase demo auth kept accounts (with password hashes) in localStorage. */
const LEGACY_KEYS = ["veridose.accounts", "veridose.profile"];

/**
 * Exposes the server-verified user to client components. The root layout
 * reads the session cookie on every request, so `router.refresh()` after
 * signing in or out is enough to update this value.
 */
export function SessionProvider({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  useEffect(() => {
    try {
      LEGACY_KEYS.forEach((key) => window.localStorage.removeItem(key));
    } catch {
      /* storage blocked */
    }
  }, []);

  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): { user: SessionUser | null; displayName: string } {
  const user = useContext(SessionContext);
  const displayName = user?.name || (user?.isAnonymous ? "Guest" : user?.email?.split("@")[0]) || "Guest";
  return { user, displayName };
}

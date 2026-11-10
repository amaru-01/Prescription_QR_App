import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { SessionUser } from "@/types/auth";
import { BackendError } from "./errors";
import { getAdminAuth } from "./firebase";

export { SESSION_COOKIE };

const isProduction = process.env.NODE_ENV === "production";

/** Session lifetime. Firebase allows between 5 minutes and 14 days. */
export const SESSION_MAX_AGE_SECONDS = 5 * 24 * 60 * 60;

/** A sign-in must be this recent to be exchanged for a session cookie. */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

/** A vouched-for name from the custom claim, or null when absent or malformed. */
function credentialNameFrom(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}

function isAuthError(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  return typeof code === "string" && code.startsWith("auth/");
}

/**
 * Verify the session cookie and load the current user record.
 *
 * Fetching the user record both returns fresh profile data and lets us honour
 * revocation (sign-out everywhere, disabled accounts), which is what
 * `verifySessionCookie(cookie, true)` would do with the same single lookup.
 * Cached per request so layouts, pages and handlers share one lookup.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const user = await auth.getUser(decoded.uid);

    if (user.disabled) return null;
    const validAfter = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
    if (decoded.auth_time * 1000 < validAfter) return null;

    return {
      uid: user.uid,
      email: user.email ?? null,
      name: user.displayName ?? null,
      emailVerified: user.emailVerified,
      isAnonymous: decoded.firebase?.sign_in_provider === "anonymous",
      // Read from the fresh user record, so role changes apply on the next request.
      role: user.customClaims?.role === "prescriber" ? "prescriber" : "patient",
      credentialName: credentialNameFrom(user.customClaims?.credentialName),
    };
  } catch (error) {
    if (isAuthError(error)) return null;
    throw error;
  }
});

/** For API routes: the current user, or a 401 error. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new BackendError("Please log in to continue.", 401);
  return user;
}

/**
 * For prescriber-only API routes: 401 when signed out, 403 for patients, guests
 * and prescribers whose email address has not been verified.
 */
export async function requirePrescriber(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "prescriber" || user.isAnonymous) {
    throw new BackendError("Only prescriber accounts can do this.", 403);
  }
  if (!user.emailVerified) {
    throw new BackendError("Verify your email address before issuing prescriptions.", 403);
  }
  return user;
}

/** For server pages: the current user, or a redirect to the login page. */
export async function requirePageUser(nextPath = "/"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/**
 * Exchange a freshly issued Firebase ID token for a session cookie value.
 * Rejects tokens from sign-ins older than a few minutes so a stolen,
 * long-lived ID token cannot be upgraded into a multi-day session.
 */
export async function createSessionCookie(idToken: string): Promise<string> {
  const auth = getAdminAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    throw new BackendError("Your sign-in could not be verified. Please try again.", 401);
  }

  if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
    throw new BackendError("Your sign-in is too old. Please log in again.", 401);
  }

  return auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_SECONDS * 1000 });
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Make a `next` redirect target safe: same-site relative paths only. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

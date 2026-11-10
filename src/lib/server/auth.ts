import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { SESSION_COOKIE } from "@/lib/session-cookie";
import type { SessionUser } from "@/types/auth";
import { BackendError } from "./errors";
import type { UserRecord } from "firebase-admin/auth";
import { getAdminAuth } from "./firebase";
import { setContextUser } from "./request-context";

export { SESSION_COOKIE };

const isProduction = process.env.NODE_ENV === "production";

/**
 * Session lifetime: SESSION_MAX_AGE_DAYS (1-14, default 5). Shorter is safer for
 * an app holding health data, since a stolen cookie stays useful for less time
 * (2 days is a reasonable choice); longer means fewer sign-ins. Firebase itself
 * allows 5 minutes to 14 days.
 */
function sessionMaxAgeSeconds(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS);
  const valid = process.env.SESSION_MAX_AGE_DAYS !== undefined && Number.isFinite(days) && days >= 1 && days <= 14;
  return Math.round((valid ? days : 5) * 24 * 60 * 60);
}
export const SESSION_MAX_AGE_SECONDS = sessionMaxAgeSeconds();

/** A sign-in must be this recent to be exchanged for a session cookie. */
const MAX_SIGN_IN_AGE_SECONDS = 5 * 60;

/**
 * Short-lived cache of Firebase user records, per server instance. Looking the
 * user up on every request costs a round trip to Google; this keeps one lookup
 * per user per TTL. Revocation, role and name changes therefore reach other
 * instances within USER_CACHE_TTL_MS (the instance that makes the change drops
 * its own entry immediately via invalidateUserCache). Set AUTH_CACHE_TTL_MS=0
 * to turn the cache off.
 */
const USER_CACHE_MAX = 1000;
const userCache = new Map<string, { at: number; user: UserRecord }>();

function cacheTtlMs(): number {
  const configured = Number(process.env.AUTH_CACHE_TTL_MS);
  return Number.isFinite(configured) && process.env.AUTH_CACHE_TTL_MS !== undefined ? configured : 30_000;
}

async function loadUser(uid: string): Promise<UserRecord> {
  const ttl = cacheTtlMs();
  const hit = userCache.get(uid);
  if (hit && ttl > 0 && Date.now() - hit.at < ttl) return hit.user;

  const user = await getAdminAuth().getUser(uid);
  if (ttl > 0) {
    userCache.delete(uid);
    userCache.set(uid, { at: Date.now(), user });
    if (userCache.size > USER_CACHE_MAX) userCache.delete(userCache.keys().next().value!);
  }
  return user;
}

/** Forget a cached user, e.g. after revoking their sessions or changing their profile. */
export function invalidateUserCache(uid: string): void {
  userCache.delete(uid);
}

/** Test hook. */
export function clearUserCache(): void {
  userCache.clear();
}

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
    const user = await loadUser(decoded.uid);

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
  setContextUser(user.uid);
  return user;
}

/**
 * For routes guests may not use (reminders, notifications): 401 when signed
 * out, 403 for anonymous guest accounts. Guests can scan and save records, but
 * anonymous accounts are free to create in bulk, so they get no features that
 * hold server state or send anything to other systems.
 */
export async function requireRegisteredUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.isAnonymous) {
    throw new BackendError("Create a free account to use this feature.", 403);
  }
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

/**
 * Prove the person at the keyboard just signed in, for destructive actions: a
 * stolen session cookie alone must not be enough. `idToken` is a fresh Firebase
 * ID token belonging to `uid`, from a sign-in in the last few minutes.
 */
export async function assertRecentSignIn(uid: string, idToken: unknown): Promise<void> {
  if (typeof idToken !== "string" || !idToken) {
    throw new BackendError("Please confirm your password to continue.", 401);
  }
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new BackendError("Your sign-in could not be verified. Please try again.", 401);
  }
  if (decoded.uid !== uid) {
    throw new BackendError("Your sign-in could not be verified. Please try again.", 401);
  }
  if (Date.now() / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_SECONDS) {
    throw new BackendError("Please confirm your password again to continue.", 401);
  }
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

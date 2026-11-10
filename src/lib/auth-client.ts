"use client";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";

import { getAppCheckToken, getClientAuth } from "@/lib/firebase-client";

const FRIENDLY_ERRORS: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match. Check them or create an account.",
  "auth/wrong-password": "That email and password don't match. Check them or create an account.",
  "auth/user-not-found": "That email and password don't match. Check them or create an account.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
  "auth/weak-password": "Choose a stronger password.",
  "auth/password-does-not-meet-requirements": "Choose a stronger password.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/network-request-failed": "You appear to be offline. Check your connection and try again.",
  "auth/operation-not-allowed": "This sign-in method is not enabled yet.",
};

/** Turn Firebase / API errors into a message that is safe and useful to show. */
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (typeof code === "string" && FRIENDLY_ERRORS[code]) return FRIENDLY_ERRORS[code];
  if (error instanceof Error && error.name === "SessionError") return error.message;
  return "We couldn't sign you in right now. Please try again.";
}

/** Exchange the fresh ID token for an HttpOnly session cookie, then drop the client state. */
async function startServerSession(user: User): Promise<void> {
  const auth = getClientAuth();
  try {
    const idToken = await user.getIdToken();
    const appCheckToken = await getAppCheckToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {}),
      },
      body: JSON.stringify({ idToken }),
      credentials: "same-origin",
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { detail?: string } | null;
      const error = new Error(payload?.detail ?? "We couldn't start your session. Please try again.");
      error.name = "SessionError";
      throw error;
    }
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

export async function signUpWithEmail(name: string, email: string, password: string): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(getClientAuth(), email, password);
  await updateProfile(user, { displayName: name });
  // Best effort: the account works without it, the email just confirms ownership.
  await sendEmailVerification(user).catch(() => undefined);
  await startServerSession(user);
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { user } = await signInWithEmailAndPassword(getClientAuth(), email, password);
  await startServerSession(user);
}

/** Guest accounts are real (anonymous) Firebase users, so their data is still private to them. */
export async function signInAsGuest(): Promise<void> {
  const { user } = await signInAnonymously(getClientAuth());
  await startServerSession(user);
}

/** Always resolves for unknown emails so the form can't be used to discover accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getClientAuth(), email);
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "auth/user-not-found") return;
    throw error;
  }
}

export async function signOutSession({ everywhere = false } = {}): Promise<void> {
  await fetch(`/api/auth/session${everywhere ? "?all=1" : ""}`, {
    method: "DELETE",
    credentials: "same-origin",
  });
}

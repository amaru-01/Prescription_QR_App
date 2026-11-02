"use client";

import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { inMemoryPersistence, initializeAuth, type Auth } from "firebase/auth";

/** Public web config (Firebase Console → Project settings → Your apps). Safe to expose. */
const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let auth: Auth | null = null;

/**
 * Firebase Auth is used only to sign in and mint an ID token, which is then
 * exchanged for an HttpOnly session cookie. In-memory persistence means no
 * long-lived token is ever written to localStorage or IndexedDB, and no
 * popup/redirect resolver is loaded, so no third-party iframes are needed.
 */
export function getClientAuth(): Auth {
  if (auth) return auth;
  if (!config.apiKey || !config.authDomain || !config.projectId) {
    throw new Error(
      "Firebase web config is missing. Set the NEXT_PUBLIC_FIREBASE_* variables (see .env.example)."
    );
  }
  const app = getApps().length ? getApp() : initializeApp(config);
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
  return auth;
}

"use client";

import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import { inMemoryPersistence, initializeAuth, type Auth } from "firebase/auth";

/** Public web config (Firebase Console → Project settings → Your apps). Safe to expose. */
const config: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const APP_CHECK_SITE_KEY = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY;

let auth: Auth | null = null;
let appCheck: AppCheck | null = null;

function getClientApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

/**
 * An App Check token for the session exchange, or null when App Check is not
 * configured (or the token could not be fetched; the server decides whether
 * that is acceptable). Tokens come from reCAPTCHA Enterprise, no user prompt.
 */
export async function getAppCheckToken(): Promise<string | null> {
  if (!APP_CHECK_SITE_KEY) return null;
  try {
    appCheck ??= initializeAppCheck(getClientApp(), {
      provider: new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY),
      isTokenAutoRefreshEnabled: false,
    });
    return (await getToken(appCheck)).token;
  } catch {
    return null;
  }
}

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
  auth = initializeAuth(getClientApp(), { persistence: inMemoryPersistence });
  return auth;
}

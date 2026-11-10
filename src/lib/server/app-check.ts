import { getAppCheck } from "firebase-admin/app-check";

import { BackendError } from "./errors";
import { initializeFirebase } from "./firebase";
import { logger } from "./logger";
import { securityEvent } from "./security-log";

/** Header the Firebase web SDK's App Check token is sent in. */
export const APP_CHECK_HEADER = "x-firebase-appcheck";

/**
 * Firebase App Check proves a request comes from your real web app (via
 * reCAPTCHA Enterprise) rather than a script minting anonymous accounts.
 *
 *  - off:     neither NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY nor APP_CHECK_ENFORCE is set.
 *  - monitor: the site key is set. Tokens are verified and failures are logged,
 *             but requests are allowed, so you can watch real traffic first.
 *  - enforce: APP_CHECK_ENFORCE=1. A missing or invalid token is rejected (403).
 */
export function appCheckMode(): "off" | "monitor" | "enforce" {
  if (process.env.APP_CHECK_ENFORCE === "1") return "enforce";
  return process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY ? "monitor" : "off";
}

export async function assertAppCheck(request: Request): Promise<void> {
  const mode = appCheckMode();
  if (mode === "off") return;

  const token = request.headers.get(APP_CHECK_HEADER);
  let failure: string | null = null;

  if (!token) {
    failure = "missing";
  } else {
    try {
      initializeFirebase();
      await getAppCheck().verifyToken(token);
    } catch (error) {
      failure = "invalid";
      logger.warn("App Check token rejected", { error });
    }
  }

  if (!failure) return;
  securityEvent("app_check_rejected", { reason: failure, mode });
  if (mode === "enforce") {
    throw new BackendError("We couldn't verify this request came from the app. Reload the page and try again.", 403);
  }
}

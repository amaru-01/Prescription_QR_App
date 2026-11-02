import webpush from "web-push";

import { logger } from "./logger";
import type { PushSender } from "./reminders";

/**
 * Web Push (VAPID). Keys come from `npm run generate:keys`:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto: or https:)
 */
let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure(): void {
  if (configured) return;
  if (!isPushConfigured()) throw new Error("Web Push is not configured (VAPID keys missing).");
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  configured = true;
}

export const sendPush: PushSender = async (subscription, payload) => {
  configure();
  try {
    await webpush.sendNotification(subscription, payload, { TTL: 60 * 60, urgency: "high" });
    return "sent";
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    // 404/410: the browser unsubscribed or the subscription expired.
    if (status === 404 || status === 410) return "gone";
    logger.warn("Push delivery failed", { status, error });
    return "failed";
  }
};

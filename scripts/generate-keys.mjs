#!/usr/bin/env node
/**
 * Print fresh secrets for .env / your hosting provider's environment settings:
 *   - RX_SIGNING_PRIVATE_KEY   Ed25519 key that signs prescription QR codes
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY   Web Push keys
 *   - CRON_SECRET              bearer token for /api/cron/reminders
 *
 *   npm run generate:keys
 *
 * Nothing is written to disk. Treat the output as secret (except the public key).
 * Rotating RX_SIGNING_PRIVATE_KEY invalidates codes that have not been saved yet.
 */
import crypto from "node:crypto";
import webpush from "web-push";

const { privateKey } = crypto.generateKeyPairSync("ed25519");
const rxKey = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const vapid = webpush.generateVAPIDKeys();
const cronSecret = crypto.randomBytes(32).toString("base64url");

console.log(`# Signed prescriptions (server only)
RX_SIGNING_PRIVATE_KEY=${rxKey}

# Web Push notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:you@example.com

# Reminder scheduler
CRON_SECRET=${cronSecret}`);

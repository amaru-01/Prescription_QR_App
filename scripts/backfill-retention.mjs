#!/usr/bin/env node
/**
 * One-off: give issued-code and claim records that were created before the
 * retention policy a `purge_at` date, so the Firestore TTL policies can remove
 * them. New records get `purge_at` automatically.
 *
 *   node scripts/backfill-retention.mjs            # dry run: shows what would change
 *   node scripts/backfill-retention.mjs --apply    # writes the dates
 *
 *  - issued codes:  purge_at = expires_at + 90 days
 *  - rx_claims:     purge_at = claimed_at + 120 days (a code is claimable for 30 days
 *                   after issue, and claims are kept 90 days past that)
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const DAY_MS = 24 * 60 * 60 * 1000;
const apply = process.argv.includes("--apply");

function loadServiceAccount() {
  if (process.env.FIREBASE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    if (typeof credentials.private_key === "string") {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    return credentials;
  }
  const candidates = [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "firebase-service-account.json", "service-account.json"].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return JSON.parse(fs.readFileSync(resolved, "utf8"));
  }
  throw new Error("Firebase credentials not found (FIREBASE_CREDENTIALS or a service account file).");
}

/** Visit every document of a query in pages, writing `purge_at` where it is missing. */
async function backfill(label, makeQuery, purgeAtFor) {
  const db = getFirestore();
  let last;
  let seen = 0;
  let missing = 0;

  for (;;) {
    let query = makeQuery(db).limit(400);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    if (page.empty) break;

    const batch = db.batch();
    for (const doc of page.docs) {
      seen += 1;
      if (doc.get("purge_at")) continue;
      const purgeAt = purgeAtFor(doc);
      if (!purgeAt) continue;
      missing += 1;
      batch.update(doc.ref, { purge_at: Timestamp.fromMillis(purgeAt) });
    }
    if (apply && missing > 0) await batch.commit();

    last = page.docs[page.docs.length - 1];
    if (page.size < 400) break;
  }
  console.log(`${label}: ${seen} checked, ${missing} ${apply ? "updated" : "would be updated"}`);
}

async function main() {
  initializeApp({ credential: cert(loadServiceAccount()) });
  console.log(apply ? "Applying changes." : "Dry run (add --apply to write).");

  await backfill(
    "issued codes",
    (db) => db.collectionGroup("issued").orderBy("__name__"),
    (doc) => (doc.get("expires_at")?.toMillis ? doc.get("expires_at").toMillis() + 90 * DAY_MS : null)
  );
  await backfill(
    "rx_claims",
    (db) => db.collection("rx_claims").orderBy("__name__"),
    (doc) => (doc.get("claimed_at")?.toMillis ? doc.get("claimed_at").toMillis() + 120 * DAY_MS : null)
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

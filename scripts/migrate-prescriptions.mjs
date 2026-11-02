#!/usr/bin/env node
/**
 * Move legacy prescriptions (top-level `prescriptions` collection, no owner)
 * into one user's private collection at `users/{uid}/prescriptions`.
 *
 *   node scripts/migrate-prescriptions.mjs --email you@example.com            # dry run
 *   node scripts/migrate-prescriptions.mjs --email you@example.com --apply    # copy
 *   node scripts/migrate-prescriptions.mjs --uid <uid> --apply --delete-originals
 *
 * Document ids are kept, the old `user_agent` field is dropped, and docs that
 * already exist at the destination are skipped, so re-running is safe.
 * Originals are only deleted with --delete-originals, after a successful copy.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};

function loadServiceAccount() {
  if (process.env.FIREBASE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    if (typeof credentials.private_key === "string") {
      credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
    }
    return credentials;
  }
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    "firebase-service-account.json",
    "service-account.json",
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(resolved)) return JSON.parse(fs.readFileSync(resolved, "utf8"));
  }
  throw new Error("Firebase credentials not found (FIREBASE_CREDENTIALS or a service account file).");
}

async function main() {
  const apply = flag("apply");
  const deleteOriginals = flag("delete-originals");
  const email = option("email");
  let uid = option("uid");

  if (!email && !uid) {
    console.error("Pass --email <address> or --uid <uid> of the account that should own the records.");
    process.exit(1);
  }
  if (deleteOriginals && !apply) {
    console.error("--delete-originals requires --apply.");
    process.exit(1);
  }

  admin.initializeApp({ credential: admin.credential.cert(loadServiceAccount()) });
  const db = admin.firestore();

  if (!uid) uid = (await admin.auth().getUserByEmail(email)).uid;
  const user = await admin.auth().getUser(uid);
  console.log(`Target account: ${user.email ?? "(no email)"} [${uid}]`);

  const legacy = await db.collection("prescriptions").get();
  console.log(`Found ${legacy.size} legacy prescription(s).`);
  if (legacy.empty) return;

  const destination = db.collection("users").doc(uid).collection("prescriptions");
  let copied = 0;
  let skipped = 0;
  let deleted = 0;

  for (const doc of legacy.docs) {
    const target = destination.doc(doc.id);
    const exists = (await target.get()).exists;
    const { user_agent: _dropped, ...data } = doc.data();

    if (exists) {
      skipped += 1;
    } else if (apply) {
      await target.set(data);
      copied += 1;
    } else {
      copied += 1;
    }

    if (apply && deleteOriginals) {
      await doc.ref.delete();
      deleted += 1;
    }
  }

  const verb = apply ? "Copied" : "Would copy";
  console.log(`${verb} ${copied}, skipped ${skipped} already present${deleteOriginals ? `, deleted ${deleted} originals` : ""}.`);
  if (!apply) console.log("Dry run only. Re-run with --apply to write.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

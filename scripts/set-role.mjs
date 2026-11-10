#!/usr/bin/env node
/**
 * Grant or remove prescriber access (Firebase custom claims `role` and `credentialName`).
 *
 *   node scripts/set-role.mjs --email doctor@example.com --role prescriber --name "Dr. Jane Smith"
 *   node scripts/set-role.mjs --email doctor@example.com --role prescriber --name "Dr. Jane Smith, MD"  (rename)
 *   node scripts/set-role.mjs --email doctor@example.com --role patient
 *
 * Takes effect on the user's next request; no sign-out needed. Only grant
 * prescriber to people whose credentials you have checked: `--name` is what
 * patients see as the signer of every code they issue, and prescribers cannot
 * change it themselves. The account's email must be verified. Every change is
 * recorded in the Firestore collection `admin_audit`.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import os from "node:os";

const args = process.argv.slice(2);
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
  const email = option("email");
  const role = option("role");
  const name = option("name")?.trim();
  if (!email || !["prescriber", "patient"].includes(role)) {
    console.error('Usage: node scripts/set-role.mjs --email <address> --role prescriber|patient [--name "Dr. Jane Smith"]');
    process.exit(1);
  }
  if (role === "prescriber" && (!name || name.length < 2 || name.length > 80)) {
    console.error('Granting prescriber requires --name "<verified name>" (2-80 characters).');
    process.exit(1);
  }

  initializeApp({ credential: cert(loadServiceAccount()) });
  const user = await getAuth().getUserByEmail(email);
  if (role === "prescriber" && !user.emailVerified) {
    console.error(`${email} has not verified their email address yet. Ask them to verify it, then retry.`);
    process.exit(1);
  }

  const before = user.customClaims ?? {};
  const claims = { ...before };
  if (role === "prescriber") {
    claims.role = "prescriber";
    claims.credentialName = name;
  } else {
    delete claims.role;
    delete claims.credentialName;
  }

  await getAuth().setCustomUserClaims(user.uid, claims);
  await getFirestore().collection("admin_audit").add({
    action: "set-role",
    target_uid: user.uid,
    target_email: email,
    role,
    credential_name: role === "prescriber" ? name : null,
    previous_role: before.role ?? "patient",
    previous_credential_name: before.credentialName ?? null,
    by: os.userInfo().username,
    at: FieldValue.serverTimestamp(),
  });
  console.log(`${email} [${user.uid}] is now: ${role}${role === "prescriber" ? ` (signs as "${name}")` : ""}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Grant or remove prescriber access (Firebase custom claim `role`).
 *
 *   node scripts/set-role.mjs --email doctor@example.com --role prescriber
 *   node scripts/set-role.mjs --email doctor@example.com --role patient
 *
 * Takes effect on the user's next request; no sign-out needed. Only grant
 * prescriber to people whose credentials you have checked: their name
 * appears as the signer on every code they issue.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

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
  if (!email || !["prescriber", "patient"].includes(role)) {
    console.error("Usage: node scripts/set-role.mjs --email <address> --role prescriber|patient");
    process.exit(1);
  }

  initializeApp({ credential: cert(loadServiceAccount()) });
  const user = await getAuth().getUserByEmail(email);
  const claims = { ...(user.customClaims ?? {}) };
  if (role === "prescriber") claims.role = "prescriber";
  else delete claims.role;

  await getAuth().setCustomUserClaims(user.uid, claims);
  console.log(`${email} [${user.uid}] is now: ${role}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

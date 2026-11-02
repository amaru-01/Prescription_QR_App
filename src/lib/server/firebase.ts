import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

import { logger } from "./logger";

let db: Firestore | null = null;

/**
 * Load the service account credentials.
 *
 * 1. Production (Vercel): FIREBASE_CREDENTIALS env var containing the JSON string.
 * 2. Local development: a JSON file read at runtime with fs. The path is dynamic,
 *    so the bundler never tries to include the file in the build.
 */
function loadServiceAccount(): ServiceAccount {
  const firebaseCredentialsJson = process.env.FIREBASE_CREDENTIALS;

  if (firebaseCredentialsJson) {
    const credentialsDict = JSON.parse(firebaseCredentialsJson);
    // Env vars often store newlines in the private key as literal "\n"
    if (typeof credentialsDict.private_key === "string") {
      credentialsDict.private_key = credentialsDict.private_key.replace(
        /\\n/g,
        "\n"
      );
    }
    return credentialsDict;
  }

  // Local development fallback: look for the file in a few common places
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    "firebase-service-account.json",
    "service-account.json",
    path.join("src", "lib", "server", "firebase-service-account.json"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    // turbopackIgnore: without it, this runtime path makes the bundler trace the whole
    // project (including .env and key files) into the server output.
    const resolved = path.resolve(/* turbopackIgnore: true */ process.cwd(), candidate);
    if (fs.existsSync(resolved)) {
      return JSON.parse(fs.readFileSync(resolved, "utf8"));
    }
  }

  throw new Error(
    "Firebase credentials not found. Set the FIREBASE_CREDENTIALS environment variable, " +
      "or set FIREBASE_SERVICE_ACCOUNT_PATH to a local service account JSON file."
  );
}

/**
 * Initialize Firebase Admin SDK with credentials from environment or service account file.
 */
export function initializeFirebase(): Firestore {
  if (db) {
    return db;
  }

  try {
    // Check if Firebase is already initialized
    if (!getApps().length) {
      initializeApp({
        credential: cert(loadServiceAccount()),
      });
      logger.info("Firebase Admin SDK initialized");
    }

    db = getFirestore();
    return db;
  } catch (error) {
    logger.error("Error initializing Firebase", { error });
    throw new Error(
      `Failed to initialize Firebase: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get Firestore client (initializes if needed).
 */
export function getDb(): Firestore {
  if (!db) {
    return initializeFirebase();
  }
  return db;
}

/**
 * Get the Firebase Admin Auth client (initializes the app if needed).
 */
export function getAdminAuth(): Auth {
  initializeFirebase();
  return getAuth();
}

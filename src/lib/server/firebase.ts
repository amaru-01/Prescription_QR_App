import admin from "firebase-admin";
import fs from "fs";
import path from "path";

let db: admin.firestore.Firestore | null = null;

/**
 * Load the service account credentials.
 *
 * 1. Production (Vercel): FIREBASE_CREDENTIALS env var containing the JSON string.
 * 2. Local development: a JSON file read at runtime with fs. The path is dynamic,
 *    so the bundler never tries to include the file in the build.
 */
function loadServiceAccount(): admin.ServiceAccount {
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
    path.join("src", "lib", "server", "firebase-service-account.json"),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    const resolved = path.resolve(process.cwd(), candidate);
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
export function initializeFirebase(): admin.firestore.Firestore {
  if (db) {
    return db;
  }

  try {
    // Check if Firebase is already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(loadServiceAccount()),
      });
      console.log("Firebase Admin SDK initialized successfully");
    }

    db = admin.firestore();
    return db;
  } catch (error) {
    console.error("Error initializing Firebase:", error);
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
export function getDb(): admin.firestore.Firestore {
  if (!db) {
    return initializeFirebase();
  }
  return db;
}

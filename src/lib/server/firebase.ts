import admin from "firebase-admin";

let db: admin.firestore.Firestore | null = null;

/**
 * Initialize Firebase Admin SDK with credentials from environment or service account file.
 * This mirrors the FastAPI backend's Firebase initialization.
 */
export function initializeFirebase(): admin.firestore.Firestore {
  if (db) {
    return db;
  }

  try {
    // Check if Firebase is already initialized
    if (!admin.apps.length) {
      let cred: admin.credential.Credential;

      // Try to get credentials from environment variable (for Vercel deployment)
      const firebaseCredentialsJson = process.env.FIREBASE_CREDENTIALS;
      if (firebaseCredentialsJson) {
        const credentialsDict = JSON.parse(firebaseCredentialsJson);
        cred = admin.credential.cert(credentialsDict);
      } else {
        // Fallback to service account file (for local development)
        try {
          const serviceAccount = require("./firebase-service-account.json");
          cred = admin.credential.cert(serviceAccount);
        } catch (e) {
          throw new Error("Firebase service account file not found. Please set FIREBASE_CREDENTIALS environment variable or provide firebase-service-account.json");
        }
      }

      admin.initializeApp({
        credential: cred,
      });
      console.log("Firebase Admin SDK initialized successfully");
    }

    db = admin.firestore();
    return db;
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    throw new Error(`Failed to initialize Firebase: ${error instanceof Error ? error.message : String(error)}`);
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

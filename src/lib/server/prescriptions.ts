import admin from "firebase-admin";
import { getDb } from "./firebase";
import type { Prescription, PrescriptionDraft, PrescriptionInput, PrescriptionStatus, HealthResponse } from "@/types/prescription";

const DATA_MODE: "fastapi" | "local" = "fastapi";

/**
 * Get health status - mirrors FastAPI /health endpoint.
 */
export async function getHealth(): Promise<HealthResponse> {
  try {
    const db = getDb();
    const timestamp = new Date().toISOString();

    return {
      ok: true,
      status: "healthy",
      firebase: "connected",
      timestamp,
      mode: DATA_MODE,
      storage: "firebase",
    };
  } catch (error) {
    const timestamp = new Date().toISOString();
    return {
      ok: false,
      status: "unhealthy",
      firebase: "disconnected",
      timestamp,
      mode: DATA_MODE,
      storage: "firebase",
    };
  }
}

/**
 * List prescriptions from Firestore - mirrors FastAPI /api/prescriptions endpoint.
 */
export async function listPrescriptions(limit = 100): Promise<Prescription[]> {
  const db = getDb();

  const snapshot = await db
    .collection("prescriptions")
    .orderBy("created_at", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const createdAt = data.created_at;
    let createdAtIso: string | null = null;

    if (createdAt) {
      if (typeof createdAt.toDate === "function") {
        createdAtIso = createdAt.toDate().toISOString();
      } else if (createdAt._seconds) {
        createdAtIso = new Date(createdAt._seconds * 1000).toISOString();
      }
    }

    return {
      id: doc.id,
      med: data.med || "",
      dose: data.dose || "",
      duration: data.duration || "",
      createdAt: createdAtIso,
      status: (data.status || "active") as PrescriptionStatus,
      source: (data.source || "scan") as Prescription["source"],
      notes: data.notes || null,
    };
  });
}

/**
 * Save prescription to Firestore - mirrors FastAPI /api/save endpoint.
 */
export async function savePrescription(
  input: PrescriptionInput,
  options?: {
    source?: Prescription["source"];
    notes?: string | null;
    userAgent?: string | null;
  }
): Promise<{ documentId: string; prescription: Prescription }> {
  const db = getDb();

  const prescriptionData = {
    med: input.med,
    dose: input.dose,
    duration: input.duration,
    status: "active" as PrescriptionStatus,
    source: options?.source || "scan",
    notes: options?.notes || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    user_agent: options?.userAgent || null,
  };

  const docRef = await db.collection("prescriptions").add(prescriptionData);

  // Fetch the created document to return full data
  const doc = await docRef.get();
  const data = doc.data();

  return {
    documentId: doc.id,
    prescription: {
      id: doc.id,
      med: data?.med || "",
      dose: data?.dose || "",
      duration: data?.duration || "",
      createdAt: new Date().toISOString(),
      status: (data?.status || "active") as PrescriptionStatus,
      source: (data?.source || "scan") as Prescription["source"],
      notes: data?.notes || null,
    },
  };
}

/**
 * Get a single prescription by ID.
 */
export async function getPrescriptionById(id: string): Promise<Prescription> {
  const db = getDb();

  const doc = await db.collection("prescriptions").doc(id).get();

  if (!doc.exists) {
    throw new Error("Prescription not found");
  }

  const data = doc.data();
  const createdAt = data?.created_at;
  let createdAtIso: string | null = null;

  if (createdAt) {
    if (typeof createdAt.toDate === "function") {
      createdAtIso = createdAt.toDate().toISOString();
    } else if (createdAt._seconds) {
      createdAtIso = new Date(createdAt._seconds * 1000).toISOString();
    }
  }

  return {
    id: doc.id,
    med: data?.med || "",
    dose: data?.dose || "",
    duration: data?.duration || "",
    createdAt: createdAtIso,
    status: (data?.status || "active") as PrescriptionStatus,
    source: (data?.source || "scan") as Prescription["source"],
    notes: data?.notes || null,
  };
}

/**
 * Update prescription status.
 */
export async function updatePrescriptionStatus(
  id: string,
  status: PrescriptionStatus
): Promise<void> {
  const db = getDb();

  await db.collection("prescriptions").doc(id).update({
    status,
    updated_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Delete a prescription.
 */
export async function deletePrescription(id: string): Promise<void> {
  const db = getDb();

  await db.collection("prescriptions").doc(id).delete();
}

/**
 * Seed demo prescriptions - not used in Firebase mode.
 */
export async function seedDemoPrescriptions(): Promise<number> {
  throw new Error("Demo seeding is not available in Firebase mode");
}

/**
 * Export prescriptions as CSV.
 */
export async function exportPrescriptions(): Promise<string> {
  const prescriptions = await listPrescriptions(1000);

  const headers = ["ID", "Medication", "Dosage", "Duration", "Status", "Source", "Notes", "Created At"];
  const rows = prescriptions.map((p) => [
    p.id,
    p.med,
    p.dose,
    p.duration,
    p.status,
    p.source,
    p.notes || "",
    p.createdAt || "",
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  return csv;
}

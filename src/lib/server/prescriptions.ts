import admin from "firebase-admin";
import { BackendError } from "./errors";
import { getDb } from "./firebase";
import type {
  HealthResponse,
  Prescription,
  PrescriptionInput,
  PrescriptionStatus,
  PrescriptionUpdate,
} from "@/types/prescription";

const DATA_MODE: HealthResponse["mode"] = "fastapi";

/** Hard cap on how many records a single list request can read. */
export const MAX_LIST_LIMIT = 500;

/** Firestore gRPC status code for a missing document. */
const NOT_FOUND_CODE = 5;

/**
 * Prescriptions are stored per user at `users/{uid}/prescriptions/{id}`, so
 * every query is scoped to its owner by path and one user can never reach
 * another user's records by guessing an id.
 */
function userPrescriptions(uid: string) {
  if (!uid) throw new BackendError("Please log in to continue.", 401);
  return getDb().collection("users").doc(uid).collection("prescriptions");
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const timestamp = value as { toDate?: () => Date; _seconds?: number };
  if (typeof timestamp.toDate === "function") return timestamp.toDate().toISOString();
  if (typeof timestamp._seconds === "number") return new Date(timestamp._seconds * 1000).toISOString();
  return null;
}

function toPrescription(id: string, data: admin.firestore.DocumentData | undefined): Prescription {
  return {
    id,
    med: data?.med || "",
    dose: data?.dose || "",
    duration: data?.duration || "",
    createdAt: toIso(data?.created_at),
    status: (data?.status || "active") as PrescriptionStatus,
    source: (data?.source || "scan") as Prescription["source"],
    notes: data?.notes || null,
  };
}

/**
 * Get health status - mirrors FastAPI /health endpoint.
 */
export async function getHealth(): Promise<HealthResponse> {
  try {
    getDb();
    const timestamp = new Date().toISOString();

    return {
      ok: true,
      status: "healthy",
      firebase: "connected",
      timestamp,
      mode: DATA_MODE,
      storage: "firebase",
    };
  } catch {
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
 * List the user's prescriptions, newest first.
 */
export async function listPrescriptions(uid: string, limit = 100): Promise<Prescription[]> {
  const snapshot = await userPrescriptions(uid)
    .orderBy("created_at", "desc")
    .limit(Math.min(Math.max(1, limit), MAX_LIST_LIMIT))
    .get();

  return snapshot.docs.map((doc) => toPrescription(doc.id, doc.data()));
}

/**
 * Save a prescription for the user.
 */
export async function savePrescription(
  uid: string,
  input: PrescriptionInput,
  options?: {
    source?: Prescription["source"];
    notes?: string | null;
  }
): Promise<{ documentId: string; prescription: Prescription }> {
  const prescriptionData = {
    med: input.med,
    dose: input.dose,
    duration: input.duration,
    status: "active" as PrescriptionStatus,
    source: options?.source || "scan",
    notes: options?.notes || null,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await userPrescriptions(uid).add(prescriptionData);

  return {
    documentId: docRef.id,
    prescription: {
      id: docRef.id,
      med: prescriptionData.med,
      dose: prescriptionData.dose,
      duration: prescriptionData.duration,
      createdAt: new Date().toISOString(),
      status: prescriptionData.status,
      source: prescriptionData.source,
      notes: prescriptionData.notes,
    },
  };
}

/**
 * Get one of the user's prescriptions by ID.
 */
export async function getPrescriptionById(uid: string, id: string): Promise<Prescription> {
  const doc = await userPrescriptions(uid).doc(id).get();

  if (!doc.exists) {
    throw new BackendError("Prescription not found.", 404);
  }

  return toPrescription(doc.id, doc.data());
}

/** Update the supported editable prescription fields. */
export async function updatePrescription(uid: string, id: string, updates: PrescriptionUpdate): Promise<void> {
  try {
    await userPrescriptions(uid).doc(id).update({
      ...updates,
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if ((error as { code?: unknown })?.code === NOT_FOUND_CODE) {
      throw new BackendError("Prescription not found.", 404);
    }
    throw error;
  }
}

/**
 * Delete one of the user's prescriptions.
 */
export async function deletePrescription(uid: string, id: string): Promise<void> {
  const ref = userPrescriptions(uid).doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new BackendError("Prescription not found.", 404);
  }
  await ref.delete();
}

/**
 * Quote a CSV field per RFC 4180 and neutralise spreadsheet formulas, so a
 * crafted QR payload like `=HYPERLINK(...)` is shown as text, not executed.
 */
function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Export the user's prescriptions as CSV.
 */
export async function exportPrescriptions(uid: string): Promise<string> {
  const prescriptions = await listPrescriptions(uid, MAX_LIST_LIMIT);

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

  return [headers, ...rows].map((row) => row.map(csvField).join(",")).join("\r\n");
}

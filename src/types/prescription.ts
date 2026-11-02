export type PrescriptionStatus = "active" | "completed" | "archived";

export type PrescriptionSource = "scan" | "upload" | "manual" | "demo";

/** Normalized prescription used everywhere in the UI. */
export interface Prescription {
  id: string;
  med: string;
  dose: string;
  duration: string;
  /** ISO timestamp, normalized from Firestore's `created_at`. */
  createdAt: string | null;
  status: PrescriptionStatus;
  source: PrescriptionSource;
  notes: string | null;
}

/** The three fields carried by a prescription QR code. */
export interface PrescriptionInput {
  med: string;
  dose: string;
  duration: string;
}

export interface PrescriptionDraft extends PrescriptionInput {
  source: PrescriptionSource;
  notes?: string | null;
}

export type PrescriptionUpdate = Partial<Pick<Prescription, "status" | "notes">>;

export interface PrescriptionFieldErrors {
  med?: string;
  dose?: string;
  duration?: string;
}

/** Response shape of `GET /api/prescriptions?limit=50&cursor=...`. */
export interface PrescriptionListResponse {
  success: true;
  count: number;
  prescriptions: Prescription[];
  /** Pass as `cursor` to load the next page; null when there are no more. */
  next_cursor: string | null;
}

/** Response shape of `POST /api/save`. */
export interface SavePrescriptionResponse {
  success: true;
  message: string;
  document_id: string;
  prescription: Prescription;
}

export interface HealthResponse {
  ok: boolean;
  status: string;
  firebase: string;
  timestamp: string;
  storage: string;
}

export interface ApiErrorPayload {
  success?: false;
  detail?: string;
  errors?: PrescriptionFieldErrors;
  request_id?: string;
}

/** A single parsed QR / uploaded payload before it is validated. */
export type ParseResult =
  | { ok: true; value: PrescriptionInput; warnings: string[] }
  | { ok: false; message: string; fieldErrors?: PrescriptionFieldErrors };

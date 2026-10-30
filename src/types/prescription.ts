export type PrescriptionStatus = "active" | "completed" | "archived";

export type PrescriptionSource = "scan" | "upload" | "manual" | "demo";

export type DataSourceMode = "fastapi" | "local";

/** Normalized prescription used everywhere in the UI. */
export interface Prescription {
  id: string;
  med: string;
  dose: string;
  duration: string;
  /** ISO timestamp. The FastAPI backend returns `created_at`; normalized here. */
  createdAt: string | null;
  status: PrescriptionStatus;
  source: PrescriptionSource;
  notes: string | null;
}

/** Payload accepted by `POST /api/save` — matches the FastAPI Pydantic model. */
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

/** Response shape of `GET /api/prescriptions?limit=10` (unchanged from FastAPI). */
export interface PrescriptionListResponse {
  success: true;
  count: number;
  prescriptions: Prescription[];
}

/** Response shape of `POST /api/save` (FastAPI fields + additive record). */
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
  mode: DataSourceMode;
  storage: string;
}

export interface ApiErrorPayload {
  success?: false;
  detail?: string;
  errors?: PrescriptionFieldErrors;
}

export interface PendingSave {
  localId: string;
  input: PrescriptionDraft;
  queuedAt: string;
}

export interface ScanRecord {
  status: PrescriptionStatus;
  source: PrescriptionSource;
}

/** A single parsed QR / uploaded payload before it is validated. */
export type ParseResult =
  | { ok: true; value: PrescriptionInput; warnings: string[] }
  | { ok: false; message: string; fieldErrors?: PrescriptionFieldErrors };

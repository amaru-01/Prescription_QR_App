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
  /** Present when saved from a valid, unaltered signed QR code. */
  verification: PrescriptionVerification | null;
}

/** Proof that a record came from a prescriber-signed VeriDose QR code. */
export interface PrescriptionVerification {
  rxId: string;
  prescriberName: string;
  /** ISO timestamp the prescriber issued the code. */
  issuedAt: string;
}

/** Outcome of checking a scanned QR's signature, shown on the review screen. */
export type RxCheck =
  | { status: "none" }
  | { status: "verified"; prescriberName: string; issuedAt: string; matches: boolean; pinRequired: boolean }
  | {
      status: "invalid";
      reason:
        | "malformed"
        | "bad_signature"
        | "unknown_key"
        | "expired"
        | "not_configured"
        | "claimed"
        | "duplicate"
        /** The prescriber withdrew the code (or their account no longer exists). */
        | "revoked"
        /** Too many wrong PINs were entered, so the code was locked. */
        | "locked"
        /** The reviewed fields differ from what the prescriber signed. */
        | "edited";
    };

/** The three fields carried by a prescription QR code. */
export interface PrescriptionInput {
  med: string;
  dose: string;
  duration: string;
}

export interface PrescriptionDraft extends PrescriptionInput {
  source: PrescriptionSource;
  notes?: string | null;
  /** Signed token from a prescriber-issued QR code, if the code had one. */
  rx?: string;
  /** The one-time PIN the prescriber gave the patient, for codes that require one. */
  pin?: string;
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
  /** How the signed QR (if any) was handled. */
  rx: RxCheck;
}

export interface HealthResponse {
  ok: boolean;
  status: string;
  firebase: string;
  timestamp: string;
  storage: string;
  /** Reminder scheduler freshness; only present when asked for (`?cron=1`). */
  reminders?: { status: "ok" | "stale" | "unknown"; lastSuccessAt: string | null; minutesSinceLastRun: number | null };
}

export interface ApiErrorPayload {
  success?: false;
  detail?: string;
  errors?: PrescriptionFieldErrors;
  request_id?: string;
}

/** A single parsed QR / uploaded payload before it is validated. */
export type ParseResult =
  | { ok: true; value: PrescriptionInput; rx?: string; warnings: string[] }
  | { ok: false; message: string; fieldErrors?: PrescriptionFieldErrors };

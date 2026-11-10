import { FieldValue, Timestamp } from "firebase-admin/firestore";

import type { PrescriptionInput, RxCheck } from "@/types/prescription";
import type { SessionUser } from "@/types/auth";
import { BackendError } from "./errors";
import { getDb } from "./firebase";
import { generatePin, hashPin } from "./rx-pin";
import {
  newRxId,
  RX_CLAIM_WINDOW_SECONDS,
  RX_RECORD_RETENTION_SECONDS,
  rxMatches,
  signRx,
  verifyRx,
  type RxValidityDays,
} from "./rx-signing";

export interface IssuedRx {
  rxId: string;
  med: string;
  dose: string;
  duration: string;
  issuedAt: string;
  expiresAt: string;
  claimed: boolean;
  /** Past the claim window without being saved by a patient. */
  expired: boolean;
  /** Withdrawn by the prescriber. */
  revoked: boolean;
  /** Requires a one-time PIN to save. */
  pinProtected: boolean;
  /** Locked after too many wrong PINs. */
  locked: boolean;
}

function issuedCollection(prescriberUid: string) {
  return getDb().collection("users").doc(prescriberUid).collection("issued");
}

const iso = (value: unknown): string => {
  const ts = value as { toDate?: () => Date } | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate().toISOString() : "";
};

export interface IssueOptions {
  /** How long the patient has to save the code. Defaults to 7 days. */
  validityDays?: RxValidityDays;
  /** Generate a one-time PIN the patient must enter to save the code. */
  requirePin?: boolean;
}

/**
 * Sign a prescription for the patient to scan. Returns the QR text: plain
 * fields (readable by any version of the app) plus the signed `rx` token.
 * With `requirePin`, also returns the PIN: it is shown to the prescriber once
 * and only its keyed hash is stored.
 */
export async function issuePrescription(
  prescriber: SessionUser,
  input: PrescriptionInput,
  { validityDays, requirePin = false }: IssueOptions = {}
): Promise<{ qrText: string; issued: IssuedRx; pin: string | null }> {
  // Sign only the name an administrator vouched for, never the self-editable display name.
  const prescriberName = prescriber.credentialName;
  if (!prescriberName) {
    throw new BackendError(
      "Your prescriber profile has no verified name yet. Ask an administrator to set it before you issue prescriptions.",
      403
    );
  }

  const { token, payload } = signRx(
    { jti: newRxId(), iss: prescriber.uid, isn: prescriberName, ...input, ...(requirePin ? { pin: true as const } : {}) },
    new Date(),
    validityDays ? validityDays * 24 * 60 * 60 : RX_CLAIM_WINDOW_SECONDS
  );

  const pin = requirePin ? generatePin() : null;
  const issuedAt = Timestamp.fromMillis(payload.iat * 1000);
  const expiresAt = Timestamp.fromMillis(payload.exp * 1000);
  await issuedCollection(prescriber.uid)
    .doc(payload.jti)
    .set({
      med: input.med,
      dose: input.dose,
      duration: input.duration,
      issued_at: issuedAt,
      expires_at: expiresAt,
      claimed_at: null,
      revoked_at: null,
      locked_at: null,
      pin_hash: pin ? hashPin(payload.jti, pin) : null,
      pin_attempts: 0,
      purge_at: Timestamp.fromMillis((payload.exp + RX_RECORD_RETENTION_SECONDS) * 1000),
    });

  return {
    qrText: JSON.stringify({ med: input.med, dose: input.dose, duration: input.duration, rx: token }),
    pin,
    issued: {
      rxId: payload.jti,
      ...input,
      issuedAt: issuedAt.toDate().toISOString(),
      expiresAt: expiresAt.toDate().toISOString(),
      claimed: false,
      expired: false,
      revoked: false,
      pinProtected: requirePin,
      locked: false,
    },
  };
}

/** The prescriber's most recently issued codes, newest first. */
export async function listIssued(prescriberUid: string, limit = 20): Promise<IssuedRx[]> {
  const snapshot = await issuedCollection(prescriberUid).orderBy("issued_at", "desc").limit(limit).get();
  const now = Date.now();
  return snapshot.docs.map((doc) => ({
    rxId: doc.id,
    med: doc.get("med") ?? "",
    dose: doc.get("dose") ?? "",
    duration: doc.get("duration") ?? "",
    issuedAt: iso(doc.get("issued_at")),
    expiresAt: iso(doc.get("expires_at")),
    claimed: Boolean(doc.get("claimed_at")),
    expired: !doc.get("claimed_at") && (doc.get("expires_at")?.toMillis?.() ?? Infinity) < now,
    revoked: Boolean(doc.get("revoked_at")),
    pinProtected: Boolean(doc.get("pin_hash")),
    locked: Boolean(doc.get("locked_at")),
  }));
}

/**
 * Withdraw a code the prescriber issued, so it can no longer be saved as
 * verified (existing unclaimed copies keep working only as unverified records).
 * A code a patient has already saved cannot be revoked: that record is theirs.
 * Revoking twice is fine.
 */
export async function revokeIssued(prescriberUid: string, rxId: string): Promise<void> {
  const ref = issuedCollection(prescriberUid).doc(rxId);
  await getDb().runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new BackendError("Prescription code not found.", 404);
    if (doc.get("claimed_at")) {
      throw new BackendError("A patient has already saved this prescription, so it can't be revoked.", 409);
    }
    if (!doc.get("revoked_at")) tx.update(ref, { revoked_at: FieldValue.serverTimestamp() });
  });
}

/**
 * Check a scanned token for the review screen: signature, expiry, whether
 * the reviewed fields still match, whether it has been claimed, revoked or
 * locked, and whether a PIN is needed. The save route repeats these checks and
 * claims atomically; this is advisory so the user sees the outcome before saving.
 */
export async function checkRx(uid: string, token: string, input: PrescriptionInput): Promise<RxCheck> {
  const result = verifyRx(token);
  if (!result.valid) return { status: "invalid", reason: result.reason };
  const { payload } = result;

  const db = getDb();
  const [claim, issued] = await Promise.all([
    db.collection("rx_claims").doc(payload.jti).get(),
    issuedCollection(payload.iss).doc(payload.jti).get(),
  ]);

  if (claim.exists) {
    return { status: "invalid", reason: claim.get("uid") === uid ? "duplicate" : "claimed" };
  }
  // No issued record means the prescriber's account (and codes) were deleted: treat as withdrawn.
  if (!issued.exists || issued.get("revoked_at")) return { status: "invalid", reason: "revoked" };
  if (issued.get("locked_at")) return { status: "invalid", reason: "locked" };

  return {
    status: "verified",
    prescriberName: payload.isn,
    issuedAt: new Date(payload.iat * 1000).toISOString(),
    matches: rxMatches(payload, input),
    pinRequired: Boolean(payload.pin),
  };
}

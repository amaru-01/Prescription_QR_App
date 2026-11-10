import { Timestamp } from "firebase-admin/firestore";

import type { PrescriptionInput, RxCheck } from "@/types/prescription";
import type { SessionUser } from "@/types/auth";
import { BackendError } from "./errors";
import { getDb } from "./firebase";
import { newRxId, RX_RECORD_RETENTION_SECONDS, rxMatches, signRx, verifyRx } from "./rx-signing";

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
}

function issuedCollection(prescriberUid: string) {
  return getDb().collection("users").doc(prescriberUid).collection("issued");
}

const iso = (value: unknown): string => {
  const ts = value as { toDate?: () => Date } | undefined;
  return typeof ts?.toDate === "function" ? ts.toDate().toISOString() : "";
};

/**
 * Sign a prescription for the patient to scan. Returns the QR text: plain
 * fields (readable by any version of the app) plus the signed `rx` token.
 */
export async function issuePrescription(
  prescriber: SessionUser,
  input: PrescriptionInput
): Promise<{ qrText: string; issued: IssuedRx }> {
  // Sign only the name an administrator vouched for, never the self-editable display name.
  const prescriberName = prescriber.credentialName;
  if (!prescriberName) {
    throw new BackendError(
      "Your prescriber profile has no verified name yet. Ask an administrator to set it before you issue prescriptions.",
      403
    );
  }
  const { token, payload } = signRx({ jti: newRxId(), iss: prescriber.uid, isn: prescriberName, ...input });

  const issuedAt = Timestamp.fromMillis(payload.iat * 1000);
  const expiresAt = Timestamp.fromMillis(payload.exp * 1000);
  await issuedCollection(prescriber.uid).doc(payload.jti).set({
    med: input.med,
    dose: input.dose,
    duration: input.duration,
    issued_at: issuedAt,
    expires_at: expiresAt,
    claimed_at: null,
    purge_at: Timestamp.fromMillis((payload.exp + RX_RECORD_RETENTION_SECONDS) * 1000),
  });

  return {
    qrText: JSON.stringify({ med: input.med, dose: input.dose, duration: input.duration, rx: token }),
    issued: {
      rxId: payload.jti,
      ...input,
      issuedAt: issuedAt.toDate().toISOString(),
      expiresAt: expiresAt.toDate().toISOString(),
      claimed: false,
      expired: false,
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
  }));
}

/**
 * Check a scanned token for the review screen: signature, expiry, whether
 * the reviewed fields still match, and whether it has already been claimed.
 * The save route repeats the signature check and claims atomically; this is
 * advisory so the user sees the outcome before saving.
 */
export async function checkRx(uid: string, token: string, input: PrescriptionInput): Promise<RxCheck> {
  const result = verifyRx(token);
  if (!result.valid) return { status: "invalid", reason: result.reason };

  const claim = await getDb().collection("rx_claims").doc(result.payload.jti).get();
  if (claim.exists) {
    return { status: "invalid", reason: claim.get("uid") === uid ? "duplicate" : "claimed" };
  }

  return {
    status: "verified",
    prescriberName: result.payload.isn,
    issuedAt: new Date(result.payload.iat * 1000).toISOString(),
    matches: rxMatches(result.payload, input),
  };
}

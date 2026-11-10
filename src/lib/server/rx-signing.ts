import crypto from "node:crypto";

/**
 * Signed prescription tokens ("vd1" format).
 *
 *   vd1.<base64url(payload JSON)>.<base64url(Ed25519 signature)>
 *
 * The signature covers the literal bytes of `vd1.<payload>`, like a compact
 * JWS. Only this server holds the private key and it only signs for
 * accounts with the prescriber role, so a valid token proves the
 * prescription was issued through VeriDose by that prescriber and has not
 * been altered since. The QR also carries plain med/dose/duration so older
 * app versions can still read it.
 */

export const RX_TOKEN_PREFIX = "vd1";
/** Claim windows a prescriber can choose, in days. */
export const RX_VALIDITY_DAYS = [1, 7, 30] as const;
export type RxValidityDays = (typeof RX_VALIDITY_DAYS)[number];
/** How long a patient has to save (claim) a newly issued prescription, unless the prescriber picks another. */
export const RX_CLAIM_WINDOW_SECONDS = 7 * 24 * 60 * 60;
/**
 * Issued-code and claim records are kept this long after the code expires, then
 * removed by a Firestore TTL policy on their `purge_at` field. Claims must
 * outlive the code itself, otherwise an expired-but-copied QR could be claimed twice.
 */
export const RX_RECORD_RETENTION_SECONDS = 90 * 24 * 60 * 60;

export interface RxPayload {
  v: 1;
  /** Unique id of this issued prescription; used for single-use claiming. */
  jti: string;
  /** Issuing prescriber's uid. */
  iss: string;
  /** Prescriber display name at the time of issue. */
  isn: string;
  /** Signing key id, so a rotated key fails with a clear reason. */
  kid: string;
  med: string;
  dose: string;
  duration: string;
  /** True when the prescriber required a one-time PIN to claim this code. */
  pin?: true;
  /** Issued at / expires at, in Unix seconds. */
  iat: number;
  exp: number;
}

export type RxVerification =
  | { valid: true; payload: RxPayload }
  | { valid: false; reason: "malformed" | "bad_signature" | "unknown_key" | "expired" | "not_configured" };

const b64url = (buffer: Buffer) => buffer.toString("base64url");

let cachedKeys: { privateKey: crypto.KeyObject; publicKey: crypto.KeyObject; kid: string } | null = null;

/**
 * Load the Ed25519 key from RX_SIGNING_PRIVATE_KEY: a PKCS#8 PEM (with real
 * or `\n`-escaped newlines), or the base64 of the PKCS#8 DER.
 */
function loadKeys() {
  if (cachedKeys) return cachedKeys;
  const raw = process.env.RX_SIGNING_PRIVATE_KEY;
  if (!raw) return null;

  const privateKey = raw.includes("BEGIN")
    ? crypto.createPrivateKey(raw.replace(/\\n/g, "\n"))
    : crypto.createPrivateKey({ key: Buffer.from(raw, "base64"), format: "der", type: "pkcs8" });
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("RX_SIGNING_PRIVATE_KEY must be an Ed25519 key.");
  }

  const publicKey = crypto.createPublicKey(privateKey);
  const spki = publicKey.export({ format: "der", type: "spki" });
  const kid = crypto.createHash("sha256").update(spki).digest("base64url").slice(0, 12);
  cachedKeys = { privateKey, publicKey, kid };
  return cachedKeys;
}

export function isSigningConfigured(): boolean {
  return Boolean(process.env.RX_SIGNING_PRIVATE_KEY);
}

/** Test hook: forget the cached key after changing the environment. */
export function resetSigningKeyCache(): void {
  cachedKeys = null;
}

export function newRxId(): string {
  return b64url(crypto.randomBytes(15));
}

export function signRx(
  fields: Omit<RxPayload, "v" | "kid" | "iat" | "exp">,
  now = new Date(),
  windowSeconds = RX_CLAIM_WINDOW_SECONDS
): {
  token: string;
  payload: RxPayload;
} {
  const keys = loadKeys();
  if (!keys) throw new Error("RX_SIGNING_PRIVATE_KEY is not configured.");

  const iat = Math.floor(now.getTime() / 1000);
  const payload: RxPayload = { v: 1, ...fields, kid: keys.kid, iat, exp: iat + windowSeconds };
  const signingInput = `${RX_TOKEN_PREFIX}.${b64url(Buffer.from(JSON.stringify(payload), "utf8"))}`;
  const signature = crypto.sign(null, Buffer.from(signingInput, "ascii"), keys.privateKey);
  return { token: `${signingInput}.${b64url(signature)}`, payload };
}

function isPayload(value: unknown): value is RxPayload {
  const p = value as Partial<RxPayload> | null;
  return (
    !!p &&
    p.v === 1 &&
    [p.jti, p.iss, p.isn, p.kid, p.med, p.dose, p.duration].every((field) => typeof field === "string" && field) &&
    (p.pin === undefined || p.pin === true) &&
    Number.isInteger(p.iat) &&
    Number.isInteger(p.exp)
  );
}

export function verifyRx(token: string, now = new Date()): RxVerification {
  const keys = loadKeys();
  if (!keys) return { valid: false, reason: "not_configured" };

  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts[0] !== RX_TOKEN_PREFIX || token.length > 4096) {
    return { valid: false, reason: "malformed" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!isPayload(payload)) return { valid: false, reason: "malformed" };
  if (payload.kid !== keys.kid) return { valid: false, reason: "unknown_key" };

  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, "ascii");
  const signature = Buffer.from(parts[2], "base64url");
  if (!crypto.verify(null, signingInput, keys.publicKey, signature)) {
    return { valid: false, reason: "bad_signature" };
  }

  if (payload.exp * 1000 < now.getTime()) return { valid: false, reason: "expired" };
  return { valid: true, payload };
}

/** True when the reviewed fields are exactly what the prescriber signed. */
export function rxMatches(
  payload: Pick<RxPayload, "med" | "dose" | "duration">,
  input: { med: string; dose: string; duration: string }
): boolean {
  return payload.med === input.med && payload.dose === input.dose && payload.duration === input.duration;
}

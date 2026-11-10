import crypto from "node:crypto";

/**
 * One-time PINs for prescription codes.
 *
 * A prescriber can require a PIN (shown once, read out to the patient) so a
 * photographed or forwarded QR cannot be claimed by someone else. Only a keyed
 * hash is stored, never the PIN. The PIN space is small (10^6), so the real
 * protection is the attempt limit: after MAX_PIN_ATTEMPTS wrong tries the code
 * is locked and the prescriber must issue a new one.
 */
export const PIN_LENGTH = 6;
export const MAX_PIN_ATTEMPTS = 5;

/** A random 6-digit PIN (leading zeros kept). */
export function generatePin(): string {
  return String(crypto.randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
}

/**
 * Key for the PIN hash, derived from the signing key so no extra secret has to
 * be configured. Rotating RX_SIGNING_PRIVATE_KEY already invalidates unsaved
 * codes, so it invalidates their PINs too.
 */
function pinKey(): Buffer {
  const secret = process.env.RX_SIGNING_PRIVATE_KEY;
  if (!secret) throw new Error("RX_SIGNING_PRIVATE_KEY is not configured.");
  return crypto.createHash("sha256").update(`veridose-pin-v1:${secret}`).digest();
}

/** Keyed hash of a PIN, bound to the code id so a hash cannot be reused on another code. */
export function hashPin(rxId: string, pin: string): string {
  return crypto.createHmac("sha256", pinKey()).update(`${rxId}:${pin}`).digest("hex");
}

/** Constant-time check of a PIN against a stored hash. */
export function pinMatches(rxId: string, pin: string, storedHash: unknown): boolean {
  if (typeof storedHash !== "string") return false;
  const expected = Buffer.from(hashPin(rxId, pin), "hex");
  const actual = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

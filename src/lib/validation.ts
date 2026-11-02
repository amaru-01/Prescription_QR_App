import { z } from "zod";

import { fieldErrorsFrom, KNOWN_QR_FIELDS, prescriptionInputSchema } from "@/lib/schemas";
import type { PrescriptionInput, PrescriptionFieldErrors, ParseResult } from "@/types/prescription";

/**
 * Deliberately lenient: a QR code only needs the three fields as non-empty
 * text. Length limits are checked at save time, so an over-long value lands
 * on the review screen where the user can fix it instead of a dead end.
 */
const qrPayloadSchema = z.object({
  med: z.string({ error: "Missing medication name (med)" }).trim().min(1, "Missing medication name (med)"),
  dose: z.string({ error: "Missing dosage (dose)" }).trim().min(1, "Missing dosage (dose)"),
  duration: z.string({ error: "Missing duration" }).trim().min(1, "Missing duration"),
});

/**
 * Parse prescription payload from QR code or manual input.
 * Handles JSON parsing and basic structure validation.
 */
export function parsePrescriptionPayload(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "Could not read the QR code. Please try again." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "The QR code does not contain valid data." };
  }

  const result = qrPayloadSchema.safeParse(parsed);
  if (!result.success) {
    const fieldErrors = fieldErrorsFrom(result.error);
    return {
      ok: false,
      message: result.error.issues[0]?.message ?? "The QR code is missing prescription details.",
      fieldErrors: Object.fromEntries(Object.keys(fieldErrors).map((key) => [key, "Required"])),
    };
  }

  const extraFields = Object.keys(parsed).filter((key) => !KNOWN_QR_FIELDS.includes(key));
  const warnings = extraFields.length > 0 ? [`Extra fields ignored: ${extraFields.join(", ")}`] : [];

  // A prescriber-signed code carries its token in `rx`; the server checks it.
  const rx = (parsed as { rx?: unknown }).rx;
  return {
    ok: true,
    value: result.data,
    ...(typeof rx === "string" && rx ? { rx } : {}),
    warnings,
  };
}

/**
 * Validate prescription input before saving (same rules the API enforces).
 */
export function validatePrescription(
  input: PrescriptionInput
): { ok: true; value: PrescriptionInput } | { ok: false; errors: PrescriptionFieldErrors } {
  const result = prescriptionInputSchema.safeParse(input);
  if (!result.success) return { ok: false, errors: fieldErrorsFrom(result.error) };
  return { ok: true, value: result.data };
}

import type { PrescriptionInput, PrescriptionFieldErrors, ParseResult } from "@/types/prescription";

/**
 * Parse prescription payload from QR code or manual input.
 * Handles JSON parsing and basic structure validation.
 */
export function parsePrescriptionPayload(raw: string): ParseResult {
  try {
    const parsed = JSON.parse(raw);
    
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, message: "The QR code does not contain valid data." };
    }

    const warnings: string[] = [];
    
    // Check for required fields
    if (!parsed.med || typeof parsed.med !== "string") {
      return { ok: false, message: "Missing medication name (med)", fieldErrors: { med: "Required" } };
    }
    if (!parsed.dose || typeof parsed.dose !== "string") {
      return { ok: false, message: "Missing dosage (dose)", fieldErrors: { dose: "Required" } };
    }
    if (!parsed.duration || typeof parsed.duration !== "string") {
      return { ok: false, message: "Missing duration", fieldErrors: { duration: "Required" } };
    }

    // Warn about extra fields
    const knownFields = ["med", "dose", "duration", "notes", "source"];
    const extraFields = Object.keys(parsed).filter((key) => !knownFields.includes(key));
    if (extraFields.length > 0) {
      warnings.push(`Extra fields ignored: ${extraFields.join(", ")}`);
    }

    return {
      ok: true,
      value: {
        med: parsed.med,
        dose: parsed.dose,
        duration: parsed.duration,
      },
      warnings,
    };
  } catch (error) {
    return { ok: false, message: "Could not read the QR code. Please try again." };
  }
}

/**
 * Validate prescription input - mirrors FastAPI Pydantic model validation.
 */
export function validatePrescription(
  input: PrescriptionInput
): { ok: true; value: PrescriptionInput } | { ok: false; errors: PrescriptionFieldErrors } {
  const errors: PrescriptionFieldErrors = {};

  // Validate medication name
  if (!input.med || typeof input.med !== "string" || !input.med.trim()) {
    errors.med = "Medication name cannot be empty";
  } else if (input.med.trim().length > 120) {
    errors.med = "Medication name is too long (max 120 characters)";
  }

  // Validate dose
  if (!input.dose || typeof input.dose !== "string" || !input.dose.trim()) {
    errors.dose = "Dosage cannot be empty";
  } else if (input.dose.trim().length > 120) {
    errors.dose = "Dosage is too long (max 120 characters)";
  }

  // Validate duration
  if (!input.duration || typeof input.duration !== "string" || !input.duration.trim()) {
    errors.duration = "Duration cannot be empty";
  } else if (input.duration.trim().length > 120) {
    errors.duration = "Duration is too long (max 120 characters)";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      med: input.med.trim(),
      dose: input.dose.trim(),
      duration: input.duration.trim(),
    },
  };
}

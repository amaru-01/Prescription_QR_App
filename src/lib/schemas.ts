import { z } from "zod";

import type { PrescriptionFieldErrors } from "@/types/prescription";

/**
 * Single source of truth for prescription data rules, shared by the scan UI,
 * the manual entry form and the API routes, so client and server can never
 * disagree about what is valid.
 */

export const MAX_FIELD_LENGTH = 120;
export const MAX_NOTES_LENGTH = 500;
export const MAX_LIST_LIMIT = 500;
export const DEFAULT_PAGE_SIZE = 50;

export const PRESCRIPTION_STATUSES = ["active", "completed", "archived"] as const;
export const PRESCRIPTION_SOURCES = ["scan", "upload", "manual", "demo"] as const;

const requiredText = (label: string) =>
  z
    .string({ error: `${label} cannot be empty` })
    .trim()
    .min(1, `${label} cannot be empty`)
    .max(MAX_FIELD_LENGTH, `${label} is too long (max ${MAX_FIELD_LENGTH} characters)`);

/** Firestore auto-ids are 20 chars; allow some slack but never path separators. */
export const documentIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const statusSchema = z.enum(PRESCRIPTION_STATUSES);
export const sourceSchema = z.enum(PRESCRIPTION_SOURCES);

/** Empty or whitespace-only notes are stored as null. */
export const notesSchema = z
  .string({ error: "Notes must be text" })
  .trim()
  .max(MAX_NOTES_LENGTH, `Notes must be ${MAX_NOTES_LENGTH} characters or fewer`)
  .transform((value) => (value ? value : null))
  .nullable();

/** The three fields carried by a prescription QR code. */
export const prescriptionInputSchema = z.object({
  med: requiredText("Medication name"),
  dose: requiredText("Dosage"),
  duration: requiredText("Duration"),
});

/** POST /api/save body. Unknown sources fall back to "scan" for older clients. */
export const saveRequestSchema = prescriptionInputSchema.extend({
  source: sourceSchema.catch("scan").default("scan"),
  notes: notesSchema.optional(),
});

/** PATCH /api/prescriptions/[id] body. */
export const updateRequestSchema = z
  .object({
    status: statusSchema.optional(),
    notes: notesSchema.optional(),
  })
  .refine((value) => value.status !== undefined || value.notes !== undefined, {
    message: "Provide a status or notes field to update.",
  });

/** GET /api/prescriptions query string. */
export const listQuerySchema = z.object({
  limit: z.coerce
    .number({ error: "Limit must be a positive integer." })
    .int("Limit must be a positive integer.")
    .min(1, `Limit must be between 1 and ${MAX_LIST_LIMIT}.`)
    .max(MAX_LIST_LIMIT, `Limit must be between 1 and ${MAX_LIST_LIMIT}.`)
    .default(100),
  cursor: documentIdSchema.optional(),
});

/** Keys a QR payload may carry without triggering an "ignored" warning. */
export const KNOWN_QR_FIELDS = ["med", "dose", "duration", "notes", "source"];

/** First message per prescription field, in the shape the forms already render. */
export function fieldErrorsFrom(error: z.ZodError): PrescriptionFieldErrors {
  const errors: PrescriptionFieldErrors = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if ((field === "med" || field === "dose" || field === "duration") && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/** First human-readable message from a validation error. */
export function firstMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request.";
}

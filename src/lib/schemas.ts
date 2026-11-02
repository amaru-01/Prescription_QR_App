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

/** Signed token from a prescriber-issued QR code (format checked by the server). */
export const rxTokenSchema = z.string().min(1).max(4096);

/** POST /api/save body. Unknown sources fall back to "scan" for older clients. */
export const saveRequestSchema = prescriptionInputSchema.extend({
  source: sourceSchema.catch("scan").default("scan"),
  notes: notesSchema.optional(),
  rx: rxTokenSchema.optional(),
});

/** POST /api/rx/verify body: the token plus the fields as currently reviewed. */
export const rxVerifyRequestSchema = prescriptionInputSchema.extend({ rx: rxTokenSchema });

/** POST /api/rx/issue body. */
export const rxIssueRequestSchema = prescriptionInputSchema;

const timeZoneSchema = z
  .string()
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone.");

/** PUT /api/reminders/[id] body. */
export const reminderUpdateSchema = z
  .object({
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:MM (24-hour).").optional(),
    notify: z.boolean().optional(),
    timezone: timeZoneSchema,
  })
  .refine((value) => value.time !== undefined || value.notify !== undefined, {
    message: "Provide a time or notify field to update.",
  });

/** POST /api/reminders/[id]/doses body. */
export const doseRequestSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Day must be a date in YYYY-MM-DD format."),
  taken: z.boolean(),
});

/** POST /api/reminders/import body: the old on-device reminder map. */
export const reminderImportSchema = z.object({
  timezone: timeZoneSchema,
  reminders: z.record(
    documentIdSchema,
    z.object({ time: z.string().max(5), log: z.array(z.string().max(10)).max(400) })
  ),
});

/** POST /api/push/subscription body (a browser PushSubscription as JSON). */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(128) }),
});

export const pushUnsubscribeSchema = z.object({ endpoint: z.string().max(2048) });

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
export const KNOWN_QR_FIELDS = ["med", "dose", "duration", "notes", "source", "rx"];

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

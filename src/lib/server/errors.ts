import type { z } from "zod";

import { fieldErrorsFrom, firstMessage } from "@/lib/schemas";
import type { PrescriptionFieldErrors } from "@/types/prescription";
import { logger } from "./logger";
import { currentContext } from "./request-context";
import { securityEvent } from "./security-log";

/**
 * Custom error class for backend errors. Its message is safe to show to users;
 * anything that is not a BackendError is treated as internal and never echoed.
 */
export class BackendError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errors?: PrescriptionFieldErrors,
    /** Seconds the client should wait before retrying (sent as Retry-After). */
    public retryAfter?: number
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/**
 * Parse with a Zod schema, or throw a 422 carrying per-field messages.
 * `fieldMessage` is the summary used when prescription fields are invalid;
 * other problems (e.g. notes too long) surface their own message.
 */
export function parseOrThrow<T extends z.ZodType>(
  schema: T,
  data: unknown,
  fieldMessage?: string
): z.output<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const errors = fieldErrorsFrom(result.error);
  const hasFieldErrors = Object.keys(errors).length > 0;
  throw new BackendError(
    hasFieldErrors && fieldMessage ? fieldMessage : firstMessage(result.error),
    422,
    hasFieldErrors ? errors : undefined
  );
}

/**
 * Standard error response helper for API routes.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof BackendError) {
    if (error.statusCode >= 500) logger.error("API error", { status: error.statusCode, error });
    // Refusals worth alerting on. 401s are left out: expired sessions are routine.
    else if (error.statusCode === 403) securityEvent("forbidden", { status: 403, reason: error.message });
    else if (error.statusCode === 429) securityEvent("rate_limited", { status: 429 });
    return Response.json(
      {
        success: false,
        detail: error.message,
        errors: error.errors,
      },
      {
        status: error.statusCode,
        headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : undefined,
      }
    );
  }

  // Unexpected failures: log the details server-side, return only a reference id.
  // The same id the response header and every other log line for this request carry.
  const requestId = currentContext()?.requestId ?? crypto.randomUUID();
  logger.error("Unhandled API error", { requestId, error });

  return Response.json(
    {
      success: false,
      detail: "Something went wrong on our side. Please try again.",
      request_id: requestId,
    },
    { status: 500 }
  );
}

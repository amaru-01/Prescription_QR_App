import type { PrescriptionFieldErrors } from "@/types/prescription";

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
 * Standard error response helper for API routes.
 */
export function errorResponse(error: unknown): Response {
  if (error instanceof BackendError) {
    if (error.statusCode >= 500) console.error("API Error:", error);
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
  const requestId = crypto.randomUUID();
  console.error(`API Error [${requestId}]:`, error);

  return Response.json(
    {
      success: false,
      detail: "Something went wrong on our side. Please try again.",
      request_id: requestId,
    },
    { status: 500 }
  );
}

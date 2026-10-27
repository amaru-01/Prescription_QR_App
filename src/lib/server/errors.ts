import type { PrescriptionFieldErrors } from "@/types/prescription";

/**
 * Custom error class for backend errors.
 */
export class BackendError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public errors?: PrescriptionFieldErrors
  ) {
    super(message);
    this.name = "BackendError";
  }
}

/**
 * Standard error response helper for API routes.
 */
export function errorResponse(error: unknown): Response {
  console.error("API Error:", error);

  if (error instanceof BackendError) {
    return Response.json(
      {
        success: false,
        detail: error.message,
        errors: error.errors,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    return Response.json(
      {
        success: false,
        detail: error.message,
      },
      { status: 500 }
    );
  }

  return Response.json(
    {
      success: false,
      detail: "An unexpected error occurred",
    },
    { status: 500 }
  );
}

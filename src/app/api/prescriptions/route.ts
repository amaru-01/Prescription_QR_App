import { BackendError, errorResponse } from "@/lib/server/errors";
import { listPrescriptions } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/**
 * GET /api/prescriptions?limit=10
 * Unchanged response contract: { success, count, prescriptions[] }.
 * Records include the original fields plus normalized status/source/notes.
 */
export async function GET(request: Request) {
  try {
    const rawLimit = new URL(request.url).searchParams.get("limit");
    let limit = 100;

    if (rawLimit !== null) {
      if (!/^\d+$/.test(rawLimit)) {
        throw new BackendError("Limit must be a positive integer.", 400);
      }

      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new BackendError("Limit must be a positive integer.", 400);
      }
    }

    const prescriptions = await listPrescriptions(limit);
    return Response.json({
      success: true,
      count: prescriptions.length,
      prescriptions,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

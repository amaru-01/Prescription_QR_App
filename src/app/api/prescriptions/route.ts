import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { listPrescriptions, MAX_LIST_LIMIT } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/**
 * GET /api/prescriptions?limit=10
 * Unchanged response contract: { success, count, prescriptions[] }, scoped to
 * the signed-in user. Records include normalized status/source/notes.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();

    const rawLimit = new URL(request.url).searchParams.get("limit");
    let limit = 100;

    if (rawLimit !== null) {
      if (!/^\d+$/.test(rawLimit)) {
        throw new BackendError("Limit must be a positive integer.", 400);
      }

      limit = Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
        throw new BackendError(`Limit must be between 1 and ${MAX_LIST_LIMIT}.`, 400);
      }
    }

    const prescriptions = await listPrescriptions(user.uid, limit);
    return Response.json(
      {
        success: true,
        count: prescriptions.length,
        prescriptions,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

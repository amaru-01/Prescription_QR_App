import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { listPrescriptionPage } from "@/lib/server/prescriptions";
import { firstMessage, listQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/prescriptions?limit=50&cursor=<id>
 * One page of the signed-in user's prescriptions, newest first:
 * { success, count, prescriptions[], next_cursor }.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();

    const params = new URL(request.url).searchParams;
    const query = listQuerySchema.safeParse({
      limit: params.get("limit") ?? undefined,
      cursor: params.get("cursor") ?? undefined,
    });
    if (!query.success) throw new BackendError(firstMessage(query.error), 400);

    const page = await listPrescriptionPage(user.uid, query.data);
    return Response.json(
      {
        success: true,
        count: page.prescriptions.length,
        prescriptions: page.prescriptions,
        next_cursor: page.nextCursor,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

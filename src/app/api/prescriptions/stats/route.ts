import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { getPrescriptionStats } from "@/lib/server/prescriptions";
import { rateLimit } from "@/lib/server/security";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

/** GET /api/prescriptions/stats — totals across all of the user's records. */
async function handleGET() {
  try {
    const user = await requireUser();
    await rateLimit(`read:${user.uid}`, 120, 60_000);
    const stats = await getPrescriptionStats(user.uid);
    return Response.json({ success: true, stats }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequest(handleGET);

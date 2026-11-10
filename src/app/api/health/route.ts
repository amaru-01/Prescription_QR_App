import { errorResponse } from "@/lib/server/errors";
import { getHealth } from "@/lib/server/prescriptions";
import { clientIp, rateLimit } from "@/lib/server/security";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Public liveness check used by the Settings connection card.
 */
export async function GET(request: Request) {
  try {
    await rateLimit(`health:${clientIp(request)}`, 60, 60_000);
    const health = await getHealth();
    return Response.json(health, { status: health.ok ? 200 : 503 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { errorResponse } from "@/lib/server/errors";
import { getHealth } from "@/lib/server/prescriptions";
import { clientIp, rateLimit } from "@/lib/server/security";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Public liveness check used by the Settings connection card.
 */
async function handleGET(request: Request) {
  try {
    await rateLimit(`health:${clientIp(request)}`, 60, 60_000);
    const cron = new URL(request.url).searchParams.get("cron") === "1";
    const health = await getHealth({ includeCron: cron });
    // `?cron=1` is for a second uptime monitor: it also fails when the reminder scheduler has stopped.
    const stale = health.reminders?.status === "stale";
    return Response.json(health, { status: health.ok && !stale ? 200 : 503 });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequest(handleGET);

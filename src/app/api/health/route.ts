import { getHealth } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Public liveness check used by the Settings connection card.
 */
export async function GET() {
  const health = await getHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}

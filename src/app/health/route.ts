import { getHealth } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/**
 * GET /health
 * Alias of `/api/health` for uptime monitors that expect a root-level path.
 */
export async function GET() {
  const health = await getHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}

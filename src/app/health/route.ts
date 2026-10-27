import { getHealth } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/**
 * GET /health
 * Compatibility alias for the original FastAPI health endpoint. `/api/health`
 * remains the primary path used by the UI.
 */
export async function GET() {
  const health = await getHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}

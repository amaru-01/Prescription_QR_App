import { getHealth } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 * Mirrors FastAPI `GET /health` and adds `mode`/`storage` so the UI can show
 * whether it is talking to the Python/Firebase backend or the local store.
 */
export async function GET() {
  const health = await getHealth();
  return Response.json(health, { status: health.ok ? 200 : 503 });
}

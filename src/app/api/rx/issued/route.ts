import { requirePrescriber } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { listIssued } from "@/lib/server/rx";
import { rateLimit } from "@/lib/server/security";

export const dynamic = "force-dynamic";

/** GET /api/rx/issued — the prescriber's 20 most recently issued codes. */
export async function GET() {
  try {
    const user = await requirePrescriber();
    await rateLimit(`read:${user.uid}`, 120, 60_000);
    const issued = await listIssued(user.uid);
    return Response.json({ success: true, issued }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

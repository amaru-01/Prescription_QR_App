import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { exportPrescriptionsStream } from "@/lib/server/prescriptions";
import { rateLimit } from "@/lib/server/security";

export const dynamic = "force-dynamic";

/** GET /api/prescriptions/export — CSV download of the signed-in user's prescriptions. */
export async function GET() {
  try {
    const user = await requireUser();
    await rateLimit(`export:${user.uid}`, 5, 60_000);

    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(exportPrescriptionsStream(user.uid), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prescriptions-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

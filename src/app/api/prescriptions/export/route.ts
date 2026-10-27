import { errorResponse } from "@/lib/server/errors";
import { exportPrescriptions } from "@/lib/server/prescriptions";

export const dynamic = "force-dynamic";

/** GET /api/prescriptions/export — CSV download of prescriptions. */
export async function GET() {
  try {
    const csv = await exportPrescriptions();
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
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

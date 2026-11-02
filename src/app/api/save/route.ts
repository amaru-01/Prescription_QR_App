import { requireUser } from "@/lib/server/auth";
import { errorResponse, parseOrThrow } from "@/lib/server/errors";
import { savePrescription } from "@/lib/server/prescriptions";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { saveRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * POST /api/save
 * Body: { med, dose, duration, source?, notes? } → saved for the signed-in user.
 */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    rateLimit(`save:${user.uid}`, 30, 60_000);

    const body = await readJsonBody(request);
    const { source, notes, ...input } = parseOrThrow(
      saveRequestSchema,
      body,
      "Please check the prescription fields."
    );

    const result = await savePrescription(user.uid, input, { source, notes: notes ?? null });

    return Response.json({
      success: true,
      message: "Prescription saved successfully",
      document_id: result.documentId,
      prescription: result.prescription,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

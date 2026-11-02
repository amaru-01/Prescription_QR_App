import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { savePrescription } from "@/lib/server/prescriptions";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { validatePrescription } from "@/lib/validation";
import type { PrescriptionSource } from "@/types/prescription";

export const dynamic = "force-dynamic";

const SOURCES: PrescriptionSource[] = ["scan", "upload", "manual", "demo"];

/** Keep in step with the PATCH /api/prescriptions/[id] notes limit. */
const MAX_NOTES_LENGTH = 500;

/** Non-string values (missing, null, numbers...) become "" so the validator rejects them. */
const asString = (value: unknown): string =>
  typeof value === "string" ? value : "";

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

    const validation = validatePrescription({
      med: asString(body.med),
      dose: asString(body.dose),
      duration: asString(body.duration),
    });
    if (!validation.ok) {
      throw new BackendError("Please check the prescription fields.", 422, validation.errors);
    }

    const source = SOURCES.includes(body.source as PrescriptionSource)
      ? (body.source as PrescriptionSource)
      : "scan";
    const notes = typeof body.notes === "string" ? body.notes.slice(0, MAX_NOTES_LENGTH) : null;

    const result = await savePrescription(user.uid, validation.value, { source, notes });

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

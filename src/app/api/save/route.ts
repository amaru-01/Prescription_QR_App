import { BackendError, errorResponse } from "@/lib/server/errors";
import { savePrescription } from "@/lib/server/prescriptions";
import { validatePrescription } from "@/lib/validation";
import type { PrescriptionSource } from "@/types/prescription";

export const dynamic = "force-dynamic";

const SOURCES: PrescriptionSource[] = ["scan", "upload", "manual", "demo"];

/**
 * POST /api/save
 * Body: { med, dose, duration }  → same contract as the Python backend.
 * Additive optional fields (source, notes) are ignored when proxying to FastAPI.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      throw new BackendError("Send a JSON body with med, dose, and duration.", 400);
    }

    const validation = validatePrescription({
      med: body.med,
      dose: body.dose,
      duration: body.duration,
    });
    if (!validation.ok) {
      throw new BackendError("Please check the prescription fields.", 422, validation.errors);
    }

    const source = SOURCES.includes(body.source as PrescriptionSource)
      ? (body.source as PrescriptionSource)
      : "scan";
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 1000) : null;

    const result = await savePrescription(validation.value, {
      source,
      notes,
      userAgent: request.headers.get("user-agent"),
    });

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

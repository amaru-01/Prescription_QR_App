import { BackendError, errorResponse } from "@/lib/server/errors";
import {
  deletePrescription,
  getPrescriptionById,
  updatePrescription,
} from "@/lib/server/prescriptions";
import type { PrescriptionStatus, PrescriptionUpdate } from "@/types/prescription";

export const dynamic = "force-dynamic";

const STATUSES: PrescriptionStatus[] = ["active", "completed", "archived"];

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const prescription = await getPrescriptionById(id);
    return Response.json({ success: true, prescription });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) throw new BackendError("Send a JSON body with status or notes.", 400);

    const updates: PrescriptionUpdate = {};
    if ("status" in body) {
      if (!STATUSES.includes(body.status as PrescriptionStatus)) {
        throw new BackendError("Unknown prescription status.", 422);
      }
      updates.status = body.status as PrescriptionStatus;
    }

    if ("notes" in body) {
      if (body.notes !== null && (typeof body.notes !== "string" || body.notes.length > 500)) {
        throw new BackendError("Notes must be text no longer than 500 characters.", 422);
      }
      updates.notes = body.notes;
    }

    if (Object.keys(updates).length === 0) {
      throw new BackendError("Provide a status or notes field to update.", 400);
    }

    await updatePrescription(id, updates);
    const prescription = await getPrescriptionById(id);
    return Response.json({ success: true, prescription });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    await deletePrescription(id);
    return Response.json({ success: true, message: "Prescription deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}

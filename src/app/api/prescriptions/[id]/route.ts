import { BackendError, errorResponse } from "@/lib/server/errors";
import {
  deletePrescription,
  getPrescriptionById,
  updatePrescriptionStatus,
} from "@/lib/server/prescriptions";
import type { PrescriptionStatus } from "@/types/prescription";

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
    if (!body) throw new BackendError("Send a JSON body with status.", 400);

    if (body.status === undefined) {
      throw new BackendError("Status field is required.", 400);
    }

    if (!STATUSES.includes(body.status as PrescriptionStatus)) {
      throw new BackendError("Unknown prescription status.", 422);
    }

    await updatePrescriptionStatus(id, body.status as PrescriptionStatus);
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

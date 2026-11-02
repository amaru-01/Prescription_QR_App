import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import {
  deletePrescription,
  getPrescriptionById,
  updatePrescription,
} from "@/lib/server/prescriptions";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import type { PrescriptionStatus, PrescriptionUpdate } from "@/types/prescription";

export const dynamic = "force-dynamic";

const STATUSES: PrescriptionStatus[] = ["active", "completed", "archived"];

/** Firestore auto-ids are 20 chars; allow a little slack but never path separators. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

type Context = { params: Promise<{ id: string }> };

async function prescriptionId(context: Context): Promise<string> {
  const { id } = await context.params;
  if (!ID_RE.test(id)) throw new BackendError("Prescription not found.", 404);
  return id;
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    const id = await prescriptionId(context);
    const prescription = await getPrescriptionById(user.uid, id);
    return Response.json({ success: true, prescription }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    rateLimit(`write:${user.uid}`, 60, 60_000);
    const id = await prescriptionId(context);
    const body = await readJsonBody(request);

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

    await updatePrescription(user.uid, id, updates);
    const prescription = await getPrescriptionById(user.uid, id);
    return Response.json({ success: true, prescription });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    rateLimit(`write:${user.uid}`, 60, 60_000);
    const id = await prescriptionId(context);
    await deletePrescription(user.uid, id);
    return Response.json({ success: true, message: "Prescription deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}

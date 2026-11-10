import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse, parseOrThrow } from "@/lib/server/errors";
import {
  deletePrescription,
  getPrescriptionById,
  updatePrescription,
} from "@/lib/server/prescriptions";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { documentIdSchema, updateRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function prescriptionId(context: Context): Promise<string> {
  const { id } = await context.params;
  if (!documentIdSchema.safeParse(id).success) throw new BackendError("Prescription not found.", 404);
  return id;
}

export async function GET(_request: Request, context: Context) {
  try {
    const user = await requireUser();
    await rateLimit(`read:${user.uid}`, 120, 60_000);
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
    await rateLimit(`write:${user.uid}`, 60, 60_000);
    const id = await prescriptionId(context);
    const updates = parseOrThrow(updateRequestSchema, await readJsonBody(request));

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
    await rateLimit(`write:${user.uid}`, 60, 60_000);
    const id = await prescriptionId(context);
    await deletePrescription(user.uid, id);
    return Response.json({ success: true, message: "Prescription deleted." });
  } catch (error) {
    return errorResponse(error);
  }
}

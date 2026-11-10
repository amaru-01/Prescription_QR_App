import { requirePrescriber } from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { revokeIssued } from "@/lib/server/rx";
import { assertSameOrigin, rateLimit } from "@/lib/server/security";
import { documentIdSchema } from "@/lib/schemas";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/rx/[id]/revoke — prescribers only. Withdraws a code they issued.
 * Only the issuing prescriber's own codes are reachable (the lookup is scoped
 * to their uid), and a code a patient already saved cannot be revoked.
 */
async function handlePOST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requirePrescriber();
    await rateLimit(`rx-revoke:${user.uid}`, 30, 60_000);

    const { id } = await context.params;
    if (!documentIdSchema.safeParse(id).success) throw new BackendError("Prescription code not found.", 404);

    await revokeIssued(user.uid, id);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequest(handlePOST);

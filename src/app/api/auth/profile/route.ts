import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { getAdminAuth } from "@/lib/server/firebase";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";

export const dynamic = "force-dynamic";

/** PATCH /api/auth/profile — Body: { name }. Updates the account display name. */
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    rateLimit(`profile:${user.uid}`, 10, 60_000);

    const body = await readJsonBody(request);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 60) {
      throw new BackendError("Display name must be between 2 and 60 characters.", 422);
    }

    await getAdminAuth().updateUser(user.uid, { displayName: name });
    return Response.json({ success: true, user: { ...user, name } });
  } catch (error) {
    return errorResponse(error);
  }
}

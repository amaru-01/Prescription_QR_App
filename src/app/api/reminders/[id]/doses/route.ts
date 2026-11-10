import { requireRegisteredUser } from "@/lib/server/auth";
import { BackendError, errorResponse, parseOrThrow } from "@/lib/server/errors";
import { setDoseTaken } from "@/lib/server/reminders";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { documentIdSchema, doseRequestSchema } from "@/lib/schemas";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** POST /api/reminders/[id]/doses — Body: { day: "YYYY-MM-DD", taken: boolean } */
async function handlePOST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireRegisteredUser();
    await rateLimit(`write:${user.uid}`, 60, 60_000);

    const { id } = await context.params;
    if (!documentIdSchema.safeParse(id).success) throw new BackendError("Prescription not found.", 404);

    const { day, taken } = parseOrThrow(doseRequestSchema, await readJsonBody(request));
    const reminder = await setDoseTaken(user.uid, id, day, taken);
    return Response.json({ success: true, reminder });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequest(handlePOST);

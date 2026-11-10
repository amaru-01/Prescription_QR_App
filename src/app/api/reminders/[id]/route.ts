import { requireRegisteredUser } from "@/lib/server/auth";
import { BackendError, errorResponse, parseOrThrow } from "@/lib/server/errors";
import { updateReminder } from "@/lib/server/reminders";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { documentIdSchema, reminderUpdateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** PUT /api/reminders/[id] — Body: { timezone, time?, notify? } */
export async function PUT(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = await requireRegisteredUser();
    await rateLimit(`write:${user.uid}`, 60, 60_000);

    const { id } = await context.params;
    if (!documentIdSchema.safeParse(id).success) throw new BackendError("Prescription not found.", 404);

    const changes = parseOrThrow(reminderUpdateSchema, await readJsonBody(request));
    const reminder = await updateReminder(user.uid, id, changes);
    return Response.json({ success: true, reminder });
  } catch (error) {
    return errorResponse(error);
  }
}

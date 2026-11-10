import { requireRegisteredUser } from "@/lib/server/auth";
import { errorResponse, parseOrThrow } from "@/lib/server/errors";
import { importReminders } from "@/lib/server/reminders";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { reminderImportSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** POST /api/reminders/import — one-time move of on-device reminders to the account. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireRegisteredUser();
    await rateLimit(`reminder-import:${user.uid}`, 5, 60_000);

    const { reminders, timezone } = parseOrThrow(reminderImportSchema, await readJsonBody(request, 256 * 1024));
    const imported = await importReminders(user.uid, reminders, timezone);
    return Response.json({ success: true, imported });
  } catch (error) {
    return errorResponse(error);
  }
}

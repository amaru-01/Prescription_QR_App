import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { isPushConfigured } from "@/lib/server/push";
import { hasPushSubscription, listReminders } from "@/lib/server/reminders";

export const dynamic = "force-dynamic";

/** GET /api/reminders — reminder state per prescription id, plus push availability. */
export async function GET() {
  try {
    const user = await requireUser();
    const [reminders, subscribed] = await Promise.all([listReminders(user.uid), hasPushSubscription(user.uid)]);
    return Response.json(
      { success: true, reminders, push: { configured: isPushConfigured(), subscribed } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

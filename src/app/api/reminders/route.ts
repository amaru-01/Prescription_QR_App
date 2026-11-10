import { requireUser } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { isPushConfigured } from "@/lib/server/push";
import { hasPushSubscription, listReminders } from "@/lib/server/reminders";
import { rateLimit } from "@/lib/server/security";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

/** GET /api/reminders — reminder state per prescription id, plus push availability. */
async function handleGET() {
  try {
    const user = await requireUser();
    await rateLimit(`read:${user.uid}`, 120, 60_000);
    const [reminders, subscribed] = await Promise.all([listReminders(user.uid), hasPushSubscription(user.uid)]);
    return Response.json(
      { success: true, reminders, push: { configured: isPushConfigured(), subscribed } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequest(handleGET);

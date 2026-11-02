import { requireUser } from "@/lib/server/auth";
import { BackendError, errorResponse, parseOrThrow } from "@/lib/server/errors";
import { isPushConfigured } from "@/lib/server/push";
import { deletePushSubscription, savePushSubscription } from "@/lib/server/reminders";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { pushSubscriptionSchema, pushUnsubscribeSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** POST /api/push/subscription — Body: PushSubscription JSON from this browser. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    rateLimit(`push:${user.uid}`, 10, 60_000);
    if (!isPushConfigured()) throw new BackendError("Notifications are not set up on this server yet.", 503);

    const subscription = parseOrThrow(pushSubscriptionSchema, await readJsonBody(request));
    await savePushSubscription(user.uid, subscription);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/push/subscription — Body: { endpoint }. Stops notifications to that browser. */
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { endpoint } = parseOrThrow(pushUnsubscribeSchema, await readJsonBody(request));
    await deletePushSubscription(user.uid, endpoint);
    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

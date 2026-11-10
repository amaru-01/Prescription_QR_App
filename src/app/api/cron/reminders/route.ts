import crypto from "node:crypto";

import { BackendError, errorResponse } from "@/lib/server/errors";
import { isPushConfigured, sendPush } from "@/lib/server/push";
import { logger } from "@/lib/server/logger";
import { recordCronSuccess, runDueReminders } from "@/lib/server/reminders";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Constant-time check of `Authorization: Bearer <CRON_SECRET>` (the header Vercel Cron sends). */
function assertCronAuthorized(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new BackendError("Cron is not configured.", 503);

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new BackendError("Unauthorized.", 401);
  }
}

/**
 * GET|POST /api/cron/reminders — sends due medication reminders.
 * Call it every 5–15 minutes from a scheduler (see README → Reminders).
 */
async function handle(request: Request) {
  try {
    assertCronAuthorized(request);
    if (!isPushConfigured()) throw new BackendError("Notifications are not set up on this server yet.", 503);
    const result = await runDueReminders(sendPush);
    // Feeds GET /api/health?cron=1. A failure to record must not fail a run that did its job.
    try {
      await recordCronSuccess(result);
    } catch (error) {
      logger.warn("Could not record cron success", { error });
    }
    return Response.json({ success: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequest(handle);
export const POST = withRequest(handle);

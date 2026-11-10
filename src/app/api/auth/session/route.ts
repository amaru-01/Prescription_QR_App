import { cookies } from "next/headers";

import {
  createSessionCookie,
  getSessionUser,
  invalidateUserCache,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "@/lib/server/auth";
import { assertAppCheck } from "@/lib/server/app-check";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { getAdminAuth } from "@/lib/server/firebase";
import { assertSameOrigin, clientIp, rateLimit, readJsonBody } from "@/lib/server/security";
import { securityEvent } from "@/lib/server/security-log";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

/** GET /api/auth/session — the current user, or null. */
async function handleGET(request: Request) {
  try {
    await rateLimit(`session-read:${clientIp(request)}`, 120, 60_000);
    const user = await getSessionUser();
    return Response.json({ success: true, user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/auth/session
 * Body: { idToken } from the Firebase client SDK right after sign-in.
 * Sets an HttpOnly session cookie; the browser never keeps a usable token.
 */
async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(`session:${clientIp(request)}`, 10, 60_000);
    await assertAppCheck(request);

    const body = await readJsonBody(request, 8 * 1024);
    if (typeof body.idToken !== "string" || !body.idToken) {
      throw new BackendError("Missing sign-in token.", 400);
    }

    let sessionCookie: string;
    try {
      sessionCookie = await createSessionCookie(body.idToken);
    } catch (error) {
      securityEvent("session_exchange_failed", { status: (error as { statusCode?: number }).statusCode });
      throw error;
    }
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, sessionCookie, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/auth/session[?all=1]
 * Clears the session cookie. With `all=1`, also revokes every session for
 * this account so other signed-in devices are logged out too.
 */
async function handleDELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit(`session-end:${clientIp(request)}`, 30, 60_000);

    if (new URL(request.url).searchParams.get("all") === "1") {
      const user = await getSessionUser();
      if (user) {
        await getAdminAuth().revokeRefreshTokens(user.uid);
        invalidateUserCache(user.uid);
      }
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, "", sessionCookieOptions(0));

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export const GET = withRequest(handleGET);
export const POST = withRequest(handlePOST);
export const DELETE = withRequest(handleDELETE);

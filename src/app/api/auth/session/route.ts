import { cookies } from "next/headers";

import {
  createSessionCookie,
  getSessionUser,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "@/lib/server/auth";
import { BackendError, errorResponse } from "@/lib/server/errors";
import { getAdminAuth } from "@/lib/server/firebase";
import { assertSameOrigin, clientIp, rateLimit, readJsonBody } from "@/lib/server/security";

export const dynamic = "force-dynamic";

/** GET /api/auth/session — the current user, or null. */
export async function GET() {
  try {
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
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    rateLimit(`session:${clientIp(request)}`, 10, 60_000);

    const body = await readJsonBody(request, 8 * 1024);
    if (typeof body.idToken !== "string" || !body.idToken) {
      throw new BackendError("Missing sign-in token.", 400);
    }

    const sessionCookie = await createSessionCookie(body.idToken);
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
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);

    if (new URL(request.url).searchParams.get("all") === "1") {
      const user = await getSessionUser();
      if (user) await getAdminAuth().revokeRefreshTokens(user.uid);
    }

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, "", sessionCookieOptions(0));

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

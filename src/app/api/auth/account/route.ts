import { cookies } from "next/headers";

import { assertRecentSignIn, invalidateUserCache, requireUser, SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/auth";
import { deleteAccountData } from "@/lib/server/account";
import { errorResponse } from "@/lib/server/errors";
import { getAdminAuth } from "@/lib/server/firebase";
import { invalidateStatsCache } from "@/lib/server/prescriptions";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { securityEvent } from "@/lib/server/security-log";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * DELETE /api/auth/account — permanently delete the signed-in user's account and data.
 *
 * Body: { idToken } — a Firebase ID token from a sign-in made in the last few
 * minutes (the client asks for the password again), so a stolen session cookie
 * alone cannot wipe an account. Guest accounts have no password and send `{}`.
 */
async function handleDELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`account-delete:${user.uid}`, 3, 60_000);

    const body = await readJsonBody(request, 8 * 1024);
    if (!user.isAnonymous) await assertRecentSignIn(user.uid, body.idToken);

    // Data first, sign-in record last: if anything fails the user can simply try again.
    await deleteAccountData(user.uid);
    await getAdminAuth().deleteUser(user.uid);

    securityEvent("account_deleted", { guest: user.isAnonymous });
    invalidateUserCache(user.uid);
    invalidateStatsCache(user.uid);
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, "", sessionCookieOptions(0));

    return Response.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export const DELETE = withRequest(handleDELETE);

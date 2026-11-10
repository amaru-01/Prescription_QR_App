import { requireUser } from "@/lib/server/auth";
import { errorResponse, parseOrThrow } from "@/lib/server/errors";
import { checkRx } from "@/lib/server/rx";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { rxVerifyRequestSchema } from "@/lib/schemas";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/rx/verify — Body: { rx, med, dose, duration }
 * Advisory check for the review screen. Saving re-verifies and claims atomically.
 */
async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`rx-verify:${user.uid}`, 60, 60_000);

    const { rx, ...input } = parseOrThrow(rxVerifyRequestSchema, await readJsonBody(request));
    const check = await checkRx(user.uid, rx, input);
    return Response.json({ success: true, rx: check }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequest(handlePOST);

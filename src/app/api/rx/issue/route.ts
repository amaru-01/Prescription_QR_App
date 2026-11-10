import { requirePrescriber } from "@/lib/server/auth";
import { BackendError, errorResponse, parseOrThrow } from "@/lib/server/errors";
import { issuePrescription } from "@/lib/server/rx";
import { isSigningConfigured } from "@/lib/server/rx-signing";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { rxIssueRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** POST /api/rx/issue — prescribers only. Body: { med, dose, duration } → signed QR text. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requirePrescriber();
    await rateLimit(`rx-issue:${user.uid}`, 30, 60_000);

    if (!isSigningConfigured()) {
      throw new BackendError("Prescription signing is not set up on this server yet.", 503);
    }

    const { validityDays, requirePin, ...input } = parseOrThrow(
      rxIssueRequestSchema,
      await readJsonBody(request),
      "Please check the prescription fields."
    );
    const { qrText, issued, pin } = await issuePrescription(user, input, { validityDays, requirePin });
    // The PIN is shown once: only its hash is stored, and the response must never be cached.
    return Response.json({ success: true, qr_text: qrText, issued, pin }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

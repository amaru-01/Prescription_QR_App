import { requireUser } from "@/lib/server/auth";
import { errorResponse, parseOrThrow } from "@/lib/server/errors";
import { savePrescription } from "@/lib/server/prescriptions";
import { rxMatches, verifyRx } from "@/lib/server/rx-signing";
import { assertSameOrigin, rateLimit, readJsonBody } from "@/lib/server/security";
import { saveRequestSchema } from "@/lib/schemas";
import type { RxCheck } from "@/types/prescription";
import { withRequest } from "@/lib/server/request-context";

export const dynamic = "force-dynamic";

/**
 * POST /api/save
 * Body: { med, dose, duration, source?, notes?, rx? } → saved for the signed-in user.
 *
 * With `rx`, the record is marked verified only if the signature is valid,
 * unexpired, matches the saved fields exactly and has not been claimed by
 * another account. Otherwise it is saved as an ordinary (unverified) record
 * and the response's `rx` says why, so the UI can explain.
 */
async function handlePOST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await rateLimit(`save:${user.uid}`, 30, 60_000);

    const body = await readJsonBody(request);
    const { source, notes, rx, pin, ...input } = parseOrThrow(
      saveRequestSchema,
      body,
      "Please check the prescription fields."
    );

    let rxCheck: RxCheck = { status: "none" };
    let signed;
    if (rx) {
      const verification = verifyRx(rx);
      if (!verification.valid) rxCheck = { status: "invalid", reason: verification.reason };
      else if (!rxMatches(verification.payload, input)) rxCheck = { status: "invalid", reason: "edited" };
      else signed = verification.payload;
    }

    const result = await savePrescription(user.uid, input, { source, notes: notes ?? null, rx: signed, pin });

    return Response.json({
      success: true,
      message: "Prescription saved successfully",
      document_id: result.documentId,
      prescription: result.prescription,
      rx: signed ? result.rx : rxCheck,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export const POST = withRequest(handlePOST);

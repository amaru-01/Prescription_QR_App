import { BadgeCheck, Loader2, ShieldAlert } from "lucide-react";

import { formatDate } from "@/lib/format";
import type { PrescriptionVerification, RxCheck } from "@/types/prescription";

/** Why a signed code could not be trusted, in plain language. */
export const RX_REASON_TEXT: Record<Extract<RxCheck, { status: "invalid" }>["reason"], string> = {
  malformed: "This code's signature is damaged or incomplete, so it can't be verified.",
  bad_signature: "This code's signature doesn't match its contents. It may have been altered.",
  unknown_key: "This code was signed with a key this server no longer recognises.",
  expired: "This signed code has expired and can no longer be verified. Ask your prescriber for a new one.",
  not_configured: "Verification isn't set up on this server, so the code can't be checked.",
  claimed: "This prescription has already been saved by another account.",
  duplicate: "You've already saved this prescription.",
  revoked: "Your prescriber withdrew this code, so it can no longer be verified.",
  locked: "This code was locked after too many wrong PINs. Ask your prescriber for a new one.",
  edited: "The details were changed after the prescriber signed them.",
};

/** Small chip for saved records that came from a valid signed code. */
export function VerifiedBadge({ verification }: { verification: PrescriptionVerification }) {
  return (
    <span
      className="chip border-brand/30 bg-brand-soft text-brand-strong"
      title={`Issued by ${verification.prescriberName}${verification.issuedAt ? ` on ${formatDate(verification.issuedAt)}` : ""}`}
    >
      <BadgeCheck className="size-3.5" aria-hidden />
      Verified prescriber
    </span>
  );
}

/** Review-screen banner describing the scanned code's signature. */
export function RxStatusBanner({ check, edited }: { check: RxCheck | "checking"; edited: boolean }) {
  if (check === "checking") {
    return (
      <p className="flex items-center gap-2 rounded-2xl border border-line bg-elevated/60 px-4 py-3 text-sm text-muted" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Checking the prescriber&apos;s signature…
      </p>
    );
  }
  if (check.status === "none") return null;

  if (check.status === "verified" && !edited) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3" role="status">
        <BadgeCheck className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
        <div className="text-sm">
          <p className="font-bold text-brand-strong">Verified prescription</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Signed by <span className="font-semibold text-ink">{check.prescriberName}</span> on{" "}
            {formatDate(check.issuedAt)}. The details below are exactly as issued.
          </p>
        </div>
      </div>
    );
  }

  const message =
    check.status === "verified"
      ? `${RX_REASON_TEXT.edited} Saving it will store an unverified copy. Undo your edits to keep it verified.`
      : `${RX_REASON_TEXT[check.reason]}${
          check.reason === "duplicate" ? "" : " You can still save it as an unverified record."
        }`;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3" role="alert">
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      <div className="text-sm">
        <p className="font-bold text-warning">Not verified</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{message}</p>
      </div>
    </div>
  );
}

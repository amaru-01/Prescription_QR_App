import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { PrescribeView } from "@/components/prescribe/prescribe-view";
import { requirePageUser } from "@/lib/server/auth";
import { isSigningConfigured } from "@/lib/server/rx-signing";

export const metadata: Metadata = {
  title: "Issue a prescription",
  description: "Prescribers: issue a signed, tamper-evident prescription QR code.",
};

export default async function PrescribePage() {
  const user = await requirePageUser("/prescribe");

  if (user.role !== "prescriber" || user.isAnonymous) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="card p-6 text-center">
          <ShieldCheck className="mx-auto size-8 text-brand" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Prescriber access required</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Only verified prescriber accounts can issue signed prescription codes. If you are a prescriber, ask
            your VeriDose administrator to enable prescriber access for your account.
          </p>
          <Link href="/" className="btn btn-secondary mt-5 min-h-11">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return <PrescribeView prescriberName={user.name || user.email || "Prescriber"} signingReady={isSigningConfigured()} />;
}

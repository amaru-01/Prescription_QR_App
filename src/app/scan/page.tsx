import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ImageUp,
  Lightbulb,
  ShieldCheck,
  Smartphone,
  SunMedium,
  WifiOff,
} from "lucide-react";

import { ScanFlow } from "@/components/scan/scan-flow";

export const metadata: Metadata = {
  title: "Scan a prescription",
  description:
    "Scan a prescription QR code with your camera, upload a screenshot, or type the details. Review and save in three steps.",
};

const SCAN_TIPS = [
  {
    icon: SunMedium,
    title: "Find good light",
    copy: "Keep the code bright, clear, and free from glare.",
  },
  {
    icon: Smartphone,
    title: "Hold steady",
    copy: "Keep the full square inside the frame for a moment.",
  },
  {
    icon: ImageUp,
    title: "Photo works too",
    copy: "Upload a screenshot or photo if the camera cannot scan it.",
  },
] as const;

export default function ScanPage() {
  return (
    <div className="space-y-5 pb-6">
      <div className="no-print flex items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted transition hover:bg-elevated hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to dashboard
        </Link>
        <span className="chip">
          <Camera className="size-3.5 text-brand" aria-hidden />
          Scan · Review · Save
        </span>
      </div>

      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">New prescription</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.4rem]">
          Let&apos;s capture that code
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          Scan the QR code on your prescription. You&apos;ll get a chance to check and correct every detail before
          saving it.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
        <div className="min-w-0">
          <ScanFlow />
        </div>

        <aside className="no-print space-y-3 lg:sticky lg:top-20 lg:self-start">
          <section className="card p-4" aria-labelledby="scan-tips-title">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                <Lightbulb className="size-4.5" aria-hidden />
              </span>
              <div>
                <h2 id="scan-tips-title" className="text-sm font-bold text-ink">
                  For a quick, clear scan
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Most prescription codes scan in a second or two.
                </p>
              </div>
            </div>

            <ol className="mt-4 space-y-2.5">
              {SCAN_TIPS.map((tip, index) => (
                <li key={tip.title} className="group flex items-start gap-3 rounded-2xl border border-line bg-elevated/40 p-3 transition hover:border-brand/35 hover:bg-brand-soft/40">
                  <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-strong shadow-sm transition group-hover:scale-105">
                    <tip.icon className="size-4" aria-hidden />
                    <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-brand text-[0.55rem] font-bold text-white">
                      {index + 1}
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-ink">{tip.title}</span>
                    <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-muted">{tip.copy}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft/60 p-3 text-xs leading-relaxed text-muted">
              <WifiOff className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              No connection? You can still save. VeriDose will sync when you&apos;re back online.
            </div>
          </section>

          <section className="card p-4" aria-labelledby="privacy-title">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                <ShieldCheck className="size-4.5" aria-hidden />
              </span>
              <div>
                <h2 id="privacy-title" className="text-sm font-bold text-ink">
                  Your photo stays private
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  VeriDose reads the code on your device. The photo is never saved or uploaded—only the details you
                  review and confirm are added to your history.
                </p>
              </div>
            </div>
            <Link
              href="/history"
              className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-full text-xs font-bold text-brand-strong hover:underline"
            >
              <CheckCircle2 className="size-3.5" aria-hidden />
              View my saved prescriptions
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

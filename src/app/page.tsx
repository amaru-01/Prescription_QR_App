import Link from "next/link";
import { ArrowRight, ClipboardList, ScanLine, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";

import { Hero } from "@/components/dashboard/hero";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { PrescriptionCard } from "@/components/prescription/prescription-card";
import { Onboarding } from "@/components/onboarding";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, Tilt } from "@/components/motion";
import { listPrescriptions } from "@/lib/server/prescriptions";
import { computeStats } from "@/lib/stats";
import type { Prescription } from "@/types/prescription";

export const dynamic = "force-dynamic";

const FLOW = [
  { step: "01", title: "Scan", copy: "Camera, upload, or manual entry.", icon: ScanLine },
  { step: "02", title: "Review", copy: "Validate and edit every field.", icon: ShieldCheck },
  { step: "03", title: "Save", copy: "Keep it safely in your records.", icon: Sparkles },
  { step: "04", title: "History", copy: "Search, track, export, repeat.", icon: ClipboardList },
] as const;

export default async function HomePage() {
  let prescriptions: Prescription[] = [];
  let loadError: string | null = null;

  try {
    prescriptions = await listPrescriptions(100);
  } catch (error) {
    loadError = "Could not load prescriptions right now.";
  }

  const stats = computeStats(prescriptions);
  const recent = prescriptions.slice(0, 4);

  return (
    <div className="space-y-7 pb-6 sm:space-y-8">
      <Onboarding />
      <Hero stats={stats} mode="fastapi" />
      <StatsGrid stats={stats} />

      <Reveal>
      <section aria-labelledby="flow-title" className="card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="flow-title" className="font-display text-xl font-semibold text-ink">
              Four clear steps
            </h2>
            <p className="text-sm text-muted">Nothing is written until you confirm the details.</p>
          </div>
          <Link
            href="/scan"
            className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-brand-strong transition hover:bg-brand-soft"
          >
            Start a scan
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map((item, index) => {
            const Icon = item.icon;
            return (
              <li
                key={item.step}
                className="group relative flex items-start gap-3 rounded-2xl border border-line bg-elevated/40 p-3 transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand-soft/40"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-strong shadow-sm transition group-hover:scale-110 group-hover:rotate-6">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted">{item.step}</p>
                  <p className="text-sm font-bold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.copy}</p>
                </div>
                {index < FLOW.length - 1 ? (
                  <span className="absolute -right-1.5 top-1/2 hidden size-3 -translate-y-1/2 rotate-45 border-r border-t border-line bg-elevated/40 lg:block" aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
      </Reveal>

      <section aria-labelledby="recent-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="recent-title" className="font-display text-xl font-semibold text-ink">
              Recent prescriptions
            </h2>
            <p className="text-sm text-muted">
              {stats.total > 0
                ? `${stats.active} active course${stats.active === 1 ? "" : "s"} out of ${stats.total} saved.`
                : "Your saved records will appear here."}
            </p>
          </div>
          <Link
            href="/history"
            className="inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-brand-strong transition hover:bg-brand-soft"
          >
            View all history
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        {loadError ? (
          <div className="card flex flex-col items-start gap-3 border-danger/30 bg-danger/5 p-5">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-danger">
              <TriangleAlert className="size-4" aria-hidden />
              The prescription service is not answering
            </p>
            <p className="text-sm text-muted">
              We couldn’t refresh your records right now. This is usually temporary.
            </p>
            <p className="text-xs text-muted">
              Your saved records are still safe. Refresh the page or try again in a moment.
            </p>
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<ScanLine className="size-7" aria-hidden />}
            title="No prescriptions yet"
            description="Scan your first QR code to start tracking your medications."
            action={
              <Link href="/scan" className="btn btn-primary min-h-11">
                <ScanLine className="size-4" aria-hidden />
                Scan prescription
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {recent.map((prescription, index) => (
              <Reveal key={prescription.id} delay={index * 80}>
                <Tilt className="h-full rounded-3xl">
                  <PrescriptionCard prescription={prescription} showActions />
                </Tilt>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      <Reveal>
        <QuickActions />
      </Reveal>
    </div>
  );
}

import Link from "next/link";
import { Camera, History, ShieldCheck, Smartphone } from "lucide-react";

import type { DashboardStats } from "@/lib/stats";

const TRUST_POINTS = [
  { icon: ShieldCheck, label: "Review before saving" },
  { icon: Smartphone, label: "Built for phones" },
];

export function Hero({ stats }: { stats: DashboardStats }) {
  return (
    <section className="card relative overflow-hidden border-brand/15 p-5 sm:p-7 lg:p-9">
      <div
        className="animate-blob pointer-events-none absolute -right-20 -top-24 size-72 bg-brand-soft blur-2xl"
        aria-hidden
      />
      <div
        className="animate-blob pointer-events-none absolute -bottom-24 -left-16 size-64 bg-accent-soft blur-2xl [animation-delay:-6s]"
        aria-hidden
      />

      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-brand/25 bg-brand-soft text-brand-strong">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Prescription QR scanner
          </span>
          <span className="chip">
            <span className="size-1.5 rounded-full bg-brand" aria-hidden />
            Securely connected
          </span>
        </div>

        <h1 className="mt-4 font-display text-[2.15rem] font-semibold leading-[1.06] tracking-tight text-ink sm:text-[2.9rem] lg:text-[3.15rem]">
          Scan the code.
          <br />
          <span className="text-shimmer">Keep the meds clear.</span>
        </h1>

        <p className="mt-3 max-w-xl text-[0.95rem] leading-relaxed text-muted sm:text-base">
          VeriDose turns a prescription QR code into a clear medication record. Scan with your camera,
          review every detail, then save it to your private history.
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link href="/scan" className="btn btn-primary min-h-12 px-6 text-base">
            <Camera className="size-5" aria-hidden />
            Scan prescription
          </Link>
          <Link href="/history" className="btn btn-secondary min-h-12 px-5 text-base">
            <History className="size-4.5" aria-hidden />
            View history
          </Link>
        </div>

        <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2">
          {TRUST_POINTS.map((point) => (
            <li key={point.label} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted">
              <point.icon className="size-3.5 text-brand" aria-hidden />
              {point.label}
            </li>
          ))}
        </ul>

        <dl className="mt-6 grid max-w-md grid-cols-3 gap-3 border-t border-line pt-4">
          <div>
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Records</dt>
            <dd className="mt-0.5 text-xl font-extrabold text-ink">{stats.total}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Active</dt>
            <dd className="mt-0.5 text-xl font-extrabold text-ink">{stats.active}</dd>
          </div>
          <div>
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">This week</dt>
            <dd className="mt-0.5 text-xl font-extrabold text-ink">{stats.thisWeek}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Clock3,
  Pill,
  ScanLine,
  Stethoscope,
  TriangleAlert,
} from "lucide-react";

import { PrescriptionActions } from "@/components/history/prescription-actions";
import { SourceBadge, StatusBadge } from "@/components/ui/badges";
import { BackendError } from "@/lib/server/errors";
import { getPrescriptionById } from "@/lib/server/prescriptions";
import { formatDateTime, formatRelative, initialsFor } from "@/lib/format";
import type { Prescription } from "@/types/prescription";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const record = await getPrescriptionById(id);
    return {
      title: record ? `${record.med} ${record.dose}` : "Prescription",
      description: record ? `Prescription details for ${record.med} ${record.dose}, ${record.duration}.` : undefined,
    };
  } catch {
    return { title: "Prescription" };
  }
}

export default async function PrescriptionDetailPage({ params }: PageProps) {
  const { id } = await params;

  let record: Prescription | null = null;
  let loadError: string | null = null;

  try {
    record = await getPrescriptionById(id);
  } catch (error) {
    loadError =
      error instanceof BackendError
        ? error.message
        : "The prescription service is unavailable right now. Please try again in a moment.";
  }

  if (!record && !loadError) notFound();

  if (!record && loadError) {
    return (
      <div className="mx-auto max-w-xl py-10">
        <div className="card border-danger/30 bg-danger/5 p-6 text-center">
          <TriangleAlert className="mx-auto size-8 text-danger" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-semibold text-ink">Record unavailable</h1>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <Link href="/history" className="btn btn-secondary mt-5 min-h-11">
            Back to history
          </Link>
        </div>
      </div>
    );
  }

  const prescription = record as Prescription;

  return (
    <div className="space-y-5 pb-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/history"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted transition hover:bg-elevated hover:text-ink"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Prescription history
        </Link>
        <StatusBadge status={prescription.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <article className="card overflow-hidden">
          <div className="border-b border-line bg-elevated/50 p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-lg font-extrabold text-brand-strong" aria-hidden>
                {initialsFor(prescription.med)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">Prescription record</p>
                <h1 className="mt-1 font-display text-3xl font-semibold leading-tight text-ink">
                  {prescription.med}
                </h1>
                <p className="mt-1 text-sm font-medium text-muted">
                  {prescription.dose} · {prescription.duration}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SourceBadge source={prescription.source} />
                  <span className="chip">
                    <CalendarDays className="size-3" aria-hidden />
                    Saved {formatRelative(prescription.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-elevated/40 p-3">
                <dt className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted">
                  <Pill className="size-3.5" aria-hidden /> Medication
                </dt>
                <dd className="mt-1 text-base font-bold text-ink">{prescription.med}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-elevated/40 p-3">
                <dt className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted">
                  <Stethoscope className="size-3.5" aria-hidden /> Dose
                </dt>
                <dd className="mt-1 text-base font-bold text-ink">{prescription.dose}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-elevated/40 p-3">
                <dt className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted">
                  <Clock3 className="size-3.5" aria-hidden /> Duration
                </dt>
                <dd className="mt-1 text-base font-bold text-ink">{prescription.duration}</dd>
              </div>
              <div className="rounded-2xl border border-line bg-elevated/40 p-3">
                <dt className="flex items-center gap-1.5 text-[0.7rem] font-bold uppercase tracking-wide text-muted">
                  <CalendarDays className="size-3.5" aria-hidden /> Saved
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink">{formatDateTime(prescription.createdAt)}</dd>
              </div>
            </dl>

            <div className="mt-4 rounded-2xl border border-line p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-wide text-muted">Current notes</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">
                {prescription.notes?.trim() ? prescription.notes : "No notes yet. Add directions below."}
              </p>
            </div>

            <div className="no-print mt-5 border-t border-line pt-5">
              <PrescriptionActions prescription={prescription} />
            </div>

            <p className="mt-4 text-[0.7rem] text-muted">
              Record ID <span className="font-mono">{prescription.id}</span>
            </p>
          </div>
        </article>

        <aside className="no-print space-y-3">
          <section className="card p-4">
            <h2 className="text-sm font-bold text-ink">Keep the course on track</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Set a daily reminder and tick off doses in the reminders view. Adherence tracking stays on this
              device.
            </p>
            <Link href="/reminders" className="btn btn-primary mt-3 min-h-11 w-full text-sm">
              <Bell className="size-4" aria-hidden />
              Open reminders
            </Link>
          </section>
          <section className="card p-4">
            <h2 className="text-sm font-bold text-ink">Need to change a field?</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Medication, dose, and duration are immutable once saved. Re-scan the code and save a new record if
              the original was wrong.
            </p>
            <Link href="/scan" className="btn btn-secondary mt-3 min-h-11 w-full text-sm">
              <ScanLine className="size-4" aria-hidden />
              Scan again
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

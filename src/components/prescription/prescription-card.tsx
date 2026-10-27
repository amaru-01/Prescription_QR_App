import Link from "next/link";
import { ChevronRight, Clock3, Pill } from "lucide-react";

import { SourceBadge, StatusBadge } from "@/components/ui/badges";
import { formatDateTime, formatRelative, initialsFor } from "@/lib/format";
import type { Prescription } from "@/types/prescription";

const AVATAR_TONES = [
  "bg-brand-soft text-brand-strong",
  "bg-accent-soft text-accent",
  "bg-elevated text-ink",
] as const;

function toneFor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 7)) % 997;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function PrescriptionCard({
  prescription,
  showActions = false,
}: {
  prescription: Prescription;
  showActions?: boolean;
}) {
  const { id, med, dose, duration, createdAt, status, source } = prescription;

  return (
    <article className="card group relative flex h-full flex-col gap-4 p-4 transition hover:-translate-y-0.5 hover:border-brand/40 sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex size-12 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold ${toneFor(med)}`}
          aria-hidden
        >
          {initialsFor(med)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold leading-tight text-ink">
            <Link href={`/history/${id}`} className="focus-visible:outline-none">
              <span className="absolute inset-0 rounded-3xl" aria-hidden />
              {med}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Pill className="size-3.5" aria-hidden />
            {dose}
            <span className="text-line" aria-hidden>
              |
            </span>
            <Clock3 className="size-3.5" aria-hidden />
            {duration}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <SourceBadge source={source} />
          <span className="text-[0.7rem] font-medium text-muted" title={formatDateTime(createdAt)} suppressHydrationWarning>
            Saved {formatRelative(createdAt)}
          </span>
        </div>
        {showActions ? (
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand-strong">
            Details
            <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" aria-hidden />
          </span>
        ) : null}
      </div>
    </article>
  );
}

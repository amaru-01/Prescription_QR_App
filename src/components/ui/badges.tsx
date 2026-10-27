import { Camera, ImageUp, PenLine, Sparkles } from "lucide-react";

import type { PrescriptionSource, PrescriptionStatus } from "@/types/prescription";

const STATUS_STYLES: Record<PrescriptionStatus, string> = {
  active: "border-brand/25 bg-brand-soft text-brand-strong",
  completed: "border-line bg-elevated text-muted",
  archived: "border-line bg-surface text-muted",
};

const STATUS_DOT: Record<PrescriptionStatus, string> = {
  active: "bg-brand",
  completed: "bg-muted/60",
  archived: "bg-muted/40",
};

export function StatusBadge({ status }: { status: PrescriptionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold capitalize ${STATUS_STYLES[status]}`}
    >
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      {status}
    </span>
  );
}

const SOURCE_ICONS = {
  scan: Camera,
  upload: ImageUp,
  manual: PenLine,
  demo: Sparkles,
} as const;

const SOURCE_TEXT: Record<PrescriptionSource, string> = {
  scan: "Camera",
  upload: "Upload",
  manual: "Typed",
  demo: "Sample",
};

export function SourceBadge({ source }: { source: PrescriptionSource }) {
  const Icon = SOURCE_ICONS[source];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[0.7rem] font-semibold text-muted">
      <Icon className="size-3" aria-hidden />
      {SOURCE_TEXT[source]}
    </span>
  );
}

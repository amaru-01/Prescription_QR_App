"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  History,
  ImageUp,
  PenLine,
  RotateCcw,
  ScanLine,
  ShieldCheck,
} from "lucide-react";

import { ManualEntry } from "@/components/scan/manual-entry";
import { QrCamera } from "@/components/scan/qr-camera";
import { QrUploader } from "@/components/scan/qr-uploader";
import { ScanPreview } from "@/components/scan/scan-preview";
import { SourceBadge } from "@/components/ui/badges";
import { Confetti } from "@/components/motion";
import { useToast } from "@/hooks/use-toasts";
import { prescriptionApi } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { parsePrescriptionPayload, validatePrescription } from "@/lib/validation";
import type {
  Prescription,
  PrescriptionDraft,
  PrescriptionFieldErrors,
  PrescriptionInput,
  PrescriptionSource,
} from "@/types/prescription";

type Stage = "capture" | "review" | "saved";
type Mode = "camera" | "upload" | "manual";

const MODES: { id: Mode; label: string; icon: typeof Camera; hint: string }[] = [
  { id: "camera", label: "Camera", icon: Camera, hint: "Scan the code live" },
  { id: "upload", label: "Upload", icon: ImageUp, hint: "Use a photo or screenshot" },
  { id: "manual", label: "Manual", icon: PenLine, hint: "Type the details" },
];

const STEPS = [
  { id: "capture", label: "Scan" },
  { id: "review", label: "Review" },
  { id: "saved", label: "Save" },
] as const;

function Steps({ stage }: { stage: Stage }) {
  const currentIndex = STEPS.findIndex((step) => step.id === stage);
  return (
    <ol className="grid grid-cols-3 gap-2" aria-label="Scan progress">
      {STEPS.map((step, index) => {
        const done = index < currentIndex || stage === "saved";
        const active = index === currentIndex && stage !== "saved";
        return (
          <li
            key={step.id}
            aria-current={active ? "step" : undefined}
            className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
              done
                ? "border-brand/25 bg-brand-soft text-brand-strong"
                : active
                  ? "border-brand/40 bg-surface text-ink"
                  : "border-line bg-surface/60 text-muted"
            }`}
          >
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] ${
                done ? "bg-brand text-white" : active ? "bg-ink text-canvas" : "bg-elevated text-muted"
              }`}
            >
              {done ? <CheckCircle2 className="size-3.5" aria-hidden /> : index + 1}
            </span>
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

export function ScanFlow() {
  const [stage, setStage] = useState<Stage>("capture");
  const [mode, setMode] = useState<Mode>("camera");
  const [draft, setDraft] = useState<PrescriptionDraft | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<PrescriptionFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedRecord, setSavedRecord] = useState<Prescription | null>(null);

  const { toast } = useToast();

  const handlePayload = useCallback(
    (raw: string, source: PrescriptionSource) => {
      const parsed = parsePrescriptionPayload(raw);
      if (!parsed.ok) {
        setFormError(parsed.message);
        setErrors(parsed.fieldErrors ?? {});
        toast({
          title: "That code could not be read",
          description: parsed.message,
          variant: "error",
        });
        return;
      }
      setErrors({});
      setFormError(null);
      setWarnings(parsed.warnings);
      setDraft({ ...parsed.value, source, notes: "" });
      setStage("review");
      toast({ title: "QR code parsed", description: "Review the details before saving.", variant: "success" });
    },
    [toast],
  );

  const handleManual = useCallback((input: PrescriptionInput) => {
    setErrors({});
    setFormError(null);
    setWarnings([]);
    setDraft({ ...input, source: "manual", notes: "" });
    setStage("review");
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    const validation = validatePrescription(draft);
    if (!validation.ok) {
      setErrors(validation.errors);
      toast({ title: "Check the highlighted fields", variant: "error" });
      return;
    }

    const clean: PrescriptionDraft = {
      ...validation.value,
      source: draft.source,
      notes: draft.notes?.trim() ? draft.notes.trim() : null,
    };

    setSaving(true);
    setErrors({});
    setFormError(null);

    try {
      const result = await prescriptionApi.save(clean);
      setSavedRecord(result.prescription);
      setStage("saved");
      window.dispatchEvent(new Event("veridose:data-changed"));
      toast({
        title: "Prescription saved",
        description: `${result.prescription.med} ${result.prescription.dose} added to your history.`,
        variant: "success",
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something unexpected happened. Please try again.");
      toast({ title: "Could not save", description: error instanceof Error ? error.message : "Unknown error", variant: "error" });
    } finally {
      setSaving(false);
    }
  }, [draft, toast]);

  const reset = useCallback(() => {
    setStage("capture");
    setDraft(null);
    setSavedRecord(null);
    setWarnings([]);
    setErrors({});
    setFormError(null);
    setMode("camera");
  }, []);

  const startOverLabel = useMemo(
    () => (stage === "saved" ? "Scan another prescription" : "Start over"),
    [stage],
  );

  return (
    <div className="space-y-4">
      <Steps stage={stage} />

      <section className="card p-4 sm:p-6" aria-live="polite">
        {stage === "capture" ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">Step 1 of 3</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Capture the QR code</h2>
                <p className="mt-1 text-sm text-muted">
                  Choose whichever works best: live camera, a saved photo, or typing it in.
                </p>
              </div>
              <span className="chip">
                <ShieldCheck className="size-3.5 text-brand" aria-hidden />
                On-device decoding
              </span>
            </div>

            <div role="tablist" aria-label="Scan method" className="grid grid-cols-3 gap-1.5 rounded-2xl bg-elevated p-1.5">
              {MODES.map((item) => {
                const active = mode === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`panel-${item.id}`}
                    id={`tab-${item.id}`}
                    onClick={() => {
                      setMode(item.id);
                      setFormError(null);
                    }}
                    className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-semibold transition ${
                      active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
                    }`}
                  >
                    <Icon className={`size-4 ${active ? "text-brand" : ""}`} aria-hidden />
                    {item.label}
                    <span className="hidden text-[0.65rem] font-normal text-muted sm:block">{item.hint}</span>
                  </button>
                );
              })}
            </div>

            {formError ? (
              <div
                role="alert"
                className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
              >
                <p className="font-semibold">{formError}</p>
                {Object.keys(errors).length > 0 ? (
                  <ul className="mt-1 list-inside list-disc text-xs">
                    {Object.entries(errors).map(([field, message]) => (
                      <li key={field}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div id="panel-camera" role="tabpanel" aria-labelledby="tab-camera" hidden={mode !== "camera"}>
              <QrCamera onDecode={(raw) => handlePayload(raw, "scan")} />
            </div>

            <div id="panel-upload" role="tabpanel" aria-labelledby="tab-upload" hidden={mode !== "upload"}>
              <QrUploader onDecode={(raw) => handlePayload(raw, "upload")} />
            </div>

            <div id="panel-manual" role="tabpanel" aria-labelledby="tab-manual" hidden={mode !== "manual"}>
              <ManualEntry onSubmit={handleManual} />
            </div>
          </div>
        ) : null}

        {stage === "review" && draft ? (
          <ScanPreview
            draft={draft}
            errors={errors}
            warnings={warnings}
            formError={formError}
            saving={saving}
            onChange={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
            onSave={() => void save()}
            onBack={reset}
          />
        ) : null}

        {stage === "saved" && savedRecord ? (
          <div className="animate-[var(--animate-fade-up)]">
            <Confetti />
            <div className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-full animate-[var(--animate-pop)] animate-ring bg-brand text-white">
                <svg viewBox="0 0 24 24" className="size-9" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">Step 3 of 3</p>
              <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
                Prescription saved
              </h2>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">
                Your prescription is now in the history. You can track doses, add notes, or export it any time.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-line bg-elevated/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-ink">{savedRecord.med}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {savedRecord.dose} · {savedRecord.duration}
                  </p>
                </div>
                <SourceBadge source={savedRecord.source} />
              </div>
              {savedRecord.notes ? (
                <p className="mt-2 text-xs leading-relaxed text-muted">{savedRecord.notes}</p>
              ) : null}
              <dl className="mt-3 grid gap-1 border-t border-line pt-3 text-xs text-muted sm:grid-cols-2">
                <div className="flex justify-between gap-3 sm:justify-start sm:gap-2">
                  <dt className="font-semibold">Record</dt>
                  <dd className="truncate font-mono">{savedRecord.id.slice(0, 8)}</dd>
                </div>
                <div className="flex justify-between gap-3 sm:justify-start sm:gap-2">
                  <dt className="font-semibold">Saved</dt>
                  <dd>{formatRelative(savedRecord.createdAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={reset} className="btn btn-primary min-h-12 flex-1">
                <RotateCcw className="size-4" aria-hidden />
                {startOverLabel}
              </button>
              <Link href="/history" className="btn btn-secondary min-h-12 flex-1">
                <History className="size-4" aria-hidden />
                View history
              </Link>
            </div>
            <p className="mt-3 text-center text-xs text-muted">
              Saved {formatDateTime(savedRecord.createdAt)}
            </p>
          </div>
        ) : null}
      </section>

      {stage === "capture" ? (
        <p className="flex items-center justify-center gap-1.5 text-center text-xs font-medium text-muted">
          <ScanLine className="size-3.5" aria-hidden />
          Flow: Scan
          <ArrowRight className="size-3" aria-hidden />
          Review
          <ArrowRight className="size-3" aria-hidden />
          Save
          <ArrowRight className="size-3" aria-hidden />
          History
        </p>
      ) : null}
    </div>
  );
}

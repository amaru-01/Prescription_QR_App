"use client";

import { ArrowLeft, KeyRound, Loader2, Save, ShieldCheck, TriangleAlert } from "lucide-react";

import { RxStatusBanner } from "@/components/prescription/verification";
import { SourceBadge } from "@/components/ui/badges";
import type { PrescriptionDraft, PrescriptionFieldErrors, RxCheck } from "@/types/prescription";

export function ScanPreview({
  draft,
  errors,
  warnings,
  formError,
  rxCheck = { status: "none" },
  edited = false,
  saving,
  onChange,
  onSave,
  onBack,
}: {
  draft: PrescriptionDraft;
  errors: PrescriptionFieldErrors;
  warnings: string[];
  formError: string | null;
  /** Signature status of a prescriber-signed code. */
  rxCheck?: RxCheck | "checking";
  /** True when the user changed fields that the prescriber signed. */
  edited?: boolean;
  saving: boolean;
  onChange: (patch: Partial<PrescriptionDraft>) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  /** Ask for the PIN only while the code is still verifiable and unedited. */
  const pinRequired = rxCheck !== "checking" && rxCheck.status === "verified" && rxCheck.pinRequired && !edited;

  const fields: {
    name: "med" | "dose" | "duration";
    label: string;
    placeholder: string;
    autoComplete: string;
  }[] = [
    { name: "med", label: "Medication", placeholder: "Amoxicillin", autoComplete: "off" },
    { name: "dose", label: "Dose", placeholder: "500mg", autoComplete: "off" },
    { name: "duration", label: "Duration", placeholder: "7 days", autoComplete: "off" },
  ];

  return (
    <div className="animate-[var(--animate-fade-up)] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-strong">Step 2 of 3</p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Review before saving</h2>
          <p className="mt-1 text-sm text-muted">
            Check the details against the label. Anything can be corrected before it is stored.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={draft.source} />
          <span className="chip border-warning/30 bg-warning/10 text-warning">Not saved yet</span>
        </div>
      </div>

      <RxStatusBanner check={rxCheck} edited={edited} />

      {pinRequired ? (
        <div className="rounded-2xl border border-line bg-elevated/60 px-4 py-3">
          <label htmlFor="rx-pin" className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <KeyRound className="size-4 text-brand-strong" aria-hidden />
            Prescriber&apos;s PIN
          </label>
          <p className="mt-0.5 text-xs text-muted">
            This code needs the 6-digit PIN your prescriber gave you. Too many wrong tries locks the code.
          </p>
          <input
            id="rx-pin"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            maxLength={6}
            value={draft.pin ?? ""}
            onChange={(event) => onChange({ pin: event.target.value.replace(/\D/g, "").slice(0, 6) })}
            placeholder="123456"
            className="field mt-2 max-w-[11rem] font-mono tracking-[0.3em]"
          />
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <ul className="space-y-1.5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-warning">
          {warnings.map((warning) => (
            <li key={warning} className="flex gap-2">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}

      {formError ? (
        <p role="alert" className="rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {formError}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {fields.map((field) => (
          <div key={field.name}>
            <label htmlFor={`review-${field.name}`} className="mb-1.5 block text-sm font-semibold text-ink">
              {field.label}
            </label>
            <input
              id={`review-${field.name}`}
              value={draft[field.name]}
              onChange={(event) => onChange({ [field.name]: event.target.value })}
              placeholder={field.placeholder}
              autoComplete={field.autoComplete}
              maxLength={120}
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={errors[field.name] ? `review-${field.name}-error` : undefined}
              className="field text-base font-semibold"
            />
            {errors[field.name] ? (
              <p id={`review-${field.name}-error`} role="alert" className="mt-1.5 text-xs font-medium text-danger">
                {errors[field.name]}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div>
        <label htmlFor="review-notes" className="mb-1.5 block text-sm font-semibold text-ink">
          Notes <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="review-notes"
          value={draft.notes ?? ""}
          onChange={(event) => onChange({ notes: event.target.value })}
          rows={2}
          maxLength={500}
          placeholder="e.g. Take with food, morning dose"
          className="field resize-y"
        />
        <p className="mt-1 text-xs text-muted">Notes are stored with the record and appear in the history view.</p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <button type="button" onClick={onBack} className="btn btn-secondary min-h-12">
          <ArrowLeft className="size-4" aria-hidden />
          Back to scan
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn btn-primary min-h-12 flex-1"
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
          {saving ? "Saving…" : "Save prescription"}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
        Only the medication, dose, duration, and notes are sent to the prescription service. Photographs never
        leave your device.
      </p>
    </div>
  );
}

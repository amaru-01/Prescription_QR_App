"use client";

import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { BadgeCheck, Clock3, Loader2, Printer, QrCode, RotateCcw, TriangleAlert } from "lucide-react";

import { useToast } from "@/hooks/use-toasts";
import { rxApi, type IssuedRx } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { validatePrescription } from "@/lib/validation";
import type { PrescriptionFieldErrors, PrescriptionInput } from "@/types/prescription";

const FIELDS: { name: keyof PrescriptionInput; label: string; placeholder: string }[] = [
  { name: "med", label: "Medication", placeholder: "e.g. Amoxicillin" },
  { name: "dose", label: "Dose", placeholder: "e.g. 500mg three times daily" },
  { name: "duration", label: "Duration", placeholder: "e.g. 7 days" },
];

const EMPTY: PrescriptionInput = { med: "", dose: "", duration: "" };

export function PrescribeView({ prescriberName, signingReady }: { prescriberName: string; signingReady: boolean }) {
  const { toast } = useToast();
  const [values, setValues] = useState<PrescriptionInput>(EMPTY);
  const [errors, setErrors] = useState<PrescriptionFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ rx: IssuedRx; image: string } | null>(null);
  const [recent, setRecent] = useState<IssuedRx[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    rxApi
      .listIssued()
      .then((items) => !cancelled && setRecent(items))
      .catch((cause) => !cancelled && setRecentError(cause instanceof Error ? cause.message : "Could not load."));
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validatePrescription(values);
    if (!validation.ok) {
      setErrors(validation.errors);
      document.getElementById(`rx-${Object.keys(validation.errors)[0]}`)?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const { qrText, issued: rx } = await rxApi.issue(validation.value);
      const image = await QRCode.toDataURL(qrText, { errorCorrectionLevel: "M", margin: 2, width: 360 });
      setIssued({ rx, image });
      setRecent((items) => [rx, ...(items ?? [])].slice(0, 20));
      toast({ title: "Signed prescription issued", description: "Ask the patient to scan it in VeriDose.", variant: "success" });
    } catch (cause) {
      toast({ title: "Could not issue", description: cause instanceof Error ? cause.message : undefined, variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setIssued(null);
    setValues(EMPTY);
  };

  return (
    <div className="space-y-4 pb-6">
      <header className="no-print">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">Prescriber tools</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.4rem]">
          Issue a signed prescription
        </h1>
        <p className="mt-1 text-sm text-muted">
          Signed as <span className="font-semibold text-ink">{prescriberName}</span>. Patients see a
          &ldquo;Verified prescriber&rdquo; badge, and any change to the details removes it.
        </p>
      </header>

      {!signingReady ? (
        <p role="alert" className="card flex items-start gap-2 border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Signing isn&apos;t set up on this server yet. Add RX_SIGNING_PRIVATE_KEY (see README → Signed prescriptions).
        </p>
      ) : null}

      {issued ? (
        <section className="card p-5 text-center print:shadow-none" aria-labelledby="issued-title">
          <BadgeCheck className="mx-auto size-7 text-brand" aria-hidden />
          <h2 id="issued-title" className="mt-2 font-display text-xl font-semibold text-ink">
            {issued.rx.med} · {issued.rx.dose}
          </h2>
          <p className="text-sm text-muted">{issued.rx.duration}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise */}
          <img
            src={issued.image}
            alt={`Signed prescription QR code for ${issued.rx.med}`}
            className="mx-auto mt-4 size-72 rounded-2xl border border-line bg-white p-2"
          />
          <p className="mt-3 text-xs text-muted">
            Issued {formatDateTime(issued.rx.issuedAt)} · must be saved by {formatDate(issued.rx.expiresAt)} ·
            can be saved by one patient only.
          </p>
          <div className="no-print mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => window.print()} className="btn btn-secondary min-h-11 text-sm">
              <Printer className="size-4" aria-hidden />
              Print
            </button>
            <button type="button" onClick={startOver} className="btn btn-primary min-h-11 text-sm">
              <RotateCcw className="size-4" aria-hidden />
              Issue another
            </button>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} noValidate className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {FIELDS.map((field) => (
              <div key={field.name}>
                <label htmlFor={`rx-${field.name}`} className="mb-1.5 block text-sm font-semibold text-ink">
                  {field.label}
                </label>
                <input
                  id={`rx-${field.name}`}
                  value={values[field.name]}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                  placeholder={field.placeholder}
                  autoComplete="off"
                  maxLength={120}
                  aria-invalid={Boolean(errors[field.name])}
                  aria-describedby={errors[field.name] ? `rx-${field.name}-error` : undefined}
                  className={`field ${errors[field.name] ? "!border-danger" : ""}`}
                />
                {errors[field.name] ? (
                  <p id={`rx-${field.name}-error`} className="mt-1 text-xs font-medium text-danger">
                    {errors[field.name]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <button type="submit" disabled={busy || !signingReady} className="btn btn-primary min-h-12 w-full sm:w-auto">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
            {busy ? "Signing…" : "Sign and create QR code"}
          </button>
        </form>
      )}

      <section className="no-print card p-5" aria-labelledby="recent-issued-title">
        <h2 id="recent-issued-title" className="text-sm font-bold text-ink">
          Recently issued
        </h2>
        {recentError ? (
          <p className="mt-2 text-sm text-danger">{recentError}</p>
        ) : recent === null ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Codes you issue will appear here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {recent.map((item) => (
              <li key={item.rxId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">
                    {item.med} · {item.dose}
                  </p>
                  <p className="text-xs text-muted">
                    {item.duration} · issued {formatDateTime(item.issuedAt)}
                  </p>
                </div>
                {item.claimed ? (
                  <span className="chip border-brand/30 bg-brand-soft text-brand-strong">
                    <BadgeCheck className="size-3" aria-hidden /> Saved by patient
                  </span>
                ) : item.expired ? (
                  <span className="chip">Expired</span>
                ) : (
                  <span className="chip">
                    <Clock3 className="size-3" aria-hidden /> Waiting for patient
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

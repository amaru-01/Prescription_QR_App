"use client";

import { useEffect, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import { Ban, BadgeCheck, Clock3, KeyRound, Loader2, Lock, Printer, QrCode, RotateCcw, TriangleAlert } from "lucide-react";

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

const VALIDITY_OPTIONS: { days: 1 | 7 | 30; label: string }[] = [
  { days: 1, label: "24 hours" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

export function PrescribeView({ prescriberName, signingReady }: { prescriberName: string; signingReady: boolean }) {
  const { toast } = useToast();
  const [values, setValues] = useState<PrescriptionInput>(EMPTY);
  const [errors, setErrors] = useState<PrescriptionFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [validityDays, setValidityDays] = useState<1 | 7 | 30>(7);
  const [requirePin, setRequirePin] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  /** `pin` is shown once, right after issuing; the server keeps only a hash. */
  const [issued, setIssued] = useState<{ rx: IssuedRx; image: string; pin: string | null } | null>(null);
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
      const { qrText, issued: rx, pin } = await rxApi.issue(validation.value, { validityDays, requirePin });
      const image = await QRCode.toDataURL(qrText, { errorCorrectionLevel: "M", margin: 2, width: 360 });
      setIssued({ rx, image, pin });
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

  const revoke = async (item: IssuedRx) => {
    if (!window.confirm(`Withdraw the code for ${item.med}? Patients will no longer be able to save it as verified.`)) return;
    setRevokingId(item.rxId);
    try {
      await rxApi.revoke(item.rxId);
      setRecent((items) => items?.map((entry) => (entry.rxId === item.rxId ? { ...entry, revoked: true } : entry)) ?? items);
      toast({ title: "Code withdrawn", variant: "success" });
    } catch (cause) {
      toast({ title: "Could not withdraw", description: cause instanceof Error ? cause.message : undefined, variant: "error" });
    } finally {
      setRevokingId(null);
    }
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
          {issued.pin ? (
            <div className="mx-auto mt-4 max-w-xs rounded-2xl border border-brand/30 bg-brand-soft px-4 py-3" role="status">
              <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand-strong">
                <KeyRound className="size-3.5" aria-hidden /> One-time PIN
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-ink" aria-label={`PIN ${issued.pin.split("").join(" ")}`}>
                {issued.pin}
              </p>
              <p className="mt-1 text-xs text-muted">
                Tell the patient this PIN in person. It is shown once and can&apos;t be looked up again. Don&apos;t print it
                next to the code.
              </p>
            </div>
          ) : null}
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
          <fieldset className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <legend className="sr-only">Code options</legend>
            <div>
              <label htmlFor="rx-validity" className="mb-1.5 block text-sm font-semibold text-ink">
                Patient can save it for
              </label>
              <select
                id="rx-validity"
                value={validityDays}
                onChange={(event) => setValidityDays(Number(event.target.value) as 1 | 7 | 30)}
                className="field"
              >
                {VALIDITY_OPTIONS.map((option) => (
                  <option key={option.days} value={option.days}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted">After that the code can no longer be saved as verified.</p>
            </div>
            <div>
              <label className="flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={requirePin}
                  onChange={(event) => setRequirePin(event.target.checked)}
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="font-semibold text-ink">Require a one-time PIN</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    Stops a photographed or forwarded code from being claimed by someone else. You give the patient the
                    PIN in person.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>
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
                <div className="flex flex-wrap items-center gap-2">
                  {item.pinProtected && !item.claimed ? (
                    <span className="chip" title="Needs a one-time PIN">
                      <KeyRound className="size-3" aria-hidden /> PIN
                    </span>
                  ) : null}
                  {item.claimed ? (
                    <span className="chip border-brand/30 bg-brand-soft text-brand-strong">
                      <BadgeCheck className="size-3" aria-hidden /> Saved by patient
                    </span>
                  ) : item.revoked ? (
                    <span className="chip">
                      <Ban className="size-3" aria-hidden /> Withdrawn
                    </span>
                  ) : item.locked ? (
                    <span className="chip border-warning/30 bg-warning/10 text-warning">
                      <Lock className="size-3" aria-hidden /> Locked (wrong PINs)
                    </span>
                  ) : item.expired ? (
                    <span className="chip">Expired</span>
                  ) : (
                    <span className="chip">
                      <Clock3 className="size-3" aria-hidden /> Waiting for patient
                    </span>
                  )}
                  {!item.claimed && !item.revoked && !item.expired ? (
                    <button
                      type="button"
                      onClick={() => void revoke(item)}
                      disabled={revokingId === item.rxId}
                      className="btn btn-ghost min-h-9 px-2.5 text-xs"
                    >
                      {revokingId === item.rxId ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Ban className="size-3.5" aria-hidden />
                      )}
                      Withdraw
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

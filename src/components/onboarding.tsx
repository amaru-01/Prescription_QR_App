"use client";

import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, BellRing, CheckCircle2, ScanLine, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    icon: ScanLine,
    title: "Scan, upload, or type",
    description:
      "Use the rear camera for a live scan, upload a screenshot if the camera is blocked, or type the three fields manually.",
  },
  {
    icon: ShieldCheck,
    title: "Review before saving",
    description:
      "VeriDose checks the medication, dose, and duration for you. Nothing is saved until you confirm.",
  },
  {
    icon: BellRing,
    title: "Keep the course on track",
    description:
      "Saved prescriptions land in a searchable history with notes, reminders, CSV export, and a printable summary.",
  },
] as const;

const STORAGE_KEY = "veridose.onboarded";

export function Onboarding() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gates a client-only modal until after hydration
    setMounted(true);
    try {
      if (!window.localStorage.getItem(STORAGE_KEY)) {
        const timer = setTimeout(() => setOpen(true), 450);
        return () => clearTimeout(timer);
      }
    } catch {
      /* storage blocked */
    }
  }, []);

  const close = useCallback((completed: boolean) => {
    setOpen(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, completed ? "completed" : "dismissed");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    // Keep the page beneath the modal still and prevent a horizontal jump when
    // the browser scrollbar disappears.
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
      if (event.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea");
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      previouslyFocused?.focus();
    };
  }, [close, open]);

  if (!mounted || !open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] grid min-h-[100dvh] place-items-center overflow-y-auto bg-[#06120e]/60 px-4 backdrop-blur-md sm:px-6"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        className="card relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto animate-[var(--animate-pop)] p-5 shadow-[0_28px_80px_-24px_rgba(0,0,0,0.65)] sm:p-6"
      >
        <div className="absolute inset-x-0 top-0 h-1 overflow-hidden bg-brand-soft" aria-hidden>
          <span
            className="block h-full rounded-r-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="chip min-w-0">
            <span className="size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
            <span className="truncate">Welcome to VeriDose</span>
          </span>
          <button
            type="button"
            onClick={() => close(false)}
            className="min-h-10 shrink-0 rounded-full px-3 text-xs font-semibold text-muted transition hover:bg-elevated hover:text-ink"
          >
            Skip
          </button>
        </div>

        <div
          key={step}
          className="animate-[var(--animate-fade-up)]"
        >
          <div className="mt-5 flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
            <Icon className="size-7" aria-hidden />
          </div>
          <h2 id="onboarding-title" className="mt-4 font-display text-2xl font-semibold leading-tight text-ink">
            {current.title}
          </h2>
          <p id="onboarding-description" className="mt-2 text-sm leading-relaxed text-muted">
            {current.description}
          </p>
        </div>

        <div className="mt-5 flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((item, index) => (
            <span
              key={item.title}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === step ? "w-7 bg-brand" : index < step ? "w-3 bg-brand/45" : "w-2 bg-line"
              }`}
              aria-hidden
            />
          ))}
          <span className="ml-auto text-[0.7rem] font-semibold text-muted">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>

        <div className="mt-5 flex gap-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((value) => value - 1)}
              className="btn btn-secondary min-h-12 px-5"
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              if (isLast) {
                close(true);
                router.push("/scan");
                return;
              }
              setStep((value) => Math.min(STEPS.length - 1, value + 1));
            }}
            className="btn btn-primary group min-h-12 flex-1"
          >
            {isLast ? (
              <>
                <CheckCircle2 className="size-4" aria-hidden />
                Start scanning
              </>
            ) : (
              <>
                Next
                <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

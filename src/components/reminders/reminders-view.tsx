"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellOff, BellRing, Check, Clock, Info, Loader2, Pill, RefreshCw, ScanLine } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { PrescriptionListSkeleton } from "@/components/ui/skeleton";
import { usePrescriptions } from "@/hooks/use-prescriptions";
import { usePush } from "@/hooks/use-push";
import { useReminders } from "@/hooks/use-reminders";
import { useToast } from "@/hooks/use-toasts";
import { formatDayKey, formatRelative, dayKey } from "@/lib/format";
import { lastNDays } from "@/lib/stats";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export function RemindersView() {
  const { prescriptions, loading, error, refresh } = usePrescriptions(100);
  const { entryFor, setTime, setNotify, toggleTaken, hydrated, error: reminderError, push, timezone, refreshPushStatus } =
    useReminders();
  const pushDevice = usePush();
  const { toast } = useToast();

  const enableNotifications = async () => {
    try {
      await pushDevice.enable();
      await refreshPushStatus();
      toast({ title: "Notifications on", description: "Switch on “Notify me” for each medication.", variant: "success" });
    } catch (cause) {
      toast({ title: "Could not turn on notifications", description: cause instanceof Error ? cause.message : undefined, variant: "error" });
    }
  };

  const disableNotifications = async () => {
    try {
      await pushDevice.disable();
      await refreshPushStatus();
      toast({ title: "Notifications off on this device", variant: "info" });
    } catch (cause) {
      toast({ title: "Could not turn off notifications", description: cause instanceof Error ? cause.message : undefined, variant: "error" });
    }
  };
  const active = useMemo(() => prescriptions.filter((item) => item.status === "active"), [prescriptions]);
  const days = useMemo(() => lastNDays(7), []);
  const today = dayKey();

  const takenToday = hydrated ? active.filter((item) => entryFor(item.id).log.includes(today)).length : 0;
  const progress = active.length > 0 ? Math.round((takenToday / active.length) * 100) : 0;
  const totalTaken = hydrated
    ? active.reduce((sum, item) => sum + days.filter((day) => entryFor(item.id).log.includes(day)).length, 0)
    : 0;
  const totalPossible = active.length * days.length;
  const weeklyPercent = totalPossible > 0 ? Math.round((totalTaken / totalPossible) * 100) : 0;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">Medication tracking</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.4rem]">
            Reminders & adherence
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tick off doses as you take them and build a clear picture of your routine.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="btn btn-secondary min-h-11 px-3.5 text-sm"
          aria-label="Refresh reminders"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </header>

      <section className="card grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="relative mx-auto size-32">
          <svg viewBox="0 0 120 120" className="size-32 -rotate-90" role="img" aria-label={`${progress}% of today's doses taken`}>
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--line)" strokeWidth="10" />
            <circle
              cx="60"
              cy="60"
              r="50"
              fill="none"
              stroke="var(--brand)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 314} 314`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-ink">{progress}%</span>
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">today</span>
          </div>
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold text-ink">
            {active.length === 0
              ? "No active medication"
              : takenToday === active.length
                ? "Today's doses are complete"
                : `${active.length - takenToday} dose${active.length - takenToday === 1 ? "" : "s"} left today`}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {active.length} active course{active.length === 1 ? "" : "s"} · {weeklyPercent}% adherence across the
            last 7 days.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line bg-elevated/50 px-2.5 py-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">Taken</p>
              <p className="text-lg font-extrabold text-ink">{takenToday}</p>
            </div>
            <div className="rounded-xl border border-line bg-elevated/50 px-2.5 py-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">Active</p>
              <p className="text-lg font-extrabold text-ink">{active.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-elevated/50 px-2.5 py-2">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-muted">7-day</p>
              <p className="text-lg font-extrabold text-ink">
                {totalTaken}
                <span className="text-xs font-semibold text-muted">/{totalPossible}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="card flex flex-wrap items-start justify-between gap-3 p-4" aria-labelledby="push-title">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
            {pushDevice.state === "on" ? <BellRing className="size-5" aria-hidden /> : <BellOff className="size-5" aria-hidden />}
          </span>
          <div>
            <h2 id="push-title" className="text-sm font-bold text-ink">Notifications on this device</h2>
            <p className="mt-0.5 max-w-prose text-xs leading-relaxed text-muted">
              {!push.configured && hydrated
                ? "Notifications aren't set up on this server yet. You can still log doses here."
                : pushDevice.state === "unsupported"
                  ? "This browser can't receive notifications. On iPhone, add VeriDose to your Home Screen first (iOS 16.4+)."
                  : pushDevice.state === "denied"
                    ? "Notifications are blocked for this site. Allow them in your browser settings, then reload."
                    : pushDevice.state === "on"
                      ? `Reminders arrive at the times below (${timezone}). They never show medication names.`
                      : "Get a reminder at each dose time, even when VeriDose is closed."}
            </p>
          </div>
        </div>
        {push.configured && (pushDevice.state === "off" || pushDevice.state === "on" || pushDevice.state === "working") ? (
          <button
            type="button"
            onClick={() => void (pushDevice.state === "on" ? disableNotifications() : enableNotifications())}
            disabled={pushDevice.state === "working"}
            className={`btn min-h-10 px-4 text-sm ${pushDevice.state === "on" ? "btn-ghost" : "btn-primary"}`}
          >
            {pushDevice.state === "working" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {pushDevice.state === "on" ? "Turn off" : "Turn on notifications"}
          </button>
        ) : null}
      </section>

      {reminderError ? (
        <div role="alert" className="card border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {reminderError}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="card border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {error}
        </div>
      ) : loading ? (
        <PrescriptionListSkeleton count={2} />
      ) : active.length === 0 ? (
        <EmptyState
          icon={<BellRing className="size-7" aria-hidden />}
          title="Nothing scheduled yet"
          description="Reminders are built from active prescriptions. Scan a code, then come back to set a daily time and tick off doses."
          action={
            <Link href="/scan" className="btn btn-primary min-h-11">
              <ScanLine className="size-4" aria-hidden />
              Scan a prescription
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {active.map((prescription) => {
            const entry = entryFor(prescription.id);
            const taken = hydrated && entry.log.includes(today);
            const weekCount = days.filter((day) => entry.log.includes(day)).length;
            return (
              <li key={prescription.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
                    <Pill className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-bold text-ink">{prescription.med}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {prescription.dose} · {prescription.duration} · saved {formatRelative(prescription.createdAt)}
                    </p>
                    {prescription.notes ? (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{prescription.notes}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void toggleTaken(prescription.id)}
                    aria-pressed={taken}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                      taken
                        ? "border-brand bg-brand text-white"
                        : "border-line bg-surface text-ink hover:border-brand/50"
                    }`}
                  >
                    <span className={`flex size-4 items-center justify-center rounded-full border ${taken ? "border-white/60 bg-white/20" : "border-line"}`}>
                      {taken ? <Check className="size-3" aria-hidden /> : null}
                    </span>
                    {taken ? "Taken today" : "Mark taken"}
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
                  <div>
                    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted">Daily reminder</p>
                    <div className="mt-1 flex items-center gap-2">
                      <Clock className="size-3.5 text-muted" aria-hidden />
                      <label htmlFor={`time-${prescription.id}`} className="sr-only">
                        Reminder time for {prescription.med}
                      </label>
                      <input
                        id={`time-${prescription.id}`}
                        type="time"
                        value={entry.time}
                        onChange={(event) => {
                          if (event.target.value) void setTime(prescription.id, event.target.value);
                        }}
                        className="field min-h-10 w-[7.5rem] py-1 text-sm"
                      />
                      <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink">
                        <input
                          type="checkbox"
                          checked={entry.notify}
                          onChange={(event) => void setNotify(prescription.id, event.target.checked)}
                          disabled={!push.configured}
                          className="size-4 accent-[var(--brand)]"
                        />
                        Notify me
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="text-[0.65rem] font-bold uppercase tracking-wide text-muted">
                      Last 7 days · {weekCount}/7
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      {days.map((day, index) => {
                        const isTaken = entry.log.includes(day);
                        const isToday = day === today;
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => void toggleTaken(prescription.id, day)}
                            aria-pressed={isTaken}
                            aria-label={`${formatDayKey(day)}, ${isTaken ? "taken" : "not taken"}`}
                            title={formatDayKey(day)}
                            className={`flex size-8 items-center justify-center rounded-full border text-[0.65rem] font-bold transition ${
                              isTaken
                                ? "border-brand bg-brand text-white"
                                : isToday
                                  ? "border-brand/50 bg-brand-soft text-brand-strong"
                                  : "border-line bg-surface text-muted hover:border-brand/40"
                            }`}
                          >
                            {isTaken ? <Check className="size-3.5" aria-hidden /> : DAY_LETTERS[new Date(`${day}T12:00:00`).getDay()]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="card flex items-start gap-2 p-4 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
        Reminder times and check-ins are saved privately to your account, so they follow you across devices.
        Reminders are a memory aid: keep following the schedule given by your clinician or pharmacist.
      </p>
    </div>
  );
}

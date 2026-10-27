"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  ClipboardList,
  RefreshCw,
  ScanLine,
  Search,
  X,
} from "lucide-react";

import { ExportActions, ExportHint } from "@/components/export-actions";
import { PrescriptionCard } from "@/components/prescription/prescription-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PrescriptionListSkeleton } from "@/components/ui/skeleton";
import { usePrescriptions } from "@/hooks/use-prescriptions";
import { formatDate } from "@/lib/format";
import type { PrescriptionStatus } from "@/types/prescription";

type Filter = "all" | PrescriptionStatus;
type Sort = "newest" | "oldest" | "az";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archived" },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "az", label: "Medication A–Z" },
];

export function HistoryView() {
  const { prescriptions, loading, error, refresh } = usePrescriptions(100);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("newest");

  const counts = useMemo(
    () => ({
      all: prescriptions.length,
      active: prescriptions.filter((item) => item.status === "active").length,
      completed: prescriptions.filter((item) => item.status === "completed").length,
      archived: prescriptions.filter((item) => item.status === "archived").length,
    }),
    [prescriptions],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = prescriptions.filter((item) => {
      if (filter !== "all" && item.status !== filter) return false;
      if (!needle) return true;
      return [item.med, item.dose, item.duration, item.notes ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return result.sort((a, b) => {
      if (sort === "az") return a.med.localeCompare(b.med);
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
  }, [filter, prescriptions, query, sort]);

  const hasFilters = query.trim().length > 0 || filter !== "all";

  return (
    <div className="space-y-4">
      <header className="no-print flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">Your records</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.4rem]">
            Prescription history
          </h1>
          <p className="mt-1 text-sm text-muted">
            {loading ? "Loading your saved prescriptions…" : `${counts.all} saved · ${counts.active} active`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="btn btn-secondary min-h-11 px-3.5 text-sm"
            aria-label="Refresh prescription history"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
          <ExportActions compact />
          <Link href="/scan" className="btn btn-primary min-h-11 px-4 text-sm">
            <ScanLine className="size-4" aria-hidden />
            New scan
          </Link>
        </div>
      </header>

      <div className="print:block hidden">
        <h2 className="text-xl font-bold">VeriDose prescription summary</h2>
        <p className="text-xs text-muted">Generated {formatDate(new Date().toISOString())}</p>
      </div>

      <section className="no-print card flex flex-col gap-3 p-3 sm:p-4" aria-label="Search and filter prescriptions">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <label htmlFor="history-search" className="sr-only">
              Search prescriptions
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="history-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search medication, dose, duration, or notes"
              className="field min-h-12 pl-10 pr-10"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:bg-elevated hover:text-ink"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="history-sort" className="sr-only">
              Sort prescriptions
            </label>
            <div className="relative">
              <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <select
                id="history-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                className="field min-h-12 w-full appearance-none pl-9 pr-8 text-sm font-medium sm:w-auto"
              >
                {SORTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
          {FILTERS.map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id)}
                aria-pressed={active}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition ${
                  active
                    ? "border-brand/30 bg-brand-soft text-brand-strong"
                    : "border-line bg-surface text-muted hover:text-ink"
                }`}
              >
                {option.label}
                <span className={`text-[0.7rem] ${active ? "text-brand-strong/80" : "text-muted/80"}`}>
                  {counts[option.id]}
                </span>
              </button>
            );
          })}
        </div>
        <ExportHint />
      </section>

      {error ? (
        <div role="alert" className="card border-danger/30 bg-danger/5 p-5">
          <p className="text-sm font-bold text-danger">Could not load your prescriptions</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <button type="button" onClick={() => void refresh()} className="btn btn-secondary mt-3 min-h-11 text-sm">
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
        </div>
      ) : loading ? (
        <PrescriptionListSkeleton count={4} />
      ) : prescriptions.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-7" aria-hidden />}
          title="Your history is empty"
          description="Scan a prescription QR code to create your first record."
          action={
            <Link href="/scan" className="btn btn-primary min-h-11">
              <ScanLine className="size-4" aria-hidden />
              Scan prescription
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search className="size-7" aria-hidden />}
          title="No matches"
          description="Nothing matches your current search and filters. Try a different medication name or reset the filters."
          action={
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
              className="btn btn-secondary min-h-11"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <p className="no-print text-xs font-semibold text-muted" aria-live="polite">
            Showing {filtered.length} of {prescriptions.length} prescriptions
            {hasFilters ? " (filtered)" : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((prescription, index) => (
              <div
                key={prescription.id}
                className="animate-[var(--animate-fade-up)]"
                style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
              >
                <PrescriptionCard prescription={prescription} showActions />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

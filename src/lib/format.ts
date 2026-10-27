import type { Prescription, PrescriptionSource, PrescriptionStatus } from "@/types/prescription";

export const STATUS_LABELS: Record<PrescriptionStatus, string> = {
  active: "Active",
  completed: "Completed",
  archived: "Archived",
};

export const SOURCE_LABELS: Record<PrescriptionSource, string> = {
  scan: "Camera scan",
  upload: "Photo upload",
  manual: "Manual entry",
  demo: "Sample record",
};

export function formatDate(iso: string | null): string {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Formats a local `YYYY-MM-DD` day key without UTC drift. */
export function formatDayKey(key: string): string {
  const date = new Date(`${key}T12:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", weekday: "short" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "Date unavailable";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function dayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysAgoKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dayKey(date);
}

export function initialsFor(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "RX";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "RX";
}

export function isActive(prescription: Prescription): boolean {
  return prescription.status === "active";
}

export function relativeTimeLabel(iso: string | null): string {
  return iso ? formatRelative(iso) : "unknown date";
}

export function adherencePercent(taken: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.min(100, Math.round((taken / expected) * 100));
}

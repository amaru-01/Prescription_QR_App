import type { Metadata } from "next";
import Link from "next/link";
import { CloudOff, RefreshCw, ScanLine } from "lucide-react";

export const metadata: Metadata = {
  title: "You are offline",
  description: "VeriDose offline fallback.",
};

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-accent-soft text-accent">
        <CloudOff className="size-8" aria-hidden />
      </div>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">You are offline</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        This page is not cached yet. Any scans you saved while offline are still queued on this device and will
        sync automatically once you reconnect.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href="/" className="btn btn-primary min-h-11">
          <RefreshCw className="size-4" aria-hidden />
          Try again
        </Link>
        <Link href="/scan" className="btn btn-secondary min-h-11">
          <ScanLine className="size-4" aria-hidden />
          Open scanner
        </Link>
      </div>
    </div>
  );
}

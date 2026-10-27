import Link from "next/link";
import { ClipboardList, Compass, ScanLine } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-3xl bg-brand-soft text-brand-strong">
        <Compass className="size-8" aria-hidden />
      </div>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted">404</p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-ink">That record moved</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        We could not find the page or prescription you were looking for. It may have been deleted, or the link was
        mistyped.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Link href="/history" className="btn btn-primary min-h-11">
          <ClipboardList className="size-4" aria-hidden />
          Prescription history
        </Link>
        <Link href="/scan" className="btn btn-secondary min-h-11">
          <ScanLine className="size-4" aria-hidden />
          Scan instead
        </Link>
      </div>
    </div>
  );
}

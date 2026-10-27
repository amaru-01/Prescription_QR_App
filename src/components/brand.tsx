import Link from "next/link";

export function BrandMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_8px_18px_-10px_rgba(14,124,102,0.9)] ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" className="size-[68%]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 11V7.5A2.5 2.5 0 0 1 7.5 5H11" />
        <path d="M21 5h3.5A2.5 2.5 0 0 1 27 7.5V11" />
        <path d="M27 21v3.5A2.5 2.5 0 0 1 24.5 27H21" />
        <path d="M11 27H7.5A2.5 2.5 0 0 1 5 24.5V21" />
        <path d="M8.5 16h4l2-4 3 8 2-4h4" />
      </svg>
    </span>
  );
}

export function BrandLockup({ withTagline = false }: { withTagline?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5 rounded-2xl pr-2" aria-label="VeriDose home">
      <BrandMark />
      <span className="flex flex-col leading-none">
        <span className="text-[1.05rem] font-extrabold tracking-tight text-ink">VeriDose</span>
        {withTagline ? (
          <span className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted">
            Prescription QR
          </span>
        ) : null}
      </span>
    </Link>
  );
}

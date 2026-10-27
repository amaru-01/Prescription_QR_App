import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="no-print mx-auto mt-10 w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
      <div className="card flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">VeriDose keeps your medication record clear.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Your records, reminders, and exports in one calm place. Always follow the directions from your
            clinician or pharmacist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-muted">
          <Link href="/history" className="rounded-lg py-1 hover:text-ink">
            History
          </Link>
          <Link href="/reminders" className="rounded-lg py-1 hover:text-ink">
            Reminders
          </Link>
          <Link href="/settings" className="rounded-lg py-1 hover:text-ink">
            Settings
          </Link>
        </div>
      </div>
    </footer>
  );
}

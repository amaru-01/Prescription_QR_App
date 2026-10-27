import Link from "next/link";
import { ArrowUpRight, Bell, Download, Settings, Smartphone } from "lucide-react";

const ACTIONS = [
  {
    href: "/reminders",
    label: "Medication reminders",
    description: "Today's doses and a 7-day adherence view.",
    icon: Bell,
  },
  {
    href: "/history",
    label: "Export your history",
    description: "Download CSV or print a PDF summary.",
    icon: Download,
  },
  {
    href: "/settings",
    label: "Profile & onboarding",
    description: "Profile, theme, privacy, and app install.",
    icon: Settings,
  },
  {
    href: "/settings#install",
    label: "Install the app",
    description: "Add VeriDose to your home screen.",
    icon: Smartphone,
  },
];

export function QuickActions() {
  return (
    <section aria-labelledby="quick-actions-title">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h2 id="quick-actions-title" className="font-display text-xl font-semibold text-ink">
            Make it yours
          </h2>
          <p className="text-sm text-muted">Shortcuts built into this release.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              href={action.href}
              className="card group flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:border-brand/40"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-brand-strong">
                <Icon className="size-[1.1rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink">{action.label}</span>
                  <ArrowUpRight className="size-4 text-muted transition group-hover:text-brand" aria-hidden />
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{action.description}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

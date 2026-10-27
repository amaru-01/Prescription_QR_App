"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { BrandLockup } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { useProfile } from "@/hooks/use-profile";
import { initialsFor } from "@/lib/format";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/scan", label: "Scan" },
  { href: "/history", label: "History" },
  { href: "/reminders", label: "Reminders" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  const pathname = usePathname();
  const { profile, hydrated } = useProfile();

  return (
    <header className="no-print sticky top-0 z-50 border-b border-line/80 bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <BrandLockup />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  active ? "bg-brand-soft text-brand-strong" : "text-muted hover:bg-elevated hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {hydrated && !profile.signedIn ? (
            <Link href="/login" className="btn btn-primary hidden min-h-10 px-4 text-sm sm:inline-flex">
              Log in
            </Link>
          ) : null}

          <Link
            href={hydrated && !profile.signedIn ? "/login" : "/settings"}
            className="flex size-10 items-center justify-center rounded-full border border-line bg-surface text-xs font-bold text-brand-strong transition hover:border-brand"
            aria-label={`Profile settings for ${hydrated ? profile.name : "guest"}`}
          >
            {initialsFor(hydrated ? profile.name : "Guest tester")}
          </Link>
        </div>
      </div>
    </header>
  );
}

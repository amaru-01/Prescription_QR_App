"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ClipboardList, Home, ScanLine, Settings } from "lucide-react";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/history", label: "History", icon: ClipboardList },
  { href: "/scan", label: "Scan", icon: ScanLine, primary: true },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2 pt-1.5">
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;

          if (item.primary) {
            return (
              <li key={item.href} className="flex justify-center">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="-mt-6 flex size-14 flex-col items-center justify-center rounded-full bg-brand text-white shadow-[0_14px_28px_-14px_rgba(14,124,102,0.9)] ring-4 ring-canvas transition active:scale-90 animate-ring"
                >
                  <Icon className="size-6" aria-hidden />
                  <span className="mt-0.5 text-[0.6rem] font-bold">{item.label}</span>
                </Link>
              </li>
            );
          }

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[0.65rem] font-semibold transition ${
                  active ? "text-brand" : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

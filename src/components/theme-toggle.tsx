"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const { theme, mounted, toggleTheme } = useTheme();
  const dark = mounted && theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface text-muted transition hover:text-ink hover:bg-elevated ${
        withLabel ? "min-h-11 px-4 text-sm font-semibold" : "size-10"
      }`}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="size-[1.15rem]" aria-hidden /> : <Moon className="size-[1.15rem]" aria-hidden />}
      {withLabel ? <span>{dark ? "Light mode" : "Dark mode"}</span> : null}
    </button>
  );
}

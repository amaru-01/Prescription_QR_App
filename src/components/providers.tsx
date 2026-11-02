"use client";

import type { ReactNode } from "react";

import { SessionProvider } from "@/hooks/use-session";
import { ThemeProvider } from "@/hooks/use-theme";
import { ToastProvider } from "@/hooks/use-toasts";
import { RippleEffect } from "@/components/motion";
import type { SessionUser } from "@/types/auth";

export function Providers({ user, children }: { user: SessionUser | null; children: ReactNode }) {
  return (
    <SessionProvider user={user}>
      <ThemeProvider>
        <ToastProvider>
          <RippleEffect />
          {children}
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}

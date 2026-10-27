"use client";

import type { ReactNode } from "react";

import { ThemeProvider } from "@/hooks/use-theme";
import { ToastProvider } from "@/hooks/use-toasts";
import { RippleEffect } from "@/components/motion";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <RippleEffect />
        {children}
      </ToastProvider>
    </ThemeProvider>
  );
}

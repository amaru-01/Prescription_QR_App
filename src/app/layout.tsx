import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/fraunces";
import "./globals.css";

import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: {
    default: "VeriDose — Prescription QR scanner",
    template: "%s · VeriDose",
  },
  description:
    "Scan a prescription QR code, review the medication details, and keep a clear, private record of every course. Mobile-first, accessible, and built for real user testing.",
  applicationName: "VeriDose",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "VeriDose",
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  openGraph: {
    title: "VeriDose — Prescription QR scanner",
    description:
      "Scan, review, and save prescriptions in seconds. Medication history, reminders, exports, and offline-safe saving.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f7f3" },
    { media: "(prefers-color-scheme: dark)", color: "#07130f" },
  ],
};

const themeScript = `(function(){try{var stored=localStorage.getItem("veridose.theme");var isDark=stored?stored==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",isDark);document.documentElement.style.colorScheme=isDark?"dark":"light";}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-brand focus:px-5 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
          >
            Skip to content
          </a>
          <AppHeader />
          <main id="main-content" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-16 lg:px-8">
            {children}
          </main>
          <SiteFooter />
          <BottomNav />
          <PwaRegister />
        </Providers>
      </body>
    </html>
  );
}

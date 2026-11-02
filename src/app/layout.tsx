import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/fraunces";
import "./globals.css";

import { AppHeader } from "@/components/layout/app-header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SiteFooter } from "@/components/layout/site-footer";
import { Providers } from "@/components/providers";
import { PwaRegister } from "@/components/pwa-register";
import { getSessionUser } from "@/lib/server/auth";
import type { SessionUser } from "@/types/auth";

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

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Set per request by src/proxy.ts; the inline theme script must carry it to pass the CSP.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  let user: SessionUser | null = null;
  try {
    user = await getSessionUser();
  } catch (error) {
    console.error("Could not verify session:", error);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Providers user={user}>
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

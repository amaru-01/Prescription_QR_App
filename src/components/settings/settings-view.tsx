"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  Loader2,
  LogOut,
  Moon,
  Smartphone,
  Sparkles,
  UserRound,
} from "lucide-react";

import { ExportActions } from "@/components/export-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { useProfile } from "@/hooks/use-profile";
import { useToast } from "@/hooks/use-toasts";
import { prescriptionApi } from "@/lib/api";
import { initialsFor } from "@/lib/format";
import type { HealthResponse } from "@/types/prescription";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function SettingsView() {
  const router = useRouter();
  const { toast } = useToast();
  const { profile, hydrated, saveProfile } = useProfile();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    setName(profile.name === "Guest tester" ? "" : profile.name);
    setEmail(profile.email);
  }, [hydrated, profile.email, profile.name]);

  const checkHealth = async () => {
    setChecking(true);
    setHealthError(null);
    try {
      setHealth(await prescriptionApi.health());
    } catch (error) {
      setHealthError("We couldn't check your connection right now. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkHealth();
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const saveProfile_ = () => {
    saveProfile({
      name: name.trim() || "Guest tester",
      email: email.trim(),
      signedIn: profile.signedIn,
    });
    toast({ title: "Profile saved on this device", variant: "success" });
  };

  const signOut = () => {
    saveProfile({ name: "Guest tester", email: "", signedIn: false });
    setName("");
    setEmail("");
    toast({ title: "Signed out of the demo session", variant: "success" });
  };

  const install = async () => {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      toast({
        title: choice.outcome === "accepted" ? "Installing VeriDose" : "Install dismissed",
        variant: choice.outcome === "accepted" ? "success" : "info",
      });
      setInstallEvent(null);
    } finally {
      setInstalling(false);
    }
  };

  const resetReminders = () => {
    if (!window.confirm("Clear all reminder times and adherence history on this device?")) return;
    try {
      window.localStorage.removeItem("veridose.reminders");
    } catch {
      /* ignore */
    }
    toast({ title: "Reminder data cleared", variant: "info" });
    router.refresh();
  };

  const replayOnboarding = () => {
    try {
      window.localStorage.removeItem("veridose.onboarded");
    } catch {
      /* ignore */
    }
    toast({ title: "Onboarding reset", description: "It will show the next time you open the home page.", variant: "success" });
  };

  return (
    <div className="space-y-4 pb-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-strong">Preferences & setup</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink sm:text-[2.4rem]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your account, appearance, connection, exports, and app preferences.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5" aria-labelledby="account-title">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <UserRound className="size-[1.1rem]" aria-hidden />
            </span>
            <div>
              <h2 id="account-title" className="text-sm font-bold text-ink">Your account</h2>
              <p className="text-xs text-muted">Update your name and sign-in details.</p>
            </div>
            {profile.signedIn ? (
              <span className="chip ml-auto border-brand/30 bg-brand-soft text-brand-strong">
                <CheckCircle2 className="size-3" aria-hidden /> Signed in
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-elevated text-sm font-extrabold text-ink">
              {initialsFor(hydrated ? profile.name : "Guest tester")}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{hydrated ? profile.name : "Guest tester"}</p>
              <p className="truncate text-xs text-muted">{profile.email || "No account connected"}</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="profile-name" className="mb-1.5 block text-xs font-semibold text-ink">Display name</label>
              <input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Alex Rivera"
                autoComplete="name"
                className="field"
                maxLength={60}
              />
            </div>
            <div>
              <label htmlFor="profile-email" className="mb-1.5 block text-xs font-semibold text-ink">Email</label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@example.com"
                autoComplete="email"
                className="field"
                maxLength={120}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={saveProfile_} className="btn btn-secondary min-h-11 px-3.5 text-sm">
                Save profile
              </button>
              {profile.signedIn ? (
                <button type="button" onClick={signOut} className="btn btn-ghost min-h-11 px-3 text-sm">
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              ) : (
                <>
                  <Link href="/login" className="btn btn-primary min-h-11 px-3.5 text-sm">
                    Log in / Sign up
                  </Link>
                </>
              )}
            </div>
            <p className="rounded-xl border border-line bg-elevated/60 p-2.5 text-[0.7rem] leading-relaxed text-muted">
              Your display name and preferences are kept private on this device.
            </p>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="appearance-title">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-elevated text-ink">
              <Moon className="size-[1.1rem]" aria-hidden />
            </span>
            <div>
              <h2 id="appearance-title" className="text-sm font-bold text-ink">Appearance</h2>
              <p className="text-xs text-muted">Your choice is saved on this device.</p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <ThemeToggle withLabel />
            <button type="button" onClick={replayOnboarding} className="btn btn-secondary min-h-11 w-full text-sm">
              <Sparkles className="size-4" aria-hidden />
              Show onboarding again
            </button>
            <Link href="/scan" className="btn btn-secondary min-h-11 w-full text-sm">
              Start a test scan
            </Link>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="backend-title">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <Loader2 className="size-[1.1rem]" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="backend-title" className="text-sm font-bold text-ink">Connection status</h2>
              <p className="text-xs text-muted">Check your Firebase connection.</p>
            </div>
            <button
              type="button"
              onClick={() => void checkHealth()}
              disabled={checking}
              className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full border border-line px-2.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-60"
            >
              <Loader2 className={`size-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden />
              {checking ? "Checking" : "Refresh"}
            </button>
          </div>

          <div className={`mt-4 flex items-center gap-3 rounded-2xl border p-4 ${
            checking
              ? "border-line bg-elevated/50"
              : health?.ok
                ? "border-brand/25 bg-brand-soft"
                : "border-danger/25 bg-danger/10"
          }`} role="status">
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
              health?.ok && !checking ? "bg-brand text-white" : "bg-surface text-muted"
            }`}>
              {checking ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : health?.ok ? (
                <CheckCircle2 className="size-5" aria-hidden />
              ) : (
                <Loader2 className="size-5 text-danger" aria-hidden />
              )}
            </span>
            <div>
              <p className="text-sm font-bold text-ink">
                {checking ? "Checking your connection…" : health?.ok ? "Everything is connected" : "Connection unavailable"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                {checking
                  ? "This will only take a moment."
                  : health?.ok
                    ? "Your prescription history is up to date."
                    : "You can still scan and save. We'll sync your changes when the connection returns."}
              </p>
            </div>
          </div>

          {healthError ? (
            <p role="alert" className="mt-3 flex items-start gap-1.5 text-xs text-danger">
              <Loader2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {healthError}
            </p>
          ) : null}
        </section>

        <section className="card p-5" aria-labelledby="data-title">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Download className="size-[1.1rem]" aria-hidden />
            </span>
            <div>
              <h2 id="data-title" className="text-sm font-bold text-ink">Data & exports</h2>
              <p className="text-xs text-muted">Download a private copy of your prescription history.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <ExportActions />
            <button type="button" onClick={resetReminders} className="btn btn-ghost min-h-10 w-full text-xs">
              Clear reminder data
            </button>
          </div>
        </section>
      </div>

      <section id="install" className="card scroll-mt-24 p-5" aria-labelledby="install-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
              <Smartphone className="size-[1.1rem]" aria-hidden />
            </span>
            <div>
              <h2 id="install-title" className="text-sm font-bold text-ink">Install VeriDose</h2>
              <p className="text-xs text-muted">Add VeriDose to your home screen for quick access.</p>
            </div>
          </div>
          {installEvent ? (
            <button type="button" onClick={() => void install()} disabled={installing} className="btn btn-primary min-h-10 px-4 text-sm">
              {installing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
              Install app
            </button>
          ) : (
            <span className="chip">Ready for your home screen</span>
          )}
        </div>
        <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
          <p className="rounded-xl border border-line bg-elevated/50 p-3">
            <span className="font-bold text-ink">iPhone / iPad:</span> open this page in Safari, tap Share, then
            &ldquo;Add to Home Screen&rdquo;.
          </p>
          <p className="rounded-xl border border-line bg-elevated/50 p-3">
            <span className="font-bold text-ink">Android / desktop:</span> use the browser menu &ldquo;Install
            app&rdquo;, or the button above when available.
          </p>
        </div>
      </section>

    </div>
  );
}

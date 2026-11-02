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
import { useSession } from "@/hooks/use-session";
import { useToast } from "@/hooks/use-toasts";
import { accountApi, prescriptionApi } from "@/lib/api";
import { signOutSession } from "@/lib/auth-client";
import { initialsFor } from "@/lib/format";
import type { HealthResponse } from "@/types/prescription";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function SettingsView() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, displayName } = useSession();

  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

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

  const saveName = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      toast({ title: "Enter at least 2 characters", variant: "error" });
      return;
    }
    setSavingName(true);
    try {
      await accountApi.updateName(trimmed);
      toast({ title: "Name updated", variant: "success" });
      router.refresh();
    } catch (error) {
      toast({ title: "Could not update your name", description: error instanceof Error ? error.message : undefined, variant: "error" });
    } finally {
      setSavingName(false);
    }
  };

  const signOut = async (everywhere = false) => {
    if (user?.isAnonymous && !window.confirm("Guest records can't be recovered after you sign out. Sign out anyway?")) return;
    if (everywhere && !window.confirm("Sign out of VeriDose on every device, including this one?")) return;
    setSigningOut(true);
    try {
      await signOutSession({ everywhere });
      toast({ title: everywhere ? "Signed out on all devices" : "Signed out", variant: "success" });
      router.replace("/login");
      router.refresh();
    } catch {
      toast({ title: "Could not sign out", description: "Check your connection and try again.", variant: "error" });
      setSigningOut(false);
    }
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
            {user && !user.isAnonymous ? (
              <span
                className={`chip ml-auto ${user.emailVerified ? "border-brand/30 bg-brand-soft text-brand-strong" : ""}`}
              >
                <CheckCircle2 className="size-3" aria-hidden /> {user.emailVerified ? "Verified" : "Email not verified"}
              </span>
            ) : user ? (
              <span className="chip ml-auto">Guest</span>
            ) : null}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-elevated text-sm font-extrabold text-ink">
              {initialsFor(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{displayName}</p>
              <p className="truncate text-xs text-muted">
                {user?.isAnonymous ? "Guest session" : user?.email || "No account connected"}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {user && !user.isAnonymous ? (
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
            ) : null}
            <div className="flex flex-wrap gap-2">
              {user && !user.isAnonymous ? (
                <button
                  type="button"
                  onClick={() => void saveName()}
                  disabled={savingName}
                  className="btn btn-secondary min-h-11 px-3.5 text-sm"
                >
                  {savingName ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Save name
                </button>
              ) : (
                <Link href="/signup" className="btn btn-primary min-h-11 px-3.5 text-sm">
                  Create an account
                </Link>
              )}
              {user ? (
                <button
                  type="button"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="btn btn-ghost min-h-11 px-3 text-sm"
                >
                  <LogOut className="size-4" aria-hidden />
                  Sign out
                </button>
              ) : null}
              {user && !user.isAnonymous ? (
                <button
                  type="button"
                  onClick={() => void signOut(true)}
                  disabled={signingOut}
                  className="btn btn-ghost min-h-11 px-3 text-sm"
                >
                  Sign out of all devices
                </button>
              ) : null}
            </div>
            <p className="rounded-xl border border-line bg-elevated/60 p-2.5 text-[0.7rem] leading-relaxed text-muted">
              {user?.isAnonymous
                ? "Guest records are private to this session and can't be recovered after you sign out. Create an account to keep them long term."
                : "Your prescriptions are stored privately in your account. Only you can see them when signed in."}
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
                    : "Saving needs a connection. Try again once you're back online."}
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

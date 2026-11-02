"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ScanLine,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

import { BrandMark } from "@/components/brand";
import { useToast } from "@/hooks/use-toasts";
import {
  authErrorMessage,
  requestPasswordReset,
  signInAsGuest,
  signInWithEmail,
  signUpWithEmail,
} from "@/lib/auth-client";

type Mode = "login" | "signup";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Firebase error codes that point at a specific form field. */
const FIELD_FOR_CODE: Record<string, string> = {
  "auth/invalid-email": "email",
  "auth/email-already-in-use": "email",
  "auth/invalid-credential": "password",
  "auth/wrong-password": "password",
  "auth/user-not-found": "password",
  "auth/weak-password": "password",
  "auth/password-does-not-meet-requirements": "password",
};

function strengthOf(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  const capped = Math.min(4, score);
  return { score: capped, label: ["Too short", "Weak", "Fair", "Good", "Strong"][capped] };
}

const STRENGTH_COLORS = ["bg-danger", "bg-danger", "bg-warning", "bg-brand", "bg-brand-strong"];

const PERKS = [
  { icon: ScanLine, title: "Scan in seconds", copy: "Camera, upload, or manual entry." },
  { icon: ShieldCheck, title: "Review before saving", copy: "Every field is validated first." },
  { icon: BellRing, title: "Stay on track", copy: "Reminders and adherence at a glance." },
];

export function AuthForm({ mode, next = "/" }: { mode: Mode; next?: string }) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const strength = useMemo(() => strengthOf(password), [password]);

  const fail = (message: string, fieldErrors: Record<string, string> = {}) => {
    setErrors(fieldErrors);
    setFormError(message);
    setShakeKey((key) => key + 1);
    const first = Object.keys(fieldErrors)[0];
    if (first) document.getElementById(`auth-${first}`)?.focus();
  };

  const finish = (destination: string, title: string, description: string) => {
    setSuccess(true);
    toast({ title, description, variant: "success" });
    window.setTimeout(() => {
      router.replace(destination);
      router.refresh();
    }, 900);
  };

  const failWith = (error: unknown) => {
    const message = authErrorMessage(error);
    const code = (error as { code?: unknown })?.code;
    const field = typeof code === "string" ? FIELD_FOR_CODE[code] : undefined;
    fail(message, field ? { [field]: message } : {});
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const fieldErrors: Record<string, string> = {};
    const mail = email.trim().toLowerCase();

    if (isSignup && name.trim().length < 2) fieldErrors.name = "Enter your name (at least 2 characters).";
    if (!EMAIL_RE.test(mail)) fieldErrors.email = "Enter a valid email address.";
    if (isSignup && password.length < 8) fieldErrors.password = "Use at least 8 characters.";
    else if (isSignup && strength.score < 2) fieldErrors.password = "Add length, mixed case, numbers or symbols.";
    if (!isSignup && !password) fieldErrors.password = "Enter your password.";
    if (isSignup && confirm !== password) fieldErrors.confirm = "Passwords do not match.";
    if (isSignup && !agree) fieldErrors.agree = "Please accept the testing terms.";

    if (Object.keys(fieldErrors).length) return fail("Please fix the highlighted fields.", fieldErrors);

    setBusy(true);
    try {
      if (isSignup) {
        const displayName = name.trim();
        await signUpWithEmail(displayName, mail, password);
        finish(
          next === "/" ? "/scan" : next,
          `Welcome, ${displayName.split(" ")[0]}!`,
          "We sent you an email to verify your address.",
        );
      } else {
        await signInWithEmail(mail, password);
        finish(next, "Welcome back", "You're signed in.");
      }
    } catch (error) {
      failWith(error);
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setFormError(null);
    setBusy(true);
    try {
      await signInAsGuest();
      finish(next, "Continuing as guest", "Guest records stay private, but are lost when you sign out.");
    } catch (error) {
      failWith(error);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const mail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(mail)) {
      fail("Enter your email above, then choose “Forgot password?” again.", { email: "Enter a valid email address." });
      return;
    }
    try {
      await requestPasswordReset(mail);
      toast({
        title: "Check your inbox",
        description: "If an account exists for that email, we've sent a password reset link.",
        variant: "success",
      });
    } catch (error) {
      failWith(error);
    }
  };

  const inputWrap = (field: string) =>
    `field flex items-center gap-2 px-3 focus-within:border-brand focus-within:shadow-[0_0_0_4px_var(--ring)] ${
      errors[field] ? "!border-danger" : ""
    }`;

  return (
    <div className="relative grid min-h-[calc(100dvh-10rem)] items-center gap-8 py-4 lg:grid-cols-2">
      {/* Animated brand panel */}
      <aside className="card relative hidden h-full min-h-[560px] overflow-hidden border-brand/20 bg-brand p-8 text-white lg:flex lg:flex-col">
        <div className="animate-blob absolute -right-24 -top-24 size-80 bg-white/10" aria-hidden />
        <div className="animate-blob absolute -bottom-28 -left-20 size-72 bg-accent/40 [animation-delay:-5s]" aria-hidden />
        <div className="animate-float absolute right-10 top-40 flex size-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur" aria-hidden>
          <ScanLine className="size-8" />
        </div>
        <div className="animate-float absolute bottom-44 right-24 flex size-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur [animation-delay:-2s]" aria-hidden>
          <BellRing className="size-6" />
        </div>

        <div className="relative flex items-center gap-2.5">
          <BrandMark className="size-10 bg-white/20" />
          <span className="text-lg font-extrabold">VeriDose</span>
        </div>
        <div className="relative mt-auto">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
            {isSignup ? "Create your account" : "Good to see you"}
          </p>
          <h2 className="mt-2 font-display text-4xl font-semibold leading-tight">
            Your medication record,
            <br />
            clear and calm.
          </h2>
          <ul className="mt-6 space-y-3">
            {PERKS.map((perk, index) => (
              <li
                key={perk.title}
                className="animate-slide-in flex items-start gap-3 rounded-2xl bg-white/10 p-3 backdrop-blur"
                style={{ animationDelay: `${200 + index * 120}ms` }}
              >
                <perk.icon className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  <span className="block text-sm font-bold">{perk.title}</span>
                  <span className="text-xs text-white/75">{perk.copy}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Form */}
      <section className="mx-auto w-full max-w-md">
        <div
          key={shakeKey}
          className={`card relative overflow-hidden p-6 sm:p-8 ${shakeKey > 0 ? "animate-shake" : ""}`}
        >
          <div className="animate-blob pointer-events-none absolute -right-16 -top-16 size-40 bg-brand-soft lg:hidden" aria-hidden />

          {success ? (
            <div className="relative flex flex-col items-center py-10 text-center animate-[var(--animate-pop)]">
              <div className="animate-ring flex size-20 items-center justify-center rounded-full bg-brand text-white">
                <svg viewBox="0 0 24 24" className="size-10" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path className="check-draw" d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h1 className="mt-5 font-display text-2xl font-semibold text-ink">
                {isSignup ? "Account created" : "Signed in"}
              </h1>
              <p className="mt-1 text-sm text-muted">Taking you {isSignup ? "to your first scan" : "to your dashboard"}…</p>
            </div>
          ) : (
            <div className="relative">
              {/* Mode switcher */}
              <div className="relative grid grid-cols-2 rounded-full bg-elevated p-1" role="tablist" aria-label="Authentication">
                <span
                  className={`absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-surface shadow-sm transition-transform duration-300 ease-out ${
                    isSignup ? "translate-x-[calc(100%+0.5rem)]" : "translate-x-0"
                  }`}
                  style={{ left: "0.25rem" }}
                  aria-hidden
                />
                <Link href="/login" role="tab" aria-selected={!isSignup} className={`relative z-10 rounded-full py-2.5 text-center text-sm font-bold transition ${!isSignup ? "text-ink" : "text-muted"}`}>
                  Log in
                </Link>
                <Link href="/signup" role="tab" aria-selected={isSignup} className={`relative z-10 rounded-full py-2.5 text-center text-sm font-bold transition ${isSignup ? "text-ink" : "text-muted"}`}>
                  Sign up
                </Link>
              </div>

              <h1 className="mt-6 font-display text-[1.9rem] font-semibold leading-tight text-ink">
                {isSignup ? (
                  <>Start your <span className="text-shimmer">clear record</span></>
                ) : (
                  <>Welcome <span className="text-shimmer">back</span></>
                )}
              </h1>
              <p className="mt-1 text-sm text-muted">
                {isSignup ? "Create an account to keep scans, reminders, and exports together." : "Log in to see your prescriptions and reminders."}
              </p>

              {formError ? (
                <p role="alert" className="mt-4 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger animate-[var(--animate-pop)]">
                  {formError}
                </p>
              ) : null}

              <form onSubmit={submit} noValidate className="mt-5 space-y-4">
                {isSignup ? (
                  <div className="animate-[var(--animate-fade-up)]">
                    <label htmlFor="auth-name" className="mb-1.5 block text-sm font-semibold text-ink">Full name</label>
                    <div className={inputWrap("name")}>
                      <UserRound className="size-4 shrink-0 text-muted" aria-hidden />
                      <input id="auth-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Alex Rivera" className="w-full bg-transparent outline-none" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "auth-name-err" : undefined} />
                    </div>
                    {errors.name ? <p id="auth-name-err" className="mt-1 text-xs font-medium text-danger">{errors.name}</p> : null}
                  </div>
                ) : null}

                <div>
                  <label htmlFor="auth-email" className="mb-1.5 block text-sm font-semibold text-ink">Email</label>
                  <div className={inputWrap("email")}>
                    <Mail className="size-4 shrink-0 text-muted" aria-hidden />
                    <input id="auth-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" className="w-full bg-transparent outline-none" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "auth-email-err" : undefined} />
                    {EMAIL_RE.test(email.trim()) ? <CheckCircle2 className="size-4 shrink-0 text-brand animate-[var(--animate-pop)]" aria-hidden /> : null}
                  </div>
                  {errors.email ? <p id="auth-email-err" className="mt-1 text-xs font-medium text-danger">{errors.email}</p> : null}
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="auth-password" className="text-sm font-semibold text-ink">Password</label>
                    {!isSignup ? (
                      <button type="button" onClick={() => void resetPassword()} className="text-xs font-semibold text-brand-strong hover:underline">
                        Forgot password?
                      </button>
                    ) : null}
                  </div>
                  <div className={inputWrap("password")}>
                    <Lock className="size-4 shrink-0 text-muted" aria-hidden />
                    <input id="auth-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignup ? "new-password" : "current-password"} placeholder={isSignup ? "At least 8 characters" : "Your password"} className="w-full bg-transparent outline-none" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "auth-password-err" : undefined} />
                    <button type="button" onClick={() => setShowPassword((v) => !v)} className="rounded-full p-1.5 text-muted transition hover:bg-elevated hover:text-ink" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                      {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                    </button>
                  </div>
                  {errors.password ? <p id="auth-password-err" className="mt-1 text-xs font-medium text-danger">{errors.password}</p> : null}
                  {isSignup && password ? (
                    <div className="mt-2" aria-live="polite">
                      <div className="grid grid-cols-4 gap-1.5">
                        {[0, 1, 2, 3].map((index) => (
                          <span key={index} className="h-1.5 overflow-hidden rounded-full bg-line">
                            <span className={`block h-full rounded-full transition-all duration-500 ${STRENGTH_COLORS[strength.score]}`} style={{ width: index < strength.score ? "100%" : "0%" }} />
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-[0.7rem] font-semibold text-muted">Strength: {strength.label}</p>
                    </div>
                  ) : null}
                </div>

                {isSignup ? (
                  <div className="animate-[var(--animate-fade-up)]">
                    <label htmlFor="auth-confirm" className="mb-1.5 block text-sm font-semibold text-ink">Confirm password</label>
                    <div className={inputWrap("confirm")}>
                      <Lock className="size-4 shrink-0 text-muted" aria-hidden />
                      <input id="auth-confirm" type={showPassword ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="Repeat password" className="w-full bg-transparent outline-none" aria-invalid={Boolean(errors.confirm)} />
                      {confirm && confirm === password ? <CheckCircle2 className="size-4 shrink-0 text-brand animate-[var(--animate-pop)]" aria-hidden /> : null}
                    </div>
                    {errors.confirm ? <p className="mt-1 text-xs font-medium text-danger">{errors.confirm}</p> : null}
                  </div>
                ) : null}

                {isSignup ? (
                  <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
                    <input id="auth-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                    <span>
                      I agree to use VeriDose as a record-keeping aid, not as medical advice.
                      {errors.agree ? <span className="block font-medium text-danger">{errors.agree}</span> : null}
                    </span>
                  </label>
                ) : null}

                <button type="submit" disabled={busy} className="btn btn-primary group min-h-12 w-full text-base">
                  {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : null}
                  {busy ? (isSignup ? "Creating account…" : "Signing in…") : isSignup ? "Create account" : "Log in"}
                  {!busy ? <ArrowRight className="size-4 transition group-hover:translate-x-1" aria-hidden /> : null}
                </button>
              </form>

              <div className="my-5 flex items-center gap-3 text-[0.7rem] font-semibold uppercase tracking-widest text-muted">
                <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
              </div>

              <button type="button" onClick={() => void guest()} disabled={busy} className="btn btn-secondary min-h-12 w-full">
                <Sparkles className="size-4 text-accent" aria-hidden />
                Continue as guest
              </button>

              <p className="mt-5 text-center text-sm text-muted">
                {isSignup ? "Already have an account? " : "New to VeriDose? "}
                <Link href={isSignup ? "/login" : "/signup"} className="font-bold text-brand-strong hover:underline">
                  {isSignup ? "Log in" : "Create one"}
                </Link>
              </p>
              <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-[0.7rem] leading-relaxed text-muted">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                Sign-in is handled by Firebase Authentication. Your records are private to your account.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

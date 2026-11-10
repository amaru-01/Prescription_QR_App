"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { useSession } from "@/hooks/use-session";
import { useToast } from "@/hooks/use-toasts";
import { authErrorMessage, deleteAccount } from "@/lib/auth-client";

const CONFIRM_WORD = "DELETE";

/** Permanent account deletion, behind a typed confirmation and (for registered users) the password. */
export function DeleteAccount() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useSession();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;

  const needsPassword = !user.isAnonymous;
  const ready = typed.trim() === CONFIRM_WORD && (!needsPassword || password.length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({ email: needsPassword ? user.email : null, password });
      toast({ title: "Account deleted", description: "Your account and data have been removed.", variant: "success" });
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(authErrorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <section className="card border-danger/25 p-5" aria-labelledby="delete-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <Trash2 className="size-[1.1rem]" aria-hidden />
        </span>
        <div>
          <h2 id="delete-title" className="text-sm font-bold text-ink">Delete account</h2>
          <p className="text-xs text-muted">
            Permanently remove your account, prescriptions, reminders and devices. This can&apos;t be undone, so
            download your CSV first.
          </p>
        </div>
      </div>

      {open ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready && !busy) void submit();
          }}
        >
          {needsPassword ? (
            <div>
              <label htmlFor="delete-password" className="mb-1.5 block text-xs font-semibold text-ink">
                Your password
              </label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field"
              />
            </div>
          ) : null}
          <div>
            <label htmlFor="delete-confirm" className="mb-1.5 block text-xs font-semibold text-ink">
              Type {CONFIRM_WORD} to confirm
            </label>
            <input
              id="delete-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              className="field"
            />
          </div>
          {error ? (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!ready || busy}
              className="btn min-h-11 border border-danger/40 bg-danger/10 px-3.5 text-sm font-semibold text-danger disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
              Delete everything
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setPassword("");
                setTyped("");
                setError(null);
              }}
              className="btn btn-ghost min-h-11 px-3 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn-secondary mt-4 min-h-11 w-full text-sm"
        >
          Delete my account…
        </button>
      )}
    </section>
  );
}

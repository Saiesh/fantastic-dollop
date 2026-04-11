"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { login, type LoginResult } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/** Why: join page writes the typed display name here so `/login` can sign in without asking again. */
const PENDING_DISPLAY_NAME_KEY = "fanbet_pending_display_name";

async function submitLogin(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult | null> {
  const displayName = String(formData.get("displayName") ?? "");
  const password = String(formData.get("password") ?? "");
  return login({ displayName, password });
}

interface LoginFormProps {
  /** Why: `?displayName=` from shareable links or redirects encodes who is signing in without a second name field. */
  displayNameFromUrl: string | null;
}

/**
 * Player sign-in: posts password (and hidden display name from join/URL) to the server action.
 * Why client: needs pending state, error display, sessionStorage hydration, and client navigation after the cookie is set.
 */
export function LoginForm({ displayNameFromUrl }: LoginFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitLogin, null);
  const redirected = useRef(false);

  const [resolvedDisplayName, setResolvedDisplayName] = useState<string | null>(
    () => displayNameFromUrl?.trim() || null,
  );
  // Why: avoid flashing the “no account” message before we read sessionStorage (when there is no URL param).
  const [storageChecked, setStorageChecked] = useState(
    () => Boolean(displayNameFromUrl?.trim()),
  );

  useEffect(() => {
    if (displayNameFromUrl?.trim()) return;
    try {
      const stored = sessionStorage.getItem(PENDING_DISPLAY_NAME_KEY)?.trim();
      if (stored) setResolvedDisplayName(stored);
    } catch {
      // Why: storage may be unavailable in private mode; login still works if `?displayName=` is used.
    } finally {
      setStorageChecked(true);
    }
  }, [displayNameFromUrl]);

  // Why: after a successful login the dashboard lives at `/` — mirror join flow navigation.
  useEffect(() => {
    if (state?.ok && !redirected.current) {
      redirected.current = true;
      try {
        sessionStorage.removeItem(PENDING_DISPLAY_NAME_KEY);
      } catch {
        /* ignore */
      }
      router.push("/");
    }
  }, [state, router]);

  if (!storageChecked) {
    return (
      <p className="text-center text-sm text-muted-foreground" aria-live="polite">
        Loading sign-in…
      </p>
    );
  }

  if (!resolvedDisplayName) {
    return (
      <div className="flex w-full flex-col gap-4 rounded-lg border border-border bg-card/50 px-4 py-5 text-center">
        <p className="text-sm text-muted-foreground">
          We need your display name from the Join flow before you can enter a
          password here — so we don&apos;t ask for your name twice.
        </p>
        <p className="text-sm text-muted-foreground">
          Go to{" "}
          <Link
            href="/join"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Join a group
          </Link>
          , enter your invite and display name, then open Log in from that page.
        </p>
        <p className="text-xs text-muted-foreground">
          Or use a link that includes your name, for example{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.7rem]">
            /login?displayName=YourName
          </code>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="displayName" value={resolvedDisplayName} />
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center text-sm">
        <span className="text-muted-foreground">Signing in as </span>
        <span className="font-medium text-foreground">{resolvedDisplayName}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
      {state != null && !state.ok ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
          "bg-accent text-accent-foreground hover:bg-accent/90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link
          href="/join"
          className="font-medium text-foreground underline underline-offset-4"
        >
          Join a group
        </Link>
      </p>
    </form>
  );
}

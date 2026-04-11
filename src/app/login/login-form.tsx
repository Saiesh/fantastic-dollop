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
  /** Why: `?displayName=` from shareable links encodes who is signing in without a second name field. */
  displayNameFromUrl: string | null;
}

const inputClass =
  "w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/25";

/**
 * Player sign-in: posts password to the server action.
 * Why client: pending state, error display, sessionStorage hydration, and navigation after cookie is set.
 */
export function LoginForm({ displayNameFromUrl }: LoginFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitLogin, null);
  const redirected = useRef(false);

  const [resolvedDisplayName, setResolvedDisplayName] = useState<string | null>(
    () => displayNameFromUrl?.trim() || null,
  );
  const [storageChecked, setStorageChecked] = useState(
    () => Boolean(displayNameFromUrl?.trim()),
  );

  useEffect(() => {
    if (displayNameFromUrl?.trim()) return;
    try {
      const stored = sessionStorage.getItem(PENDING_DISPLAY_NAME_KEY)?.trim();
      if (stored) setResolvedDisplayName(stored);
    } catch {
      /* storage may be unavailable in private mode */
    } finally {
      setStorageChecked(true);
    }
  }, [displayNameFromUrl]);

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
      <div className="flex w-full flex-col gap-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
        <p className="text-sm text-muted-foreground">
          We need your display name from the Join flow before you can sign in with your password — so we
          don&apos;t ask for your name on this screen.
        </p>
        <p className="text-sm text-muted-foreground">
          Go to{" "}
          <Link href="/join" className="font-semibold text-accent hover:underline">
            Join a group
          </Link>
          , enter your invite and display name, then open Log in from that page.
        </p>
        <p className="text-xs text-muted-foreground">
          Or use{" "}
          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">/login?displayName=YourName</code>
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      <input type="hidden" name="displayName" value={resolvedDisplayName} />
      <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-center text-sm">
        <span className="text-muted-foreground">Signing in as </span>
        <span className="font-semibold text-foreground">{resolvedDisplayName}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
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
          "rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-3 text-sm font-bold text-accent-foreground shadow-md shadow-amber-900/25 transition hover:brightness-110",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/join" className="font-semibold text-accent hover:underline">
          Join a group
        </Link>
      </p>
    </form>
  );
}

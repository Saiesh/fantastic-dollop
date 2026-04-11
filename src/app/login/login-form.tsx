"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { login } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/** Why: join page writes the typed display name here so `/login` can sign in without asking again. */
const PENDING_DISPLAY_NAME_KEY = "fanbet_pending_display_name";

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
  const redirected = useRef(false);

  const [resolvedDisplayName, setResolvedDisplayName] = useState<string | null>(
    () => displayNameFromUrl?.trim() || null,
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Why: sessionStorage pre-fill must not block first paint — on iOS, delayed effects can strand a loading state; `useEffect` (not `useLayoutEffect`) reads storage after paint.
  useEffect(() => {
    if (displayNameFromUrl?.trim()) {
      return;
    }
    try {
      const stored = sessionStorage.getItem(PENDING_DISPLAY_NAME_KEY)?.trim();
      if (stored) setResolvedDisplayName(stored);
    } catch {
      /* storage may be unavailable in private mode */
    }
  }, [displayNameFromUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (redirected.current) return;

    const form = event.currentTarget;
    const fd = new FormData(form);
    const displayName =
      resolvedDisplayName ?? String(fd.get("displayName") ?? "").trim();
    const password = String(fd.get("password") ?? "");

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await login({ displayName, password });
      if (result.ok) {
        redirected.current = true;
        try {
          sessionStorage.removeItem(PENDING_DISPLAY_NAME_KEY);
        } catch {
          /* ignore */
        }
        router.push("/");
      } else {
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
      {resolvedDisplayName ? (
        <>
          {/* Why: URL or join flow already fixed the name — keep a single password field for a shorter path. */}
          <input type="hidden" name="displayName" value={resolvedDisplayName} />
          <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-center text-sm">
            <span className="text-muted-foreground">Signing in as </span>
            <span className="font-semibold text-foreground">{resolvedDisplayName}</span>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* Why: direct visits to `/login` have no stored name — collect it here instead of blocking on join or query params. */}
          <label htmlFor="login-display-name" className="text-sm font-medium text-foreground">
            Display name
          </label>
          <input
            id="login-display-name"
            name="displayName"
            type="text"
            required
            autoComplete="username"
            className={inputClass}
          />
        </div>
      )}
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
      {error != null ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "rounded-xl bg-gradient-to-r from-accent to-amber-500 px-4 py-3 text-sm font-bold text-accent-foreground shadow-md shadow-amber-900/25 transition hover:brightness-110",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isSubmitting ? "Signing in…" : "Sign in"}
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

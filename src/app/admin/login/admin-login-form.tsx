"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { adminLogin } from "@/lib/actions/admin-auth";
import { cn } from "@/lib/utils";

/**
 * Password gate for admin routes; submits to `adminLogin` and navigates to `/admin` on success.
 * Why client: needs pending state, error display, and client navigation after the server sets the cookie.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const res = await adminLogin({
        password: String(formData.get("password") ?? ""),
      });

      if (!res.success) {
        setError(res.error);
        return;
      }
      router.push("/admin");
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="admin-password" className="text-sm font-medium">
          Admin password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
        />
        <p className="text-xs text-muted-foreground">
          Use the database user password from your <code className="font-mono">DATABASE_URL</code>
          .
        </p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground transition-colors",
          "hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isPending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

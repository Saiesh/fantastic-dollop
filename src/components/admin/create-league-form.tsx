"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createLeague } from "@/lib/actions/admin";

/**
 * Form for Super Admin to create a new league (tournament).
 * Calls the createLeague server action and redirects to the admin panel on success.
 */
export function CreateLeagueForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setError(null);
      const res = await createLeague({
        name: String(formData.get("name") ?? ""),
        seasonYear: Number(formData.get("seasonYear") ?? new Date().getFullYear()),
      });

      if (res.error) {
        setError(res.error);
      } else if (res.data) {
        router.push(`/admin/league/${res.data.leagueId}`);
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          League Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="e.g. IPL 2026"
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="seasonYear" className="text-sm font-medium">
          Season Year
        </label>
        <input
          id="seasonYear"
          name="seasonYear"
          type="number"
          required
          min={2020}
          max={2099}
          defaultValue={new Date().getFullYear()}
          className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm"
        />
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
          "hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        {isPending ? "Creating…" : "Create League"}
      </button>
    </form>
  );
}

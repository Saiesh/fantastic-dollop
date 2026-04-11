import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Sign in | IPL Fanbet",
  description: "Sign in with the password you chose when you joined a group.",
};

function parseDisplayNameFromSearch(
  raw: string | string[] | undefined,
): string | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value?.trim()) return null;
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

/**
 * Player login route — heading is server-rendered; form handles cookie + redirect to `/`.
 * Why: separates static copy from interactive sign-in so the shell stays a server component.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ displayName?: string | string[] }>;
}) {
  const sp = await searchParams;
  const displayNameFromUrl = parseDisplayNameFromSearch(sp.displayName);

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background-elevated via-background to-background"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-cricket-grid opacity-30" aria-hidden />
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent">IPL Fanbet</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="text-sm text-muted-foreground">
              Enter the password you set when you joined. Your display name comes from Join or your
              invite link — this screen only asks for your password.
            </p>
          </div>
          <div className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-sm">
            <LoginForm displayNameFromUrl={displayNameFromUrl} />
          </div>
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <Link href="/" className="font-medium hover:text-accent">
              Home
            </Link>
            <Link href="/rules" className="font-medium hover:text-accent">
              Rules
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

import { LoginForm } from "@/app/login/login-form";

export const metadata: Metadata = {
  title: "Sign in | IPL FanBet",
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
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            IPL FanBet
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground">
            Enter the password you set when you joined. Your display name is
            carried over from the Join page or your invite link.
          </p>
        </div>
        <LoginForm displayNameFromUrl={displayNameFromUrl} />
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Home
          </Link>
          <Link
            href="/rules"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Rules
          </Link>
        </div>
      </div>
    </div>
  );
}

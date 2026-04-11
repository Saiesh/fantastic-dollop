import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session";
import { JoinForm } from "@/app/join/join-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join a group | IPL FanBet",
  description:
    "Enter your invite code, pick your home team, and set a password to join a friend group.",
};

export default async function JoinPage() {
  const user = await getSessionUser();

  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            IPL FanBet
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Join with an invite code
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter an invite code, choose your home IPL team, and set a display
            name and password. Your browser keeps a signed session for 30 days.
          </p>
        </div>
        {user ? (
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-center text-sm">
            Signed in as{" "}
            <span className="font-medium">{user.displayName}</span>. You can
            join another group with a new code (one group per league).
          </div>
        ) : null}
        <JoinForm isSignedIn={Boolean(user)} />
        {!user ? (
          <p className="text-center text-sm text-muted-foreground">
            Already playing?{" "}
            <Link
              href="/login"
              className="font-medium text-foreground underline underline-offset-4 hover:text-accent"
            >
              Log in
            </Link>
          </p>
        ) : null}
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <Link href="/" className="underline underline-offset-4 hover:text-foreground">
            Home
          </Link>
          <Link href="/rules" className="underline underline-offset-4 hover:text-foreground">
            Rules
          </Link>
        </div>
      </div>
    </div>
  );
}

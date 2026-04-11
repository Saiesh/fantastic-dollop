import Link from "next/link";
import { getSessionUser } from "@/lib/auth/get-session";
import { JoinForm } from "@/app/join/join-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join a group | IPL Fanbet",
  description:
    "Enter your invite code, pick your home team, and set a password to join a friend group.",
};

export default async function JoinPage() {
  const user = await getSessionUser();

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
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Join with an invite code
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter an invite code, choose your home IPL team, and set a display name and password. Your
              browser keeps a signed session for 30 days.
            </p>
          </div>
          {user ? (
            <div className="rounded-xl border border-border/80 bg-card/80 px-4 py-3 text-center text-sm text-muted-foreground ring-1 ring-white/5">
              Signed in as <span className="font-semibold text-foreground">{user.displayName}</span>. You
              can join another group with a new code (one group per league).
            </div>
          ) : null}
          <div className="rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xl shadow-black/40 ring-1 ring-white/5 backdrop-blur-sm">
            <JoinForm isSignedIn={Boolean(user)} />
          </div>
          {!user ? (
            <p className="text-center text-sm text-muted-foreground">
              Already playing?{" "}
              <Link href="/login" className="font-semibold text-accent hover:underline">
                Log in
              </Link>
            </p>
          ) : null}
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

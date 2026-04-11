import Link from "next/link";
import { Card } from "@/components/ui/card";
import { BackLink } from "@/components/ui/back-link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rules | IPL Fanbet",
  description: "All scoring rules, Palat, Double Down, streaks, and draw handling.",
};

export default function RulesPage() {
  return (
    <div className="relative min-h-full">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background-elevated via-background to-background"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-cricket-grid opacity-25" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-4 py-12">
        <BackLink href="/" label="Home" />
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground">IPL Fanbet Rules</h1>
        <p className="mt-2 text-muted-foreground">Everything you need to know about betting, points, and prizes.</p>

        <div className="mt-10 space-y-6">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
              <span className="text-accent" aria-hidden>
                ●
              </span>
              Standard betting
            </h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-accent">+2</span>
                <span>Correct prediction — pick the winning team before the match.</span>
              </li>
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-foreground">0</span>
                <span>Incorrect prediction or missed bet — no points, streak resets.</span>
              </li>
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-accent">+1</span>
                <span>Draw — every player who placed a bet gets +1 regardless of team picked.</span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Deadline: 1 hour before the scheduled match start time. After the deadline, bets are locked.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
              <span className="text-warning" aria-hidden>
                ●
              </span>
              Double Down
            </h2>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-accent">+4</span>
                <span>Correct Double Down — double the standard reward.</span>
              </li>
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-foreground">0</span>
                <span>Incorrect Double Down — no penalty, just 0 points.</span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Activate at bet placement time. No limit on usage. Trade-off: Palat is disabled for any match
              with Double Down.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
              <span className="text-accent-secondary" aria-hidden>
                ●
              </span>
              Palat (mid-match switch)
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              &ldquo;Palat&rdquo; means &ldquo;turn around&rdquo; in Hindi. Switch your prediction after seeing
              first-innings performance.
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-accent">+1</span>
                <span>Correct after Palat — reduced from standard +2.</span>
              </li>
            </ul>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-center ring-1 ring-white/5">
                <p className="text-3xl font-bold text-accent">7</p>
                <p className="text-xs font-medium text-muted-foreground">League stage uses</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-4 text-center ring-1 ring-white/5">
                <p className="text-3xl font-bold text-accent">1</p>
                <p className="text-xs font-medium text-muted-foreground">Playoff use (all rounds)</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Window: opens when the bet deadline passes and closes when the first innings ends. Not available
              if Double Down is active.
            </p>
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-bold text-foreground">Streak bonuses</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Consecutive correct predictions earn bonus points, awarded when the streak breaks or the season
              ends. Only the highest tier per streak window applies.
            </p>
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-center sm:gap-4">
              <div className="flex flex-1 flex-col items-center rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-400">Birdie</p>
                <p className="mt-1 text-3xl font-bold text-accent">+2</p>
                <p className="text-xs text-muted-foreground">3 in a row</p>
              </div>
              <div className="flex flex-1 flex-col items-center rounded-xl border border-slate-400/30 bg-muted/50 p-4 text-center sm:mb-4">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Eagle</p>
                <p className="mt-1 text-3xl font-bold text-foreground">+5</p>
                <p className="text-xs text-muted-foreground">4 in a row</p>
              </div>
              <div className="flex flex-1 flex-col items-center rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 text-center sm:mb-8">
                <p className="text-xs font-bold uppercase tracking-wide text-orange-400">Albatross</p>
                <p className="mt-1 text-3xl font-bold text-warning">+7</p>
                <p className="text-xs text-muted-foreground">5+ in a row</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Draws and abandoned matches don&apos;t affect streaks. Missed bets reset the streak to 0. Bonuses
              repeat in 5-win windows (e.g., Birdie again at 8, Eagle at 9, Albatross at 10).
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold text-foreground">Home team bonus</h2>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex flex-wrap items-baseline gap-3">
                <span className="min-w-12 text-2xl font-bold tabular-nums text-success">+1</span>
                <span>Every match your home team wins — awarded automatically.</span>
              </li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">
              Pick your home team during onboarding. It&apos;s locked once the first match begins. Multiple
              players in the same group can pick the same team.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold text-foreground">Prize pool</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Each group has its own prize pool based on buy-in amounts. Default distribution:
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                <p className="text-xs font-bold text-amber-400">1st</p>
                <p className="text-2xl font-bold text-accent">50%</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-center">
                <p className="text-xs font-bold text-muted-foreground">2nd</p>
                <p className="text-2xl font-bold text-foreground">30%</p>
              </div>
              <div className="rounded-xl border border-orange-500/40 bg-orange-500/10 p-3 text-center">
                <p className="text-xs font-bold text-orange-400">3rd</p>
                <p className="text-2xl font-bold text-warning">20%</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Organisers can also choose Winner Takes All, Top 2 (60/40), or a custom split. Payments happen
              offline. The organiser marks the group as settled when done.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold text-foreground">Abandoned / no-result</h2>
            <p className="text-sm text-muted-foreground">
              All bets are voided. No points awarded or deducted. Streaks are unaffected. If a Palat was used,
              it is refunded.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-lg font-bold text-foreground">Leaderboard tiebreakers</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Higher total points</li>
              <li>More correct predictions</li>
              <li>More Double Down wins</li>
              <li>Alphabetical by name</li>
            </ol>
          </Card>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          <Link href="/" className="font-medium text-accent hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

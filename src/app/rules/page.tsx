import Link from "next/link";
import { Card } from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rules | IPL FanBet",
  description: "All scoring rules, Palat, Double Down, streaks, and draw handling.",
};

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Home
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          IPL FanBet Rules
        </h1>
        <p className="mt-2 text-muted-foreground">
          Everything you need to know about betting, points, and prizes.
        </p>
      </div>

      <div className="space-y-6">
        {/* Standard Betting */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Standard Betting</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">+2</span>
              <span>Correct prediction — pick the winning team before the match.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">&nbsp;0</span>
              <span>Incorrect prediction or missed bet — no points, streak resets.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">+1</span>
              <span>Draw — every player who placed a bet gets +1 regardless of team picked.</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Deadline: 1 hour before the scheduled match start time. After the deadline,
            bets are locked.
          </p>
        </Card>

        {/* Double Down */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Double Down</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">+4</span>
              <span>Correct Double Down — double the standard reward.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">&nbsp;0</span>
              <span>Incorrect Double Down — no penalty, just 0 points.</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Activate at bet placement time. No limit on usage. Trade-off:
            Palat is disabled for any match with Double Down.
          </p>
        </Card>

        {/* Palat */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Palat (Mid-Match Switch)</h2>
          <p className="text-sm text-muted-foreground mb-3">
            &ldquo;Palat&rdquo; means &ldquo;turn around&rdquo; in Hindi. Switch your prediction
            after seeing first-innings performance.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">+1</span>
              <span>Correct after Palat — reduced from standard +2.</span>
            </li>
          </ul>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted p-3 text-center">
              <p className="text-2xl font-bold">7</p>
              <p className="text-xs text-muted-foreground">League stage uses</p>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <p className="text-2xl font-bold">1</p>
              <p className="text-xs text-muted-foreground">Playoff use (all rounds)</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Window: opens when the bet deadline passes and closes when the first innings ends.
            Not available if Double Down is active.
          </p>
        </Card>

        {/* Streak Bonuses */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Streak Bonuses</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Consecutive correct predictions earn bonus points, awarded when the streak breaks
            or the season ends. Only the highest tier per streak window applies.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-muted p-3 text-center">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Birdie</p>
              <p className="text-2xl font-bold">+2</p>
              <p className="text-xs text-muted-foreground">3 in a row</p>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Eagle</p>
              <p className="text-2xl font-bold">+5</p>
              <p className="text-xs text-muted-foreground">4 in a row</p>
            </div>
            <div className="rounded-lg bg-muted p-3 text-center">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Albatross</p>
              <p className="text-2xl font-bold">+7</p>
              <p className="text-xs text-muted-foreground">5+ in a row</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Draws and abandoned matches don&apos;t affect streaks. Missed bets reset the streak to 0.
            Bonuses repeat in 5-win windows (e.g., Birdie again at 8, Eagle at 9, Albatross at 10).
          </p>
        </Card>

        {/* Home Team */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Home Team Bonus</h2>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-3">
              <span className="shrink-0 font-mono text-foreground">+1</span>
              <span>Every match your home team wins — awarded automatically.</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Pick your home team during onboarding. It&apos;s locked once the first match begins.
            Multiple players in the same group can pick the same team.
          </p>
        </Card>

        {/* Prize Pool */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Prize Pool</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Each group has its own prize pool based on buy-in amounts. Default distribution:
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-amber-50 p-3 text-center dark:bg-amber-950/20">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">1st Place</p>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">50%</p>
            </div>
            <div className="rounded-lg bg-zinc-100 p-3 text-center dark:bg-zinc-800">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">2nd Place</p>
              <p className="text-2xl font-bold text-zinc-600 dark:text-zinc-400">30%</p>
            </div>
            <div className="rounded-lg bg-orange-50 p-3 text-center dark:bg-orange-950/20">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400">3rd Place</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">20%</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Organisers can also choose Winner Takes All, Top 2 (60/40), or a custom split.
            Payments happen offline. The organiser marks the group as settled when done.
          </p>
        </Card>

        {/* Abandoned Matches */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Abandoned / No-Result Matches</h2>
          <p className="text-sm text-muted-foreground">
            All bets are voided. No points awarded or deducted. Streaks are unaffected.
            If a Palat was used, it is refunded.
          </p>
        </Card>

        {/* Tiebreakers */}
        <Card>
          <h2 className="text-lg font-semibold mb-3">Leaderboard Tiebreakers</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
            <li>Higher total points</li>
            <li>More correct predictions</li>
            <li>More Double Down wins</li>
            <li>Alphabetical by name</li>
          </ol>
        </Card>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          Back to home
        </Link>
      </p>
    </div>
  );
}

import { Suspense } from "react";
import { getMatchTrivia } from "@/lib/gemini";
import { Card } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// MatchTrivia — "Some Trivia" section for upcoming matches.
//
// Rendered as an async server component so the rest of the page loads
// instantly and trivia streams in via the Suspense boundary. The Gemini
// call is made server-side (no API key exposed to the client).
//
// Only shown when betting is open (>1 h before match start). The caller
// in page.tsx gates rendering on `isBettingOpen`.
// ---------------------------------------------------------------------------

interface MatchTriviaProps {
  matchId: string;
  team1Name: string;
  team2Name: string;
  startTimeUtc: string;
}

// ---------------------------------------------------------------------------
// Skeleton — shown while Gemini response is in flight
// ---------------------------------------------------------------------------

export function MatchTriviaSkeleton() {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-base">💡</span>
        <h3 className="text-sm font-bold text-foreground">Some Trivia</h3>
      </div>
      <ul className="space-y-2.5">
        {[80, 64, 72, 56, 68].map((w) => (
          <li key={w} className="flex items-start gap-2">
            <span className="skeleton-shimmer mt-1 h-2 w-2 shrink-0 rounded-full" />
            <span className={`skeleton-shimmer h-4 w-${w} rounded`} />
          </li>
        ))}
      </ul>
      <p className="text-right text-xs text-muted-foreground">
        via Gemini · Google Search
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inner async component — performs the actual Gemini fetch
// ---------------------------------------------------------------------------

async function TriviaContent({
  matchId,
  team1Name,
  team2Name,
  startTimeUtc,
}: MatchTriviaProps) {
  const bullets = await getMatchTrivia(
    matchId,
    team1Name,
    team2Name,
    startTimeUtc,
  );

  // If Gemini key is missing or returns nothing, skip the section entirely.
  if (bullets.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base" aria-hidden>
          💡
        </span>
        <h3 className="text-sm font-bold text-foreground">Some Trivia</h3>
        <span className="ml-auto rounded-full bg-accent-secondary/15 px-2 py-0.5 text-xs font-semibold text-accent-secondary ring-1 ring-accent-secondary/25">
          AI Powered
        </span>
      </div>

      <ul className="space-y-3">
        {bullets.map((bullet, idx) => (
          <li key={idx} className="flex items-start gap-2.5 text-sm">
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
              aria-hidden
            />
            <span className="leading-relaxed text-foreground">{bullet}</span>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-right text-xs text-muted-foreground">
        Summarised by Gemini · Google Search · may contain errors
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Public export — wraps with Suspense so the rest of the page renders first
// ---------------------------------------------------------------------------

export function MatchTrivia(props: MatchTriviaProps) {
  return (
    <Suspense fallback={<MatchTriviaSkeleton />}>
      <TriviaContent {...props} />
    </Suspense>
  );
}

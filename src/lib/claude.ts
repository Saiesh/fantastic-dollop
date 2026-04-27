import "server-only";

// ---------------------------------------------------------------------------
// Claude API helper — "Some Trivia" section on match bet window.
//
// Why: We call Claude to distil IPL match context into 5-8 punchy bullet
// points covering injuries, news, predictions, and head-to-head stats.
// Results are cached per match for 2 hours to avoid burning API quota on
// every page load.
//
// Required env var: ANTHROPIC_API_KEY
// ---------------------------------------------------------------------------

const CLAUDE_MODEL = "claude-sonnet-4-20250514";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

interface CachedTrivia {
  bullets: string[];
  cachedAt: number;
}

const triviaCache = new Map<string, CachedTrivia>();
const TRIVIA_TTL_MS = 2 * 60 * 60 * 1_000; // 2 hours

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPrompt(
  team1Name: string,
  team2Name: string,
  matchDateIST: string,
): string {
  return `You are a cricket journalist writing a pre-match trivia section for IPL fans.

The upcoming IPL 2026 match is: **${team1Name} vs ${team2Name}** on ${matchDateIST}.

Based on your knowledge, gather and summarise:
1. Player injury or availability news for either squad
2. Team management decisions (squad changes, captaincy, coaching news)
3. Recent head-to-head record and current form of both teams
4. Predictions or tips from famous cricket analysts, celebrities, or former players
5. Any interesting gossip, controversies, or storylines surrounding either team
6. Venue pitch/weather conditions if available

Return ONLY a valid JSON array of strings. Each string is one bullet point (1–2 sentences, factual, engaging). Between 5 and 8 bullets. No markdown. No extra keys. Example format:
["Bullet one.", "Bullet two.", "Bullet three."]`;
}

// ---------------------------------------------------------------------------
// JSON extraction — model sometimes wraps the array in markdown fences.
// ---------------------------------------------------------------------------

function extractJsonArray(text: string): string[] | null {
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start === -1 || end === -1) return null;

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    if (
      Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
    ) {
      return parsed.slice(0, 8); // cap at 8
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch 5-8 trivia bullet points for a match from Claude.
 * Returns an empty array if the API key is missing or the call fails.
 * Results are memoised per matchId for 2 hours.
 */
export async function getMatchTrivia(
  matchId: string,
  team1Name: string,
  team2Name: string,
  startTimeUtc: string,
): Promise<string[]> {
  // Why: return cached bullets if still within TTL to avoid redundant API calls.
  const cached = triviaCache.get(matchId);
  if (cached && Date.now() - cached.cachedAt < TRIVIA_TTL_MS) {
    return cached.bullets;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Why: silently return empty so the UI section can be hidden gracefully.
    return [];
  }

  const matchDateIST = new Date(startTimeUtc).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const prompt = buildPrompt(team1Name, team2Name, matchDateIST);

  // Why: Claude uses header-based auth (x-api-key) instead of query-param keys.
  const body = {
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  };

  try {
    const res = await fetch(CLAUDE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      // Why: trivia fetches are one-off per page load; no Next.js caching
      // since we manage our own TTL via triviaCache.
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Why: Claude response shape is { content: [{ type: "text", text: "..." }] }
    const content = Array.isArray(data.content) ? data.content : [];
    const firstBlock =
      content[0] !== null && typeof content[0] === "object"
        ? (content[0] as Record<string, unknown>)
        : {};
    const text = typeof firstBlock.text === "string" ? firstBlock.text : "";

    const bullets = extractJsonArray(text) ?? [];

    triviaCache.set(matchId, { bullets, cachedAt: Date.now() });
    return bullets;
  } catch {
    // Why: network/parse error — degrade gracefully so the UI still renders.
    return [];
  }
}

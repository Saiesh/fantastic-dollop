import "server-only";

// ---------------------------------------------------------------------------
// Gemini API helper — "Some Trivia" section on match bet window.
//
// Why: We call Gemini with Google Search grounding so it can pull live
// web results (injuries, news, predictions) and distil them into 5-8 punchy
// bullet points. Results are cached per match for 2 hours to avoid burning
// API quota on every page load.
//
// Required env var: GEMINI_API_KEY
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

// In-process cache: matchId → { bullets, cachedAt }
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

Using current web search results, gather and summarise:
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
  // Strip markdown fences if present
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find the first '[' and last ']'
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
 * Fetch 5-8 trivia bullet points for a match from Gemini + Google Search.
 * Returns an empty array if the API key is missing or the call fails.
 * Results are memoised per matchId for 2 hours.
 */
export async function getMatchTrivia(
  matchId: string,
  team1Name: string,
  team2Name: string,
  startTimeUtc: string,
): Promise<string[]> {
  // Return cached bullets if still within TTL
  const cached = triviaCache.get(matchId);
  if (cached && Date.now() - cached.cachedAt < TRIVIA_TTL_MS) {
    return cached.bullets;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Silently return empty so the UI section can be hidden gracefully.
    return [];
  }

  // Format the match date in IST for the prompt
  const matchDateIST = new Date(startTimeUtc).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const prompt = buildPrompt(team1Name, team2Name, matchDateIST);

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    // Why: Google Search grounding lets Gemini retrieve current web results
    // for injury news, predictions, and squad updates that post-date training.
    tools: [{ googleSearch: {} }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // Why: trivia fetches are one-off per page load; no Next.js caching
      // since we manage our own TTL via triviaCache.
      cache: "no-store",
    });

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as Record<string, unknown>;

    // Navigate the Gemini response: candidates[0].content.parts[0].text
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    const firstCandidate =
      candidates[0] !== null && typeof candidates[0] === "object"
        ? (candidates[0] as Record<string, unknown>)
        : {};
    const content =
      firstCandidate.content !== null &&
      typeof firstCandidate.content === "object"
        ? (firstCandidate.content as Record<string, unknown>)
        : {};
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const firstPart =
      parts[0] !== null && typeof parts[0] === "object"
        ? (parts[0] as Record<string, unknown>)
        : {};
    const text = typeof firstPart.text === "string" ? firstPart.text : "";

    const bullets = extractJsonArray(text) ?? [];

    triviaCache.set(matchId, { bullets, cachedAt: Date.now() });
    return bullets;
  } catch {
    // Network/parse error — degrade gracefully
    return [];
  }
}

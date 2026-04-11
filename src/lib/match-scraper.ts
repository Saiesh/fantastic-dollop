import "server-only";

import { z } from "zod/v4";

import { findCurrentIPLMatch, toScrapedMatchData } from "@/lib/cricketdata";
import { prisma } from "@/lib/prisma";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";
const CLEAN_HTML_MAX_CHARS = 15_000;
const SCRAPE_CACHE_TTL_MS = 90_000;

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};

interface CachedScrape {
  data: ScrapedMatchData;
  cachedAt: number;
}

const scrapeCache = new Map<string, CachedScrape>();

const ScrapedMatchDataSchema = z.object({
  matchPhase: z.enum([
    "not_started",
    "first_innings",
    "second_innings",
    "completed",
    "abandoned",
  ]),
  innings: z
    .array(
      z.object({
        battingTeamShortName: z.string().min(1),
        runs: z.number().int().nonnegative(),
        wickets: z.number().int().nonnegative(),
        overs: z.string().min(1),
        isComplete: z.boolean(),
      }),
    )
    .max(4),
  resultText: z.string().nullable(),
  winningTeamShortName: z.string().nullable(),
  toss: z.string().nullable(),
});

export interface ScrapedMatchData {
  matchPhase:
    | "not_started"
    | "first_innings"
    | "second_innings"
    | "completed"
    | "abandoned";
  innings: Array<{
    battingTeamShortName: string;
    runs: number;
    wickets: number;
    overs: string;
    isComplete: boolean;
  }>;
  resultText: string | null;
  winningTeamShortName: string | null;
  toss: string | null;
}

export interface MatchScrapeTarget {
  id: string;
  matchNumber: number;
  team1ShortName: string;
  team2ShortName: string;
  espncricinfoUrl: string | null;
}

interface ScrapeResult {
  url: string | null;
  data: ScrapedMatchData | null;
}

function extractFirstEspnUrl(text: string): string | null {
  const matches = text.match(/https?:\/\/[^\s)"']+/gi) ?? [];
  for (const rawMatch of matches) {
    const cleaned = rawMatch.replace(/[.,;!?]+$/, "");
    const normalized = normalizeEspnUrl(cleaned);
    if (normalized) return normalized;
  }
  return null;
}

function normalizeEspnUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "espncricinfo.com") return null;
    // Why: canonicalizing discovered URLs avoids duplicate cache entries.
    parsed.protocol = "https:";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function buildDiscoveryPrompt(target: MatchScrapeTarget): string {
  return `Find the single best ESPNcricinfo live score URL for IPL 2026 Match ${target.matchNumber}: ${target.team1ShortName} vs ${target.team2ShortName}.

Return ONLY the URL as plain text.
Do not return any explanation.`;
}

function buildExtractionPrompt(
  target: MatchScrapeTarget,
  cleanedHtml: string,
): string {
  return `You are extracting structured live-match state from ESPNcricinfo HTML for IPL 2026 Match ${target.matchNumber}: ${target.team1ShortName} vs ${target.team2ShortName}.

Rules:
1) Return ONLY valid JSON with this exact shape:
{
  "matchPhase": "not_started" | "first_innings" | "second_innings" | "completed" | "abandoned",
  "innings": [
    {
      "battingTeamShortName": string,
      "runs": number,
      "wickets": number,
      "overs": string,
      "isComplete": boolean
    }
  ],
  "resultText": string | null,
  "winningTeamShortName": string | null,
  "toss": string | null
}
2) Use short names if present in the page.
3) If data is uncertain, prefer null/empty fields over guessing.
4) "completed" means result decided; "abandoned" means no result due to washout/no play.

HTML:
${cleanedHtml}`;
}

function extractGeminiText(data: Record<string, unknown>): string {
  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  const firstCandidate =
    candidates[0] !== null && typeof candidates[0] === "object"
      ? (candidates[0] as Record<string, unknown>)
      : {};
  const content =
    firstCandidate.content !== null && typeof firstCandidate.content === "object"
      ? (firstCandidate.content as Record<string, unknown>)
      : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const firstPart =
    parts[0] !== null && typeof parts[0] === "object"
      ? (parts[0] as Record<string, unknown>)
      : {};
  return typeof firstPart.text === "string" ? firstPart.text : "";
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    return null;
  }

  try {
    const parsed = JSON.parse(stripped.slice(firstBrace, lastBrace + 1));
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function cleanMatchHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CLEAN_HTML_MAX_CHARS);
}

async function callGemini(
  prompt: string,
  options?: { useGoogleSearch?: boolean; temperature?: number },
): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      // Why: deterministic extraction keeps status transitions stable.
      temperature: options?.temperature ?? 0,
      maxOutputTokens: 2048,
    },
  };

  if (options?.useGoogleSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as Record<string, unknown>;
    return extractGeminiText(data).trim() || null;
  } catch {
    return null;
  }
}

async function discoverAndPersistUrl(
  target: MatchScrapeTarget,
): Promise<string | null> {
  if (target.espncricinfoUrl) {
    return normalizeEspnUrl(target.espncricinfoUrl);
  }

  const responseText = await callGemini(buildDiscoveryPrompt(target), {
    useGoogleSearch: true,
    temperature: 0,
  });
  if (!responseText) return null;

  const discovered = extractFirstEspnUrl(responseText);
  if (!discovered) return null;

  try {
    // Why: persist the discovered URL once to skip repeated search calls.
    await prisma.match.update({
      where: { id: target.id },
      data: { espncricinfoUrl: discovered },
    });
  } catch {
    // Non-fatal; polling can still proceed with the discovered URL.
  }

  return discovered;
}

async function fetchCleanedHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const cleaned = cleanMatchHtml(html);
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

export async function scrapeMatchData(
  target: MatchScrapeTarget,
): Promise<ScrapeResult> {
  // ---------------------------------------------------------------------------
  // Branch A — no ESPNCricinfo URL stored: use cricketdata.org API.
  //
  // Why: when no URL has been manually set (or previously discovered and saved),
  // the cricketdata.org API is far cheaper and faster than Gemini URL discovery
  // + HTML extraction. We skip Gemini entirely as long as the API has the match.
  //
  // Last resort: if the match isn't in the API feed yet (e.g. it's days away,
  // or quota is exhausted), we still attempt Gemini URL discovery so the cron
  // doesn't silently do nothing for upcoming matches.
  // ---------------------------------------------------------------------------
  if (!target.espncricinfoUrl) {
    const apiState = await findCurrentIPLMatch(
      target.team1ShortName,
      target.team2ShortName,
    );

    if (apiState) {
      return { url: null, data: toScrapedMatchData(apiState) };
    }

    // Why fall through: cricketdata currentMatches only surfaces matches within
    // a recent window. Gemini URL discovery keeps the cron alive for far-future
    // fixtures or during temporary API quota exhaustion.
    const discovered = await discoverAndPersistUrl(target);
    if (!discovered) return { url: null, data: null };
    return scrapeFromUrl(target, discovered);
  }

  // ---------------------------------------------------------------------------
  // Branch B — ESPNCricinfo URL is already stored: use the HTML scraper.
  //
  // Why prefer the stored URL: an admin (or a previous Gemini run) has already
  // identified the exact match page. The HTML scraper against a known URL is
  // more precise than the API for edge cases like super-overs or DLS targets.
  // ---------------------------------------------------------------------------
  const url = normalizeEspnUrl(target.espncricinfoUrl);
  if (!url) return { url: null, data: null };
  return scrapeFromUrl(target, url);
}

/**
 * Fetch, clean, and Gemini-extract match data from a known ESPNCricinfo URL.
 * Extracted into a helper so both branches of scrapeMatchData can reuse it.
 */
async function scrapeFromUrl(
  target: MatchScrapeTarget,
  url: string,
): Promise<ScrapeResult> {
  const cached = scrapeCache.get(url);
  if (cached && Date.now() - cached.cachedAt < SCRAPE_CACHE_TTL_MS) {
    return { url, data: cached.data };
  }

  const cleanedHtml = await fetchCleanedHtml(url);
  if (!cleanedHtml) return { url, data: null };

  const responseText = await callGemini(buildExtractionPrompt(target, cleanedHtml), {
    temperature: 0,
  });
  if (!responseText) return { url, data: null };

  const parsedJson = extractJsonObject(responseText);
  if (!parsedJson) return { url, data: null };

  const parsed = ScrapedMatchDataSchema.safeParse(parsedJson);
  if (!parsed.success) return { url, data: null };

  const data = parsed.data;
  scrapeCache.set(url, { data, cachedAt: Date.now() });
  return { url, data };
}

# Gemini-Powered Live Match Sync Service

## Overview

This document describes the new live match synchronization service powered by Google Gemini LLM. The system replaces the ESPNCricinfo scraper with an LLM-based approach that provides structured, enriched match data including real-time scores, news, and player statistics.

## Architecture

### Components

#### 1. **gemini-match-sync.ts**
Core Gemini integration layer that:
- Builds structured prompts asking for match updates
- Calls Google Generative AI API
- Parses JSON responses
- Caches results (90-second TTL for freshness)

**Key Exports:**
- `getGeminiMatchUpdate()` - Fetch structured match data
- `streamGeminiMatchUpdates()` - Stream real-time updates
- `clearMatchCache()` - Manual cache invalidation

**Response Structure:**
```typescript
{
  matchPhase: "first_innings" | "second_innings" | "completed" | "abandoned",
  isLive: boolean,
  statusText: string,
  toss: string | null,
  innings: [
    {
      inningsNumber: number,
      battingTeamShortName: string,
      runs: number,
      wickets: number,
      overs: "15.3",
      isComplete: boolean,
      currentBatter?: string,
      currentBowler?: string,
      recentWickets?: Array<{ batter, bowler, runs }>
    }
  ],
  winningTeamShortName: string | null,
  resultText: string | null,
  isFirstInningsComplete: boolean,
  matchNews: [
    {
      title: string,
      source: string,
      summary: string,
      timestamp: ISO8601,
      url?: string,
      keyPoints?: string[]
    }
  ],
  playerStats?: {
    topBatter?: { name, runs, balls, strikeRate },
    topBowler?: { name, wickets, runs, overs }
  },
  keyMoments?: string[]
}
```

#### 2. **match-scraper-gemini.ts**
Adapter layer that:
- Maintains backward compatibility with `match-poller.ts`
- Converts Gemini responses to `ScrapedMatchData` format
- Formats match date/time for Gemini prompts
- Exports both primary and legacy function names

**Migration Path:** 
- Old: `scrapeMatchData()` → New: `scrapeMatchDataGemini()`
- Both names are supported for gradual rollout

#### 3. **match-poller-gemini.ts**
Polling orchestrator that:
- Queries pollable matches (live or upcoming)
- Calls `scrapeMatchDataGemini()` for each match
- Handles status transitions
- Triggers scoring and cache revalidation
- Saves match news and player stats

**Entry Point:** `pollAndUpdateMatchesGemini()` (replaces `pollAndUpdateMatches()`)

#### 4. **match-updater.ts**
Database update service that:
- Saves match news to `MatchNews` model
- Updates team standings in `TeamPointsTable`
- Stores player stats in `MatchPlayerStat` model
- Non-blocking — failures don't halt the polling cycle

**Functions:**
- `saveMatchNews(matchId, newsItems)` - Store news updates
- `updateTeamStandings(...)` - Update IPL standings
- `savePlayerStats(matchId, stats)` - Track top performers
- `updateMatchFromGemini(payload)` - Orchestrator

### Database Changes

#### New Models

**MatchNews**
```prisma
model MatchNews {
  id        String   @id @default(cuid())
  matchId   String
  title     String
  source    String       // "ESPNCricinfo", "Cricbuzz", etc.
  summary   String
  keyPoints String[]
  createdAt DateTime
  
  @@unique([matchId, source, title])
  @@index([matchId, createdAt])
}
```

**MatchPlayerStat**
```prisma
model MatchPlayerStat {
  id String @id @default(cuid())
  matchId String @unique
  
  topBatterName String?
  topBatterRuns Int?
  topBatterBalls Int?
  topBatterStrikeRate Float?
  
  topBowlerName String?
  topBowlerWickets Int?
  topBowlerRuns Int?
  topBowlerOvers String?
  
  createdAt DateTime
  updatedAt DateTime
}
```

#### Modified Models

**Match** — Add relations:
```prisma
matchNews      MatchNews[]
playerStats    MatchPlayerStat?
```

## Configuration

### Environment Variables

```env
GOOGLE_GENERATIVE_AI_API_KEY=your-gemini-api-key
```

### Installation

1. Install Google Generative AI SDK:
   ```bash
   npm install @google/generative-ai
   ```

2. Add Gemini models to Prisma schema:
   ```bash
   npx prisma migrate dev --name add_gemini_match_data
   ```

3. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

## Prompt Engineering

The Gemini prompt is designed to request structured JSON with these information sources:

1. **Live Score Updates** — Current runs, wickets, overs
2. **Match Phase** — Which innings, completed status
3. **Toss Information** — Team and decision
4. **News & Analysis** — Recent updates from:
   - ESPNCricinfo / Cricbuzz
   - Sports blogs and news sites
   - Twitter/X cricket updates
   - Official IPL sources
5. **Player Statistics** — Top batter/bowler performance
6. **Key Moments** — Important match events

The LLM synthesizes live data from multiple sources, providing richer context than a single API endpoint.

## Migration Guide

### Step 1: Backup Existing Data
```sql
-- Backup current state
SELECT * FROM matches WHERE status IN ('live_first_innings', 'live_second_innings');
```

### Step 2: Update Cron Route

In `src/app/api/cron/poll-matches/route.ts`:

**Before:**
```typescript
import { pollAndUpdateMatches } from "@/lib/match-poller";

export async function GET() {
  const result = await pollAndUpdateMatches();
  return Response.json(result);
}
```

**After:**
```typescript
import { pollAndUpdateMatchesGemini } from "@/lib/match-poller-gemini";

export async function GET() {
  const result = await pollAndUpdateMatchesGemini();
  return Response.json(result);
}
```

### Step 3: Test with a Live Match

```bash
curl -X GET http://localhost:3000/api/cron/poll-matches
```

Expected response:
```json
{
  "polled": 5,
  "updated": 2,
  "skipped": 3,
  "failed": 0,
  "details": [
    {
      "matchId": "abc123",
      "previousStatus": "upcoming",
      "nextStatus": "live_first_innings",
      "action": "status_advanced",
      "reason": "Advanced to first innings."
    }
  ]
}
```

### Step 4: Verify News and Stats

```typescript
// Check stored news
const news = await prisma.matchNews.findMany({
  where: { matchId: "abc123" },
  orderBy: { createdAt: "desc" },
});

// Check player stats
const stats = await prisma.matchPlayerStat.findUnique({
  where: { matchId: "abc123" },
});
```

## Usage Examples

### Basic Match Poll
```typescript
import { pollAndUpdateMatchesGemini } from "@/lib/match-poller-gemini";

const result = await pollAndUpdateMatchesGemini();
console.log(`Updated ${result.updated} matches`);
```

### Direct Gemini Query
```typescript
import { getGeminiMatchUpdate } from "@/lib/gemini-match-sync";

const update = await getGeminiMatchUpdate(
  "MI",    // Mumbai Indians short name
  "RCB",   // Royal Challengers Bangalore
  "April 18, 2026",
  "07:30 PM"
);

console.log(`Current score: ${update.innings[0].runs}/${update.innings[0].wickets}`);
console.log(`Match status: ${update.statusText}`);
console.log(`News items: ${update.matchNews.length}`);
```

### Stream Match Updates (Real-time)
```typescript
import { streamGeminiMatchUpdates } from "@/lib/gemini-match-sync";

for await (const chunk of streamGeminiMatchUpdates("MI", "RCB", "April 18, 2026", "07:30 PM")) {
  console.log(chunk);
}
```

### Save Match News Manually
```typescript
import { saveMatchNews } from "@/lib/match-updater";

await saveMatchNews("match_id_123", [
  {
    title: "MI collapse in pursuit",
    source: "ESPNCricinfo",
    summary: "Mumbai Indians lost 4 wickets for 23 runs...",
    keyPoints: ["Middle order weakness", "Pressure mounting"]
  }
]);
```

## Performance Characteristics

| Metric | Value |
|--------|-------|
| Gemini API latency | 2-8 seconds |
| Cache TTL | 90 seconds |
| Cron frequency | Every 5 minutes (recommended) |
| Cron runtime | ~30-60 seconds for 10-20 matches |
| Memory usage | ~5-10MB (in-process cache) |

## Error Handling

The system is resilient to Gemini API failures:

- **API Down:** Returns `null`, cron skips the match
- **Parse Error:** Logs error, returns `null`
- **Rate Limited:** Respects Gemini backoff headers
- **Invalid Response:** Falls back to cached data

Non-blocking operations (news, stats) failures don't halt the polling cycle.

## Monitoring

### Key Metrics
- Cron success rate (track in logs)
- Average Gemini API latency
- Cache hit ratio
- Parse success rate

### Logs to Watch
```
[Gemini] Error fetching match data for MI vs RCB:
[MatchPoller] Error processing match abc123:
[MatchUpdater] Error saving match news:
```

## Future Enhancements

1. **Historical Data** — Archive news items for each match
2. **Multi-Language** — Gemini can translate non-English updates
3. **Custom Prompts** — Admin UI to customize Gemini prompts per league
4. **Webhook Events** — Push updates to connected apps (Discord, Slack)
5. **Streaming UX** — Real-time SSE to frontend for live updates
6. **Player Analysis** — Extended stats (partnerships, momentum shifts)
7. **Match Predictions** — Gemini-powered win probability updates

## Troubleshooting

### Gemini API returns null
- Check `GOOGLE_GENERATIVE_AI_API_KEY` is set
- Verify API quota and rate limits
- Check team short names are exactly 2-3 chars (MI, RCB, CSK)

### News items not saved
- Verify `MatchNews` table exists
- Check match ID is correct
- Review `match-updater.ts` logs

### Standings not updating
- Ensure `TeamPointsTable` records exist
- Verify `team1Id` and `team2Id` are valid
- Check result resolution logic matches team names

### Stale cache data
Manually clear:
```typescript
import { clearMatchCache } from "@/lib/gemini-match-sync";
clearMatchCache("MI", "RCB");
// Or clear all:
// clearAllMatchCache();
```

## References

- [Google Generative AI SDK](https://ai.google.dev/tutorials/javascript_quickstart)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Prompt Engineering Guide](https://ai.google.dev/docs/prompt_engineering)

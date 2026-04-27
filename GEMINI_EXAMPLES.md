# Gemini Match Sync - Usage Examples

Practical examples for using the Gemini-powered live match sync service.

## Example 1: Basic Match Poll in Cron

**File:** `src/app/api/cron/poll-matches-gemini/route.ts`

```typescript
import { pollAndUpdateMatchesGemini } from "@/lib/match-poller-gemini";

export async function GET(request: Request) {
  // Verify auth
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollAndUpdateMatchesGemini();
    
    console.log(`Polled ${result.polled} matches, updated ${result.updated}`);
    
    return Response.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Poll error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
```

**Usage:**
```bash
# Test the endpoint
curl -H "Authorization: Bearer your_cron_secret" \
  http://localhost:3000/api/cron/poll-matches-gemini

# Set up as a cron job (Vercel Crons)
# Add to vercel.json:
{
  "crons": [
    {
      "path": "/api/cron/poll-matches-gemini",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

## Example 2: Direct API Call

Get live match updates for a specific match:

```typescript
import { getGeminiMatchUpdate } from "@/lib/gemini-match-sync";
import { prisma } from "@/lib/prisma";

export default async function LiveScorePage({ params }: { params: { groupId: string; matchId: string } }) {
  const match = await prisma.match.findUnique({
    where: { id: params.matchId },
    select: {
      team1: { select: { shortName: true } },
      team2: { select: { shortName: true } },
      startTimeUtc: true,
    },
  });

  if (!match) {
    return <div>Match not found</div>;
  }

  const date = match.startTimeUtc.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  
  const time = match.startTimeUtc.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const liveUpdate = await getGeminiMatchUpdate(
    match.team1.shortName,
    match.team2.shortName,
    date,
    time,
  );

  if (!liveUpdate) {
    return <div>Unable to fetch live score</div>;
  }

  return (
    <div>
      <h2>{match.team1.shortName} vs {match.team2.shortName}</h2>
      
      {/* Score Display */}
      {liveUpdate.innings.map((inn) => (
        <div key={inn.inningsNumber}>
          <h3>{inn.battingTeamShortName}</h3>
          <p>{inn.runs}/{inn.wickets} ({inn.overs} overs)</p>
          {inn.currentBatter && <p>Batter: {inn.currentBatter}</p>}
          {inn.currentBowler && <p>Bowler: {inn.currentBowler}</p>}
        </div>
      ))}

      {/* News Section */}
      {liveUpdate.matchNews && liveUpdate.matchNews.length > 0 && (
        <div>
          <h3>Latest News</h3>
          {liveUpdate.matchNews.map((news, idx) => (
            <article key={idx}>
              <h4>{news.title}</h4>
              <p>{news.summary}</p>
              <small>{news.source} - {new Date(news.timestamp).toLocaleString()}</small>
            </article>
          ))}
        </div>
      )}

      {/* Player Stats */}
      {liveUpdate.playerStats && (
        <div>
          <h3>Top Performers</h3>
          {liveUpdate.playerStats.topBatter && (
            <p>
              Top Batter: {liveUpdate.playerStats.topBatter.name} 
              ({liveUpdate.playerStats.topBatter.runs} from {liveUpdate.playerStats.topBatter.balls})
            </p>
          )}
          {liveUpdate.playerStats.topBowler && (
            <p>
              Top Bowler: {liveUpdate.playerStats.topBowler.name} 
              ({liveUpdate.playerStats.topBowler.wickets}/{liveUpdate.playerStats.topBowler.runs})
            </p>
          )}
        </div>
      )}
    </div>
  );
}
```

## Example 3: Server Action for Manual Update

Create a button that manually syncs a specific match:

```typescript
"use server";

import { prisma } from "@/lib/prisma";
import { scrapeMatchDataGemini } from "@/lib/match-scraper-gemini";
import { saveMatchNews } from "@/lib/match-updater";

export async function syncMatchManually(matchId: string) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true,
      team1: { select: { shortName: true } },
      team2: { select: { shortName: true } },
      startTimeUtc: true,
    },
  });

  if (!match) {
    return { error: "Match not found" };
  }

  try {
    const scraped = await scrapeMatchDataGemini({
      id: match.id,
      matchNumber: 0,
      team1ShortName: match.team1.shortName,
      team2ShortName: match.team2.shortName,
      startTimeUtc: match.startTimeUtc,
    });

    if (!scraped.data) {
      return { error: "Failed to fetch data" };
    }

    // Save news
    await saveMatchNews(match.id, scraped.data.matchNews);

    return {
      success: true,
      data: scraped.data,
      newsCount: scraped.data.matchNews?.length ?? 0,
    };
  } catch (error) {
    console.error("Manual sync error:", error);
    return { error: "Internal server error" };
  }
}
```

**Component:**
```typescript
"use client";

import { useState } from "react";
import { syncMatchManually } from "./actions";

export function ManualSyncButton({ matchId }: { matchId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; error?: string; newsCount?: number }>();

  async function handleClick() {
    setLoading(true);
    const res = await syncMatchManually(matchId);
    setResult(res);
    setLoading(false);
  }

  return (
    <div>
      <button onClick={handleClick} disabled={loading}>
        {loading ? "Syncing..." : "Sync Now"}
      </button>
      {result?.success && <p>✓ Synced! Found {result.newsCount} news items</p>}
      {result?.error && <p>✗ Error: {result.error}</p>}
    </div>
  );
}
```

## Example 4: Stream Real-Time Updates

For a live dashboard using SSE (Server-Sent Events):

```typescript
// src/app/api/matches/[matchId]/live-stream/route.ts

import { streamGeminiMatchUpdates } from "@/lib/gemini-match-sync";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: { matchId: string } }
) {
  const match = await prisma.match.findUnique({
    where: { id: params.matchId },
    select: {
      team1: { select: { shortName: true } },
      team2: { select: { shortName: true } },
      startTimeUtc: true,
    },
  });

  if (!match) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const date = match.startTimeUtc.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const time = match.startTimeUtc.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamGeminiMatchUpdates(
          match.team1.shortName,
          match.team2.shortName,
          date,
          time
        )) {
          controller.enqueue(
            new TextEncoder().encode(`data: ${JSON.stringify({ chunk })}\n\n`)
          );
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

**Frontend:**
```typescript
export function LiveMatchStream({ matchId }: { matchId: string }) {
  const [updates, setUpdates] = useState<string[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/matches/${matchId}/live-stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setUpdates((prev) => [...prev, data.chunk]);
    };

    eventSource.onerror = () => eventSource.close();

    return () => eventSource.close();
  }, [matchId]);

  return (
    <div>
      {updates.map((update, idx) => (
        <p key={idx}>{update}</p>
      ))}
    </div>
  );
}
```

## Example 5: Webhook Notification

Send match updates to Discord/Slack:

```typescript
// src/lib/match-webhooks.ts

interface WebhookPayload {
  matchId: string;
  event: "status_change" | "news_update" | "match_complete";
  data: any;
}

export async function notifyWebhooks(payload: WebhookPayload) {
  const webhooks = [
    process.env.DISCORD_WEBHOOK_URL,
    process.env.SLACK_WEBHOOK_URL,
  ].filter(Boolean);

  for (const webhook of webhooks) {
    try {
      const message = formatMessage(payload);
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error("Webhook error:", error);
    }
  }
}

function formatMessage(payload: WebhookPayload) {
  if (payload.event === "status_change") {
    return {
      content: `🏏 Match ${payload.data.matchNumber}: ${payload.data.nextStatus}`,
    };
  }
  if (payload.event === "news_update") {
    return {
      embeds: [
        {
          title: payload.data.title,
          description: payload.data.summary,
          footer: { text: payload.data.source },
        },
      ],
    };
  }
  if (payload.event === "match_complete") {
    return {
      content: `✅ ${payload.data.team1} vs ${payload.data.team2}: ${payload.data.winner} won!`,
    };
  }
  return {};
}
```

**Usage in poller:**
```typescript
// In match-poller-gemini.ts, after updating match status:
await notifyWebhooks({
  matchId: match.id,
  event: "status_change",
  data: {
    matchNumber: match.matchNumber,
    nextStatus: "live_first_innings",
  },
});
```

## Example 6: Database Queries

Common queries to analyze match data:

```typescript
// Get all news for a match
const news = await prisma.matchNews.findMany({
  where: { matchId: "match_id" },
  orderBy: { createdAt: "desc" },
});

// Get top performers across matches
const topBatters = await prisma.matchPlayerStat.groupBy({
  by: ["topBatterName"],
  _max: { topBatterRuns: true },
  orderBy: { _max: { topBatterRuns: "desc" } },
  take: 10,
});

// Get matches with most news coverage
const trending = await prisma.matchNews.groupBy({
  by: ["matchId"],
  _count: true,
  orderBy: { _count: "desc" },
  take: 5,
});

// Get latest news across all matches
const latestNews = await prisma.matchNews.findMany({
  take: 20,
  orderBy: { createdAt: "desc" },
  include: { match: { select: { matchNumber: true } } },
});
```

## Example 7: Error Handling and Logging

Implement comprehensive error tracking:

```typescript
// src/lib/match-sync-logger.ts

interface MatchSyncLog {
  timestamp: Date;
  matchId: string;
  event: "poll_start" | "poll_end" | "error" | "success";
  duration?: number;
  error?: string;
  metadata?: Record<string, any>;
}

const logs: MatchSyncLog[] = [];

export function logMatchSync(log: MatchSyncLog) {
  logs.push(log);

  // Send to external logging service
  if (log.event === "error") {
    console.error(`[Match] ${log.matchId}: ${log.error}`);
    // Send to Sentry, LogRocket, etc.
  } else {
    console.log(`[Match] ${log.matchId}: ${log.event}`);
  }
}

export function getRecentLogs(limit = 100) {
  return logs.slice(-limit);
}

// Usage in match-poller-gemini.ts:
logMatchSync({
  timestamp: new Date(),
  matchId: match.id,
  event: "poll_start",
  metadata: { team1: match.team1.shortName, team2: match.team2.shortName },
});

try {
  const scraped = await scrapeMatchDataGemini(target);
  logMatchSync({
    timestamp: new Date(),
    matchId: match.id,
    event: "success",
    duration: Date.now() - start,
  });
} catch (error) {
  logMatchSync({
    timestamp: new Date(),
    matchId: match.id,
    event: "error",
    error: String(error),
  });
}
```

## Testing Examples

```typescript
// tests/gemini-match-sync.test.ts

import { getGeminiMatchUpdate, clearMatchCache } from "@/lib/gemini-match-sync";

describe("Gemini Match Sync", () => {
  beforeEach(() => clearMatchCache("MI", "RCB"));

  test("fetches match data from Gemini", async () => {
    const data = await getGeminiMatchUpdate("MI", "RCB", "April 18, 2026", "07:30 PM");
    
    expect(data).toBeDefined();
    expect(data.matchPhase).toMatch(/not_started|first_innings|second_innings|completed/);
    expect(data.innings).toBeInstanceOf(Array);
  });

  test("caches results for 90 seconds", async () => {
    const start = Date.now();
    await getGeminiMatchUpdate("MI", "RCB", "April 18, 2026", "07:30 PM");
    const firstCall = Date.now() - start;

    const start2 = Date.now();
    await getGeminiMatchUpdate("MI", "RCB", "April 18, 2026", "07:30 PM");
    const cachedCall = Date.now() - start2;

    expect(cachedCall).toBeLessThan(firstCall);
  });

  test("returns null on API error", async () => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "invalid";
    const data = await getGeminiMatchUpdate("MI", "RCB", "April 18, 2026", "07:30 PM");
    expect(data).toBeNull();
  });
});
```

---

**Need more examples?** Check GEMINI_MATCH_SYNC.md for detailed documentation.

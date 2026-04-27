-- Gemini Match Sync - Database Migration
-- Run these commands after updating schema.prisma with new models

-- Step 1: Create MatchNews table
CREATE TABLE IF NOT EXISTS "match_news" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "match_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "key_points" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_news_match_id_fkey" FOREIGN KEY ("match_id")
    REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "match_news_matchId_source_title_key" UNIQUE ("match_id", "source", "title")
);

-- Step 2: Create MatchPlayerStat table
CREATE TABLE IF NOT EXISTS "match_player_stats" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "match_id" TEXT NOT NULL UNIQUE,
  "top_batter_name" TEXT,
  "top_batter_runs" INTEGER,
  "top_batter_balls" INTEGER,
  "top_batter_strike_rate" DOUBLE PRECISION,
  "top_bowler_name" TEXT,
  "top_bowler_wickets" INTEGER,
  "top_bowler_runs" INTEGER,
  "top_bowler_overs" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "match_player_stats_match_id_fkey" FOREIGN KEY ("match_id")
    REFERENCES "matches" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Step 3: Create indexes for common queries
CREATE INDEX IF NOT EXISTS "match_news_match_id_idx" ON "match_news"("match_id");
CREATE INDEX IF NOT EXISTS "match_news_created_at_idx" ON "match_news"("created_at");
CREATE INDEX IF NOT EXISTS "match_player_stats_match_id_idx" ON "match_player_stats"("match_id");

-- Step 4: Verify creation
SELECT
  tablename,
  CASE
    WHEN tablename = 'match_news' THEN 'MatchNews'
    WHEN tablename = 'match_player_stats' THEN 'MatchPlayerStat'
  END as model_name,
  'Created' as status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('match_news', 'match_player_stats');

-- Step 5: (Optional) Check foreign key constraints
SELECT
  constraint_name,
  table_name,
  column_name,
  foreign_table_name,
  foreign_column_name
FROM information_schema.key_column_usage
WHERE table_name IN ('match_news', 'match_player_stats')
  AND column_name LIKE '%_id%';

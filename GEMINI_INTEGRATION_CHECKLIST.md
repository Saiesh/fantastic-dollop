# Gemini Match Sync Integration Checklist

Complete this checklist to integrate the Gemini-powered live match sync service into your IPL Fanbet application.

## Phase 1: Setup (Pre-Production)

- [ ] **Get Gemini API Key**
  - [ ] Create Google Cloud account
  - [ ] Enable Generative AI API
  - [ ] Generate API key from https://aistudio.google.com/apikey
  - [ ] Add to `.env.local`:
    ```
    GOOGLE_GENERATIVE_AI_API_KEY=your-key-here
    ```

- [ ] **Install Dependencies**
  - [ ] Run: `npm install @google/generative-ai`
  - [ ] Run: `npm install --save-dev @types/node` (if not already installed)
  - [ ] Verify installation: `npm ls @google/generative-ai`

- [ ] **Update Prisma Schema**
  - [ ] Open `prisma/schema.prisma`
  - [ ] Add `MatchNews` model (from GEMINI_MATCH_SYNC.md)
  - [ ] Add `MatchPlayerStat` model (from GEMINI_MATCH_SYNC.md)
  - [ ] Add relations to `Match` model:
    ```prisma
    matchNews     MatchNews[]
    playerStats   MatchPlayerStat?
    ```
  - [ ] Run: `npx prisma migrate dev --name add_gemini_models`
  - [ ] Run: `npx prisma generate`

- [ ] **Verify File Structure**
  - [ ] ✓ `src/lib/gemini-match-sync.ts` — Gemini API integration
  - [ ] ✓ `src/lib/match-scraper-gemini.ts` — Adapter layer
  - [ ] ✓ `src/lib/match-updater.ts` — Database updates
  - [ ] ✓ `src/lib/match-poller-gemini.ts` — Polling orchestrator
  - [ ] ✓ `src/app/api/cron/poll-matches-gemini/route.ts` — Cron endpoint
  - [ ] ✓ `GEMINI_MATCH_SYNC.md` — Documentation
  - [ ] ✓ `GEMINI_INTEGRATION_CHECKLIST.md` — This file

## Phase 2: Testing (Development)

- [ ] **Unit Tests**
  - [ ] Test `gemini-match-sync.ts`:
    - [ ] Cache hit/miss behavior
    - [ ] JSON parsing with valid/invalid responses
    - [ ] Error handling when API is down
    - [ ] Rate limit handling
  - [ ] Test `match-scraper-gemini.ts`:
    - [ ] Date/time formatting for Gemini
    - [ ] Innings data conversion
    - [ ] Response mapping to ScrapedMatchData
  - [ ] Test `match-poller-gemini.ts`:
    - [ ] Status transitions (upcoming → live_first_innings)
    - [ ] Match result resolution
    - [ ] Cache revalidation calls

- [ ] **Integration Tests**
  - [ ] [ ] Test with real Gemini API:
    ```bash
    npm run test:gemini-integration
    ```
  - [ ] [ ] Verify cron endpoint:
    ```bash
    curl -H "Authorization: Bearer YOUR_SECRET" \
      http://localhost:3000/api/cron/poll-matches-gemini
    ```
  - [ ] [ ] Check database updates:
    ```typescript
    const news = await prisma.matchNews.findMany({ take: 5 });
    const stats = await prisma.matchPlayerStat.findMany({ take: 5 });
    console.log(news, stats);
    ```

- [ ] **Error Scenarios**
  - [ ] [ ] Missing API key:
    - Should throw clear error at startup
  - [ ] [ ] Invalid team short names:
    - Should handle gracefully, return null
  - [ ] [ ] Network timeout:
    - Should fallback to cache within 90 seconds
  - [ ] [ ] Malformed JSON from Gemini:
    - Should log error and return null
  - [ ] [ ] Database connection failure:
    - Should log error but not block polling

- [ ] **Load Testing**
  - [ ] Test with multiple concurrent matches:
    ```bash
    npm run test:load-poll -- --matches 20 --duration 300s
    ```
  - [ ] Monitor:
    - [ ] API latency (target: < 8 seconds per match)
    - [ ] Memory usage (target: < 50MB)
    - [ ] Cache effectiveness (target: > 80% hit rate)
    - [ ] Database insert performance

## Phase 3: Staging Deployment

- [ ] **Environment Setup**
  - [ ] Add `GOOGLE_GENERATIVE_AI_API_KEY` to staging env
  - [ ] Add `CRON_SECRET` if using auth on cron endpoint
  - [ ] Verify database schema is up to date:
    ```bash
    npx prisma migrate status
    ```

- [ ] **Monitoring Setup**
  - [ ] [ ] Configure logging for:
    - [ ] `[Gemini]` prefix for API calls
    - [ ] `[MatchPoller]` prefix for polling
    - [ ] `[MatchUpdater]` prefix for DB updates
  - [ ] [ ] Set up alerts for:
    - [ ] Cron failure (poll success rate < 95%)
    - [ ] API errors (> 10% failure rate)
    - [ ] Database errors (> 5% failure rate)

- [ ] **Gradual Rollout**
  - [ ] [ ] Keep original cron endpoint running:
    - `/api/cron/poll-matches` → uses ESPNCricinfo
  - [ ] [ ] Start new Gemini cron:
    - `/api/cron/poll-matches-gemini` → uses Gemini
  - [ ] [ ] Compare results for 24 hours
  - [ ] [ ] Monitor both in parallel

- [ ] **Data Validation**
  - [ ] [ ] Verify scores match ESPNCricinfo (allowing 1-2 minute delay)
  - [ ] [ ] Check news items are being stored
  - [ ] [ ] Validate player stats accuracy
  - [ ] [ ] Compare match completion times

## Phase 4: Production Deployment

- [ ] **Pre-Production Checks**
  - [ ] [ ] All tests passing
  - [ ] [ ] Staging comparison complete
  - [ ] [ ] Documentation reviewed
  - [ ] [ ] Monitoring alerts configured
  - [ ] [ ] Rollback plan documented

- [ ] **Deployment**
  - [ ] [ ] Merge feature branch with Gemini code
  - [ ] [ ] Deploy to production
  - [ ] [ ] Verify migrations ran:
    ```sql
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('match_news', 'match_player_stats');
    ```
  - [ ] [ ] Check environment variables set correctly
  - [ ] [ ] Run initial cron job manually to validate

- [ ] **Production Monitoring (First 24 Hours)**
  - [ ] [ ] Monitor cron success rate (target: > 95%)
  - [ ] [ ] Watch API error logs
  - [ ] [ ] Verify news items being created
  - [ ] [ ] Check for any data inconsistencies
  - [ ] [ ] Monitor database query performance

- [ ] **Decommissioning Old Service** (After 48+ hours of successful Gemini operation)
  - [ ] [ ] Stop calling old ESPNCricinfo endpoint
  - [ ] [ ] Update cron job to only use Gemini route
  - [ ] [ ] Archive old scraper code (don't delete, keep in git history)
  - [ ] [ ] Update CLAUDE.md to reference Gemini architecture
  - [ ] [ ] Archive ESPNCricinfo documentation

## Phase 5: Post-Launch Optimization

- [ ] **Performance Tuning**
  - [ ] [ ] Analyze cache hit rates
  - [ ] [ ] Optimize Gemini prompt if needed
  - [ ] [ ] Adjust cache TTL based on match phase
  - [ ] [ ] Consider batch processing for multiple matches

- [ ] **Feature Enhancement**
  - [ ] [ ] Add streaming updates for real-time UX
  - [ ] [ ] Implement webhook notifications (Discord/Slack)
  - [ ] [ ] Add admin UI for custom prompts
  - [ ] [ ] Create player performance leaderboard

- [ ] **Documentation**
  - [ ] [ ] Update main README.md to mention Gemini
  - [ ] [ ] Create runbook for on-call engineers
  - [ ] [ ] Document known limitations
  - [ ] [ ] Create troubleshooting guide

## Rollback Plan

If Gemini service fails in production:

```bash
# Option 1: Revert to ESPNCricinfo temporarily
# Update cron route to call original pollAndUpdateMatches()
git revert COMMIT_HASH

# Option 2: Disable Gemini, keep ESPNCricinfo
# In /api/cron/poll-matches-gemini:
# if (!process.env.GEMINI_ENABLED) return Response.json({message: "Disabled"});

# Option 3: Hybrid mode
# Add fallback: try Gemini first, fallback to ESPNCricinfo
```

## Monitoring Dashboard Queries

### Cron Success Rate
```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as attempts,
  SUM(CASE WHEN success = true THEN 1 ELSE 0 END) as successes,
  ROUND(100.0 * SUM(CASE WHEN success = true THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM cron_log
WHERE service = 'poll_matches_gemini'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

### News Items Created
```sql
SELECT
  COUNT(*) as total_news,
  COUNT(DISTINCT match_id) as matches_with_news,
  AVG(LENGTH(summary)) as avg_summary_length
FROM match_news
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### Player Stats Quality
```sql
SELECT
  COUNT(*) as total_stats,
  SUM(CASE WHEN top_batter_name IS NOT NULL THEN 1 ELSE 0 END) as with_batter,
  SUM(CASE WHEN top_bowler_name IS NOT NULL THEN 1 ELSE 0 END) as with_bowler
FROM match_player_stats
WHERE created_at > NOW() - INTERVAL '24 hours';
```

## Support Contacts

- **Gemini API Issues:** [Google AI Studio](https://aistudio.google.com)
- **Database Issues:** DBA team
- **Deployment Issues:** DevOps team
- **Feature Requests:** Product team

## Sign-Off

- [ ] **Tech Lead Review:** _____________________ Date: _____
- [ ] **QA Sign-Off:** _____________________ Date: _____
- [ ] **Product Approval:** _____________________ Date: _____
- [ ] **Security Review:** _____________________ Date: _____

---

**Last Updated:** April 18, 2026
**Author:** Claude / saiesh.natrajan@branch.co
**Version:** 1.0

-- CreateTable
CREATE TABLE "match_sync_cache" (
    "id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_sync_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_sync_cache_cache_key_key" ON "match_sync_cache"("cache_key");

-- CreateIndex
CREATE INDEX "match_sync_cache_cache_key_expires_at_idx" ON "match_sync_cache"("cache_key", "expires_at");

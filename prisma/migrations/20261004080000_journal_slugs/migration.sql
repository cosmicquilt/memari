-- A journal's address in words, /app/j/frosty-otter-4821 (2026-10-04).
-- Additive: one nullable column and its unique index. Journals made before
-- it have none until they are next opened or listed, which gives them one
-- (src/app/planner/journalSlugs.ts) - nothing to backfill here.

-- AlterTable
ALTER TABLE "Planner" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Planner_slug_key" ON "Planner"("slug");

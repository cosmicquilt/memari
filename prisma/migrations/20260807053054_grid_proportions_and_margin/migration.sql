-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "marginPx" DOUBLE PRECISION NOT NULL DEFAULT 75,
ALTER COLUMN "gridColumns" SET DEFAULT 4,
ALTER COLUMN "gridGapPx" SET DEFAULT 32;

-- Backfill: existing pages were created under the old 6-column/8px-gap
-- defaults. Bring them onto the new proportions too, since this is
-- pre-launch test data, not real user content worth preserving as-is.
UPDATE "Page" SET "gridColumns" = 4, "gridGapPx" = 32;

-- The existing hourly-grid-core instance was sized for a 6-column grid
-- (columnStart=1, columnSpan=5) and would overflow a 4-column one.
-- Simplest correct fix for pre-launch test data: drop the grid-placed
-- instances and let getOrCreatePlanner's auto-heal recreate the core
-- block correctly sized for the new grid. FREE-mode (freeform, hand-drawn)
-- instances are left untouched — that's real content, not layout scaffolding.
DELETE FROM "ModuleInstance" WHERE "placementMode" = 'GRID';

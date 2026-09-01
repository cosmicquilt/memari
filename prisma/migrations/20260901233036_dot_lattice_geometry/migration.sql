-- AlterTable
ALTER TABLE "Page" ALTER COLUMN "gridColumns" SET DEFAULT 24,
ALTER COLUMN "gridRows" SET DEFAULT 36,
ALTER COLUMN "marginPx" SET DEFAULT 187.5;

-- Defaults only apply to rows created after this point, so bring the
-- existing pages onto the lattice as well.
--
-- Their module placements are still in 4 x 30 coordinates and will look
-- wrong until each planner is reset to its template. That is deliberate:
-- no real layouts exist yet, and re-seeding is cleaner than rounding every
-- rowStart through a 30 -> 36 map that is only an integer for even rows.
-- Columns would have mapped exactly (x6), but a half-migrated page is
-- harder to reason about than an obviously stale one.
UPDATE "Page" SET "gridColumns" = 24, "gridRows" = 36, "marginPx" = 187.5;

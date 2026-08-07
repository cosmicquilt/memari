/*
  Warnings:

  - Made the column `gridColumns` on table `Page` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gridGapPx` on table `Page` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gridRows` on table `Page` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill: pages created before this migration have NULL grid config.
-- Give them the same starter grid new pages get.
UPDATE "Page" SET "gridColumns" = 6 WHERE "gridColumns" IS NULL;
UPDATE "Page" SET "gridRows" = 10 WHERE "gridRows" IS NULL;
UPDATE "Page" SET "gridGapPx" = 8 WHERE "gridGapPx" IS NULL;

-- CreateEnum
CREATE TYPE "ModulePlacementMode" AS ENUM ('GRID', 'FREE');

-- AlterTable
ALTER TABLE "ModuleInstance" ADD COLUMN     "placementMode" "ModulePlacementMode" NOT NULL DEFAULT 'GRID';

-- Backfill: existing rows from before this migration are the freeform
-- test elements saved with x/y set and no grid coordinates — correct
-- those specifically to FREE rather than leaving them at the new
-- column's default of GRID, which would be wrong for them.
UPDATE "ModuleInstance" SET "placementMode" = 'FREE'
WHERE "columnStart" IS NULL AND "x" IS NOT NULL;

-- AlterTable
ALTER TABLE "Page" ALTER COLUMN "gridColumns" SET NOT NULL,
ALTER COLUMN "gridColumns" SET DEFAULT 6,
ALTER COLUMN "gridGapPx" SET NOT NULL,
ALTER COLUMN "gridGapPx" SET DEFAULT 8,
ALTER COLUMN "gridRows" SET NOT NULL,
ALTER COLUMN "gridRows" SET DEFAULT 10;

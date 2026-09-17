-- Per-occurrence layouts: "repeat by default, customise by exception".
--
-- null means the DEFAULT layout for the level, printed for every occurrence
-- that has none of its own. A key like '2026-01' is a layout for that month
-- alone. Nullable so the exception costs nothing when unused, which is the
-- common case - most books want one weekly spread repeated.
ALTER TABLE "Page" ADD COLUMN "variantKey" TEXT;

-- NULLS NOT DISTINCT, which Prisma cannot express and which this index is
-- nearly worthless without: the default pages are the ones with a null
-- variantKey, so under the standard NULLS DISTINCT rule two default pages at
-- the same position would both be allowed - the exact collision the
-- constraint exists to stop.
DROP INDEX "Page_plannerId_level_position_key";
CREATE UNIQUE INDEX "Page_plannerId_level_variantKey_position_key"
  ON "Page"("plannerId", "level", "variantKey", "position") NULLS NOT DISTINCT;

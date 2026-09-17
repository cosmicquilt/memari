-- How often a page repeats in the finished book.
--
-- Declaration order is binding order: Postgres sorts an enum by the order
-- its values were declared, so ORDER BY level is the order the pages are
-- bound in, and the timeline reads left to right off the same query.
CREATE TYPE "PageLevel" AS ENUM ('FRONT_MATTER', 'MONTHLY', 'WEEKLY', 'DAILY', 'BACK_MATTER');

-- Added WITH a default so it can land on rows that already exist, then
-- backfilled from what each planner already was, then the default DROPPED.
-- The schema therefore has no default: there is no sensible universal answer
-- to "what level is a page whose level nobody stated", and a standing default
-- of WEEKLY would silently swallow a daily page created without one.
ALTER TABLE "Page" ADD COLUMN "level" "PageLevel" NOT NULL DEFAULT 'WEEKLY';

-- A MONTH planner's pages are the monthly set. Everything else was a week
-- spread, which the default already covers. QUARTER and YEAR exist in
-- BaseType and have never been created, so nothing of theirs is being
-- guessed at here.
UPDATE "Page" SET "level" = 'MONTHLY'
FROM "Planner"
WHERE "Page"."plannerId" = "Planner"."id" AND "Planner"."baseType" = 'MONTH';

ALTER TABLE "Page" ALTER COLUMN "level" DROP DEFAULT;

-- What term the book covers. Sequence generation walks this range to turn
-- the templates into pages. Nullable: every planner that existed before this
-- was a single spread with no term at all.
ALTER TABLE "Planner" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Planner" ADD COLUMN "endDate" TIMESTAMP(3);

-- Position is position WITHIN a level now, so two levels of one book can
-- both have a first page.
DROP INDEX "Page_plannerId_position_key";
CREATE UNIQUE INDEX "Page_plannerId_level_position_key" ON "Page"("plannerId", "level", "position");

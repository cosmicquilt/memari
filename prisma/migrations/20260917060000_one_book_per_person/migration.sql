-- One book per person, so a planner no longer has a "type".
--
-- baseType said whether a Planner was the WEEK one or the MONTH one, back
-- when those were two unrelated rows. A page says how often it is printed
-- now (Page.level) and a term says what the book covers (startDate/endDate),
-- so between them they carry everything baseType did and more.
--
-- Leaving it would be worse than dropping it: the surviving book holds both
-- weekly and monthly pages, so a column reading 'WEEK' would be a second,
-- WRONG description of something the pages already say - the exact defect
-- class this codebase keeps undoing.
--
-- The data fold itself is NOT here. scripts/fold-books.mts reparents the
-- pages and deletes the emptied planner, because that is a one-time repair
-- of data created before levels existed; a fresh database makes one book
-- from the start and must not run a repair for a shape it never had.
ALTER TABLE "Planner" DROP COLUMN "baseType";
DROP TYPE "BaseType";

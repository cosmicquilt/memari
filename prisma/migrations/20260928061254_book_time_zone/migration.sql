-- A book's time zone. Null until the editor gives it the browser's zone on
-- the next open; a null zone draws in UTC, exactly as every book drew before.
ALTER TABLE "Planner" ADD COLUMN     "timeZone" TEXT;

-- EVERY EVENT TYPED BEFORE THIS IS A FLOATING TIME, and says so now.
--
-- The editor saved "9am on the 28th" as 2026-09-28T09:00:00Z - the wall time
-- with a Z on the end - and the page read it back with getUTCHours. So those
-- rows were never instants in UTC; they were wall times with no zone, which
-- is precisely iCalendar's "floating" time. Left marked "UTC", the new
-- zone-aware page would convert them and move every one: a 9am dentist
-- appointment would print at 5am in a New York book.
--
-- Only rows typed here: origin TYPED, and nothing outside knows them (no
-- externalId). No zone has to be guessed, which is the point - floating is
-- not an approximation of what they were, it is what they were.
UPDATE "CalendarEvent"
SET "timeZone" = 'floating'
WHERE "origin" = 'TYPED'
  AND "externalId" IS NULL
  AND "timeZone" = 'UTC';

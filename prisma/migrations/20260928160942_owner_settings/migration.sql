-- Per-person settings - today, the default time zone.
--
-- Additive: one new table, nothing existing touched. It also CHANGES WHAT A
-- NULL Planner.timeZone MEANS, with no data to move: the previous migration
-- described null as "not set yet"; from here it means "follow the owner's
-- default". Every book is null on production when this runs, so every book
-- follows its owner's default, which is seeded from their browser the next
-- time they open the editor.
-- CreateTable
CREATE TABLE "OwnerSettings" (
    "ownerId" TEXT NOT NULL,
    "timeZone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OwnerSettings_pkey" PRIMARY KEY ("ownerId")
);

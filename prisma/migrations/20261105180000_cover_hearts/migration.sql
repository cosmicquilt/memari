-- Hearted covers (2026-11-05): a cover somebody hearted on /covers, kept per
-- owner (a guest too) and shown first in the order screen's Cover picker.
-- Additive: one new table, nothing else changes.

-- CreateTable
CREATE TABLE "CoverHeart" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "coverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoverHeart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoverHeart_ownerId_idx" ON "CoverHeart"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverHeart_ownerId_coverId_key" ON "CoverHeart"("ownerId", "coverId");

-- AlterTable
ALTER TABLE "SavedModule" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "SavedPage" ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "SavedPlanner" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedPlanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPlanner_ownerId_idx" ON "SavedPlanner"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPlanner_ownerId_templateKey_key" ON "SavedPlanner"("ownerId", "templateKey");

-- CreateIndex
CREATE INDEX "SavedModule_ownerId_sourceKey_idx" ON "SavedModule"("ownerId", "sourceKey");

-- CreateIndex
CREATE INDEX "SavedPage_ownerId_sourceKey_idx" ON "SavedPage"("ownerId", "sourceKey");


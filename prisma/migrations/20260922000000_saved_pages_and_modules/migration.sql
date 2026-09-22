-- Saved > Pages and Saved > Modules: things somebody made once and uses again.
--
-- LINKED (Andrew, 2026-09-21: "for now it can just change all of them"). A
-- use of a saved page is an ordinary Page carrying savedPageId; a use of a
-- saved module is an ordinary ModuleInstance carrying savedModuleId. Every
-- reader of pages and modules therefore works on them unchanged, and an edit
-- to one use is copied to the others - see src/app/planner/savedItems.ts.
--
-- Additive only: two new tables, three nullable columns. Deleting a saved
-- item NULLs the links (ON DELETE SET NULL), so the pages and modules that
-- used it stay exactly as they were, as the journal's own.

-- AlterTable
ALTER TABLE "ModuleInstance" ADD COLUMN     "savedModuleId" TEXT;

-- AlterTable
ALTER TABLE "Page" ADD COLUMN     "savedPageId" TEXT,
ADD COLUMN     "savedPageIndex" INTEGER;

-- CreateTable
CREATE TABLE "SavedPage" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "widthPx" DOUBLE PRECISION NOT NULL,
    "heightPx" DOUBLE PRECISION NOT NULL,
    "gridColumns" INTEGER NOT NULL,
    "gridRows" INTEGER NOT NULL,
    "gridGapPx" DOUBLE PRECISION NOT NULL,
    "marginPx" DOUBLE PRECISION NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedModule" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "moduleTypeId" TEXT NOT NULL,
    "propValues" JSONB NOT NULL DEFAULT '{}',
    "columnSpan" INTEGER NOT NULL,
    "rowSpan" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedPage_ownerId_idx" ON "SavedPage"("ownerId");

-- CreateIndex
CREATE INDEX "SavedModule_ownerId_idx" ON "SavedModule"("ownerId");

-- CreateIndex
CREATE INDEX "ModuleInstance_savedModuleId_idx" ON "ModuleInstance"("savedModuleId");

-- CreateIndex
CREATE INDEX "Page_savedPageId_idx" ON "Page"("savedPageId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_savedPageId_fkey" FOREIGN KEY ("savedPageId") REFERENCES "SavedPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstance" ADD CONSTRAINT "ModuleInstance_savedModuleId_fkey" FOREIGN KEY ("savedModuleId") REFERENCES "SavedModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedModule" ADD CONSTRAINT "SavedModule_moduleTypeId_fkey" FOREIGN KEY ("moduleTypeId") REFERENCES "ModuleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


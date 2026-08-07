-- CreateEnum
CREATE TYPE "BaseType" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'YEAR');

-- CreateTable
CREATE TABLE "Planner" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "baseType" "BaseType" NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "theme" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleType" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "configSchema" JSONB NOT NULL,
    "defaultWidth" DOUBLE PRECISION NOT NULL,
    "defaultHeight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ModuleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleInstance" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "moduleTypeId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "zIndex" INTEGER NOT NULL DEFAULT 0,
    "propValues" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ModuleInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Planner_ownerId_idx" ON "Planner"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Page_plannerId_position_key" ON "Page"("plannerId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ModuleType_slug_key" ON "ModuleType"("slug");

-- CreateIndex
CREATE INDEX "ModuleInstance_pageId_idx" ON "ModuleInstance"("pageId");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstance" ADD CONSTRAINT "ModuleInstance_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleInstance" ADD CONSTRAINT "ModuleInstance_moduleTypeId_fkey" FOREIGN KEY ("moduleTypeId") REFERENCES "ModuleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

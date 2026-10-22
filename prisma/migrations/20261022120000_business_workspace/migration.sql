-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessTemplate" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessClient" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "coverName" TEXT,
    "email" TEXT,
    "shippingAddress" JSONB,
    "startDate" TIMESTAMP(3),
    "bookMonths" INTEGER NOT NULL DEFAULT 3,
    "templateId" TEXT,
    "plannerId" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessClient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Business_ownerId_key" ON "Business"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTemplate_plannerId_key" ON "BusinessTemplate"("plannerId");

-- CreateIndex
CREATE INDEX "BusinessTemplate_businessId_idx" ON "BusinessTemplate"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessClient_plannerId_key" ON "BusinessClient"("plannerId");

-- CreateIndex
CREATE INDEX "BusinessClient_businessId_idx" ON "BusinessClient"("businessId");

-- AddForeignKey
ALTER TABLE "BusinessTemplate" ADD CONSTRAINT "BusinessTemplate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessTemplate" ADD CONSTRAINT "BusinessTemplate_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClient" ADD CONSTRAINT "BusinessClient_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClient" ADD CONSTRAINT "BusinessClient_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClient" ADD CONSTRAINT "BusinessClient_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planner"("id") ON DELETE SET NULL ON UPDATE CASCADE;


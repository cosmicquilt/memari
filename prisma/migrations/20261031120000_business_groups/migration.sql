-- DropIndex
DROP INDEX "PrintOrder_stripeCheckoutSessionId_key";

-- AlterTable
ALTER TABLE "BusinessClient" ADD COLUMN     "groupId" TEXT;

-- AlterTable
ALTER TABLE "PrintOrder" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "PrintBatch" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "groupId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "placedEmailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessGroup" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "bookMonths" INTEGER NOT NULL DEFAULT 3,
    "templateId" TEXT,
    "shipToVenue" BOOLEAN NOT NULL DEFAULT false,
    "venueAddress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintBatch_stripeCheckoutSessionId_key" ON "PrintBatch"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "PrintBatch_ownerId_createdAt_idx" ON "PrintBatch"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PrintBatch_groupId_idx" ON "PrintBatch"("groupId");

-- CreateIndex
CREATE INDEX "BusinessGroup_businessId_idx" ON "BusinessGroup"("businessId");

-- CreateIndex
CREATE INDEX "BusinessClient_groupId_idx" ON "BusinessClient"("groupId");

-- CreateIndex
CREATE INDEX "PrintOrder_stripeCheckoutSessionId_idx" ON "PrintOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "PrintOrder_batchId_idx" ON "PrintOrder"("batchId");

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PrintBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintBatch" ADD CONSTRAINT "PrintBatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BusinessGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessClient" ADD CONSTRAINT "BusinessClient_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "BusinessGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessGroup" ADD CONSTRAINT "BusinessGroup_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessGroup" ADD CONSTRAINT "BusinessGroup_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BusinessTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;


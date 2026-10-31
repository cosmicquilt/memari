-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "claimExpiresAt" TIMESTAMP(3),
ADD COLUMN     "claimTokenHash" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "preparedAt" TIMESTAMP(3),
ADD COLUMN     "preparedKey" TEXT;

-- AlterTable
ALTER TABLE "PrintOrder" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "BusinessFeedback" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "ownerId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BusinessFeedback_businessId_createdAt_idx" ON "BusinessFeedback"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Business_claimTokenHash_key" ON "Business"("claimTokenHash");

-- AddForeignKey
ALTER TABLE "BusinessFeedback" ADD CONSTRAINT "BusinessFeedback_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;


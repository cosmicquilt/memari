-- AlterTable
ALTER TABLE "PrintOrder" ADD COLUMN     "arrivalAnswer" TEXT,
ADD COLUMN     "arrivalAnsweredAt" TIMESTAMP(3),
ADD COLUMN     "arrivalAskedAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryAlertedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryProblem" TEXT,
ADD COLUMN     "shippedAt" TIMESTAMP(3),
ADD COLUMN     "trackerCheckedAt" TIMESTAMP(3),
ADD COLUMN     "trackerId" TEXT,
ADD COLUMN     "trackerStatus" TEXT,
ADD COLUMN     "trackingCarrier" TEXT,
ADD COLUMN     "trackingCode" TEXT;

-- CreateIndex
CREATE INDEX "PrintOrder_status_shippedAt_idx" ON "PrintOrder"("status", "shippedAt");


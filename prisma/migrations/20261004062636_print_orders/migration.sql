-- CreateEnum
CREATE TYPE "PrintBinding" AS ENUM ('COIL', 'PAPERBACK', 'HARDCOVER');

-- CreateEnum
CREATE TYPE "PrintOrderStatus" AS ENUM ('QUOTED', 'PAID', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELED', 'FAILED');

-- AlterTable
ALTER TABLE "OwnerSettings" ADD COLUMN     "stripeCustomerId" TEXT;

-- CreateTable
CREATE TABLE "PrintOrder" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "plannerId" TEXT,
    "status" "PrintOrderStatus" NOT NULL DEFAULT 'QUOTED',
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "binding" "PrintBinding" NOT NULL,
    "podPackageId" TEXT NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "shippingLevel" TEXT NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "contactEmail" TEXT,
    "bookCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "costCents" INTEGER NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewsAt" TIMESTAMP(3),
    "renewedFromId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripePaymentMethodId" TEXT,
    "luluPrintJobId" TEXT,
    "luluStatus" TEXT,
    "trackingUrls" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintFile" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PrintOrder_stripeCheckoutSessionId_key" ON "PrintOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE INDEX "PrintOrder_ownerId_idx" ON "PrintOrder"("ownerId");

-- CreateIndex
CREATE INDEX "PrintOrder_status_renewsAt_idx" ON "PrintOrder"("status", "renewsAt");

-- CreateIndex
CREATE UNIQUE INDEX "PrintFile_orderId_kind_key" ON "PrintFile"("orderId", "kind");

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintOrder" ADD CONSTRAINT "PrintOrder_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "PrintOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintFile" ADD CONSTRAINT "PrintFile_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "PrintOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

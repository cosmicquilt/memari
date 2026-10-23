-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "clientsPay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "markupCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "payoutsReady" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeAccountId" TEXT;

-- AlterTable
ALTER TABLE "PrintOrder" ADD COLUMN     "markupCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paidByClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutAccountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_stripeAccountId_key" ON "Business"("stripeAccountId");


-- AlterTable
ALTER TABLE "BusinessClient" ADD COLUMN     "accessMadeAt" TIMESTAMP(3),
ADD COLUMN     "accessSeenAt" TIMESTAMP(3),
ADD COLUMN     "accessTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessClient_accessTokenHash_key" ON "BusinessClient"("accessTokenHash");


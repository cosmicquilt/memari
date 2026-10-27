-- CreateTable
CREATE TABLE "ClientLinkEmail" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientLinkEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientLinkEmail_businessId_createdAt_idx" ON "ClientLinkEmail"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClientLinkEmail" ADD CONSTRAINT "ClientLinkEmail_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;


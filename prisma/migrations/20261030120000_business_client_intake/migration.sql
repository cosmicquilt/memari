-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "intakeMadeAt" TIMESTAMP(3),
ADD COLUMN     "intakeTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Business_intakeTokenHash_key" ON "Business"("intakeTokenHash");


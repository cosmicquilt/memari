-- AlterTable
ALTER TABLE "BusinessClient" ADD COLUMN     "answers" JSONB,
ADD COLUMN     "answersAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BusinessTemplate" ADD COLUMN     "questions" JSONB;


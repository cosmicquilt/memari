-- CreateTable
CREATE TABLE "JournalAiRun" (
    "id" TEXT NOT NULL,
    "plannerId" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '[]',
    "eventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "afterHash" TEXT,
    "editedBetween" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "touchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "JournalAiRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalAiRun_plannerId_lastChangeAt_idx" ON "JournalAiRun"("plannerId", "lastChangeAt");

-- AddForeignKey
ALTER TABLE "JournalAiRun" ADD CONSTRAINT "JournalAiRun_plannerId_fkey" FOREIGN KEY ("plannerId") REFERENCES "Planner"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "EventOrigin" AS ENUM ('TYPED', 'IMPORTED', 'PHOTO');

-- CreateTable
CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "source" TEXT,
    "externalId" TEXT,
    "syncToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'UTC',
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "rrule" TEXT,
    "origin" "EventOrigin" NOT NULL DEFAULT 'TYPED',
    "externalId" TEXT,
    "etag" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "location" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEventOverride" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recurrenceId" TIMESTAMP(3) NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "CalendarEventOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenCalendar" (
    "plannerId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,

    CONSTRAINT "HiddenCalendar_pkey" PRIMARY KEY ("plannerId","calendarId")
);

-- CreateIndex
CREATE INDEX "Calendar_ownerId_idx" ON "Calendar"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Calendar_ownerId_source_externalId_key" ON "Calendar"("ownerId", "source", "externalId");

-- CreateIndex
CREATE INDEX "CalendarEvent_ownerId_startsAt_idx" ON "CalendarEvent"("ownerId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_calendarId_idx" ON "CalendarEvent"("calendarId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_calendarId_externalId_key" ON "CalendarEvent"("calendarId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventOverride_eventId_recurrenceId_key" ON "CalendarEventOverride"("eventId", "recurrenceId");

-- CreateIndex
CREATE INDEX "HiddenCalendar_calendarId_idx" ON "HiddenCalendar"("calendarId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventOverride" ADD CONSTRAINT "CalendarEventOverride_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenCalendar" ADD CONSTRAINT "HiddenCalendar_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "Calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

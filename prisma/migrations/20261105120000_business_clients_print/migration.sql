-- Clients may print their own book from their link (2026-11-05): the coach's
-- switch in Settings, beside who pays for books. Off by default.
ALTER TABLE "Business" ADD COLUMN "clientsMayPrint" BOOLEAN NOT NULL DEFAULT false;

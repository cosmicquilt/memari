-- Which printer an order went to (src/lib/print/printer.ts), and when its
-- renewal reminder email was sent (src/lib/print/emails.ts). Additive: every
-- existing order went to Lulu, which the default says.

-- AlterTable
ALTER TABLE "PrintOrder" ADD COLUMN     "printer" TEXT NOT NULL DEFAULT 'lulu',
ADD COLUMN     "renewalReminderSentAt" TIMESTAMP(3);

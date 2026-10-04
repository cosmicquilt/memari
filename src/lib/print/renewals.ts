// RENEWALS: the next book, ordered and paid for on its own. Server-only.
//
// "it should always default to auto renew off with the option to turn it
// on" (2026-10-04). An order with auto-renew on carries `renewsAt` - set when
// it went to print, early enough for the next book to arrive before this one
// runs out (orderRange.ts, renewalDate). Once a day (src/app/api/cron/
// renewals) every order whose day has come is renewed:
//
//   the next range - the same number of days, straight after - is built from
//   the journal AS IT IS NOW, priced by Lulu to the same address and post,
//   charged to the card saved with the order (off-session), and sent to
//   print. The renewal carries auto-renew on, so the chain continues; the
//   order it renewed stops showing a switch.
//
// Anything that stops a renewal - the journal deleted, the book now too
// thick for its binding, the card declined - becomes a FAILED renewal order
// with a reason written for the customer, and auto-renew goes off: the
// Orders page says what happened and that the next book must be ordered by
// hand. Nothing is retried on its own; a declined card charged again
// tomorrow is how people get angry.
//
// The world outside - Lulu and Stripe - comes in through `deps`, so the
// job can be checked against fakes (scripts/check-renewals.mts).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { bindingFromEnum, orderableTrim, BINDING_SPECS } from "./products";
import { availabilityAt, printerFor } from "./printer";
import { nextRange, type ShippingLevel } from "./orderRange";
import type { PrintCost, ShippingAddress } from "./lulu";
import { priceFromCost } from "./pricing";
import { buildCoverPdf } from "./cover";
import { buildInterior, loadJournal, rangeLabel, trimInches } from "./orderBook";
import { fulfilPaidOrder } from "./orders";
import { stripe } from "./stripe";
import { notify, renewalFailedEmail } from "./emails";
import { sendEmail, type EmailSender } from "@/lib/email";

export type ChargeResult = { ok: true; paymentIntentId: string } | { ok: false; reason: string };

export type RenewalDeps = {
  /** What the order's printer charges - `printer` is the order's own. */
  printCost: (printer: string, sku: string, pages: number, address: ShippingAddress, level: ShippingLevel) => Promise<PrintCost>;
  coverDimensions: (printer: string, sku: string, pages: number) => Promise<{ widthPt: number; heightPt: number }>;
  /** Charge the saved card, without the customer present. */
  charge: (input: { orderId: string; amountCents: number; customerId: string; paymentMethodId: string; email?: string; description: string }) => Promise<ChargeResult>;
  /** Send a paid order to print. */
  fulfil: (orderId: string, payment: { paymentIntentId: string; paymentMethodId: string }) => Promise<void>;
  /** Tell the customer a renewal was not ordered. */
  email: EmailSender;
};

export function liveDeps(origin: string): RenewalDeps {
  return {
    printCost: (printer, ...rest) => printerFor(printer).printCost(...rest),
    coverDimensions: (printer, ...rest) => printerFor(printer).coverSize(...rest),
    charge: async (input) => {
      try {
        const intent = await stripe().paymentIntents.create(
          {
            amount: input.amountCents,
            currency: "usd",
            customer: input.customerId,
            payment_method: input.paymentMethodId,
            off_session: true,
            confirm: true,
            description: input.description,
            ...(input.email ? { receipt_email: input.email } : {}),
            metadata: { orderId: input.orderId },
          },
          // One charge per renewal order, however many times this runs.
          { idempotencyKey: `renewal-${input.orderId}` }
        );
        if (intent.status === "succeeded") return { ok: true, paymentIntentId: intent.id };
        return { ok: false, reason: "your bank asked to confirm the payment, which can't be done automatically" };
      } catch (error) {
        const message = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error);
        return { ok: false, reason: `your card was declined (${message})` };
      }
    },
    fulfil: (orderId, payment) => fulfilPaidOrder(orderId, payment, origin),
    email: sendEmail,
  };
}

export type RenewalOutcome = { orderId: string; renewalId?: string; outcome: "renewed" | "failed" | "skipped"; detail?: string };

/** The orders whose renewal day has come, renewed. */
export async function runRenewals(now: Date, deps: RenewalDeps, limit = 25): Promise<RenewalOutcome[]> {
  const due = await prisma.printOrder.findMany({
    where: {
      autoRenew: true,
      renewsAt: { lte: now },
      // Only a book that really went to print renews.
      status: { in: ["SUBMITTED", "IN_PRODUCTION", "SHIPPED", "DELIVERED"] },
      renewals: { none: {} },
    },
    orderBy: { renewsAt: "asc" },
    take: limit,
  });
  const outcomes: RenewalOutcome[] = [];
  for (const order of due) {
    // CLAIMED before anything else, so two runs at once cannot both renew it:
    // only the one whose update still finds the date takes it.
    const claimed = await prisma.printOrder.updateMany({ where: { id: order.id, renewsAt: order.renewsAt }, data: { renewsAt: null } });
    if (claimed.count === 0) {
      outcomes.push({ orderId: order.id, outcome: "skipped", detail: "claimed by another run" });
      continue;
    }
    try {
      outcomes.push(await renewOne(order, deps));
    } catch (error) {
      // Something unexpected: say so on a renewal order, as for any failure.
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[print] renewal of ${order.id} failed:`, error);
      const renewalId = await failRenewal(order, "something went wrong ordering it, and nothing was charged", deps);
      outcomes.push({ orderId: order.id, renewalId, outcome: "failed", detail });
    }
  }
  return outcomes;
}

type Order = Awaited<ReturnType<typeof prisma.printOrder.findMany>>[number];

/** A FAILED renewal order saying why, auto-renew off on the order it was
 *  for. The reason is the customer's to read, and finishes a sentence that
 *  begins "This renewal was not ordered because". */
async function failRenewal(order: Order, reason: string, deps: RenewalDeps, details?: Partial<Prisma.PrintOrderUncheckedCreateInput>): Promise<string> {
  const range = nextRange({ start: order.startDate, end: order.endDate, days: order.days });
  const renewal = await prisma.printOrder.create({
    data: {
      ownerId: order.ownerId,
      plannerId: order.plannerId,
      title: order.title,
      startDate: range.start,
      endDate: range.end,
      days: range.days,
      binding: order.binding,
      podPackageId: order.podPackageId,
      pageCount: 0,
      shippingLevel: order.shippingLevel,
      shippingAddress: order.shippingAddress as Prisma.InputJsonValue,
      contactEmail: order.contactEmail,
      bookCents: 0,
      shippingCents: 0,
      totalCents: 0,
      costCents: 0,
      ...details,
      status: "FAILED",
      autoRenew: false,
      renewedFromId: order.id,
      failureReason: `This renewal was not ordered because ${reason}. Auto-renew is off; order the next book from your journal when you're ready.`,
    },
  });
  await prisma.printOrder.update({ where: { id: order.id }, data: { autoRenew: false, renewsAt: null } });
  await notify(renewalFailedEmail(renewal), deps.email);
  return renewal.id;
}

async function renewOne(order: Order, deps: RenewalDeps): Promise<RenewalOutcome> {
  const fail = async (reason: string) => ({ orderId: order.id, renewalId: await failRenewal(order, reason, deps), outcome: "failed" as const, detail: reason });

  if (!order.plannerId) return fail("its journal was deleted");
  if (!order.stripePaymentMethodId) return fail("no card was saved with the order");
  const settings = await prisma.ownerSettings.findUnique({ where: { ownerId: order.ownerId } });
  if (!settings?.stripeCustomerId) return fail("no card was saved with the order");
  const journal = await loadJournal(order.ownerId, order.plannerId);
  if (!journal) return fail("its journal was deleted");

  const range = nextRange({ start: order.startDate, end: order.endDate, days: order.days });
  const printer = printerFor(order.printer);
  const binding = bindingFromEnum(order.binding);
  const interior = buildInterior(journal, range, (pages) => printer.gutterInches(binding, pages));
  if (!orderableTrim(interior.trim)) return fail("the journal was switched to US Letter, which is printed at home");
  if (interior.problems.length > 0) return fail(`the book could not be made ready to print (${interior.problems.join("; ")})`);
  const fit = availabilityAt(printer, interior.bookPages).find((a) => a.binding === binding);
  if (!fit?.ok) return fail(`the next book has ${interior.pageCount} pages, more than ${BINDING_SPECS[binding].label.toLowerCase()} can hold`);

  const sku = printer.sku(binding, interior.trim)!;
  const address = order.shippingAddress as unknown as ShippingAddress;
  const level = order.shippingLevel as ShippingLevel;
  let cost: PrintCost;
  try {
    cost = await deps.printCost(order.printer, sku, interior.pageCount, address, level);
  } catch {
    return fail("the printer can no longer post it the same way to that address");
  }
  const price = priceFromCost(cost);
  const trim = trimInches(interior.trim);
  const dims = await deps.coverDimensions(order.printer, sku, interior.pageCount);
  const cover = buildCoverPdf({ ...dims, trimWidthIn: trim.widthIn, trimHeightIn: trim.heightIn, title: journal.title, dates: journal.dated ? rangeLabel(range) : "" });

  const renewal = await prisma.printOrder.create({
    data: {
      ownerId: order.ownerId,
      plannerId: order.plannerId,
      title: journal.title,
      startDate: range.start,
      endDate: range.end,
      days: range.days,
      binding: order.binding,
      podPackageId: sku,
      printer: order.printer,
      pageCount: interior.pageCount,
      shippingLevel: order.shippingLevel,
      shippingAddress: order.shippingAddress as Prisma.InputJsonValue,
      contactEmail: order.contactEmail,
      bookCents: price.bookCents,
      shippingCents: price.shippingCents,
      totalCents: price.totalCents,
      currency: price.currency,
      costCents: price.costCents,
      autoRenew: true,
      renewedFromId: order.id,
      files: {
        create: [
          { kind: "interior", bytes: new Uint8Array(interior.bytes) },
          { kind: "cover", bytes: new Uint8Array(cover.bytes) },
        ],
      },
    },
  });

  const charged = await deps.charge({
    orderId: renewal.id,
    amountCents: price.totalCents,
    customerId: settings.stripeCustomerId,
    paymentMethodId: order.stripePaymentMethodId,
    email: order.contactEmail ?? undefined,
    description: `${journal.title} - printed journal, ${rangeLabel(range)} (auto-renewal)`,
  });
  // Auto-renew moves to the renewal either way; this order is done.
  await prisma.printOrder.update({ where: { id: order.id }, data: { autoRenew: false, renewsAt: null } });
  if (!charged.ok) {
    const failed = await prisma.printOrder.update({
      where: { id: renewal.id },
      data: {
        status: "FAILED",
        autoRenew: false,
        failureReason: `This renewal was not ordered because ${charged.reason}. Nothing was charged. Auto-renew is off; order the next book from your journal when you're ready.`,
      },
    });
    await notify(renewalFailedEmail(failed), deps.email);
    return { orderId: order.id, renewalId: renewal.id, outcome: "failed", detail: charged.reason };
  }
  await deps.fulfil(renewal.id, { paymentIntentId: charged.paymentIntentId, paymentMethodId: order.stripePaymentMethodId });
  return { orderId: order.id, renewalId: renewal.id, outcome: "renewed" };
}

/** Print files kept a year after their book is delivered or cancelled -
 *  long enough to reprint a damaged one - then deleted, as the privacy
 *  page says. The order itself is kept. */
export async function pruneOldPrintFiles(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 365 * 86_400_000);
  const deleted = await prisma.printFile.deleteMany({
    where: { order: { status: { in: ["DELIVERED", "CANCELED"] }, updatedAt: { lt: cutoff } } },
  });
  // Abandoned checkouts - priced, never paid - keep nothing past a month.
  const abandoned = await prisma.printFile.deleteMany({
    where: { order: { status: "QUOTED", createdAt: { lt: new Date(now.getTime() - 30 * 86_400_000) } } },
  });
  return deleted.count + abandoned.count;
}

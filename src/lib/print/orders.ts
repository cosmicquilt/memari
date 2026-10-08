// ORDERS: from a price on the screen to a book at the printer. Server-only.
//
//   quoteOrder       the book for the chosen days, which bindings can hold
//                    it and the lowest price of each, and every shipping
//                    level the chosen binding's printer offers the address,
//                    priced (pricing.ts) - nothing stored
//   startCheckout    priced again here (a price from the browser is never
//                    trusted), the interior and cover built and stored with
//                    a QUOTED order, and Stripe's payment page opened
//   fulfilPaidOrder  once Stripe says it is paid: PAID, then a print job at
//                    the binding's printer - which charges us - and SUBMITTED
//   applyLuluStatus  Lulu's word on where the book is; BookVault's is read
//                    back from its API (refreshBookVaultOrder)
//   cancelByCustomer the customer stops their own book, while the printer
//                    has not begun it - the printer asked first, the money
//                    back only if it agrees
//
// Every step is safe to repeat: a webhook delivered twice finds the order
// already past the step and does nothing.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BINDING_ENUM, BINDING_SPECS, BINDINGS, bindingFromEnum, orderableTrim, shippedAbroad, type Binding, type BindingAvailability } from "./products";
import { DEFAULT_PRINTER, availability, printerFor, printerForBinding, type ShippingQuote } from "./printer";
import { orderRange, renewalDate, type OrderRange, type ShippingLevel } from "./orderRange";
import { LULU_STOPPABLE, type PrintJob, type ShippingAddress } from "./lulu";
import { BookVaultError, bookVaultReport, getBookVaultOrder, type JobReport } from "./bookvault";
import type { PlannerTrimKey } from "@/lib/planner-trims";
import { priceFromCost, type Price } from "./pricing";
import { buildCoverPdf } from "./cover";
import { buildInterior, loadJournal, OrderError, rangeLabel, trimInches } from "./orderBook";
import { printFileUrl } from "./fileUrls";
import { stripe, stripeConfigured } from "./stripe";
import { adminAlertEmail, cancelledEmail, notify, placedEmail, shippedEmail } from "./emails";
import { sendEmail, type EmailSender } from "@/lib/email";

export { OrderError };

export { SHIPPING_LABELS } from "./orderRange";

export type OrderInput = {
  journalId: string;
  /** "2027-01-04" - the first day the book covers. */
  startISO: string;
  days: number;
  binding: Binding;
  address: ShippingAddress;
};

export type Quote = {
  /** The binding the shipping options are for. */
  binding: Binding;
  range: { startISO: string; endISO: string; days: number; label: string };
  pageCount: number;
  availability: BindingAvailability[];
  /** The lowest price, post included, of every binding that can be had, to
   *  this address - each binding's cost on the screen ("list every binding
   *  cost", 2026-10-08). A binding missing here could not be priced. */
  fromPrices: Partial<Record<Binding, number>>;
  /** Every level the binding's printer will post this book by, priced.
   *  Empty when the chosen binding cannot hold the book. */
  options: Array<{ level: ShippingLevel; label: string; price: Price; arrives?: { earliest: string; latest: string } }>;
  /** Who prints it and how long it takes, in a sentence. */
  note: string;
};

/** Is ordering switched on here? Both services' keys must be set. */
export function orderingConfigured(): { ok: boolean; missing: string[] } {
  const missing = [...(DEFAULT_PRINTER.configured() ? [] : [DEFAULT_PRINTER.label]), ...(stripeConfigured() ? [] : ["Stripe"])];
  return { ok: missing.length === 0, missing };
}

function parseStart(startISO: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startISO);
  if (!match) throw new OrderError("Choose the day the book starts.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** The address, checked for what every carrier needs - Lulu says the rest. */
export function cleanAddress(raw: ShippingAddress): ShippingAddress {
  const text = (value: unknown, max = 100) => (typeof value === "string" ? value.trim().slice(0, max) : "");
  const address: ShippingAddress = {
    name: text(raw.name),
    street1: text(raw.street1),
    street2: text(raw.street2) || undefined,
    city: text(raw.city),
    stateCode: text(raw.stateCode, 10).toUpperCase() || undefined,
    countryCode: text(raw.countryCode, 2).toUpperCase(),
    postcode: text(raw.postcode, 20),
    phoneNumber: text(raw.phoneNumber, 30),
    email: text(raw.email, 200) || undefined,
  };
  const missing = [
    !address.name && "name",
    !address.street1 && "street",
    !address.city && "city",
    !/^[A-Z]{2}$/.test(address.countryCode) && "country",
    !address.postcode && "postcode",
    !address.phoneNumber && "phone number (carriers ask for one)",
  ].filter(Boolean);
  if (missing.length > 0) throw new OrderError(`The address needs a ${missing.join(", ")}.`);
  return address;
}

/** A printer's refusal to make a book is the customer's to hear, as for any
 *  other reason it cannot be ordered; anything else is a fault. */
function asOrderError(error: unknown): unknown {
  return error instanceof BookVaultError && error.refusal ? new OrderError(error.message) : error;
}

async function priced(input: OrderInput, ownerId: string) {
  const configured = orderingConfigured();
  if (!configured.ok) throw new OrderError(`Ordering is not switched on yet: the ${configured.missing.join(" and ")} keys are not set.`);
  if (!BINDINGS.includes(input.binding)) throw new OrderError("Choose a binding.");
  const journal = await loadJournal(ownerId, input.journalId);
  if (!journal) throw new OrderError("That journal could not be found.");
  const range = orderRange(parseStart(input.startISO), input.days);
  // The binding's printer: its binding margin shapes the interior.
  const printer = printerForBinding(input.binding);
  const interior = buildInterior(journal, range, (pages) => printer.gutterInches(input.binding, pages));
  if (!orderableTrim(interior.trim)) {
    throw new OrderError("This journal is laid out at US Letter, the print-at-home size. Switch it to 7 × 10 in Page Settings to order it printed.");
  }
  if (interior.problems.length > 0) throw new OrderError(`This book is not ready to print: ${interior.problems.join("; ")}.`);
  const bindings = availability(interior.bookPages);
  const fits = bindings.find((a) => a.binding === input.binding)?.ok ?? false;
  const sku = fits ? printer.sku(input.binding, interior.trim) : null;
  const address = cleanAddress(input.address);
  const problem = fits ? printer.addressProblem(address) : null;
  if (problem) throw new OrderError(problem);
  let quotes: ShippingQuote[] = [];
  if (fits && sku) {
    try {
      quotes = await printer.quoteShipping(sku, interior.pageCount, address, printer.levels);
    } catch (error) {
      throw asOrderError(error);
    }
    if (quotes.length === 0) throw new OrderError(`${printer.label} cannot post to that address. Check the country and postcode.`);
  }
  return { journal, range, interior, availability: bindings, sku: sku ?? "", address, quotes, printer };
}

/** The lowest price of each other binding that can be had, to this address:
 *  its printer asked at its cheapest levels only. One that cannot be priced
 *  - a refusal, the printer not answering - is left out, not an error: the
 *  chosen binding's quote is what is being asked for. */
async function otherBindingPrices(
  chosen: Binding,
  bindings: BindingAvailability[],
  interior: { trim: PlannerTrimKey; pageCount: number },
  address: ShippingAddress
): Promise<Partial<Record<Binding, number>>> {
  const prices: Partial<Record<Binding, number>> = {};
  await Promise.all(
    bindings
      .filter((fit) => fit.ok && fit.binding !== chosen)
      .map(async ({ binding }) => {
        const printer = printerForBinding(binding);
        const sku = printer.sku(binding, interior.trim);
        if (!sku || printer.addressProblem(address)) return;
        try {
          const quotes = await printer.quoteShipping(sku, interior.pageCount, address, printer.cheapestLevels);
          const lowest = Math.min(...quotes.map((quote) => priceFromCost(quote.cost).totalCents));
          if (Number.isFinite(lowest)) prices[binding] = lowest;
        } catch (error) {
          console.error(`[print] pricing ${binding} for the binding list failed:`, error);
        }
      })
  );
  return prices;
}

function describeRange(range: OrderRange) {
  return { startISO: range.start.toISOString().slice(0, 10), endISO: range.end.toISOString().slice(0, 10), days: range.days, label: rangeLabel(range) };
}

export async function quoteOrder(ownerId: string, input: OrderInput): Promise<Quote> {
  const { range, interior, availability, quotes, address, printer } = await priced(input, ownerId);
  const options = quotes.map(({ level, cost, label, arrives }) => ({
    level,
    label: label ?? printer.levelLabel(level),
    price: priceFromCost(cost),
    ...(arrives ? { arrives } : {}),
  }));
  const fromPrices = await otherBindingPrices(input.binding, availability, interior, address);
  if (options.length > 0) fromPrices[input.binding] = Math.min(...options.map((option) => option.price.totalCents));
  return {
    binding: input.binding,
    range: describeRange(range),
    pageCount: interior.pageCount,
    availability,
    fromPrices,
    options,
    note: printer.note(address),
  };
}

/** The person's customer at Stripe, made the first time they order. */
async function stripeCustomer(ownerId: string, email: string | undefined, name: string): Promise<string> {
  const settings = await prisma.ownerSettings.findUnique({ where: { ownerId } });
  if (settings?.stripeCustomerId) return settings.stripeCustomerId;
  const customer = await stripe().customers.create({ email, name, metadata: { ownerId } });
  await prisma.ownerSettings.upsert({
    where: { ownerId },
    create: { ownerId, stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

/**
 * Price the order again, keep its files with a QUOTED order, and open
 * Stripe's payment page for it. Returns the page's address.
 */
export async function startCheckout(
  ownerId: string,
  input: OrderInput & { level: ShippingLevel; autoRenew: boolean; email?: string },
  origin: string
): Promise<{ url: string; orderId: string }> {
  const { journal, range, interior, availability, sku, address, quotes, printer } = await priced(input, ownerId);
  const fit = availability.find((a) => a.binding === input.binding);
  if (!fit?.ok) throw new OrderError(fit && !fit.ok ? fit.reason : "Choose a binding.");
  const chosen = quotes.find((q) => q.level === input.level);
  if (!chosen) throw new OrderError("That shipping option is not available to this address. Choose another.");
  const price = priceFromCost(chosen.cost);
  const shippingName = chosen.label ?? printer.levelLabel(input.level);

  const trim = trimInches(interior.trim);
  const dims = await printer.coverSize(sku, interior.pageCount);
  const cover = buildCoverPdf({
    ...dims,
    form: printer.coverForm,
    trimWidthIn: trim.widthIn,
    trimHeightIn: trim.heightIn,
    title: journal.title,
    dates: journal.dated ? rangeLabel(range) : "",
  });

  const contactEmail = input.email || address.email;
  const order = await prisma.printOrder.create({
    data: {
      ownerId,
      plannerId: journal.id,
      title: journal.title,
      startDate: range.start,
      endDate: range.end,
      days: range.days,
      binding: BINDING_ENUM[input.binding],
      podPackageId: sku,
      printer: printer.id,
      pageCount: interior.pageCount,
      shippingLevel: input.level,
      shippingAddress: address as unknown as Prisma.InputJsonValue,
      contactEmail,
      bookCents: price.bookCents,
      shippingCents: price.shippingCents,
      totalCents: price.totalCents,
      currency: price.currency,
      costCents: price.costCents,
      autoRenew: input.autoRenew,
      files: {
        create: [
          { kind: "interior", bytes: new Uint8Array(interior.bytes) },
          { kind: "cover", bytes: new Uint8Array(cover.bytes) },
        ],
      },
    },
  });

  const customer = await stripeCustomer(ownerId, contactEmail, address.name);
  const spec = BINDING_SPECS[input.binding];
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer,
    client_reference_id: order.id,
    metadata: { orderId: order.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: price.bookCents,
          product_data: { name: `${journal.title} - printed journal`, description: `${spec.label}, ${rangeLabel(range)}, ${interior.pageCount} pages` },
        },
      },
      {
        quantity: 1,
        price_data: { currency: "usd", unit_amount: price.shippingCents, product_data: { name: `Shipping - ${shippingName}` } },
      },
    ],
    payment_intent_data: {
      metadata: { orderId: order.id },
      // The card is kept only when the person asked for renewals.
      ...(input.autoRenew ? { setup_future_usage: "off_session" as const } : {}),
    },
    ...(input.autoRenew
      ? { custom_text: { submit: { message: "Auto-renew is on: your card is saved to order the next book, at its own price, before this one runs out. Turn it off any time under Orders." } } }
      : {}),
    success_url: `${origin}/app/account/orders?placed=${order.id}`,
    cancel_url: `${origin}/app/j/${journal.slug ?? journal.id}`,
  });
  await prisma.printOrder.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
  if (!session.url) throw new OrderError("Stripe did not open a payment page. Try again.");
  return { url: session.url, orderId: order.id };
}

/** Paid: send it to print. Safe to call again - an order past QUOTED/PAID
 *  is left alone. */
export async function fulfilPaidOrder(orderId: string, payment: { paymentIntentId?: string; paymentMethodId?: string }, origin: string): Promise<void> {
  // QUOTED -> PAID, once: the update only matches an order still QUOTED.
  await prisma.printOrder.updateMany({
    where: { id: orderId, status: "QUOTED" },
    data: { status: "PAID", stripePaymentIntentId: payment.paymentIntentId, stripePaymentMethodId: payment.paymentMethodId },
  });
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  if (!order || order.status !== "PAID" || order.luluPrintJobId) return;
  try {
    const job = await printerFor(order.printer).submit({
      externalId: order.id,
      title: order.title,
      sku: order.podPackageId,
      pages: order.pageCount,
      interiorUrl: printFileUrl(origin, order.id, "interior"),
      coverUrl: printFileUrl(origin, order.id, "cover"),
      address: order.shippingAddress as unknown as ShippingAddress,
      level: order.shippingLevel as ShippingLevel,
      contactEmail: order.contactEmail ?? (order.shippingAddress as unknown as ShippingAddress).email ?? "",
    });
    const range = { start: order.startDate, end: order.endDate, days: order.days };
    const address = order.shippingAddress as unknown as ShippingAddress;
    const submitted = await prisma.printOrder.update({
      where: { id: order.id },
      data: {
        status: "SUBMITTED",
        // The column says Lulu for history; it holds the job's id at
        // whichever printer the order went to (`printer`).
        luluPrintJobId: job.jobId,
        luluStatus: job.status,
        renewsAt: order.autoRenew ? renewalDate(range, order.shippingLevel as ShippingLevel, shippedAbroad(bindingFromEnum(order.binding), address.countryCode), new Date()) : null,
      },
    });
    await notify(placedEmail(submitted));
    // Placed, but something of ours stands in its way (BookVault waiting
    // for payment): ours to see to, so the alert, and the order stays with
    // the printer.
    if (job.attention) await notify(adminAlertEmail(submitted, job.attention));
  } catch (error) {
    const reason = `Paid, but the printer refused the job: ${error instanceof Error ? error.message : String(error)}`;
    await prisma.printOrder.update({ where: { id: order.id }, data: { status: "FAILED", failureReason: reason } });
    await notify(adminAlertEmail(order, reason));
    throw error;
  }
}

const LULU_TO_STATUS: Record<string, "SUBMITTED" | "IN_PRODUCTION" | "SHIPPED" | "DELIVERED" | "CANCELED" | "FAILED"> = {
  CREATED: "SUBMITTED",
  UNPAID: "SUBMITTED",
  PAYMENT_IN_PROGRESS: "SUBMITTED",
  PRODUCTION_DELAYED: "SUBMITTED",
  PRODUCTION_READY: "SUBMITTED",
  IN_PRODUCTION: "IN_PRODUCTION",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELED: "CANCELED",
  REJECTED: "FAILED",
  ERROR: "FAILED",
};

/** Lulu's report on a print job, onto its order. */
export async function applyLuluStatus(job: PrintJob): Promise<void> {
  await applyJobStatus(String(job.id), {
    name: job.status?.name ?? null,
    status: LULU_TO_STATUS[job.status?.name ?? ""],
    tracking: (job.line_items ?? []).flatMap((item) => item.tracking_urls ?? []),
    message: job.status?.message,
  });
}

/** BookVault's word on an order, read back from its API rather than taken
 *  from the webhook that prompted it (bookvault.ts: they are not signed).
 *  Found by its job id, else by our own id, which BookVault holds as its
 *  docRef. */
export async function refreshBookVaultOrder(ref: { podRef?: string; docRef?: string }): Promise<boolean> {
  const match = [...(ref.podRef ? [{ luluPrintJobId: ref.podRef }] : []), ...(ref.docRef ? [{ id: ref.docRef }] : [])];
  if (match.length === 0) return false;
  const order = await prisma.printOrder.findFirst({ where: { printer: "bookvault", OR: match } });
  if (!order?.luluPrintJobId) return false;
  await applyJobStatus(order.luluPrintJobId, bookVaultReport(await getBookVaultOrder(order.luluPrintJobId)));
  return true;
}

/** BookVault sends no event when an order fails, and webhooks can be missed:
 *  the daily cron reads back every BookVault order still on its way. */
export async function refreshBookVaultOrders(limit = 20): Promise<number> {
  const open = await prisma.printOrder.findMany({
    where: { printer: "bookvault", status: { in: ["SUBMITTED", "IN_PRODUCTION"] }, luluPrintJobId: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
  let read = 0;
  for (const order of open) {
    try {
      await applyJobStatus(order.luluPrintJobId!, bookVaultReport(await getBookVaultOrder(order.luluPrintJobId!)));
      read += 1;
    } catch (error) {
      console.error(`[print] reading BookVault order ${order.luluPrintJobId} back failed:`, error);
    }
  }
  return read;
}

/** A printer's report on a job, onto its order - and the email when it
 *  ships (or the alert when the printer gives up on it), sent on the CHANGE
 *  only: a printer may report the same status twice, and the conditional
 *  update below lets just one delivery through. */
export async function applyJobStatus(jobId: string, report: JobReport): Promise<void> {
  const { status, tracking } = report;
  const said = `${report.name ?? "a problem"}${report.message ? `: ${report.message}` : ""}`;
  if (status === "SHIPPED" || status === "FAILED") {
    const before = await prisma.printOrder.findFirst({ where: { luluPrintJobId: jobId } });
    const moved = await prisma.printOrder.updateMany({
      where: { luluPrintJobId: jobId, status: { notIn: status === "SHIPPED" ? ["SHIPPED", "DELIVERED"] : ["FAILED"] } },
      data: { status, ...(tracking.length > 0 ? { trackingUrls: tracking } : {}) },
    });
    if (before && moved.count > 0) {
      if (status === "SHIPPED") await notify(shippedEmail(before, tracking));
      else await notify(adminAlertEmail(before, `The printer reported ${said}.`));
    }
  }
  await prisma.printOrder.updateMany({
    where: { luluPrintJobId: jobId },
    data: {
      luluStatus: report.name,
      ...(tracking.length > 0 ? { trackingUrls: tracking } : {}),
    },
  });
  // A cancelled order stays cancelled: a printer's news can arrive out of order,
  // and a late "waiting to print" must not bring back a book that was
  // stopped and refunded.
  if (!status) return;
  await prisma.printOrder.updateMany({
    where: { luluPrintJobId: jobId, status: { not: "CANCELED" } },
    data: {
      status,
      ...(status === "FAILED" ? { failureReason: `The printer reported ${said}.` } : {}),
    },
  });
}

/** Lulu's statuses in which a job can still be stopped (lulu.ts). Each
 *  printer has its own: Printer.stoppable. */
export const STOPPABLE_AT_PRINTER = LULU_STOPPABLE;

/** Can the customer cancel this order themselves? While it is with the
 *  printer and the printer has not begun it - as far as we have heard. The
 *  printer has the last word (cancelByCustomer). A PAID order not yet sent
 *  is seconds from being sent, and one that failed is ours to sort out; the
 *  admin page refunds those. */
export function customerCanCancel(order: { status: string; luluPrintJobId: string | null; luluStatus: string | null; stripePaymentIntentId: string | null; printer?: string | null }): boolean {
  if (order.status !== "SUBMITTED" || !order.luluPrintJobId || !order.stripePaymentIntentId) return false;
  let stoppable: ReadonlySet<string>;
  try {
    stoppable = printerFor(order.printer).stoppable;
  } catch {
    return false;
  }
  return order.luluStatus === null || stoppable.has(order.luluStatus);
}

export type CancelDeps = {
  /** Stop the job; throws if the printer has begun it. */
  stopAtPrinter: (printerId: string, jobId: string) => Promise<void>;
  /** All of the payment back. */
  refund: (paymentIntentId: string, orderId: string) => Promise<void>;
  email: EmailSender;
};

export function liveCancelDeps(): CancelDeps {
  return {
    stopAtPrinter: (printerId, jobId) => printerFor(printerId).cancel(jobId),
    // The same key as the admin's refund (admin.ts): whoever presses first,
    // the payment is refunded once.
    refund: async (paymentIntentId, orderId) => {
      await stripe().refunds.create({ payment_intent: paymentIntentId }, { idempotencyKey: `refund-${orderId}` });
    },
    email: sendEmail,
  };
}

const AFTERWARDS = "If something is wrong with it when it arrives, tell us and we'll put it right.";
/** What we know: the printer has said it began. */
const STARTED = `The printer has started on this book, so it can no longer be stopped. ${AFTERWARDS}`;
/** What the printer's refusal says - nearly always that it began, but it
 *  may be the printer not answering, so the words do not claim more. */
const REFUSED = `The printer could not stop this book - almost always because it has started printing it, and then it can no longer be stopped. ${AFTERWARDS}`;

/**
 * THE CUSTOMER CANCELS their own book. The printer is asked FIRST, and the
 * money goes back only if it agrees: a book that will be printed anyway is
 * not refunded here - that is the terms' "after that it cannot be stopped".
 * Once stopped, the order is CANCELED, auto-renew off, and the whole payment
 * refunded. A refund that fails is told to us to make by hand, and to the
 * customer plainly; the book is stopped either way.
 */
export async function cancelByCustomer(ownerId: string, orderId: string, deps: CancelDeps = liveCancelDeps()): Promise<void> {
  const order = await prisma.printOrder.findFirst({ where: { id: orderId, ownerId } });
  if (!order) throw new OrderError("That order could not be found.");
  if (order.status === "CANCELED") throw new OrderError("This order is already cancelled.");
  if (!customerCanCancel(order)) throw new OrderError(STARTED);
  try {
    await deps.stopAtPrinter(order.printer, order.luluPrintJobId!);
  } catch (error) {
    console.error(`[print] the printer would not cancel ${order.id}:`, error);
    throw new OrderError(REFUSED);
  }
  const day = new Date().toISOString().slice(0, 10);
  // Cancelled once, however many times it is pressed: only the press that
  // moves the order sends the email.
  const moved = await prisma.printOrder.updateMany({
    where: { id: order.id, status: { not: "CANCELED" } },
    data: { status: "CANCELED", luluStatus: "CANCELED", autoRenew: false, renewsAt: null, failureReason: `Cancelled by the customer ${day}.` },
  });
  try {
    await deps.refund(order.stripePaymentIntentId!, order.id);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    await prisma.printOrder.update({ where: { id: order.id }, data: { failureReason: `Cancelled by the customer ${day}; the refund failed and must be made by hand: ${why}` } });
    await notify(adminAlertEmail(order, `The customer cancelled and the printer stopped it, but the refund failed: ${why}. Refund it from Stripe.`), deps.email);
    throw new OrderError("Your book is stopped. The refund did not go through straight away - we have been told, and will make it by hand within two business days.");
  }
  if (moved.count > 0) await notify(cancelledEmail(order), deps.email);
}

export { orderRange };

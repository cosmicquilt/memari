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
// already past the step and does nothing - and one delivered twice AT ONCE
// finds it claimed (fulfilPaidOrder, SENDING; review, 2026-10-27).

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BINDING_ENUM, BINDING_SPECS, BINDINGS, bindingDescription, bindingFromEnum, orderableTrim, paperFor, shippedAbroad, type Binding, type BindingAvailability, type PaperColour } from "./products";
import { DEFAULT_PRINTER, availability, printerFor, printerForBinding, type ShippingQuote } from "./printer";
import { orderRange, renewalDate, type OrderRange, type ShippingLevel } from "./orderRange";
import { LULU_STOPPABLE, type PrintJob, type ShippingAddress } from "./lulu";
import { BookVaultError, bookVaultReport, getBookVaultOrder, type JobReport } from "./bookvault";
import type { PlannerTrimKey } from "@/lib/planner-trims";
import { priceFromCost, type Price } from "./pricing";
import { clientSessionParams, payerProblem, refundParams, withMarkup, type ClientPayer } from "./clientPays";
import { buildCoverPdf } from "./cover";
import { coverBrandFor } from "@/lib/print/coverBrand";
import { buildInterior, loadJournal, OrderError, rangeLabel, trimInches } from "./orderBook";
import { printFileUrl } from "./fileUrls";
import { stripe, stripeConfigured } from "./stripe";
import { adminAlertEmail, bankPaymentFailedEmail, cancelledEmail, notify, placedEmail, shippedEmail } from "./emails";
import { sendEmail, type EmailSender } from "@/lib/email";
import { PRINTER_CANCELLED, REFUND_BY_HAND } from "./refundDue";
import { HOLDS_DAYS } from "./holdsDays";

export { OrderError };

export { SHIPPING_LABELS } from "./orderRange";

export type OrderInput = {
  journalId: string;
  /** "2027-01-04" - the first day the book covers. */
  startISO: string;
  days: number;
  binding: Binding;
  /** Cream or white, where the binding has both (paperback, hardcover);
   *  cream unless asked. */
  paper?: PaperColour;
  address: ShippingAddress;
};

export type Quote = {
  /** The binding the shipping options are for, and its paper. */
  binding: Binding;
  paper: PaperColour;
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

export function parseStart(startISO: string): Date {
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
export function asOrderError(error: unknown): unknown {
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
  const paper = paperFor(input.binding, input.paper);
  const sku = fits ? printer.sku(input.binding, interior.trim, paper) : null;
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
  return { journal, range, interior, availability: bindings, sku: sku ?? "", address, quotes, printer, paper };
}

/** The lowest price of each other binding that can be had, to this address:
 *  its printer asked at its cheapest levels only. One that cannot be priced
 *  - a refusal, the printer not answering - is left out, not an error: the
 *  chosen binding's quote is what is being asked for. */
async function otherBindingPrices(
  chosen: Binding,
  bindings: BindingAvailability[],
  interior: { trim: PlannerTrimKey; pageCount: number },
  address: ShippingAddress,
  paper: PaperColour | undefined
): Promise<Partial<Record<Binding, number>>> {
  const prices: Partial<Record<Binding, number>> = {};
  await Promise.all(
    bindings
      .filter((fit) => fit.ok && fit.binding !== chosen)
      .map(async ({ binding }) => {
        const printer = printerForBinding(binding);
        const sku = printer.sku(binding, interior.trim, paperFor(binding, paper));
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
  const { range, interior, availability, quotes, address, printer, paper } = await priced(input, ownerId);
  const options = quotes.map(({ level, cost, label, arrives }) => ({
    level,
    label: label ?? printer.levelLabel(level),
    price: priceFromCost(cost),
    ...(arrives ? { arrives } : {}),
  }));
  const fromPrices = await otherBindingPrices(input.binding, availability, interior, address, input.paper);
  if (options.length > 0) fromPrices[input.binding] = Math.min(...options.map((option) => option.price.totalCents));
  return {
    binding: input.binding,
    paper,
    range: describeRange(range),
    pageCount: interior.pageCount,
    availability,
    fromPrices,
    options,
    note: printer.note(address),
  };
}

/** The person's customer at Stripe, made the first time they order. */
export async function stripeCustomer(ownerId: string, email: string | undefined, name: string): Promise<string> {
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

/** The price or the dates moved between what a client was shown and what
 *  would be charged: nothing is made, and their page asks for prices again. */
export class PriceMovedError extends OrderError {}

/** What an order is made with: its days, binding, address and post, and
 *  whether it renews. */
export type CheckoutInput = OrderInput & { level: ShippingLevel; autoRenew: boolean; email?: string };

/**
 * One book priced again, its two files built and kept with a QUOTED order:
 * what a payment page is opened for - one book's (startCheckout) or a
 * group's, opened once each of its books is made (groupOrders.ts, `batchId`).
 * Nothing is made when the price is not `expectTotalCents` (or the payer's).
 */
export async function makeQuotedOrder(ownerId: string, input: CheckoutInput, opts: { payer?: ClientPayer; batchId?: string; expectTotalCents?: number } = {}) {
  const { payer } = opts;
  const { journal, range, interior, availability, sku, address, quotes, printer } = await priced(input, ownerId);
  const fit = availability.find((a) => a.binding === input.binding);
  if (!fit?.ok) throw new OrderError(fit && !fit.ok ? fit.reason : "Choose a binding.");
  const chosen = quotes.find((q) => q.level === input.level);
  if (!chosen) throw new OrderError("That shipping option is not available to this address. Choose another.");
  const price = payer ? withMarkup(priceFromCost(chosen.cost), payer.markupCents) : priceFromCost(chosen.cost);
  // what the payer was shown is what they pay, or nothing is made
  const expect = opts.expectTotalCents ?? payer?.expectTotalCents;
  if (expect !== undefined && expect !== price.totalCents) throw new PriceMovedError("The price has changed since you saw it. See prices again.");
  const share = payer && payer.markupCents > 0 ? payer.markupCents : 0;
  const shippingName = chosen.label ?? printer.levelLabel(input.level);

  const trim = trimInches(interior.trim);
  const dims = await printer.coverSize(sku, interior.pageCount);
  const cover = buildCoverPdf({
    ...dims,
    form: printer.coverForm,
    safeIn: BINDING_SPECS[input.binding].coverSafeIn,
    trimWidthIn: trim.widthIn,
    trimHeightIn: trim.heightIn,
    title: journal.title,
    dates: journal.dated ? rangeLabel(range) : "",
    brand: await coverBrandFor(journal.id),
  });

  const contactEmail = payer ? payer.email : input.email || address.email;
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
      autoRenew: payer || opts.batchId ? false : input.autoRenew,
      paidByClient: !!payer,
      markupCents: share,
      payoutAccountId: share ? payer!.destination : null,
      batchId: opts.batchId ?? null,
      files: {
        create: [
          { kind: "interior", bytes: new Uint8Array(interior.bytes) },
          { kind: "cover", bytes: new Uint8Array(cover.bytes) },
        ],
      },
    },
  });
  const description = `${bindingDescription(input.binding, sku)}, ${rangeLabel(range)}, ${interior.pageCount} pages`;
  return { order, journal, range, price, description, shippingName, contactEmail, address };
}

/**
 * Price the order again, keep its files with a QUOTED order, and open
 * Stripe's payment page for it. Returns the page's address.
 *
 * `payer`: a coach's client paying from their own page (clientPays.ts) -
 * the order stays the owner's (the journal is theirs), the price carries
 * the coach's share, the receipt goes to the client, nothing renews, and
 * with a share the payment is a destination charge to the coach.
 */
export async function startCheckout(ownerId: string, input: CheckoutInput, origin: string, payer?: ClientPayer): Promise<{ url: string; orderId: string }> {
  // a book paid for these days from now on, while this one is built, stops
  // this page being handed out (closeOverlappingPages); a client's dates were
  // worked out a moment earlier, and count from then
  const startedAt = payer?.startedAt ?? new Date();
  if (payer) {
    const problem = payerProblem(payer);
    if (problem) throw new OrderError(problem);
  }
  const { order, journal, price, description, shippingName, contactEmail, address } = await makeQuotedOrder(ownerId, input, { payer });

  if (payer) {
    const session = await stripe().checkout.sessions.create(
      clientSessionParams({ orderId: order.id, title: journal.title, description, shippingName, price, payer, expiresAt: Math.floor(Date.now() / 1000) + 23 * 60 * 60 })
    );
    await prisma.printOrder.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: session.id } });
    if (!session.url) throw new OrderError("Stripe did not open a payment page. Try again.");
    // only this page can be paid for these days (throws if another just was)
    await closeOverlappingPages(order.id, startedAt);
    // The client's page is open for these days: the owner's own renewals of
    // this journal end now, not only once the payment lands (second review)
    // - but only once the page really exists, so a Stripe failure leaves
    // them as they were (third review, 2026-10-23).
    await prisma.printOrder.updateMany({ where: { plannerId: journal.id, id: { not: order.id }, autoRenew: true }, data: { autoRenew: false, renewsAt: null } });
    return { url: session.url, orderId: order.id };
  }
  const customer = await stripeCustomer(ownerId, contactEmail, address.name);
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
          product_data: { name: `${journal.title} - printed journal`, description },
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
  await closeOverlappingPages(order.id, startedAt);
  return { url: session.url, orderId: order.id };
}

/** Stripe's payment pages, as closeOverlappingPages needs them: close one,
 *  or read whether it was paid. check:renewals fakes them. */
export type PageDeps = {
  /** Close it; Stripe's status for it after. */
  expire: (sessionId: string) => Promise<string | null>;
  /** Its status: "open", "complete" or "expired". */
  status: (sessionId: string) => Promise<string | null>;
};

const PAGE_CALL = { timeout: 8000, maxNetworkRetries: 1 };

export function livePageDeps(): PageDeps {
  return {
    expire: async (id) => (await stripe().checkout.sessions.expire(id, {}, PAGE_CALL)).status ?? null,
    status: async (id) => (await stripe().checkout.sessions.retrieve(id, {}, PAGE_CALL)).status ?? null,
  };
}

/** What a page replaced by a newer one for its days says. */
export const PAGE_REPLACED = "A newer payment page replaced this one.";

/**
 * ONE PAYABLE PAGE FOR ANY DAYS OF A JOURNAL (review, 2026-10-26). A payment
 * page just made closes every older one still open for the same journal and
 * any of the same days - the coach's or the client's, either way round, or
 * one person's in two tabs - so one period cannot be paid for twice and
 * printed twice. Before, only a client's own older pages were closed: a
 * coach's order and a client's open page for the same days could both be
 * paid. A replaced page stays an unpaid checkout with its link to Stripe cut,
 * pruned in a month like any other.
 *
 * An older page that will not close, and that Stripe says is complete, was
 * paid in this very moment. Then it is the NEW page that closes, and the
 * payer is told the first payment is going through - before, the new page
 * was left open for 23 hours and could be paid as well. So too when one
 * was paid a little earlier, while this page was being built (`since`), and
 * Stripe's word on it has already made it a book or a clearing payment
 * (review, 2026-10-27): it is no longer an open page, so it is looked for
 * among the books. And an older page that will not close and is not known
 * to be closed is not left open beside the new one: the new one closes, and
 * the payer is asked to try again. Of two pages opened together, the older
 * gives way.
 */
export async function closeOverlappingPages(orderId: string, since: Date, deps: PageDeps = livePageDeps()): Promise<void> {
  const mine = await prisma.printOrder.findUnique({ where: { id: orderId }, select: { plannerId: true, startDate: true, endDate: true, createdAt: true, stripeCheckoutSessionId: true, paidByClient: true } });
  if (!mine?.plannerId) return;
  const sameDays = { plannerId: mine.plannerId, id: { not: orderId }, startDate: { lte: mine.endDate }, endDate: { gte: mine.startDate } };
  /** This page goes instead, and the payer is told why. */
  const closeMine = async (reason: string, told: string): Promise<never> => {
    if (mine.stripeCheckoutSessionId) {
      try {
        await deps.expire(mine.stripeCheckoutSessionId);
      } catch (error) {
        console.error(`[print] could not close the new payment page ${orderId}:`, error);
      }
    }
    await prisma.printOrder.updateMany({ where: { id: orderId, status: "QUOTED" }, data: { stripeCheckoutSessionId: null, failureReason: reason } });
    throw new OrderError(told);
  };
  const GOING_THROUGH = "A payment for these days is going through already. Refresh in a minute to see it.";
  const older = await prisma.printOrder.findMany({
    where: {
      ...sameDays,
      status: "QUOTED",
      stripePaymentIntentId: null,
      stripeCheckoutSessionId: { not: null },
      // not one replaced, or whose bank payment was refused: its session
      // reads "complete" at Stripe for ever
      failureReason: null,
      // a page is open a day at most
      createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000), lte: mine.createdAt },
    },
    select: { id: true, stripeCheckoutSessionId: true },
  });
  for (const page of older) {
    let closed = false;
    try {
      closed = (await deps.expire(page.stripeCheckoutSessionId!)) === "expired";
    } catch (error) {
      console.error(`[print] could not close payment page ${page.id}:`, error);
    }
    let status: string | null = closed ? "expired" : null;
    if (!closed) {
      try {
        status = await deps.status(page.stripeCheckoutSessionId!);
      } catch (error) {
        console.error(`[print] could not read payment page ${page.id}:`, error);
      }
    }
    if (status === "expired") {
      // every book the page was for: a group's books share one (groupOrders.ts),
      // and the page is closed for all of them - else each was closed again
      await prisma.printOrder.updateMany({ where: { stripeCheckoutSessionId: page.stripeCheckoutSessionId, status: "QUOTED" }, data: { stripeCheckoutSessionId: null, failureReason: PAGE_REPLACED } });
      continue;
    }
    if (status === "complete") await closeMine("A payment for these days went through on another page first.", GOING_THROUGH);
    // open still, or not known: not left payable beside this one
    await closeMine("Another payment page for these days could not be closed.", "Another payment page for these days could not be closed just now. Try again in a moment.");
  }
  // Paid a little earlier, while this page was being built: already a book,
  // or a bank payment clearing, by the time we look. A CLIENT'S dates were
  // worked out to start after every book held (clientOrders.ts), so any book
  // for them now - the coach's, a renewal, their own - is one paid since. An
  // owner may order days a book already has (a second copy), so for them only
  // a client's payment during the build counts (review, 2026-10-27: a printer
  // status on their own book, landing in those seconds, refused it).
  const paidSince = await prisma.printOrder.findFirst({
    where: { ...sameDays, OR: HOLDS_DAYS, ...(mine.paidByClient ? {} : { paidByClient: true, updatedAt: { gte: since } }) },
    select: { id: true },
  });
  if (paidSince) await closeMine("A payment for these days went through on another page first.", GOING_THROUGH);
  // Two pages opened together: each looks only at older ones, and an older
  // page's link to Stripe can be saved after the newer one has looked, so
  // neither saw the other and both stayed payable. Each saves its link before
  // it looks, so the older one always sees the newer, and gives way to it.
  const newer = await prisma.printOrder.findFirst({
    where: {
      ...sameDays,
      status: "QUOTED",
      stripePaymentIntentId: null,
      stripeCheckoutSessionId: { not: null },
      failureReason: null,
      OR: [{ createdAt: { gt: mine.createdAt } }, { createdAt: mine.createdAt, id: { gt: orderId } }],
    },
    select: { id: true },
  });
  if (newer) await closeMine(PAGE_REPLACED, "Another payment page for these days was opened a moment ago, so this one was closed. Refresh to see where things stand.");
}

/**
 * A CHECKOUT FINISHED WITH A PAYMENT THAT TAKES DAYS TO CLEAR (2026-10-26):
 * a US bank account, which Stripe reports as completed but "unpaid". From
 * now on the order's days are taken (holdsDays.ts: QUOTED with its payment
 * intent), so they are not sold again while the bank settles; the book is
 * sent when Stripe says it cleared (async_payment_succeeded, fulfilPaidOrder)
 * and ended when it did not (failClearingPayment). Safe to repeat.
 */
export async function recordClearingPayment(orderId: string, paymentIntentId: string, email?: string | null): Promise<boolean> {
  if (email) await prisma.printOrder.updateMany({ where: { id: orderId, contactEmail: null }, data: { contactEmail: email } });
  // not once the bank has refused it: a late, re-sent "completed" must not
  // take its days again
  const recorded = await prisma.printOrder.updateMany({ where: { id: orderId, status: "QUOTED", stripePaymentIntentId: null, failureReason: null }, data: { stripePaymentIntentId: paymentIntentId } });
  return recorded.count === 1;
}

/** The bank said no: nothing was taken. The order goes back to being a
 *  checkout never finished (QUOTED, no payment): its days are free again,
 *  no list shows it as a book, and whoever paid is told. Not FAILED (review,
 *  2026-10-26): that read as a paid book gone wrong - "We will be in touch",
 *  "Paid by them, you receive $3.20", a task on the coach's Home. */
export async function failClearingPayment(orderId: string, send: EmailSender = sendEmail): Promise<boolean> {
  const failed = await prisma.printOrder.updateMany({
    where: { id: orderId, status: "QUOTED", failureReason: null },
    data: {
      stripePaymentIntentId: null,
      autoRenew: false,
      renewsAt: null,
      failureReason: "The bank payment did not go through, so this book was not ordered and nothing was taken.",
    },
  });
  if (failed.count !== 1) return false;
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  if (order) await notify(bankPaymentFailedEmail(order), send);
  return true;
}

/** What luluStatus says while fulfilPaidOrder has an order claimed and is
 *  handing it to the printer: no printer's own word, so it cannot be
 *  mistaken for one. Left there, the run that claimed it ended part way -
 *  the admin page says to look at the printer before sending it again. */
export const SENDING = "MEMARI_SENDING";

/** Paid: send it to print. Safe to call again - an order past QUOTED/PAID
 *  is left alone, and one already being sent is too. True when this call
 *  sent it. A book of a group's payment sends no email of its own: the
 *  group's one email lists them all (groupOrders.ts). */
export async function fulfilPaidOrder(orderId: string, payment: { paymentIntentId?: string; paymentMethodId?: string }, origin: string): Promise<boolean> {
  // QUOTED -> PAID, once: the update only matches an order still QUOTED.
  await prisma.printOrder.updateMany({
    where: { id: orderId, status: "QUOTED" },
    data: { status: "PAID", stripePaymentIntentId: payment.paymentIntentId, stripePaymentMethodId: payment.paymentMethodId },
  });
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  // A coach's client paid for their own book: the coach's own renewals of
  // that journal end, so its days are never bought twice (renewals.ts
  // guards the same; review, 2026-10-23).
  if (order?.paidByClient && order.plannerId) {
    await prisma.printOrder.updateMany({ where: { plannerId: order.plannerId, id: { not: order.id }, autoRenew: true }, data: { autoRenew: false, renewsAt: null } });
  }
  if (!order || order.status !== "PAID" || order.luluPrintJobId) return false;
  // SENT ONCE (review, 2026-10-27). Stripe can deliver the same event twice
  // at once, and both deliveries found the order PAID with no job and both
  // sent it: two books printed, one paid for. Now the order is claimed
  // first, and only the run whose update matched sends it.
  const claimed = await prisma.printOrder.updateMany({
    where: { id: order.id, status: "PAID", luluPrintJobId: null, luluStatus: null },
    data: { luluStatus: SENDING },
  });
  if (claimed.count !== 1) return false;
  // Only the printer's answer is inside the try: a job the printer took
  // is never recorded as refused because something after it failed - the
  // order stays claimed instead, for the admin to look at.
  let job: { jobId: string; status: string | null; attention?: string };
  try {
    job = await printerFor(order.printer).submit({
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
  } catch (error) {
    const reason = `Paid, but the printer refused the job: ${error instanceof Error ? error.message : String(error)}`;
    await prisma.printOrder.update({ where: { id: order.id }, data: { status: "FAILED", failureReason: reason, luluStatus: null } });
    await notify(adminAlertEmail(order, reason));
    throw error;
  }
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
  if (!submitted.batchId) await notify(placedEmail(submitted));
  // Placed, but something of ours stands in its way (BookVault waiting
  // for payment): ours to see to, so the alert, and the order stays with
  // the printer.
  if (job.attention) await notify(adminAlertEmail(submitted, job.attention));
  return true;
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
  const tracked = (job.line_items ?? []).find((item) => item.tracking_id);
  await applyJobStatus(String(job.id), {
    name: job.status?.name ?? null,
    status: LULU_TO_STATUS[job.status?.name ?? ""],
    tracking: (job.line_items ?? []).flatMap((item) => item.tracking_urls ?? []),
    trackingCode: tracked?.tracking_id?.trim() || undefined,
    carrier: tracked?.carrier_name?.trim() || undefined,
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

/** How long a stop Memari asked for is taken as ours when the printer's
 *  word that it is cancelled arrives: the cancel takes seconds, a printer's
 *  news can be minutes late. Past it, nothing of ours is still under way -
 *  and a stopped book nobody recorded a reason for is a refund due anyway. */
const ASKED_TO_STOP_MS = 15 * 60 * 1000;

/** A printer's report on a job, onto its order - and the email when it
 *  ships (or the alert when the printer gives up on it), sent on the CHANGE
 *  only: a printer may report the same status twice, and the conditional
 *  update below lets just one delivery through. */
export async function applyJobStatus(jobId: string, report: JobReport, send: EmailSender = sendEmail): Promise<void> {
  const { status, tracking } = report;
  const said = `${report.name ?? "a problem"}${report.message ? `: ${report.message}` : ""}`;
  // THE PRINTER CANCELLED IT ITSELF (review, 2026-10-27): a paid book is
  // stopped and Memari did not ask. The money is still taken and no book is
  // coming, so it is told to us like a failure, auto-renew goes off, and the
  // order says the refund is due (refundDue.ts) - the admin page lists it and
  // refunds it. A stop Memari asked for in the last quarter hour is not this
  // (cancelAskedAt): the printer's word on it can land before the cancel
  // that asked has written its own reason, and is taken as plain news below.
  if (status === "CANCELED") {
    const before = await prisma.printOrder.findFirst({ where: { luluPrintJobId: jobId } });
    const stopped = await prisma.printOrder.updateMany({
      where: {
        luluPrintJobId: jobId,
        status: { notIn: ["CANCELED", "DELIVERED"] },
        stripePaymentIntentId: { not: null },
        OR: [{ cancelAskedAt: null }, { cancelAskedAt: { lt: new Date(Date.now() - ASKED_TO_STOP_MS) } }],
      },
      data: { status: "CANCELED", autoRenew: false, renewsAt: null, failureReason: `${PRINTER_CANCELLED} It said ${said}.` },
    });
    if (before && stopped.count > 0) {
      await notify(adminAlertEmail(before, `The printer cancelled this book itself (it said ${said}). The payment has not been refunded: refund it from the admin page.`), send);
    }
  }
  if (status === "SHIPPED" || status === "FAILED") {
    const before = await prisma.printOrder.findFirst({ where: { luluPrintJobId: jobId } });
    const moved = await prisma.printOrder.updateMany({
      where: { luluPrintJobId: jobId, status: { notIn: status === "SHIPPED" ? ["SHIPPED", "DELIVERED"] : ["FAILED"] } },
      // When it shipped is what delivery.ts counts from.
      data: { status, ...(status === "SHIPPED" ? { shippedAt: new Date() } : {}), ...(tracking.length > 0 ? { trackingUrls: tracking } : {}) },
    });
    if (before && moved.count > 0) {
      if (status === "SHIPPED") await notify(shippedEmail(before, tracking), send);
      else await notify(adminAlertEmail(before, `The printer reported ${said}.`), send);
    }
  }
  await prisma.printOrder.updateMany({
    where: { luluPrintJobId: jobId },
    data: {
      luluStatus: report.name,
      ...(tracking.length > 0 ? { trackingUrls: tracking } : {}),
      ...(report.trackingCode ? { trackingCode: report.trackingCode } : {}),
      ...(report.carrier ? { trackingCarrier: report.carrier } : {}),
    },
  });
  // A cancelled order stays cancelled: a printer's news can arrive out of order,
  // and a late "waiting to print" must not bring back a book that was
  // stopped and refunded. Nor does a late "shipped" undo a delivery the
  // carrier or the customer has told us of (delivery.ts).
  if (!status) return;
  await prisma.printOrder.updateMany({
    where: { luluPrintJobId: jobId, status: { notIn: status === "DELIVERED" ? ["CANCELED"] : ["CANCELED", "DELIVERED"] } },
    data: {
      status,
      ...(status === "FAILED" ? { failureReason: `The printer reported ${said}.` } : {}),
    },
  });
  // Lulu sometimes hears of a delivery itself; the day is when we heard.
  if (status === "DELIVERED") {
    await prisma.printOrder.updateMany({ where: { luluPrintJobId: jobId, status: "DELIVERED", deliveredAt: null }, data: { deliveredAt: new Date() } });
  }
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
      // a coach's share comes back from them (clientPays.ts)
      // and a group's book only its own part of the payment
      const paid = await prisma.printOrder.findUnique({ where: { id: orderId }, select: { markupCents: true, payoutAccountId: true, batchId: true, totalCents: true } });
      await stripe().refunds.create(
        refundParams({ stripePaymentIntentId: paymentIntentId, markupCents: paid?.markupCents ?? 0, payoutAccountId: paid?.payoutAccountId ?? null, batchId: paid?.batchId, totalCents: paid?.totalCents }),
        { idempotencyKey: `refund-${orderId}` }
      );
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
  // Asked, written down first: the printer's word that it stopped can land
  // before this does (applyJobStatus), and must not read as the printer
  // stopping it of its own accord. Not cleared when the printer refuses: a
  // second press may be under way, and the cost of leaving it is small - a
  // printer stopping the book itself in the next quarter hour shows as a
  // refund due on the admin page without the email.
  await prisma.printOrder.update({ where: { id: order.id }, data: { cancelAskedAt: new Date() } });
  try {
    await deps.stopAtPrinter(order.printer, order.luluPrintJobId!);
  } catch (error) {
    console.error(`[print] the printer would not cancel ${order.id}:`, error);
    throw new OrderError(REFUSED);
  }
  const day = new Date().toISOString().slice(0, 10);
  // Cancelled once, however many times it is pressed: only the press that
  // moves the order sends the email. An order the printer's own word has
  // already made CANCELED, with no reason yet, is this press's to finish.
  const moved = await prisma.printOrder.updateMany({
    where: { id: order.id, OR: [{ status: { not: "CANCELED" } }, { failureReason: null }] },
    data: { status: "CANCELED", luluStatus: "CANCELED", autoRenew: false, renewsAt: null, failureReason: `Cancelled by the customer ${day}.` },
  });
  try {
    await deps.refund(order.stripePaymentIntentId!, order.id);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    await prisma.printOrder.update({ where: { id: order.id }, data: { failureReason: `Cancelled by the customer ${day}; ${REFUND_BY_HAND}: ${why}` } });
    await notify(adminAlertEmail(order, `The customer cancelled and the printer stopped it, but the refund failed: ${why}. Refund it from the admin page.`), deps.email);
    throw new OrderError("Your book is stopped. The refund did not go through straight away - we have been told, and will make it by hand within two business days.");
  }
  if (moved.count > 0) await notify(cancelledEmail(order), deps.email);
}

export { orderRange };

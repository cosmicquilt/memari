// ORDERS: from a price on the screen to a book at the printer. Server-only.
//
//   quoteOrder       the book for the chosen days, which bindings can hold
//                    it, and every shipping level Lulu offers the address,
//                    priced (pricing.ts) - nothing stored
//   startCheckout    priced again here (a price from the browser is never
//                    trusted), the interior and cover built and stored with
//                    a QUOTED order, and Stripe's payment page opened
//   fulfilPaidOrder  once Stripe says it is paid: PAID, then a print job at
//                    Lulu - which charges our card - and SUBMITTED
//   applyLuluStatus  Lulu's word on where the book is
//
// Every step is safe to repeat: a webhook delivered twice finds the order
// already past the step and does nothing.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { BINDING_ENUM, BINDING_SPECS, bindingAvailability, podPackageId, orderableTrim, type Binding, type BindingAvailability } from "./products";
import { orderRange, renewalDate, SHIPPING_LEVELS, type OrderRange, type ShippingLevel } from "./orderRange";
import { coverDimensions, createPrintJob, luluConfigured, quoteShipping, type PrintJob, type ShippingAddress } from "./lulu";
import { priceFromCost, type Price } from "./pricing";
import { buildCoverPdf } from "./cover";
import { buildInterior, loadJournal, OrderError, rangeLabel, trimInches } from "./orderBook";
import { printFileUrl } from "./fileUrls";
import { stripe, stripeConfigured } from "./stripe";

export { OrderError };

export const SHIPPING_LABELS: Record<ShippingLevel, string> = {
  MAIL: "Standard mail",
  PRIORITY_MAIL: "Priority mail",
  GROUND: "Ground",
  EXPEDITED: "Expedited",
  EXPRESS: "Express",
};


export type OrderInput = {
  journalId: string;
  /** "2027-01-04" - the first day the book covers. */
  startISO: string;
  days: number;
  binding: Binding;
  address: ShippingAddress;
};

export type Quote = {
  range: { startISO: string; endISO: string; days: number; label: string };
  pageCount: number;
  availability: BindingAvailability[];
  /** Every level Lulu will post this book by, priced. Empty when the chosen
   *  binding cannot hold the book. */
  options: Array<{ level: ShippingLevel; label: string; price: Price }>;
};

/** Is ordering switched on here? Both services' keys must be set. */
export function orderingConfigured(): { ok: boolean; missing: string[] } {
  const missing = [...(luluConfigured() ? [] : ["Lulu"]), ...(stripeConfigured() ? [] : ["Stripe"])];
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

async function priced(input: OrderInput, ownerId: string) {
  const configured = orderingConfigured();
  if (!configured.ok) throw new OrderError(`Ordering is not switched on yet: the ${configured.missing.join(" and ")} keys are not set.`);
  const journal = await loadJournal(ownerId, input.journalId);
  if (!journal) throw new OrderError("That journal could not be found.");
  const range = orderRange(parseStart(input.startISO), input.days);
  const interior = buildInterior(journal, range);
  if (!orderableTrim(interior.trim)) {
    throw new OrderError("This journal is laid out at US Letter, the print-at-home size. Switch it to 7 × 10 in Page Settings to order it printed.");
  }
  if (interior.problems.length > 0) throw new OrderError(`This book is not ready to print: ${interior.problems.join("; ")}.`);
  const availability = bindingAvailability(interior.bookPages);
  const sku = podPackageId(input.binding, interior.trim)!;
  const fits = availability.find((a) => a.binding === input.binding)?.ok ?? false;
  const address = cleanAddress(input.address);
  const quotes = fits ? await quoteShipping(sku, interior.pageCount, address, SHIPPING_LEVELS) : [];
  if (fits && quotes.length === 0) throw new OrderError("Lulu cannot post to that address. Check the country and postcode.");
  return { journal, range, interior, availability, sku, address, quotes };
}

function describeRange(range: OrderRange) {
  return { startISO: range.start.toISOString().slice(0, 10), endISO: range.end.toISOString().slice(0, 10), days: range.days, label: rangeLabel(range) };
}

export async function quoteOrder(ownerId: string, input: OrderInput): Promise<Quote> {
  const { range, interior, availability, quotes } = await priced(input, ownerId);
  return {
    range: describeRange(range),
    pageCount: interior.pageCount,
    availability,
    options: quotes.map(({ level, cost }) => ({ level, label: SHIPPING_LABELS[level], price: priceFromCost(cost) })),
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
  const { journal, range, interior, availability, sku, address, quotes } = await priced(input, ownerId);
  const fit = availability.find((a) => a.binding === input.binding);
  if (!fit?.ok) throw new OrderError(fit && !fit.ok ? fit.reason : "Choose a binding.");
  const chosen = quotes.find((q) => q.level === input.level);
  if (!chosen) throw new OrderError("That shipping option is not available to this address. Choose another.");
  const price = priceFromCost(chosen.cost);

  const trim = trimInches(interior.trim);
  const dims = await coverDimensions(sku, interior.pageCount);
  const cover = buildCoverPdf({ ...dims, trimWidthIn: trim.widthIn, trimHeightIn: trim.heightIn, title: journal.title, dates: journal.dated ? rangeLabel(range) : "" });

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
        price_data: { currency: "usd", unit_amount: price.shippingCents, product_data: { name: `Shipping - ${SHIPPING_LABELS[input.level]}` } },
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
    success_url: `${origin}/app/orders?placed=${order.id}`,
    cancel_url: `${origin}/app/j/${journal.id}`,
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
    const job = await createPrintJob({
      externalId: order.id,
      title: order.title,
      podPackageId: order.podPackageId,
      interiorUrl: printFileUrl(origin, order.id, "interior"),
      coverUrl: printFileUrl(origin, order.id, "cover"),
      address: order.shippingAddress as unknown as ShippingAddress,
      level: order.shippingLevel as ShippingLevel,
      contactEmail: order.contactEmail ?? (order.shippingAddress as unknown as ShippingAddress).email ?? "",
    });
    const range = { start: order.startDate, end: order.endDate, days: order.days };
    const address = order.shippingAddress as unknown as ShippingAddress;
    await prisma.printOrder.update({
      where: { id: order.id },
      data: {
        status: "SUBMITTED",
        luluPrintJobId: String(job.id),
        luluStatus: job.status?.name ?? null,
        renewsAt: order.autoRenew ? renewalDate(range, order.shippingLevel as ShippingLevel, address.countryCode !== "US", new Date()) : null,
      },
    });
  } catch (error) {
    await prisma.printOrder.update({
      where: { id: order.id },
      data: { status: "FAILED", failureReason: `Paid, but the printer refused the job: ${error instanceof Error ? error.message : String(error)}` },
    });
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
  const status = LULU_TO_STATUS[job.status?.name ?? ""];
  const tracking = (job.line_items ?? []).flatMap((item) => item.tracking_urls ?? []);
  await prisma.printOrder.updateMany({
    where: { luluPrintJobId: String(job.id) },
    data: {
      luluStatus: job.status?.name ?? null,
      ...(status ? { status } : {}),
      ...(tracking.length > 0 ? { trackingUrls: tracking } : {}),
      ...(status === "FAILED" ? { failureReason: `The printer reported ${job.status?.name}${job.status?.message ? `: ${job.status.message}` : ""}.` } : {}),
    },
  });
}

export { orderRange };

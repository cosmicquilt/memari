// DID IT ARRIVE? Server-only.
//
// Asked 2026-10-19, after a BookVault seller's story from 2024: its US
// consolidator stopped handing parcels to USPS, BookVault blamed the weather
// for weeks, and the seller found out from customers and refunds. Neither
// Lulu nor BookVault tells us when a book is delivered - they stop at
// "shipped" and a tracking link - so two things do, both asked for:
//
//   THE CARRIER. Every shipped book with a tracking number gets an EasyPost
//   tracker (easypost.ts), read once a day by the cron. No carrier scan
//   NO_SCAN_DAYS after it shipped - 4 for a book printed in the US for the
//   US, 10 otherwise, since BookVault's US parcels cross the Atlantic in one
//   box before USPS first scans them - or a return, failure, lost or
//   damaged parcel: flagged, and the admin emailed. Delivered: DELIVERED.
//
//   THE CUSTOMER. ASK_AFTER_DAYS after it shipped (12 / 18), "Has your book
//   arrived?" with two signed pages, yes and not yet (src/app/arrival). Not
//   yet: flagged, the admin emailed at once. Yes: DELIVERED. No answer a week
//   on: flagged quietly, on the admin page only.
//
// A flag is deliveryProblem, the admin page's "Not arrived" list
// (src/app/app/admin/orders); a delivery or an admin's "Mark arrived" clears
// it. The admin is emailed once per book (deliveryAlertedAt), the customer
// asked once (arrivalAskedAt).

import { prisma } from "@/lib/prisma";
import { sendEmail, type EmailSender } from "@/lib/email";
import { appUrl, siteSignature, verifySiteSignature } from "./fileUrls";
import { arrivalEmail, deliveryAlertEmail, notify } from "./emails";
import { createTracker, easyPostConfigured, getTracker, type Tracker } from "./easypost";

const DAY = 86_400_000;

/** Printed in the US for a US address (Lulu), or anything else - BookVault
 *  prints in the UK, and Lulu's other routes cross borders too. */
export type Route = "domestic" | "abroad";
export const NO_SCAN_DAYS: Record<Route, number> = { domestic: 4, abroad: 10 };
export const ASK_AFTER_DAYS: Record<Route, number> = { domestic: 12, abroad: 18 };
/** Days after the question with no answer before the book is flagged. */
export const UNANSWERED_DAYS = 7;
/** A tracker is read again after this long. */
const READ_EVERY_MS = 20 * 60 * 60 * 1000;

export function routeOf(order: { printer: string; shippingAddress: unknown }): Route {
  const country = (order.shippingAddress as { countryCode?: string } | null)?.countryCode ?? "";
  return order.printer === "lulu" && country === "US" ? "domestic" : "abroad";
}

// ------------------------------------------------------------ the two links

export type ArrivalAnswer = "yes" | "no";

/** The arrival email's links: signed, so they work from the email alone, but
 *  each opens a page with one button - mail scanners open every link, and a
 *  link that acted would mark books arrived that nobody has seen. */
export function arrivalUrl(orderId: string, answer: ArrivalAnswer): string {
  return `${appUrl()}/arrival/${encodeURIComponent(orderId)}?a=${answer}&sig=${siteSignature(`arrival:${orderId}:${answer}`)}`;
}

export function verifyArrival(orderId: string, answer: string | null, signature: string | null): answer is ArrivalAnswer {
  if (answer !== "yes" && answer !== "no") return false;
  // With no signing secret set nothing could have been signed (renewalControls.ts).
  try {
    return verifySiteSignature(`arrival:${orderId}:${answer}`, signature);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ what a tracker says

/** The tracker, as the checks use it: EasyPost's, or a fake in the checks. */
export type TrackerApi = { create: (code: string, carrier?: string | null) => Promise<Tracker>; get: (id: string) => Promise<Tracker> };
export const easyPostTracker: TrackerApi = { create: createTracker, get: getTracker };

/** Where the parcel is in trouble, by status or by its detail. */
const TROUBLE = new Set(["return_to_sender", "failure", "cancelled", "error", "lost", "damaged"]);
/** No carrier has scanned it yet. */
const UNSCANNED = new Set(["pre_transit", "unknown"]);

/** What a tracker means for a book: delivered (and when), a problem (in
 *  words), or nothing to act on yet. */
export function readTracker(tracker: Tracker, order: { shippedAt: Date | null; printer: string; shippingAddress: unknown }, now: Date): { delivered?: Date; problem?: string } {
  if (tracker.status === "delivered") {
    const at = [...(tracker.tracking_details ?? [])].reverse().find((detail) => detail.status === "delivered")?.datetime;
    return { delivered: at && !Number.isNaN(Date.parse(at)) ? new Date(at) : now };
  }
  const detail = tracker.status_detail ?? "";
  if (TROUBLE.has(tracker.status) || TROUBLE.has(detail)) {
    return { problem: `The carrier reports ${(TROUBLE.has(detail) ? detail : tracker.status).replace(/_/g, " ")}.` };
  }
  const days = NO_SCAN_DAYS[routeOf(order)];
  if (UNSCANNED.has(tracker.status) && order.shippedAt && now.getTime() - order.shippedAt.getTime() > days * DAY) {
    return { problem: `No carrier has scanned it in the ${days} days since it shipped.` };
  }
  return {};
}

// ------------------------------------------------------------ changes

/** The quiet flag: the customer was asked and has not answered. A louder
 *  reason - a carrier's, or the customer's "not yet" - replaces it. */
export const NO_ANSWER = `No answer to "has it arrived?" ${UNANSWERED_DAYS} days on.`;

/** Delivered: only from SHIPPED, the flag cleared. */
export async function markDelivered(orderId: string, at: Date, answer?: { arrivalAnswer: string; arrivalAnsweredAt: Date }): Promise<boolean> {
  const moved = await prisma.printOrder.updateMany({
    where: { id: orderId, status: "SHIPPED" },
    data: { status: "DELIVERED", deliveredAt: at, deliveryProblem: null, ...(answer ?? {}) },
  });
  return moved.count > 0;
}

/** Flag a book, unless a reason is already on it (a quiet one gives way).
 *  True when this call set it. */
async function flag(orderId: string, problem: string): Promise<boolean> {
  const set = await prisma.printOrder.updateMany({
    where: { id: orderId, OR: [{ deliveryProblem: null }, { deliveryProblem: NO_ANSWER }] },
    data: { deliveryProblem: problem },
  });
  return set.count > 0;
}

/** Email the admin about books newly flagged, each once. */
async function alert(orderIds: string[], send: EmailSender, now: Date): Promise<number> {
  if (orderIds.length === 0) return 0;
  const claimed: string[] = [];
  for (const id of orderIds) {
    const got = await prisma.printOrder.updateMany({ where: { id, deliveryAlertedAt: null }, data: { deliveryAlertedAt: now } });
    if (got.count > 0) claimed.push(id);
  }
  if (claimed.length === 0) return 0;
  const orders = await prisma.printOrder.findMany({ where: { id: { in: claimed } }, orderBy: { shippedAt: "asc" } });
  await notify(deliveryAlertEmail(orders), send);
  return claimed.length;
}

// ------------------------------------------------------------ the daily run

export type DeliveryDeps = { tracker: TrackerApi | null; send: EmailSender };

export const liveDeliveryDeps = (): DeliveryDeps => ({ tracker: easyPostConfigured() ? easyPostTracker : null, send: sendEmail });

export type DeliverySummary = { tracked: number; read: number; delivered: string[]; asked: string[]; flagged: string[]; alerted: number };

/** Everything the cron does about delivery, once a day: trackers made and
 *  read, books delivered or flagged, customers asked, the admin emailed. */
export async function runDeliveryChecks(now: Date, deps: DeliveryDeps = liveDeliveryDeps(), limit = 50): Promise<DeliverySummary> {
  const summary: DeliverySummary = { tracked: 0, read: 0, delivered: [], asked: [], flagged: [], alerted: 0 };
  const loud: string[] = [];

  const act = async (order: { id: string; shippedAt: Date | null; printer: string; shippingAddress: unknown }, tracker: Tracker) => {
    const said = readTracker(tracker, order, now);
    if (said.delivered) {
      if (await markDelivered(order.id, said.delivered)) summary.delivered.push(order.id);
    } else if (said.problem && (await flag(order.id, said.problem))) {
      summary.flagged.push(order.id);
      loud.push(order.id);
    }
  };

  if (deps.tracker) {
    // A tracker for every shipped book with a tracking number.
    const untracked = await prisma.printOrder.findMany({ where: { status: "SHIPPED", trackingCode: { not: null }, trackerId: null }, orderBy: { shippedAt: "asc" }, take: limit });
    for (const order of untracked) {
      try {
        const tracker = await deps.tracker.create(order.trackingCode!, order.trackingCarrier);
        await prisma.printOrder.update({ where: { id: order.id }, data: { trackerId: tracker.id, trackerStatus: tracker.status, trackerCheckedAt: now } });
        summary.tracked += 1;
        await act(order, tracker);
      } catch (error) {
        console.error(`[delivery] tracking ${order.id} (${order.trackingCode}) failed:`, error);
      }
    }
    // And each read again, once a day.
    const open = await prisma.printOrder.findMany({
      where: { status: "SHIPPED", trackerId: { not: null }, OR: [{ trackerCheckedAt: null }, { trackerCheckedAt: { lt: new Date(now.getTime() - READ_EVERY_MS) } }] },
      orderBy: { trackerCheckedAt: "asc" },
      take: limit,
    });
    for (const order of open) {
      try {
        const tracker = await deps.tracker.get(order.trackerId!);
        await prisma.printOrder.update({ where: { id: order.id }, data: { trackerStatus: tracker.status, trackerCheckedAt: now } });
        summary.read += 1;
        await act(order, tracker);
      } catch (error) {
        console.error(`[delivery] reading tracker ${order.trackerId} for ${order.id} failed:`, error);
      }
    }
  }

  // The customer, asked once - each claimed before the email goes, so two
  // runs send one.
  const due = await prisma.printOrder.findMany({
    where: { status: "SHIPPED", arrivalAskedAt: null, contactEmail: { not: null }, shippedAt: { lte: new Date(now.getTime() - ASK_AFTER_DAYS.domestic * DAY) } },
    orderBy: { shippedAt: "asc" },
    take: limit,
  });
  for (const order of due) {
    if (now.getTime() - order.shippedAt!.getTime() < ASK_AFTER_DAYS[routeOf(order)] * DAY) continue;
    // The links before the claim: signing throws without its secret, and a
    // book claimed but never asked about would never be asked.
    const links = { yes: arrivalUrl(order.id, "yes"), notYet: arrivalUrl(order.id, "no") };
    const claimed = await prisma.printOrder.updateMany({ where: { id: order.id, arrivalAskedAt: null, status: "SHIPPED" }, data: { arrivalAskedAt: now } });
    if (claimed.count === 0) continue;
    await notify(arrivalEmail(order, links), deps.send);
    summary.asked.push(order.id);
  }

  // No answer a week on: flagged, quietly.
  const silent = await prisma.printOrder.updateMany({
    where: { status: "SHIPPED", arrivalAnswer: null, deliveryProblem: null, arrivalAskedAt: { lte: new Date(now.getTime() - UNANSWERED_DAYS * DAY) } },
    data: { deliveryProblem: NO_ANSWER },
  });
  if (silent.count > 0) console.log(`[delivery] ${silent.count} book(s) unanswered, flagged`);

  summary.alerted = await alert(loud, deps.send, now);
  return summary;
}

// ------------------------------------------------------------ answers

/** The customer's answer, from the arrival page. "yes" delivers the book;
 *  "no" flags it and emails the admin at once - also when the carrier says it
 *  was delivered, since then it was left somewhere they cannot find. */
export async function recordArrivalAnswer(orderId: string, answer: ArrivalAnswer, now: Date = new Date(), send: EmailSender = sendEmail): Promise<"arrived" | "not-yet" | "gone"> {
  const order = await prisma.printOrder.findUnique({ where: { id: orderId } });
  if (!order || !["SHIPPED", "DELIVERED"].includes(order.status)) return "gone";
  if (answer === "yes") {
    if (order.status === "SHIPPED") await markDelivered(order.id, now, { arrivalAnswer: "ARRIVED", arrivalAnsweredAt: now });
    else await prisma.printOrder.update({ where: { id: order.id }, data: { arrivalAnswer: "ARRIVED", arrivalAnsweredAt: now, deliveryProblem: null } });
    return "arrived";
  }
  // (Not `not: "NOT_YET"`: SQL's NOT leaves out the unanswered, whose answer is null.)
  const first = await prisma.printOrder.updateMany({ where: { id: order.id, OR: [{ arrivalAnswer: null }, { arrivalAnswer: "ARRIVED" }] }, data: { arrivalAnswer: "NOT_YET", arrivalAnsweredAt: now } });
  if (first.count > 0) {
    // What made it look delivered, so the admin knows whom to believe.
    const day = (date: Date) => date.toISOString().slice(0, 10);
    const before =
      order.arrivalAnswer === "ARRIVED" && order.arrivalAnsweredAt
        ? ` They had said it arrived, on ${day(order.arrivalAnsweredAt)}.`
        : order.status === "DELIVERED" && order.deliveredAt
          ? order.trackerStatus === "delivered"
            ? ` The carrier says it was delivered on ${day(order.deliveredAt)}.`
            : ` It was marked arrived on ${day(order.deliveredAt)}.`
          : "";
    await prisma.printOrder.update({ where: { id: order.id }, data: { deliveryProblem: `The customer says it hasn't arrived.${before}`, deliveryAlertedAt: null } });
    await alert([order.id], send, now);
  }
  return "not-yet";
}

/** An admin's "Mark arrived": delivered, the flag cleared. */
export async function markArrivedByAdmin(orderId: string, now: Date = new Date()): Promise<void> {
  if (await markDelivered(orderId, now)) return;
  await prisma.printOrder.updateMany({ where: { id: orderId, status: "DELIVERED" }, data: { deliveryProblem: null } });
}

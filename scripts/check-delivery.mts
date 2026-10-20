// Did it arrive? (src/lib/print/delivery.ts), on throwaway orders in the dev
// database, with EasyPost and the email sender replaced by fakes - so it runs
// without keys and emails nobody.
//
// What it pins:
//   - a shipped book with a tracking number gets one tracker, read again only
//     after most of a day;
//   - no carrier scan 4 days after shipping (printed in the US for the US),
//     or 10 (anything else), flags the book and emails the admin, once; a
//     day sooner flags nothing;
//   - a return, failure, lost or damaged parcel flags it; delivered marks it
//     DELIVERED on the carrier's date;
//   - the customer is asked 12 days after shipping (18 abroad), once, with
//     or without a tracker, never without an email address;
//   - no answer a week on flags it quietly (no admin email), and a louder
//     reason replaces the quiet one and is emailed;
//   - "not yet" flags it and emails the admin at once, also when the carrier
//     says delivered, and again for a book already alerted about; "yes" and
//     the admin's "Mark arrived" deliver it and clear the flag; a cancelled
//     order has nothing to answer;
//   - the links verify only for their own order and answer;
//   - a shipped report records when and the tracking number and carrier,
//     and a late "shipped" cannot undo a delivery.
//
//   npm run check:delivery
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
// The admin alert goes nowhere without it; this one is never sent anywhere.
process.env.ADMIN_EMAIL = "admin@example.com";

const { prisma } = await import("../src/lib/prisma.js");
const delivery = await import("../src/lib/print/delivery.js");
const { runDeliveryChecks, recordArrivalAnswer, markArrivedByAdmin, arrivalUrl, verifyArrival, NO_ANSWER } = delivery;
const { applyJobStatus, applyLuluStatus } = await import("../src/lib/print/orders.js");
type Tracker = import("../src/lib/print/easypost.js").Tracker;
type TrackerApi = import("../src/lib/print/delivery.js").TrackerApi;
type Email = import("../src/lib/email.js").Email;

const OWNER = "delivery-check-throwaway";
let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}`);
  if (!ok) failures++;
};
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** EasyPost, faked: each tracking code answers the tracker set for it.
 *  Every call is recorded. */
function fakeTracker(answers: Record<string, Partial<Tracker>>) {
  const calls = { create: [] as string[], get: [] as string[] };
  const api: TrackerApi = {
    create: async (code) => {
      calls.create.push(code);
      const answer = answers[code];
      if (!answer) throw new Error(`no fake tracker for ${code}`);
      return { id: `trk_${code}`, status: "unknown", ...answer } as Tracker;
    },
    get: async (id) => {
      calls.get.push(id);
      const code = id.replace(/^trk_/, "");
      return { id, status: "unknown", ...answers[code] } as Tracker;
    },
  };
  return { api, calls };
}

function fakeSend() {
  const emails: Email[] = [];
  const send = async (email: Email) => {
    emails.push(email);
    return { sent: true };
  };
  return { emails, send };
}

const US = { name: "Check", street1: "1 Main St", city: "Springfield", stateCode: "IL", countryCode: "US", postcode: "62701", phoneNumber: "5555550100" };

async function order(label: string, overrides: Record<string, unknown> = {}) {
  return prisma.printOrder.create({
    data: {
      ownerId: OWNER,
      title: `Delivery check ${label}`,
      startDate: new Date("2027-01-01T00:00:00Z"),
      endDate: new Date("2027-01-30T00:00:00Z"),
      days: 30,
      binding: "PAPERBACK",
      podPackageId: "0700X1000BWSTDPB060UW444MXX",
      pageCount: 64,
      shippingLevel: "GROUND",
      shippingAddress: US,
      contactEmail: `${label.toLowerCase()}@example.com`,
      bookCents: 2499,
      shippingCents: 599,
      totalCents: 3098,
      costCents: 1774,
      status: "SHIPPED",
      printer: "lulu",
      ...overrides,
    },
  });
}

const get = (id: string) => prisma.printOrder.findUniqueOrThrow({ where: { id } });
const alertsFor = (emails: Email[], id: string) => emails.filter((email) => email.to === "admin@example.com" && email.text.includes(id));
const asksTo = (emails: Email[], to: string) => emails.filter((email) => email.to === to && email.subject === "Has your journal arrived?");

async function cleanUp() {
  await prisma.printOrder.deleteMany({ where: { ownerId: OWNER } });
}

// The daily run reads every shipped book in the database, not only these.
// Others in the dev database would be asked about and flagged too, so stop.
const others = await prisma.printOrder.count({ where: { ownerId: { not: OWNER }, status: { in: ["SHIPPED", "DELIVERED"] } } });
if (others > 0) {
  console.log(`The dev database has ${others} shipped order(s) not made by this check; the daily run would change them. Stopping.`);
  process.exit(1);
}

await cleanUp();
try {
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  console.log("\nTrackers and the carrier's word");
  const moving = await order("Moving", { shippedAt: ago(2), trackingCode: "MOVING", trackingCarrier: "USPS" });
  const silentUs = await order("SilentUS", { shippedAt: ago(5), trackingCode: "SILENT_US" });
  const quietUs = await order("QuietUS", { shippedAt: ago(3), trackingCode: "QUIET_US" });
  const silentUk = await order("SilentUK", { shippedAt: ago(11), trackingCode: "SILENT_UK", printer: "bookvault" });
  const quietUk = await order("QuietUK", { shippedAt: ago(8), trackingCode: "QUIET_UK", printer: "bookvault" });
  const delivered = await order("Delivered", { shippedAt: ago(6), trackingCode: "DELIVERED" });
  const returned = await order("Returned", { shippedAt: ago(6), trackingCode: "RETURNED" });
  const lost = await order("Lost", { shippedAt: ago(6), trackingCode: "LOST" });
  const deliveredAt = new Date(ago(1).toISOString().slice(0, 10) + "T15:30:00Z");
  const { api, calls } = fakeTracker({
    MOVING: { status: "in_transit" },
    SILENT_US: { status: "pre_transit" },
    QUIET_US: { status: "pre_transit" },
    SILENT_UK: { status: "unknown" },
    QUIET_UK: { status: "pre_transit" },
    DELIVERED: { status: "delivered", tracking_details: [{ status: "in_transit", datetime: ago(3).toISOString() }, { status: "delivered", datetime: deliveredAt.toISOString() }] },
    RETURNED: { status: "return_to_sender" },
    LOST: { status: "in_transit", status_detail: "lost" },
  });
  const mail = fakeSend();
  const first = await runDeliveryChecks(now, { tracker: api, send: mail.send });
  check(first.tracked === 8 && calls.create.length === 8, `one tracker made for each of the 8 books with a tracking number (made ${calls.create.length})`);
  check(calls.create.includes("MOVING") && (await get(moving.id)).trackerId === "trk_MOVING", "and its id kept on the order");
  check((await get(moving.id)).trackerStatus === "in_transit" && !(await get(moving.id)).deliveryProblem, "a moving parcel: its status kept, nothing flagged");
  check(/4 days/.test((await get(silentUs.id)).deliveryProblem ?? ""), "printed in the US for the US, no scan in 5 days: flagged (4-day rule)");
  check(!(await get(quietUs.id)).deliveryProblem, "no scan in 3 days: not yet");
  check(/10 days/.test((await get(silentUk.id)).deliveryProblem ?? ""), "printed in the UK, no scan in 11 days: flagged (10-day rule)");
  check(!(await get(quietUk.id)).deliveryProblem, "printed in the UK, no scan in 8 days: not yet");
  const d = await get(delivered.id);
  check(d.status === "DELIVERED" && d.deliveredAt?.getTime() === deliveredAt.getTime(), "the carrier says delivered: DELIVERED, on the carrier's date");
  check(/return to sender/.test((await get(returned.id)).deliveryProblem ?? ""), "returned to sender: flagged");
  check(/lost/.test((await get(lost.id)).deliveryProblem ?? ""), "lost (by its detail): flagged");
  const adminMail = mail.emails.filter((email) => email.to === "admin@example.com");
  check(adminMail.length === 1, `one admin email for the run (${adminMail.length})`);
  check(
    [silentUs, silentUk, returned, lost].every((o) => alertsFor(mail.emails, o.id).length === 1) && [moving, quietUs, quietUk, delivered].every((o) => alertsFor(mail.emails, o.id).length === 0),
    "naming the four flagged books and none of the others"
  );

  const again = fakeSend();
  const second = await runDeliveryChecks(new Date(now.getTime() + 2 * HOUR), { tracker: api, send: again.send });
  check(calls.create.length === 8 && calls.get.length === 0 && second.read === 0, "run again two hours on: no tracker made or read again");
  check(again.emails.length === 0, "and nobody emailed twice");

  const later = fakeSend();
  await runDeliveryChecks(new Date(now.getTime() + 21 * HOUR), { tracker: api, send: later.send });
  check(calls.get.includes("trk_MOVING") && !calls.get.includes("trk_DELIVERED"), "21 hours on: the open trackers read again, the delivered one not");
  check(later.emails.length === 0, "and a book flagged yesterday is not alerted again");

  console.log("\nAsking the customer");
  const due = await order("Due", { shippedAt: ago(13) });
  const dueUk = await order("DueUK", { shippedAt: ago(13), printer: "bookvault" });
  const lateUk = await order("LateUK", { shippedAt: ago(19), printer: "bookvault" });
  const lulUk = await order("LuluAbroad", { shippedAt: ago(13), shippingAddress: { ...US, countryCode: "GB", stateCode: undefined } });
  const noEmail = await order("NoEmail", { shippedAt: ago(13), contactEmail: null });
  const early = await order("Early", { shippedAt: ago(11) });
  const ask = fakeSend();
  const asked = await runDeliveryChecks(now, { tracker: null, send: ask.send });
  check(asked.asked.includes(due.id) && asksTo(ask.emails, "due@example.com").length === 1, "13 days after shipping in the US: asked, with no tracker at all");
  const question = asksTo(ask.emails, "due@example.com")[0];
  check(!!question && question.text.includes(arrivalUrl(due.id, "yes")) && question.text.includes(arrivalUrl(due.id, "no")), "the question carries both signed links");
  check(!asked.asked.includes(dueUk.id) && !asked.asked.includes(lulUk.id), "13 days for a book printed abroad, or sent abroad: not yet (18)");
  check(asked.asked.includes(lateUk.id), "19 days for a book printed in the UK: asked");
  check(!asked.asked.includes(noEmail.id) && !asked.asked.includes(early.id), "no email address, or 11 days: not asked");
  check(!!(await get(due.id)).arrivalAskedAt, "the question is recorded on the order");
  const askAgain = fakeSend();
  await runDeliveryChecks(now, { tracker: null, send: askAgain.send });
  check(asksTo(askAgain.emails, "due@example.com").length === 0, "run again: not asked twice");
  // Two runs at once, made certain: the second runs whole while the first
  // is sending its first question, so the first has already listed the
  // second book when the second run asks about it.
  await order("RaceA", { shippedAt: ago(14) });
  await order("RaceB", { shippedAt: ago(13) });
  const race = fakeSend();
  let nested = false;
  const racingSend = async (email: Email) => {
    if (!nested && email.to === "racea@example.com") {
      nested = true;
      await runDeliveryChecks(now, { tracker: null, send: race.send });
    }
    return race.send(email);
  };
  await runDeliveryChecks(now, { tracker: null, send: racingSend });
  check(nested && asksTo(race.emails, "racea@example.com").length === 1 && asksTo(race.emails, "raceb@example.com").length === 1, "two runs at once: each book asked once");

  console.log("\nNo answer");
  const unanswered = await order("Unanswered", { shippedAt: ago(21), arrivalAskedAt: ago(8) });
  const pending = await order("Pending", { shippedAt: ago(19), arrivalAskedAt: ago(6) });
  const quietThenLoud = await order("QuietThenLoud", { shippedAt: ago(21), arrivalAskedAt: ago(8), trackingCode: "FAILS" });
  const silence = fakeSend();
  await runDeliveryChecks(now, { tracker: null, send: silence.send });
  check((await get(unanswered.id)).deliveryProblem === NO_ANSWER, "asked 8 days ago, no answer: flagged");
  check(alertsFor(silence.emails, unanswered.id).length === 0, "quietly: no admin email");
  check(!(await get(pending.id)).deliveryProblem, "asked 6 days ago: not yet");
  check((await get(quietThenLoud.id)).deliveryProblem === NO_ANSWER, "(a third, quietly flagged too)");
  const loud = fakeSend();
  await runDeliveryChecks(now, { tracker: fakeTracker({ FAILS: { status: "failure" } }).api, send: loud.send });
  check(/failure/.test((await get(quietThenLoud.id)).deliveryProblem ?? ""), "then the carrier reports a failure: the louder reason replaces the quiet one");
  check(alertsFor(loud.emails, quietThenLoud.id).length === 1, "and the admin is emailed about it");

  console.log("\nThe customer's answer");
  const no = fakeSend();
  check((await recordArrivalAnswer(due.id, "no", now, no.send)) === "not-yet", "\"not yet\" is recorded");
  const dueAfter = await get(due.id);
  check(dueAfter.arrivalAnswer === "NOT_YET" && /hasn't arrived/.test(dueAfter.deliveryProblem ?? ""), "the book is flagged with the customer's word");
  check(alertsFor(no.emails, due.id).length === 1, "and the admin emailed at once");
  const noAgain = fakeSend();
  await recordArrivalAnswer(due.id, "no", now, noAgain.send);
  check(noAgain.emails.length === 0, "pressed again: not emailed twice");
  const reAlert = fakeSend();
  await recordArrivalAnswer(silentUs.id, "no", now, reAlert.send);
  check(alertsFor(reAlert.emails, silentUs.id).length === 1, "\"not yet\" on a book the carrier already flagged: emailed again, it is news");
  const carrierSaid = fakeSend();
  await recordArrivalAnswer(delivered.id, "no", now, carrierSaid.send);
  const dn = await get(delivered.id);
  check(/carrier says it was delivered/.test(dn.deliveryProblem ?? "") && alertsFor(carrierSaid.emails, delivered.id).length === 1, "\"not yet\" when the carrier says delivered: flagged, saying so, and emailed");
  const yes = fakeSend();
  check((await recordArrivalAnswer(due.id, "yes", now, yes.send)) === "arrived", "then \"yes\"");
  const dueYes = await get(due.id);
  check(dueYes.status === "DELIVERED" && dueYes.arrivalAnswer === "ARRIVED" && !dueYes.deliveryProblem && yes.emails.length === 0, "delivers it and clears the flag, emailing nobody");
  const thanks = await order("Thanks", { shippedAt: ago(13), arrivalAskedAt: ago(1) });
  await recordArrivalAnswer(thanks.id, "yes", now, fakeSend().send);
  const thanksAfter = await get(thanks.id);
  check(thanksAfter.status === "DELIVERED" && thanksAfter.deliveredAt?.getTime() === now.getTime(), "\"yes\" straight away: DELIVERED today");
  const changed = fakeSend();
  await recordArrivalAnswer(thanks.id, "no", now, changed.send);
  check((await get(thanks.id)).arrivalAnswer === "NOT_YET" && alertsFor(changed.emails, thanks.id).length === 1, "\"yes\" then \"not yet\" (a wrong button): the second answer counts and is emailed");
  check(/had said it arrived/.test((await get(thanks.id)).deliveryProblem ?? "") && !/carrier says/.test((await get(thanks.id)).deliveryProblem ?? ""), "saying they had said it arrived, not that the carrier did");
  const cancelled = await order("Cancelled", { status: "CANCELED", shippedAt: ago(13) });
  check((await recordArrivalAnswer(cancelled.id, "no", now, fakeSend().send)) === "gone", "a cancelled order has nothing to answer");
  check(!(await get(cancelled.id)).deliveryProblem, "and is left alone");

  console.log("\nMark arrived");
  await markArrivedByAdmin(silentUk.id, now);
  const marked = await get(silentUk.id);
  check(marked.status === "DELIVERED" && !marked.deliveryProblem, "a flagged shipped book: DELIVERED, off the list");
  await markArrivedByAdmin(delivered.id, now);
  check(!(await get(delivered.id)).deliveryProblem && (await get(delivered.id)).deliveredAt?.getTime() === deliveredAt.getTime(), "a delivered one flagged by \"not yet\": the flag cleared, the carrier's date kept");
  await markArrivedByAdmin(cancelled.id, now);
  check((await get(cancelled.id)).status === "CANCELED", "a cancelled one stays cancelled");

  console.log("\nThe links");
  const link = new URL(arrivalUrl(moving.id, "yes"));
  const sig = link.searchParams.get("sig");
  check(link.pathname === `/arrival/${moving.id}` && link.searchParams.get("a") === "yes", "the link is /arrival/<order>?a=yes");
  check(verifyArrival(moving.id, "yes", sig), "and verifies for its own order and answer");
  check(!verifyArrival(moving.id, "no", sig), "not for the other answer");
  check(!verifyArrival(quietUs.id, "yes", sig), "not for another order");
  check(!verifyArrival(moving.id, "maybe", sig) && !verifyArrival(moving.id, "yes", null) && !verifyArrival(moving.id, "yes", `${sig!.slice(0, -1)}0`), "nor with no answer, no signature, or a changed one");

  console.log("\nShipping reports");
  const printing = await order("Printing", { status: "IN_PRODUCTION", luluPrintJobId: "check_job_printing" });
  await applyLuluStatus({ id: "check_job_printing", status: { name: "SHIPPED" }, line_items: [{ tracking_id: " 9400111899223344556677 ", carrier_name: "USPS", tracking_urls: ["https://tools.usps.com/x"] }] } as never);
  const shipped = await get(printing.id);
  check(shipped.status === "SHIPPED" && !!shipped.shippedAt && Math.abs(shipped.shippedAt.getTime() - Date.now()) < 60_000, "Lulu's \"shipped\": SHIPPED, and when");
  check(shipped.trackingCode === "9400111899223344556677" && shipped.trackingCarrier === "USPS", "with the tracking number and carrier kept");
  const arrived = await order("Arrived", { status: "DELIVERED", luluPrintJobId: "check_job_arrived", shippedAt: ago(9), deliveredAt: ago(2) });
  await applyJobStatus("check_job_arrived", { name: "SHIPPED", status: "SHIPPED", tracking: [] });
  const stillArrived = await get(arrived.id);
  check(stillArrived.status === "DELIVERED" && stillArrived.shippedAt?.getTime() === ago(9).getTime(), "a late \"shipped\" cannot undo a delivery, nor move when it shipped");
} finally {
  await cleanUp();
  await prisma.$disconnect();
}

console.log(failures === 0 ? "\nAll delivery checks pass." : `\n${failures} delivery check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

// Ordering a printed book (2026-10-04): the parts that need no printer and
// no payment - the SKU, the bindings' page limits, the days an order covers
// and when it renews, the price, the signed file links, Lulu's webhook
// signature and the cover's panels.
//
// Expected values are STATED here, not imported - a test that asks the code
// for its answer only checks the code equals itself.
//
// Run with: npx tsx src/lib/print/print.test.mts

import { createHmac } from "node:crypto";
import { bindingAvailability, podPackageId, printedPageCount } from "./products";
import { leadDays, nextRange, orderRange, renewalDate, suggestedStart } from "./orderRange";
import { priceFromCost, BOOK_MARGIN, MIN_BOOK_PRICE_CENTS } from "./pricing";
import { printFileUrl, signPrintFile, verifyPrintFile } from "./fileUrls";
import { toCents, verifyLuluWebhook } from "./lulu";
import { buildCoverPdf, coverLayout } from "./cover";
import { rangeLabel } from "./orderBook";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} print check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All print checks passed (SKUs, page limits, order days, renewals, prices, file links, webhooks, the cover).");
  }
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

// --- the SKU -------------------------------------------------------------------
{
  check(podPackageId("coil", "bound7x10") === "0700X1000BWSTDCO060UW444MXX", `coil 7x10 (got ${podPackageId("coil", "bound7x10")})`);
  check(podPackageId("paperback", "bound7x10") === "0700X1000BWSTDPB060UW444MXX", "paperback 7x10");
  check(podPackageId("hardcover", "bound7x10") === "0700X1000BWSTDCW060UW444MXX", "hardcover 7x10");
  check(podPackageId("coil", "bound7x10")!.length === 27, "Lulu's SKU is 27 characters");
  check(podPackageId("coil", "letter") === null, "Letter is printed at home, not ordered");
}

// --- pages ---------------------------------------------------------------------
{
  check(printedPageCount(124) === 124 && printedPageCount(126) === 128 && printedPageCount(1) === 4, "padded to a multiple of four");
  const ok = (pages: number) => Object.fromEntries(bindingAvailability(pages).map((a) => [a.binding, a.ok]));
  const thin = ok(28);
  check(thin.coil && !thin.paperback && thin.hardcover, "28 pages: too thin for a paperback (32), fine coiled or hardcover (24)");
  const year = ok(500);
  check(!year.coil && year.paperback && year.hardcover, "500 pages: too thick to coil (470)");
  const huge = ok(900);
  check(!huge.coil && !huge.paperback && !huge.hardcover, "900 pages: nothing binds it (800)");
  const reason = bindingAvailability(500).find((a) => a.binding === "coil");
  check(!!reason && !reason.ok && /470/.test(reason.reason), "and says why");
}

// --- the days ------------------------------------------------------------------
{
  const range = orderRange(new Date("2026-10-05T15:30:00Z"), 30);
  check(iso(range.start) === "2026-10-05" && iso(range.end) === "2026-11-03" && range.days === 30, `30 days from 5 Oct end on 3 Nov, both included (got ${iso(range.start)}..${iso(range.end)})`);
  const year = orderRange(new Date("2027-01-01T00:00:00Z"), 365);
  check(iso(year.end) === "2027-12-31", "a year from 1 Jan ends 31 Dec");
  const next = nextRange(range);
  check(iso(next.start) === "2026-11-04" && next.days === 30, "a renewal starts the day after, for as many days");
  check(orderRange(new Date("2026-10-05T00:00:00Z"), 5000).days === 731 && orderRange(new Date("2026-10-05T00:00:00Z"), 0).days === 1, "days are clamped to 1..731");
  check(leadDays("EXPRESS", false) < leadDays("MAIL", false) && leadDays("MAIL", false) < leadDays("MAIL", true), "faster post, less lead; abroad, more");
  // Renewed early enough to arrive before the last day...
  const due = renewalDate(range, "MAIL", false, new Date("2026-10-05T00:00:00Z"));
  check(due.getTime() === range.end.getTime() - leadDays("MAIL", false) * 86_400_000, `renewal ordered ${leadDays("MAIL", false)} days before the end (${iso(due)})`);
  // ...and never in the past: a week-long book renews at once.
  const short = orderRange(new Date("2026-10-05T00:00:00Z"), 7);
  check(iso(renewalDate(short, "MAIL", true, new Date("2026-10-05T12:00:00Z"))) === "2026-10-05", "a short book's renewal is today, not before");
  // A suggested start: on the journal's week start, after the book arrives.
  const today = new Date("2026-10-04T10:00:00Z"); // a Sunday
  const start = suggestedStart(today, "GROUND", false, 1);
  const arrives = new Date(Date.UTC(2026, 9, 4) + leadDays("GROUND", false) * 86_400_000);
  check(start.getUTCDay() === 1 && start >= arrives && start.getTime() - arrives.getTime() < 7 * 86_400_000, `a Monday journal starts on the first Monday after arrival (${iso(start)})`);
}

// --- the price -----------------------------------------------------------------
{
  const cost = { printCents: 1112, fulfillmentCents: 75, shippingCents: 599, taxCents: 0, totalCents: 1786, currency: "USD" };
  const price = priceFromCost(cost);
  check(price.shippingCents === 599, "the post is passed on at Lulu's charge");
  check(price.totalCents === price.bookCents + price.shippingCents && price.costCents === 1786, "the total is book and post");
  check(price.bookCents % 100 === 99, `a price ends in 99 cents (${price.bookCents})`);
  // After the card fee, at least the margin of the book's price is left.
  const fee = price.totalCents * 0.039 + 30;
  const kept = (price.bookCents - (cost.totalCents - cost.shippingCents) - fee) / price.bookCents;
  check(kept >= BOOK_MARGIN - 0.005, `the margin holds after the card fee (${(kept * 100).toFixed(1)}%)`);
  const tiny = priceFromCost({ ...cost, printCents: 100, totalCents: 775 });
  check(tiny.bookCents >= MIN_BOOK_PRICE_CENTS, "no book under the floor");
  check(toCents("12.345") === 1235 && toCents("0.75") === 75 && toCents(undefined) === 0, "Lulu's decimal strings become cents");
}

// --- the file links ------------------------------------------------------------
{
  const url = printFileUrl("https://memari.studio", "order1", "interior");
  check(url.startsWith("https://memari.studio/api/print-files/order1/interior.pdf?sig="), url);
  const sig = signPrintFile("order1", "interior");
  check(verifyPrintFile("order1", "interior", sig), "a link's own signature opens it");
  check(!verifyPrintFile("order1", "cover", sig), "but not the order's other file");
  check(!verifyPrintFile("order2", "interior", sig), "nor another order's");
  check(!verifyPrintFile("order1", "interior", sig.replace(/.$/, (c) => (c === "0" ? "1" : "0"))), "nor a signature one character off");
  check(!verifyPrintFile("order1", "interior", null), "nor none");
}

// --- Lulu's webhook signature ---------------------------------------------------
{
  const body = JSON.stringify({ topic: "PRINT_JOB_STATUS_CHANGED", data: { id: 1 } });
  const good = createHmac("sha256", "secret").update(body).digest("hex");
  check(verifyLuluWebhook(body, good, "secret"), "Lulu's signature is accepted");
  check(verifyLuluWebhook(body, good.toUpperCase(), "secret"), "in either case");
  check(!verifyLuluWebhook(body + " ", good, "secret"), "a changed body is not");
  check(!verifyLuluWebhook(body, good, "other"), "nor another key's signature");
  check(!verifyLuluWebhook(body, null, "secret"), "nor no signature");
}

// --- the cover -----------------------------------------------------------------
{
  // A paperback: 7 x 10 trim, 1/8in bleed, a 20pt spine.
  const paperback = coverLayout({ widthPt: 2 * (504 + 9) + 20, heightPt: 738, trimWidthIn: 7, trimHeightIn: 10 });
  check(Math.abs(paperback.outerPt - 9) < 0.01 && Math.abs(paperback.spinePt - 20) < 0.01, `bleed and spine recovered (${paperback.outerPt}, ${paperback.spinePt})`);
  check(Math.abs(paperback.frontCentreX - (1046 - 9 - 252)) < 0.01 && Math.abs(paperback.backCentreX - (9 + 252)) < 0.01, "front on the right, back on the left");
  // A hardcover wraps its boards: more outside the trim, the same rule.
  const hardcover = coverLayout({ widthPt: 2 * (504 + 54) + 30, heightPt: 720 + 108, trimWidthIn: 7, trimHeightIn: 10 });
  check(Math.abs(hardcover.outerPt - 54) < 0.01 && Math.abs(hardcover.spinePt - 30) < 0.01, "a hardcover's wrap is found the same way");
  // A coil book has no spine.
  const coil = coverLayout({ widthPt: 2 * (504 + 9), heightPt: 738, trimWidthIn: 7, trimHeightIn: 10 });
  check(coil.spinePt === 0, "a coil book has no spine");
  const built = buildCoverPdf({ widthPt: 1046, heightPt: 738, trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "4 Jan – 3 Apr 2027" });
  const head = new TextDecoder().decode(new Uint8Array(built.bytes).slice(0, 5));
  check(head === "%PDF-", "the cover is a PDF");
  check(built.fontEmbedded, "set in the planner's own face");
}

// --- the dates on the cover -------------------------------------------------------
{
  check(rangeLabel(orderRange(new Date("2027-01-04T00:00:00Z"), 90)) === "4 Jan – 3 Apr 2027", `one year (got ${rangeLabel(orderRange(new Date("2027-01-04T00:00:00Z"), 90))})`);
  check(rangeLabel(orderRange(new Date("2027-01-04T00:00:00Z"), 365)) === "4 Jan 2027 – 3 Jan 2028", "across a new year");
}

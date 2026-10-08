// Ordering a printed book (2026-10-04): the parts that need no printer and
// no payment - the SKU, the bindings' page limits, the days an order covers
// and when it renews, the price, the signed file links, Lulu's webhook
// signature and the cover's panels - and, from 2026-10-08, BookVault's
// metal wire-o: its SKU, routing, page limits, money, customs, the order it
// is sent, the statuses it reports and the two-page cover.
//
// Expected values are STATED here, not imported - a test that asks the code
// for its answer only checks the code equals itself.
//
// Run with: npx tsx src/lib/print/print.test.mts

import { createHmac } from "node:crypto";
import { customerCanCancel } from "./orders";
import { BINDINGS, BINDING_ENUM, bindingFromEnum, dottedPodPackageId, gutterInches, podPackageId, printedPageCount, shippedAbroad } from "./products";
import { BOOKVAULT, LULU, availability, printerFor, printerForBinding, shippingLabel, DEFAULT_PRINTER } from "./printer";
import {
  bookVaultAddress,
  bookVaultAddressProblem,
  bookVaultCost,
  bookVaultCoverPage,
  bookVaultOrderBody,
  bookVaultReport,
  bookVaultSku,
  customsFor,
  pickService,
  webhookReferences,
} from "./bookvault";

/** With every printer's keys "set" - nothing here calls one - so a binding's
 *  page limits are what is checked; as it was before, then. */
function withKeys<T>(keys: Record<string, string | undefined>, run: () => T): T {
  const saved = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(keys)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
const ALL_KEYS = { LULU_CLIENT_KEY: "k", LULU_CLIENT_SECRET: "s", BOOKVAULT_API_KEY: "b" };
const bindingAvailability = (pages: number) => withKeys(ALL_KEYS, () => availability(pages));
import { gutterTransform } from "../plannerPdf";
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
    console.log("All print checks passed (SKUs, page limits, order days, renewals, prices, file links, webhooks, the cover, BookVault's wire-o).");
  }
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

// --- the SKU -------------------------------------------------------------------
{
  // Dotted since 2026-10-08: Lulu drops the undotted 27 characters on 2027-02-01.
  check(podPackageId("coil", "bound7x10") === "0700X1000.BW.STD.CO.060UW444.MXX", `coil 7x10 (got ${podPackageId("coil", "bound7x10")})`);
  check(podPackageId("paperback", "bound7x10") === "0700X1000.BW.STD.PB.060UW444.MXX", "paperback 7x10");
  check(podPackageId("hardcover", "bound7x10") === "0700X1000.BW.STD.CW.060UW444.MXX", "hardcover 7x10");
  check(podPackageId("coil", "bound7x10")!.replaceAll(".", "").length === 27, "the same 27 characters, dotted");
  // An order saved with the old form is sent dotted; Lulu's own example converts as its docs show.
  check(dottedPodPackageId("0500X0800FCPRESS060UW444GXX") === "0500X0800.FC.PRE.SS.060UW444.GXX", "Lulu's example, dotted");
  check(dottedPodPackageId("0700X1000BWSTDPB060UW444MXX") === podPackageId("paperback", "bound7x10"), "an old paperback SKU becomes today's");
  check(dottedPodPackageId("0700X1000.BW.STD.CO.060UW444.MXX") === "0700X1000.BW.STD.CO.060UW444.MXX", "a dotted SKU is left alone");
  check(dottedPodPackageId("NOT-A-SKU") === "NOT-A-SKU", "anything else is left for Lulu to refuse");
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

// --- room for the binding ----------------------------------------------------------
{
  // Lulu's table for a paperback or hardcover; a coil book needs none.
  const table: Array<[number, number]> = [[48, 0], [60, 0], [64, 0.125], [150, 0.125], [152, 0.5], [400, 0.5], [404, 0.625], [600, 0.625], [604, 0.75]];
  check(table.every(([pages, inches]) => gutterInches("paperback", pages) === inches && gutterInches("hardcover", pages) === inches), "Lulu's gutter table, paperback and hardcover");
  check([48, 200, 470].every((pages) => gutterInches("coil", pages) === 0), "a coil book needs no gutter");
  // The transform keeps the OUTER edge and moves the inner one by the gutter.
  const grid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5 };
  const pt = (px: number) => (px * 72) / 300;
  const g = 0.5;
  for (const rightHand of [true, false]) {
    const t = gutterTransform(grid, g, rightHand);
    // A point in the page's own px, through [s 0 0 s e f] in PDF space, back to px.
    const map = (x: number, y: number) => {
      const X = t.s * pt(x) + t.e;
      const Y = t.s * (pt(grid.heightPx) - pt(y)) + t.f;
      return { x: (X * 300) / 72, y: grid.heightPx - (Y * 300) / 72 };
    };
    const left = map(187.5, 187.5).x;
    const right = map(187.5 + 1800, 187.5).x;
    const top = map(187.5, 187.5).y;
    const bottom = map(187.5, 187.5 + 2700).y;
    const inside = rightHand ? left - 187.5 : 187.5 + 1800 - right;
    const outside = rightHand ? 187.5 + 1800 - right : left - 187.5;
    check(Math.abs(inside - g * 300) < 0.01 && Math.abs(outside) < 0.01, `${rightHand ? "a right-hand" : "a left-hand"} page: the inside edge moves ${g}in, the outside stays (${(inside / 300).toFixed(3)}, ${(outside / 300).toFixed(3)})`);
    check(Math.abs(top - 187.5 - (187.5 + 2700 - bottom)) < 0.01, "and the page stays centred top to bottom");
    check(Math.abs(t.s - (6 - g) / 6) < 1e-9, `drawn ${(t.s * 100).toFixed(1)}% of its size, never stretched`);
  }
}

// --- cancelling at the printer ---------------------------------------------------------
// Lulu's spec allows CANCELED only from CREATED, UNPAID and PRODUCTION_DELAYED.
{
  const can = (luluStatus: string | null) => customerCanCancel({ status: "SUBMITTED", luluPrintJobId: "1", stripePaymentIntentId: "pi", luluStatus });
  check(can(null) && can("CREATED") && can("UNPAID") && can("PRODUCTION_DELAYED"), "cancellable while Lulu allows it");
  check(!can("PAYMENT_IN_PROGRESS") && !can("PRODUCTION_READY") && !can("IN_PRODUCTION") && !can("SHIPPED"), "not once Lulu would refuse it");
}

// --- the printer ----------------------------------------------------------------------
{
  check(DEFAULT_PRINTER === LULU && printerFor(null) === LULU && printerFor("lulu") === LULU, "Lulu prints, and an order without a printer went to Lulu");
  let threw = false;
  try {
    printerFor("mixam");
  } catch {
    threw = true;
  }
  check(threw, "a printer this code does not know is an error, never quietly Lulu");
  check(LULU.sku("hardcover", "bound7x10") === podPackageId("hardcover", "bound7x10") && LULU.sku("coil", "letter") === null, "Lulu's product codes");
  check(LULU.gutterInches("paperback", 200) === gutterInches("paperback", 200) && LULU.gutterInches("coil", 200) === 0, "Lulu's binding margins");
  const coil = LULU.pageLimits("coil");
  check(coil.min === 2 && coil.max === 470, "Lulu's page limits");
}

// --- metal wire-o at BookVault (2026-10-08) -------------------------------------------
{
  // The SKU: [paper][lamination][binding][height]H[width]W, sizes in three digits.
  check(bookVaultSku("wireo", "bound7x10") === "170UWMWB254H178W", `170 gsm premium bond, matte, wire-o, 254 x 178 mm (got ${bookVaultSku("wireo", "bound7x10")})`);
  check(bookVaultSku("coil", "bound7x10") === null && bookVaultSku("wireo", "letter") === null, "nothing else, and not Letter");
  check(podPackageId("wireo", "bound7x10") === null, "Lulu does not make it");

  // Each binding has one printer; wire-o comes first, the screen's default.
  check(BINDINGS[0] === "wireo", "metal wire-o is listed first");
  check(printerForBinding("wireo") === BOOKVAULT && (["coil", "paperback", "hardcover"] as const).every((b) => printerForBinding(b) === LULU), "wire-o at BookVault, the rest at Lulu");
  check(printerFor("bookvault") === BOOKVAULT, "an order remembers BookVault");
  check(bindingFromEnum(BINDING_ENUM.wireo) === "wireo" && BINDING_ENUM.wireo === "WIRE_O", "stored as WIRE_O and read back");

  // Pages: 350 at most on 170 gsm.
  const fit = (pages: number) => bindingAvailability(pages).find((a) => a.binding === "wireo")!;
  check(fit(126).ok && fit(348).ok, "a quarter with daily pages (126) fits, and 348");
  const over = fit(352);
  check(!over.ok && /350/.test(over.reason), `352 printed pages is past the wire's 350, and says so (${over.ok ? "" : over.reason})`);
  const off = withKeys({ ...ALL_KEYS, BOOKVAULT_API_KEY: undefined }, () => availability(126)).find((a) => a.binding === "wireo")!;
  check(!off.ok && /can't be ordered yet/.test(off.reason), "without BookVault's key, wire-o is not offered");

  // Room for the wire: content 15mm or more from the binding edge.
  const inside = (0.5 + BOOKVAULT.gutterInches("wireo", 200)) * 25.4;
  check(inside >= 15, `content ${inside.toFixed(1)}mm from the punched edge (BookVault asks for about 15)`);

  // Where it posts from: a US address is abroad for wire-o, home for the rest.
  check(shippedAbroad("wireo", "US") && !shippedAbroad("wireo", "GB") && !shippedAbroad("coil", "US") && shippedAbroad("coil", "GB"), "abroad, by the binding's printer");
  check(shippingLabel("bookvault", "MAIL") === "Tracked post" && shippingLabel("bookvault", "EXPRESS") === "Express courier" && shippingLabel("lulu", "MAIL") === "Standard mail", "each printer names its post");

  // Money: pounds to dollars at the rate given; US duty 10% of the goods + 2.50; UK VAT 20%.
  const us = bookVaultCost(3.91, 11.08, "US", 1.4);
  check(us.printCents === 547 && us.shippingCents === 1551 && us.taxCents === 560 && us.totalCents === 2658 && us.currency === "USD", `to the US (${JSON.stringify(us)})`);
  const gb = bookVaultCost(3.91, 11.08, "GB", 1.4);
  check(gb.taxCents === 420 && gb.totalCents === 547 + 1551 + 420, `within the UK, VAT (${gb.taxCents})`);
  const de = bookVaultCost(3.91, 11.08, "DE", 1.4);
  check(de.taxCents === 0, "elsewhere, nothing: import charges are the buyer's");
  check(priceFromCost(us).totalCents > us.totalCents, "and the customer's price covers it");

  // Customs: a diary, duties paid to the US.
  check(customsFor("GB") === undefined, "no declaration within the UK");
  const toUs = customsFor("US")!;
  check(toUs.hsCode === "482010" && toUs.incoTerms === "DDP" && toUs.useOrderValue && !toUs.useIOSS, "the US: HS 4820.10, duties paid, the order's value");
  check(customsFor("DE")!.incoTerms === "DDU", "elsewhere: the buyer's");

  // The service: the one BookVault names, else the level's rule.
  const services = [
    { servID: 1, tracked: false, deliveryTotal: 4, maxDeliveryDays: 15 },
    { servID: 2, tracked: true, deliveryTotal: 9, maxDeliveryDays: 10 },
    { servID: 3, tracked: true, deliveryTotal: 25, maxDeliveryDays: 4 },
  ];
  check(pickService({ services, requestedServices: [3] }, "CheapestTracked")?.servID === 3, "the service BookVault names");
  check(pickService({ services }, "CheapestTracked")?.servID === 2, "else the cheapest that is tracked");
  check(pickService({ services }, "Quickest")?.servID === 3, "or the quickest");
  check(pickService({ services: [] }, "Quickest") === null, "none, when there is none");

  // The address.
  const home = { name: "Sam Rivera", street1: "1 Main St", city: "Springfield", stateCode: "IL", countryCode: "US", postcode: "62701", phoneNumber: "555 0100" };
  check(bookVaultAddressProblem(home) === null, "a full US address is fine");
  check(/state/.test(bookVaultAddressProblem({ ...home, stateCode: undefined }) ?? ""), "a US address needs its state");
  check(/first and last/.test(bookVaultAddressProblem({ ...home, name: "Sam" }) ?? ""), "and a first and last name");
  const mapped = bookVaultAddress(home, "sam@example.com");
  check(mapped.addressee === "Sam Rivera" && mapped.address1 === "1 Main St" && mapped.town === "Springfield" && mapped.county === "IL" && mapped.postCode === "62701" && mapped.countryCode === "US" && mapped.email === "sam@example.com", "in BookVault's words");

  // The order sent.
  const body = bookVaultOrderBody({ externalId: "ord_1", title: "My Journal", sku: "170UWMWB254H178W", pages: 128, interiorUrl: "https://x/i.pdf", coverUrl: "https://x/c.pdf", address: home, level: "EXPRESS", contactEmail: "sam@example.com" });
  const line = body.orderLines[0];
  check(body.docRef === "ord_1" && body.partner === "Bookvault_UK" && body.productionLevel === "Standard", "our id as its reference, the UK site, standard speed");
  check(line.quantity === 1 && line.transient.productSku === "170UWMWB254H178W" && line.transient.monoPages === 128 && line.transient.colourPages === 0, "one transient book of 128 black pages");
  check(line.transient.files?.Cover === "https://x/c.pdf" && line.transient.files?.Text === "https://x/i.pdf", "with its own cover and interior");
  check(body.dispatchRequest.requestedService === "Quickest" && bookVaultOrderBody({ ...{ externalId: "o", title: "t", sku: "s", pages: 4, interiorUrl: "", coverUrl: "", contactEmail: "" }, address: home, level: "MAIL" }).dispatchRequest.requestedService === "CheapestTracked", "express is the quickest; mail the cheapest tracked");
  check(body.customsDeclaration?.incoTerms === "DDP", "declared duties paid");

  // What BookVault reports, as our statuses.
  check(bookVaultReport({ fulfillment: { progress: { status: "Acknowledged" } } }).status === "SUBMITTED", "acknowledged: with the printer");
  check(bookVaultReport({ fulfillment: { progress: { status: "SentToPrint" } } }).status === "IN_PRODUCTION", "sent to print: printing");
  const shipped = bookVaultReport({ fulfillment: { progress: { status: "Dispatched" }, trackingDetails: { combinedURL: "https://track/1" } } });
  check(shipped.status === "SHIPPED" && shipped.tracking[0] === "https://track/1", "dispatched: shipped, with its tracking");
  check(bookVaultReport({ metadata: { status: "Deleted" }, fulfillment: { progress: { status: "Created" } } }).status === "CANCELED", "deleted: cancelled");
  const failed = bookVaultReport({ criticalError: true, messages: [{ level: "Error", message: "Cover file is the wrong size" }] });
  check(failed.status === "FAILED" && /wrong size/.test(failed.message ?? ""), "a critical error: failed, with why");

  // Cancelling: before BookVault sends it to print.
  const can = (luluStatus: string | null) => customerCanCancel({ status: "SUBMITTED", luluPrintJobId: "9", stripePaymentIntentId: "pi", luluStatus, printer: "bookvault" });
  check(can(null) && can("Created") && can("Acknowledged"), "cancellable until sent to print");
  check(!can("SentToPrint") && !can("Printed") && !can("CREATED"), "not after, and not by Lulu's names");

  // A webhook says which order, wherever it puts it.
  const refs = webhookReferences({ topic: "ORDER_SHIPPED", data: { identification: { podRef: 123, docRef: "ord_1" } } });
  check(refs.podRef === "123" && refs.docRef === "ord_1", `found in the body (${JSON.stringify(refs)})`);
  check(Object.keys(webhookReferences({ hello: "world" })).length === 0, "and nothing where there is nothing");

  // The cover: two pages, front then back, each the trim with 3mm bleed.
  const page = bookVaultCoverPage("170UWMWB254H178W");
  check(Math.abs(page.widthPt - (184 / 25.4) * 72) < 0.01 && Math.abs(page.heightPt - (260 / 25.4) * 72) < 0.01, `184 x 260 mm a page (${page.widthPt.toFixed(2)} x ${page.heightPt.toFixed(2)} pt)`);
  const panels = buildCoverPdf({ ...page, form: "panels", trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "4 Jan – 3 Apr 2027" });
  const text = new TextDecoder("latin1").decode(new Uint8Array(panels.bytes));
  const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [Number(m[3]), Number(m[4])]);
  check(panels.pages === 2 && boxes.length === 2, `two pages (${boxes.length} page boxes)`);
  check(boxes.every(([w, h]) => Math.abs(w - page.widthPt) < 0.01 && Math.abs(h - page.heightPt) < 0.01), `each a cover page in size (${JSON.stringify(boxes)})`);
  // Each page has its own bleed on all four sides, about 3mm (8.5pt): the
  // front's trim starts that far in from its binding edge, and the back's
  // ends that far short of it.
  const front = panels.layout.frontCentreX - 252 - page.widthPt;
  const back = page.widthPt - (panels.layout.backCentreX + 252);
  const edges = [panels.layout.outerPt, front, page.widthPt - (front + 504), back];
  check(edges.every((e) => e > 8 && e < 9.5), `3mm of bleed on every edge of both pages (${edges.map((e) => e.toFixed(2)).join(", ")} pt)`);
  const wrap = buildCoverPdf({ widthPt: 1046, heightPt: 738, trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "" });
  check(wrap.pages === 1, "a wrap is still one sheet");
}

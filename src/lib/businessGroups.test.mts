// Groups that start together (businessGroups.ts, print/groupOrders.ts): a
// pasted list read as coaches paste them, the group form, where a member's
// books go, the post levels a group's books share, and the one payment
// page. Expected values by hand.
//
// Run as part of: npm test

import { GROUP_MAX_MEMBERS, groupDetailsFrom, membersFromLines } from "./businessGroups";
import { bookAddressOf } from "./business";
import { groupOptions, groupSessionParams } from "./print/groupOrders";
import { priceFromCost } from "./print/pricing";
import type { ShippingQuote } from "./print/printer";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    failures++;
    console.error(`FAIL ${what}`);
  }
};

// ---- a pasted list
const pasted = membersFromLines(
  [
    "Name\tEmail", // headings from a spreadsheet: passed over
    "Maya Okafor, maya@example.com",
    "Sam Lee <SAM@Example.com>",
    "  ",
    "priya@example.com\tPriya Nair", // the other way round, a tab between
    "Ana Lima",
    "Maya Okafor, MAYA@example.com", // twice: once
    "Jo, jo@example", // not an email
    "noname@example.com",
    "Two, a@example.com, b@example.com",
  ].join("\r\n")
);
const names = pasted.members.map((m) => `${m.name}|${m.email ?? ""}`);
check(
  JSON.stringify(names) === JSON.stringify(["Maya Okafor|maya@example.com", "Sam Lee|sam@example.com", "Priya Nair|priya@example.com", "Ana Lima|"]),
  `names and emails in either order, by comma, <> or tab; headings, blanks and a repeat passed over (${JSON.stringify(names)})`
);
check(pasted.problems.length === 3, `three lines refused (${JSON.stringify(pasted.problems)})`);
check(pasted.problems.some((p) => p.line === 8 && p.error.includes("jo@example")), "a bad email names itself and its line");
check(pasted.problems.some((p) => p.line === 9 && p.error.includes("needs a name")), "an email with no name is refused, not guessed");
check(pasted.problems.some((p) => p.line === 10 && p.error.includes("two email")), "two emails on a line is two people: refused");
check(membersFromLines("").members.length === 0 && membersFromLines("").problems.length === 0, "nothing pasted is nobody, and no problem");
check(membersFromLines("Name, Email\nAna").members.length === 1, "comma headings too");
check(membersFromLines("Ana Lima\nANA   lima").members.length === 1, "the same name with no email, however it's spaced or cased, is one person");

// ---- the group form
const form = (fields: Record<string, string>) => (key: string, max = 200) => (fields[key] ?? "").trim().slice(0, max);
const venue = { addressName: "Northwind at Hotel Lumen", street1: "120 Congress Ave", city: "Austin", stateCode: "TX", postcode: "78701", countryCode: "us", phoneNumber: "+1 512 555 0100" };
const ok = groupDetailsFrom(form({ name: "January cohort", bookMonths: "3", startDate: "2027-01-04", shipTo: "venue", templateId: "t1", ...venue }));
check("details" in ok && ok.details.shipToVenue && ok.details.venueAddress?.countryCode === "US" && ok.details.startDate?.toISOString().startsWith("2027-01-04") === true, `a group sending every book to one place (${JSON.stringify(ok)})`);
check("error" in groupDetailsFrom(form({ bookMonths: "3" })), "a group needs a name");
check("error" in groupDetailsFrom(form({ name: "G", bookMonths: "4" })), "a book runs 1, 3, 6 or 12 months");
check("error" in groupDetailsFrom(form({ name: "G", bookMonths: "3", startDate: "2027-02-30" })), "a start date that isn't one is refused");
const half = groupDetailsFrom(form({ name: "G", bookMonths: "3", shipTo: "venue", ...venue, phoneNumber: "", street1: "" }));
check("error" in half && half.error.includes("street") && half.error.includes("phone"), `one place needs its whole address, and says what's missing (${JSON.stringify(half)})`);
const home = groupDetailsFrom(form({ name: "G", bookMonths: "3", shipTo: "homes", street1: "1 Partial St" }));
check("details" in home && !home.details.shipToVenue && home.details.venueAddress?.street1 === "1 Partial St", "books home: a place half typed is kept, not required");
check("error" in groupDetailsFrom(form({ name: "G", bookMonths: "3", countryCode: "ZZ" })), "a country Memari can't post to is refused");
check(GROUP_MAX_MEMBERS <= 99, "a group's books fit one Stripe page (99 books and the post)");

// ---- where a member's books go
const own = { name: "Maya Okafor", street1: "1 Elm St", city: "Jersey City", postcode: "07302", countryCode: "US", phoneNumber: "+1 201 555 0100" };
const place = { name: "Hotel Lumen", street1: "120 Congress Ave", city: "Austin", postcode: "78701", countryCode: "US", phoneNumber: "+1 512 555 0100" };
check(bookAddressOf({ shippingAddress: own, group: null })?.city === "Jersey City", "no group: their own address");
check(bookAddressOf({ shippingAddress: own, group: { shipToVenue: false, venueAddress: place } })?.city === "Jersey City", "a group sending books home: their own address");
check(bookAddressOf({ shippingAddress: own, group: { shipToVenue: true, venueAddress: place } })?.city === "Austin", "a group sending every book to one place: that place");
check(bookAddressOf({ shippingAddress: null, group: { shipToVenue: true, venueAddress: place } })?.city === "Austin", "a member with no address of their own still has the group's place");
check(bookAddressOf({ shippingAddress: own, group: { shipToVenue: true, venueAddress: { ...place, phoneNumber: "" } } }) === null, "a group's place without everything a printer needs is nowhere, not their home");

// ---- the post levels a group's books share
const cost = (total: number, ship: number) => ({ printCents: total - ship, fulfillmentCents: 0, shippingCents: ship, taxCents: 0, totalCents: total, currency: "USD" });
const q = (level: ShippingQuote["level"], total: number, ship: number, arrives?: [string, string]): ShippingQuote => ({ level, cost: cost(total, ship), ...(arrives ? { arrives: { earliest: arrives[0], latest: arrives[1] } } : {}) });
const options = groupOptions(
  ["MAIL", "GROUND", "EXPRESS"],
  [
    { clientId: "a", quotes: [q("MAIL", 1500, 500, ["2026-11-10", "2026-11-14"]), q("GROUND", 1800, 800, ["2026-11-09", "2026-11-12"]), q("EXPRESS", 3000, 2000)] },
    { clientId: "b", quotes: [q("MAIL", 1600, 600, ["2026-11-11", "2026-11-16"]), q("GROUND", 1900, 900, ["2026-11-10", "2026-11-13"])] },
  ],
  (level) => `label ${level}`
);
check(JSON.stringify(options.map((o) => o.level)) === JSON.stringify(["MAIL", "GROUND"]), `a level one book can't have is not offered (${options.map((o) => o.level)})`);
const mail = options[0];
const each = [priceFromCost(cost(1500, 500)), priceFromCost(cost(1600, 600))];
check(mail.totalCents === each[0].totalCents + each[1].totalCents && mail.shippingCents === 1100 && mail.bookCents === each[0].bookCents + each[1].bookCents, `each book priced as one book is, and added up (${mail.totalCents})`);
check(mail.perBook.a === each[0].totalCents && mail.perBook.b === each[1].totalCents, "and each book's own total kept, to check it when it is made");
check(mail.arrives?.earliest === "2026-11-10" && mail.arrives.latest === "2026-11-16", `arrival from the first possible to the last (${JSON.stringify(mail.arrives)})`);
check(mail.label === "label MAIL", "the level named");
check(groupOptions(["MAIL"], [], () => "").length === 0, "no books, no options");

// ---- the one payment page
const books = [
  { id: "o1", title: "Maya Okafor", description: "Coil, 4 Jan – 3 Apr 2027, 104 pages", bookCents: 3699, shippingCents: 599, totalCents: 4298 },
  { id: "o2", title: "Sam Lee", description: "Coil, 4 Jan – 3 Apr 2027, 104 pages", bookCents: 3699, shippingCents: 649, totalCents: 4348 },
];
const page = groupSessionParams({ batchId: "b1", group: "January cohort", customer: "cus_1", books, shippingName: "Standard mail", successUrl: "https://x/ok", cancelUrl: "https://x/no", expiresAt: 2_000_000_000 });
const lines = page.line_items ?? [];
const charged = lines.reduce((s, l) => s + (l.price_data?.unit_amount ?? 0) * (l.quantity ?? 1), 0);
check(charged === 4298 + 4348, `the page charges the books' totals added up (${charged})`);
check(lines.length === 3 && lines[0].price_data?.product_data?.name === "Maya Okafor - printed journal" && lines[2].price_data?.unit_amount === 1248, "a line a book, and the post of all of them on one");
check(page.metadata?.batchId === "b1" && page.payment_intent_data?.metadata?.batchId === "b1" && !page.metadata?.orderId, "the page names its batch, not an order (api/stripe/webhook)");
check(!page.payment_intent_data?.setup_future_usage, "no card kept: a group's books don't renew");
let threw = "";
try {
  groupSessionParams({ batchId: "b1", group: "G", customer: "c", books: [{ ...books[0], totalCents: 1 }], shippingName: "", successUrl: "", cancelUrl: "", expiresAt: 0 });
} catch (error) {
  threw = String(error);
}
check(threw.includes("does not add up"), "a book whose lines don't add up to its total is refused");

if (failures > 0) {
  console.error(`\n${failures} group check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All group checks passed.");
}

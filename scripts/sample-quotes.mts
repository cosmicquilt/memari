// npm run quotes:sample - refreshes src/lib/print/sampleQuotes.json, the
// printer quotes behind the How it works page's price estimate
// (src/lib/print/estimate.ts).
//
// READ-ONLY calls: Lulu's cost calculation (the sandbox unless
// LULU_API_BASE says otherwise) and BookVault's /v4/title/calculate and
// dispatch estimate, which place nothing. Keys from .env, never printed.
// Each binding is quoted at a handful of page counts in each country, at
// the cheapest post the order screen would offer; the page interpolates
// between them. Run it when a printer's prices move; the order screen stays
// the live price either way.
//
//   ONLY=JP,MX npm run quotes:sample     just those countries (merged in)
//   ALL_LEVELS=1 npm run quotes:sample   every shipping level, cheapest kept

import { existsSync, readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { LULU, BOOKVAULT } = await import("../src/lib/print/printer");
const { priceFromCost } = await import("../src/lib/print/pricing");
type Addr = import("../src/lib/print/lulu").ShippingAddress;
type Quotes = import("../src/lib/print/estimate").SampleQuotes;

const OUT = "src/lib/print/sampleQuotes.json";
/** A real-looking address per country: post is priced to it. */
const ADDRESSES: Record<string, Addr> = {
  US: { name: "Sam Lee", street1: "350 5th Ave", city: "New York", stateCode: "NY", countryCode: "US", postcode: "10118", phoneNumber: "2125551234" },
  CA: { name: "Sam Lee", street1: "290 Bremner Blvd", city: "Toronto", stateCode: "ON", countryCode: "CA", postcode: "M5V 3L9", phoneNumber: "4165551234" },
  GB: { name: "Sam Lee", street1: "10 Downing St", city: "London", countryCode: "GB", postcode: "SW1A 2AA", phoneNumber: "02075551234" },
  IE: { name: "Sam Lee", street1: "1 Grafton St", city: "Dublin", countryCode: "IE", postcode: "D02 X285", phoneNumber: "015551234" },
  DE: { name: "Sam Lee", street1: "Unter den Linden 1", city: "Berlin", countryCode: "DE", postcode: "10117", phoneNumber: "030555123" },
  FR: { name: "Sam Lee", street1: "1 Rue de Rivoli", city: "Paris", countryCode: "FR", postcode: "75001", phoneNumber: "0155512345" },
  NL: { name: "Sam Lee", street1: "Damrak 1", city: "Amsterdam", countryCode: "NL", postcode: "1012 LG", phoneNumber: "0205551234" },
  SE: { name: "Sam Lee", street1: "Drottninggatan 1", city: "Stockholm", countryCode: "SE", postcode: "111 51", phoneNumber: "085551234" },
  AU: { name: "Sam Lee", street1: "1 Macquarie St", city: "Sydney", stateCode: "NSW", countryCode: "AU", postcode: "2000", phoneNumber: "0255551234" },
  NZ: { name: "Sam Lee", street1: "1 Queen St", city: "Auckland", countryCode: "NZ", postcode: "1010", phoneNumber: "095551234" },
  JP: { name: "Sam Lee", street1: "1-1 Marunouchi", city: "Chiyoda-ku, Tokyo", countryCode: "JP", postcode: "100-0005", phoneNumber: "0355551234" },
  SG: { name: "Sam Lee", street1: "1 Raffles Pl", city: "Singapore", countryCode: "SG", postcode: "048616", phoneNumber: "65551234" },
  IN: { name: "Sam Lee", street1: "1 Marine Dr", city: "Mumbai", stateCode: "MH", countryCode: "IN", postcode: "400020", phoneNumber: "2255512345" },
  MX: { name: "Sam Lee", street1: "Paseo de la Reforma 1", city: "Ciudad de Mexico", stateCode: "CMX", countryCode: "MX", postcode: "06600", phoneNumber: "5555512345" },
  ZA: { name: "Sam Lee", street1: "1 Adderley St", city: "Cape Town", countryCode: "ZA", postcode: "8001", phoneNumber: "215551234" },
};
const PAGES = [32, 128, 240, 348, 472, 600, 800];
const BINDINGS = [
  { binding: "wireo", printer: BOOKVAULT },
  { binding: "wireoStandard", printer: BOOKVAULT },
  { binding: "paperback", printer: LULU },
  { binding: "hardcover", printer: LULU },
] as const;

const only = process.env.ONLY?.split(",");
const countries = Object.keys(ADDRESSES).filter((c) => !only || only.includes(c));
const today = new Date();
const quoted = today.toISOString().slice(0, 10);
const dayOf = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);

const previous: Quotes | null = only && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
const out: Quotes = { quoted, pages: PAGES, rows: previous?.rows ?? {} };
let asked = 0;
let failed = 0;

async function one(b: (typeof BINDINGS)[number], country: string, i: number) {
  const pages = PAGES[i];
  const { max } = b.printer.pageLimits(b.binding);
  const sku = b.printer.sku(b.binding, "bound7x10");
  if (!sku || pages > max) return;
  asked++;
  try {
    const levels = process.env.ALL_LEVELS ? b.printer.levels : b.printer.cheapestLevels;
    const quotes = await b.printer.quoteShipping(sku, pages, ADDRESSES[country], levels);
    const cheapest = quotes.sort((x, y) => priceFromCost(x.cost).totalCents - priceFromCost(y.cost).totalCents)[0];
    if (!cheapest) return void failed++;
    const row = out.rows[country][b.binding]!;
    row.book[i] = cheapest.cost.totalCents - cheapest.cost.shippingCents;
    row.post[i] = cheapest.cost.shippingCents;
    if (cheapest.arrives && !row.arrives) row.arrives = [dayOf(cheapest.arrives.earliest), dayOf(cheapest.arrives.latest)];
  } catch {
    failed++;
  }
}

const jobs: Array<() => Promise<unknown>> = [];
for (const country of countries) {
  out.rows[country] = {};
  for (const b of BINDINGS) {
    out.rows[country][b.binding] = { book: PAGES.map(() => null), post: PAGES.map(() => null), arrives: null };
    PAGES.forEach((_, i) => jobs.push(() => one(b, country, i)));
  }
}
await Promise.all(Array.from({ length: 4 }, async () => {
  while (jobs.length) await jobs.shift()!();
}));
// a binding no level reaches in a country is left out, and the page says
// it is priced on the order screen
for (const country of countries)
  for (const b of BINDINGS) if (out.rows[country][b.binding]!.book.every((v) => v === null)) delete out.rows[country][b.binding];

const text = JSON.stringify(out).replace(/"rows":\{/, '"rows":{\n').replace(/\},"([A-Z]{2})":/g, '},\n"$1":');
writeFileSync(OUT, `${text}\n`);
console.log(`${OUT}: ${asked} quotes asked, ${failed} with no post offered, quoted ${quoted}`);

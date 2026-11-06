// HOW MUCH A BOOK WOULD COST, before there is a book (2026-11-06, the How
// it works page's calculator: "a price calculator where people can put the
// cover, whether or not they have a ribbon, the page count ... as well as an
// address").
//
// The order screen asks the printer for a live quote; a page that reprices
// on every click cannot. So the printers were asked once, at a handful of
// page counts in fifteen countries (scripts/sample-quotes.mts writes
// sampleQuotes.json), and this fills the gaps:
//
//   - the book: rawBookCents (pricing.ts) is a straight line in the
//     printer's charge, and the charge is a straight line in pages, so the
//     raw price is interpolated between the two quoted page counts either
//     side, then charm-priced exactly as an order is (bookCentsFromRaw);
//   - the post: taken at the next HEAVIER quote, so an estimate is never
//     under what the order screen will say.
//
// At a quoted page count the estimate IS priceFromCost of that quote, to the
// cent (estimate.test.mts). The margin, floor and card fee are read from
// pricing.ts on the server when the page is made (estimateTable), so a
// change there changes the page with it, and what reaches the browser is
// prices, not the printers' charges.

import type { Binding } from "./products";
import { RAW_PER_COST_CENT, RAW_PER_POST_CENT, bookCentsFromRaw, rawBookCents } from "./pricing";

/** What the printers charged us, as sampleQuotes.json keeps it. */
export type SampleQuotes = {
  /** The day the quotes were taken, ISO. */
  quoted: string;
  /** The printed page counts quoted, ascending. */
  pages: number[];
  /** Country (ISO alpha-2) -> binding -> the charge at each page count, in
   *  cents: `book` everything but the post (printing, fees, any tax or
   *  duty), `post` the cheapest post. Null where that page count was not
   *  quoted (past the binding's limit). `arrives` = days from the quote to
   *  the earliest and latest arrival the printer gave. */
  rows: Record<string, Partial<Record<Binding, { book: (number | null)[]; post: (number | null)[]; arrives: [number, number] | null }>>>;
};

/** What the page is given: prices, never the printers' charges. */
export type EstimateTable = {
  quoted: string;
  pages: number[];
  /** rawBookCents added per cent of post (the card fee on it). */
  rawPerPostCent: number;
  /** A ribbon's raw price: BookVault's flat GBP 1.00 a hardback (its own
   *  /v4/title/calculate, 2026-10-19) at bookvault.ts's GBP-to-USD 1.404. */
  ribbonRaw: number;
  rows: Record<string, Partial<Record<Binding, { raw: (number | null)[]; post: (number | null)[]; arrives: [number, number] | null }>>>;
};

/** BookVault's ribbon, in cents of our cost (memory: memari-printer-tiers). */
export const RIBBON_COST_CENTS = 140;

/** The table the page is given, from the quotes, priced by pricing.ts as
 *  it stands. Server-side: the quotes are our costs. */
export function estimateTable(quotes: SampleQuotes): EstimateTable {
  const rows: EstimateTable["rows"] = {};
  for (const [country, bindings] of Object.entries(quotes.rows)) {
    rows[country] = {};
    for (const [binding, q] of Object.entries(bindings)) {
      if (!q) continue;
      // the book's part alone: the post's card fee is added back per cent
      rows[country][binding as Binding] = { raw: q.book.map((c) => (c === null ? null : rawBookCents(c, 0))), post: q.post, arrives: q.arrives };
    }
  }
  return { quoted: quotes.quoted, pages: quotes.pages, rawPerPostCent: RAW_PER_POST_CENT, ribbonRaw: RIBBON_COST_CENTS * RAW_PER_COST_CENT, rows };
}

export type Estimate = {
  /** The book, ribbon included. */
  bookCents: number;
  /** What the ribbon adds to the book. */
  ribbonCents: number;
  postCents: number;
  totalCents: number;
  /** Days from the quote to the earliest and latest arrival, if known. */
  arrives: [number, number] | null;
};

/** The estimate for a book of `printedPages` in a binding, to a country -
 *  or null where none can be made: a country or binding not quoted, or
 *  more pages than were quoted. Page limits are the caller's to check. */
export function estimatePrice(table: EstimateTable, binding: Binding, country: string, printedPages: number, ribbon = false): Estimate | null {
  const row = table.rows[country]?.[binding];
  if (!row) return null;
  const P = table.pages;
  const at = P.map((_, i) => i).filter((i) => row.raw[i] !== null && row.post[i] !== null);
  if (at.length === 0) return null;
  const hi = at.find((i) => P[i] >= printedPages);
  if (hi === undefined) return null;
  const below = at.filter((i) => P[i] <= printedPages);
  // thinner than the first quote: priced as the first quote, never less
  const lo = below.length > 0 ? below[below.length - 1] : hi;
  const raw = lo === hi ? row.raw[hi]! : row.raw[lo]! + ((row.raw[hi]! - row.raw[lo]!) * (printedPages - P[lo])) / (P[hi] - P[lo]);
  const post = row.post[hi]!;
  const plain = raw + post * table.rawPerPostCent;
  const withRibbon = ribbon ? bookCentsFromRaw(plain + table.ribbonRaw) : bookCentsFromRaw(plain);
  const ribbonCents = ribbon ? withRibbon - bookCentsFromRaw(plain) : 0;
  return { bookCents: withRibbon, ribbonCents, postCents: post, totalCents: withRibbon + post, arrives: row.arrives };
}

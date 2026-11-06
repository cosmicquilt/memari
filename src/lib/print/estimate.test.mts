// The How it works estimate (estimate.ts) against the order's own pricing.
// Sabotaged when written (2026-11-06): interpolating the post instead of
// rounding it up fails "never under"; dropping the post's card fee from the
// raw price fails "equals priceFromCost".

import assert from "node:assert/strict";
import { estimatePrice, estimateTable, RIBBON_COST_CENTS, type SampleQuotes } from "./estimate";
import { priceFromCost } from "./pricing";
import quotesJson from "./sampleQuotes.json" with { type: "json" };
import type { Binding } from "./products";

const quotes = quotesJson as unknown as SampleQuotes;
const table = estimateTable(quotes);
let checks = 0;

// 1. At every quoted page count the estimate is the order's price to the cent.
for (const [country, bindings] of Object.entries(quotes.rows)) {
  for (const [binding, q] of Object.entries(bindings)) {
    q!.book.forEach((book, i) => {
      if (book === null || q!.post[i] === null) return;
      const post = q!.post[i]!;
      const real = priceFromCost({ printCents: book, fulfillmentCents: 0, shippingCents: post, taxCents: 0, totalCents: book + post, currency: "USD" });
      const est = estimatePrice(table, binding as Binding, country, quotes.pages[i])!;
      assert.equal(est.totalCents, real.totalCents, `${country} ${binding} ${quotes.pages[i]}pp`);
      assert.equal(est.bookCents, real.bookCents);
      // and a ribbon is the same as the printer charging the ribbon on top
      const ribboned = priceFromCost({ printCents: book + RIBBON_COST_CENTS, fulfillmentCents: 0, shippingCents: post, taxCents: 0, totalCents: book + RIBBON_COST_CENTS + post, currency: "USD" });
      assert.equal(estimatePrice(table, binding as Binding, country, quotes.pages[i], true)!.totalCents, ribboned.totalCents);
      checks += 3;
    });
  }
}

// 2. Between quotes: the book rises with pages, and the post is never under
//    either neighbour's (it is the heavier one's).
for (const [country, bindings] of Object.entries(quotes.rows)) {
  for (const binding of Object.keys(bindings) as Binding[]) {
    let last = 0;
    for (let pages = 4; pages <= 800; pages += 4) {
      const est = estimatePrice(table, binding, country, pages);
      if (!est) continue;
      assert.ok(est.bookCents >= last, `${country} ${binding}: book got cheaper at ${pages}pp`);
      last = est.bookCents;
      const q = quotes.rows[country][binding]!;
      const hi = quotes.pages.findIndex((p, i) => p >= pages && q.post[i] !== null);
      assert.equal(est.postCents, q.post[hi], `${country} ${binding} ${pages}pp post`);
      checks += 2;
    }
  }
}

// 3. Past the last quote, or a country never quoted, is no estimate.
assert.equal(estimatePrice(table, "wireo", "US", 352), null);
assert.equal(estimatePrice(table, "paperback", "XX", 128), null);
assert.ok(estimatePrice(table, "paperback", "US", 4)!.totalCents >= estimatePrice(table, "paperback", "US", 32)!.totalCents);
checks += 3;

// 4. The browser gets prices, not the printers' charges.
assert.ok(!JSON.stringify(table).includes('"book"'));
checks += 1;

console.log(`estimate: ${checks} checks ok`);

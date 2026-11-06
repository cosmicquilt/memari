// The How it works page's book (book.ts) against the app's own count:
// bookPageCount for the pages, printedPageCount for the blanks. Sabotaged
// when written (2026-11-06): dropping the dot grid pages fails every book
// with a page a day; counting extras as the level's own fails the kinds.

import assert from "node:assert/strict";
import { PageLevel } from "@/generated/prisma/enums";
import { bookPageCount } from "@/lib/pageLevels";
import { printedPageCount } from "@/lib/print/products";
import { pagesPerLevel, planBook, spreadsOf, type BookChoices } from "./book";

let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = (max: number) => Math.floor(rnd() * (max + 1));
let checks = 0;

for (let t = 0; t < 3000; t++) {
  const c: BookChoices = {
    front: pick(8),
    back: pick(4),
    month: rnd() < 0.6,
    monthExtra: pick(3),
    week: rnd() < 0.7,
    weekExtra: pick(3),
    day: rnd() < 0.5,
    dayExtra: pick(2),
    start: new Date(Date.UTC(2026 + pick(1), pick(11), 1 + pick(27))),
    days: 1 + pick(730),
    weekStartDay: pick(1),
  };
  const plan = planBook(c);
  const end = new Date(c.start.getTime() + (c.days - 1) * 86_400_000);
  const app = bookPageCount(pagesPerLevel(c), c.start, end, c.weekStartDay)!;
  assert.equal(plan.designed + plan.pads, app, `pages for ${JSON.stringify(c)}`);
  assert.equal(plan.printed, printedPageCount(app));
  assert.equal(plan.pages.length, plan.printed);
  // the extras are counted as extras, and every level prints its count
  const extras = plan.pages.filter((p) => p.kind === "extra").length;
  const want = (c.month ? c.monthExtra * plan.counts.MONTHLY : 0) + (c.week ? c.weekExtra * plan.counts.WEEKLY : 0) + (c.day ? c.dayExtra * plan.counts.DAILY : 0);
  assert.equal(extras, want);
  // a spread never starts on a right-hand page (odd page number = index even)
  plan.pages.forEach((p, i) => {
    if ((p.kind === PageLevel.MONTHLY || p.kind === PageLevel.WEEKLY) && p.n === 1) assert.equal(i % 2, 1, `spread starts right at page ${i + 1}`);
  });
  checks += 5;
}

assert.deepEqual(spreadsOf(5), [[null, 0], [1, 2], [3, 4]]);
assert.deepEqual(spreadsOf(4), [[null, 0], [1, 2], [3, null]]);
checks += 2;
console.log(`how it works book: ${checks} checks ok`);

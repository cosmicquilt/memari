// A BOOK BEFORE IT EXISTS: the How it works page's "your book" (2026-11-06).
// Someone turns pages on and off, adds extra pages and picks the days; this
// says what the book would print, page by page, in binding order.
//
// Nothing is worked out here that the app does not already decide. The
// occurrences, the binding order and the dot grid pages that keep spreads
// facing are pageLevels.ts's own (the same calls bookPageCount makes), and
// the blanks to a multiple of four are products.ts's printedPageCount - so
// the page's count is the count the order screen will give (book.test.mts
// holds the two together).

import { PageLevel } from "@/generated/prisma/enums";
import { bindingOrder, facingPads, LEVEL_PAGE_COUNT, LEVELS_IN_BINDING_ORDER, MONTH_NAMES, occurrences, type BindingSlot } from "@/lib/pageLevels";
import { printedPageCount } from "@/lib/print/products";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** What someone has chosen. Extra pages are added to a level's own. */
export type BookChoices = {
  front: number;
  back: number;
  month: boolean;
  monthExtra: number;
  week: boolean;
  weekExtra: number;
  day: boolean;
  dayExtra: number;
  /** The first day, UTC midnight. */
  start: Date;
  days: number;
  /** 0 = Sunday, the app's default (preferences.ts). */
  weekStartDay: number;
};

export type PageKind = PageLevel | "extra" | "pad" | "blank";

/** One printed page. */
export type BookPage = {
  kind: PageKind;
  /** The level it belongs to; none for a blank. */
  level: PageLevel | null;
  /** "Week of 4 Jan", "March 2027", "Fri 1 Jan", "Front pages". */
  label: string;
  /** Its place in its occurrence, 1-based, of how many. */
  n: number;
  of: number;
  /** Which occurrence of its level, 0-based - which day, which week. */
  occurrence: number;
};

export type BookPlan = {
  pages: BookPage[];
  /** The pages designed: everything but the dot grid and the blanks. */
  designed: number;
  /** Dot grid pages before spreads that would start on a right-hand page. */
  pads: number;
  /** Blank pages at the end, to a multiple of four. */
  blanks: number;
  /** What prints, and what a book is priced by. */
  printed: number;
  /** How many times each level prints. */
  counts: Record<PageLevel, number>;
  /** Pages each time it prints. */
  perLevel: Record<PageLevel, number>;
  end: Date;
};

export function pagesPerLevel(c: BookChoices): Record<PageLevel, number> {
  return {
    [PageLevel.FRONT_MATTER]: c.front,
    [PageLevel.MONTHLY]: c.month ? LEVEL_PAGE_COUNT.MONTHLY + c.monthExtra : 0,
    [PageLevel.WEEKLY]: c.week ? LEVEL_PAGE_COUNT.WEEKLY + c.weekExtra : 0,
    [PageLevel.DAILY]: c.day ? LEVEL_PAGE_COUNT.DAILY + c.dayExtra : 0,
    [PageLevel.BACK_MATTER]: c.back,
  };
}

function label(level: PageLevel, start: Date): string {
  const d = `${start.getUTCDate()} ${MONTH_NAMES[start.getUTCMonth()].slice(0, 3)}`;
  switch (level) {
    case PageLevel.MONTHLY:
      return `${MONTH_NAMES[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
    case PageLevel.WEEKLY:
      return `Week of ${d}`;
    case PageLevel.DAILY:
      return `${WEEKDAYS[start.getUTCDay()]} ${d}`;
    case PageLevel.FRONT_MATTER:
      return "Front pages";
    default:
      return "Back pages";
  }
}

export function planBook(c: BookChoices): BookPlan {
  const end = new Date(c.start.getTime() + (c.days - 1) * DAY_MS);
  const perLevel = pagesPerLevel(c);
  const counts = { FRONT_MATTER: 0, MONTHLY: 0, WEEKLY: 0, DAILY: 0, BACK_MATTER: 0 } as Record<PageLevel, number>;
  const slots: Array<BindingSlot & { pages: number }> = [];
  for (const [rank, level] of LEVELS_IN_BINDING_ORDER.entries()) {
    const pages = perLevel[level];
    if (pages === 0) continue;
    const list = occurrences(level, c.start, end, c.weekStartDay) ?? [];
    counts[level] = list.length;
    list.forEach((at, index) => slots.push({ at: { ...at, level, index, total: list.length, end }, rank, pages }));
  }
  const ordered = bindingOrder(slots, c.start);
  const pads = facingPads(ordered.map((slot) => ({ level: slot.at.level, pages: slot.pages })));
  const pages: BookPage[] = [];
  ordered.forEach((slot, i) => {
    const level = slot.at.level;
    const name = label(level, slot.at.start);
    if (pads[i]) pages.push({ kind: "pad", level, label: name, n: 0, of: slot.pages, occurrence: slot.at.index });
    // a repeating level's own pages first, then its extras; front and back
    // matter are all its own
    const own = level === PageLevel.FRONT_MATTER || level === PageLevel.BACK_MATTER ? slot.pages : LEVEL_PAGE_COUNT[level];
    for (let n = 1; n <= slot.pages; n++) pages.push({ kind: n <= own ? level : "extra", level, label: name, n, of: slot.pages, occurrence: slot.at.index });
  });
  const designed = pages.length - pads.filter(Boolean).length;
  const printed = printedPageCount(pages.length);
  const blanks = printed - pages.length;
  for (let i = 0; i < blanks; i++) pages.push({ kind: "blank", level: null, label: "Blank", n: 1, of: 1, occurrence: 0 });
  return { pages, designed, pads: pads.filter(Boolean).length, blanks, printed, counts, perLevel, end };
}

/** A bound book's spreads, by page index: page 1 alone on the right, then
 *  facing pairs, the last page alone on the left if the count is even. */
export function spreadsOf(count: number): Array<[number | null, number | null]> {
  const out: Array<[number | null, number | null]> = count > 0 ? [[null, 0]] : [];
  for (let i = 1; i < count; i += 2) out.push([i, i + 1 < count ? i + 1 : null]);
  return out;
}

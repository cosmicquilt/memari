// Turning a handful of templates into the whole book.
//
// This is the paid product. A person designs one weekly spread, one monthly
// spread, and whatever front matter they want; the book is that, stamped out
// across a term, with the dates filled in. Everything before this - the
// lattice, the modules, the editor, the PDF exporter - exists so that this
// step has something worth repeating.
//
// DERIVED, NEVER STORED. A ninety-day book is about 200 pages; writing them
// into the database would double the data, and then every edit to a template
// would have to decide whether to regenerate, which pages had been touched
// by hand, and what to do about the ones that had. Andrew's own framing
// settles it: "a planner is a few templates plus a date range; the book is
// derived and never edited directly." So the book exists for exactly as long
// as it takes to write a PDF.
//
// THE ORDER IS THE BOOK'S ORDER. Not all the monthlies and then all the
// weeklies - that is how the timeline groups them for DESIGNING, and it is
// not how a book is bound. A real one runs front matter, then each month
// followed by the weeks and days inside it, then back matter. One rule
// produces that: sort every occurrence by the date it begins, and where two
// begin on the same day, put the coarser one first.
//
// NOTHING HERE KNOWS WHAT A WEEK TITLE IS. A module says how to date itself
// (the registry's `dated` hook) exactly as it says how to undate itself.
// This walks occurrences and hands each page its context.

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { withDates, withoutDates } from "./moduleRegistry";
import {
  LEVELS_IN_BINDING_ORDER,
  LEVEL_LABELS,
  occurrences,
  repeats,
  type OccurrenceContext,
  type PageLevel,
} from "./pageLevels";
import type { PageGrid } from "./grid";

/** The shape this needs from a planner row. Deliberately the smallest one,
 *  so a caller can hand it a query it already had. */
export type BookSource = {
  title: string;
  dated: boolean;
  /** theme.weekStartDay, 0 = Sunday. Weeks are snapped to it so a spread's
   *  day columns carry their dates in order - see occurrences(). */
  theme?: unknown;
  startDate: Date | null;
  endDate: Date | null;
  pages: Array<{
    id: string;
    level: PageLevel;
    variantKey: string | null;
    position: number;
    widthPx: number;
    heightPx: number;
    gridColumns: number;
    gridRows: number;
    gridGapPx: number;
    marginPx: number;
    moduleInstances: Array<{
      id: string;
      columnStart: number | null;
      rowStart: number | null;
      columnSpan: number;
      rowSpan: number;
      locked: boolean;
      zIndex: number;
      propValues: unknown;
      moduleType: { slug: string };
    }>;
  }>;
};

export type GeneratedPage = {
  /** Which template this came from - the same source page appears once per
   *  occurrence, so this is not unique across the book. */
  sourcePageId: string;
  level: PageLevel;
  /** "February 2026", "Week of 12 Jan". What this copy is FOR. */
  occurrenceLabel: string;
  occurrenceKey: string | null;
  /** True when this occurrence had a layout of its own rather than taking
   *  the default. */
  customised: boolean;
  pageGrid: PageGrid;
  elements: RenderedPolotnoElement[];
};

export type GeneratedBook = {
  title: string;
  pages: GeneratedPage[];
  /** What was walked to make it, for a caller that wants to say so. */
  summary: Array<{ level: PageLevel; occurrences: number; pages: number }>;
};

/**
 * Every page of the finished book, in the order it is bound.
 *
 * A level with no pages contributes nothing - skip the dailies and the book
 * simply has none, which is the price dial working. A repeating level in a
 * book with no term contributes nothing either, and the caller is told so by
 * the summary rather than by silence.
 */
export function generateBook(planner: BookSource, fontFamily: string): GeneratedBook {
  const weekStartDay = (planner.theme as { weekStartDay?: number } | null)?.weekStartDay ?? 0;
  const pagesByLevel = new Map<PageLevel, BookSource["pages"]>();
  for (const page of planner.pages) {
    pagesByLevel.set(page.level, [...(pagesByLevel.get(page.level) ?? []), page]);
  }

  // Collected across ALL levels first, then sorted together - which is what
  // interleaves them. Sorting each level separately and concatenating would
  // give twelve monthlies followed by fifty-two weeklies, which is a filing
  // system rather than a book.
  type Slot = { at: OccurrenceContext; rank: number };
  const slots: Slot[] = [];

  const summary: GeneratedBook["summary"] = [];

  LEVELS_IN_BINDING_ORDER.forEach((level, levelRank) => {
    const template = pagesByLevel.get(level) ?? [];
    const list = occurrences(level, planner.startDate, planner.endDate, weekStartDay);
    if (template.length === 0 || list === null) {
      summary.push({ level, occurrences: list?.length ?? 0, pages: 0 });
      return;
    }
    list.forEach((occurrence, index) => {
      slots.push({
        at: { ...occurrence, level, index, total: list.length },
        rank: levelRank,
      });
    });
    // Counted per occurrence rather than multiplied: a customised month may
    // hold a different number of pages from the default.
    const pages = list.reduce(
      (total, occurrence) => total + pagesFor(template, occurrence.key).length,
      0
    );
    summary.push({ level, occurrences: list.length, pages });
  });

  slots.sort((a, b) => {
    // Front matter opens the book and back matter closes it, whatever dates
    // they happen to carry - they are not dated at all, and sorting them by
    // a sentinel would put them wherever that sentinel fell.
    const bookend = (slot: Slot) =>
      slot.at.level === "FRONT_MATTER" ? -1 : slot.at.level === "BACK_MATTER" ? 1 : 0;
    const ends = bookend(a) - bookend(b);
    if (ends !== 0) return ends;
    if (!repeats(a.at.level) && !repeats(b.at.level)) return a.rank - b.rank;
    const byDate = a.at.start.getTime() - b.at.start.getTime();
    if (byDate !== 0) return byDate;
    // Same day: the COARSER level first. A month's own page belongs before
    // the first week inside it, and that week before its first day.
    return a.rank - b.rank;
  });

  const pages: GeneratedPage[] = [];
  for (const slot of slots) {
    const template = pagesByLevel.get(slot.at.level) ?? [];
    const chosen = pagesFor(template, slot.at.key);
    const customised = slot.at.key !== null && hasOwn(template, slot.at.key);
    for (const page of chosen) {
      const pageGrid: PageGrid = {
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        gridColumns: page.gridColumns,
        gridRows: page.gridRows,
        boxInsetPx: page.gridGapPx / 2,
        marginPx: page.marginPx,
      };
      const elements: RenderedPolotnoElement[] = [];
      // z-order, same as the editor's: later is painted on top.
      const instances = [...page.moduleInstances].sort((a, b) => a.zIndex - b.zIndex);
      for (const instance of instances) {
        if (instance.moduleType.slug === "freeform-element") continue;
        if (instance.columnStart === null || instance.rowStart === null) continue;
        // An UNDATED book stays undated even when generated: you are printing
        // many copies of a template to write into, which is a real product
        // and the free tier's whole shape. Otherwise the module fills itself
        // in for this occurrence.
        const propValues = planner.dated
          ? withDates(instance.moduleType.slug, instance.propValues, slot.at)
          : withoutDates(instance.moduleType.slug, instance.propValues);
        elements.push(
          ...renderModuleInstance({ ...instance, propValues }, pageGrid, fontFamily)
        );
      }
      pages.push({
        sourcePageId: page.id,
        level: slot.at.level,
        occurrenceLabel: slot.at.label,
        occurrenceKey: slot.at.key,
        customised,
        pageGrid,
        elements,
      });
    }
  }

  return { title: planner.title, pages, summary };
}

/** This occurrence's own pages, or the default ones when it has none. The
 *  single rule the whole feature rests on. */
function pagesFor(template: BookSource["pages"], key: string | null): BookSource["pages"] {
  const own = template.filter((page) => page.variantKey === key);
  const chosen = own.length > 0 ? own : template.filter((page) => page.variantKey === null);
  return [...chosen].sort((a, b) => a.position - b.position);
}

function hasOwn(template: BookSource["pages"], key: string): boolean {
  return template.some((page) => page.variantKey === key);
}

/** The summary in words, for a script or a route to print. */
export function describeBook(book: GeneratedBook): string[] {
  return book.summary.map(
    (row) =>
      `  ${LEVEL_LABELS[row.level].padEnd(9)} ${String(row.occurrences).padStart(3)} occurrence(s)` +
      ` -> ${String(row.pages).padStart(4)} page(s)`
  );
}

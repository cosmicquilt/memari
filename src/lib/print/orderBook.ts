// AN ORDER'S BOOK: the journal generated for the order's days, as the
// print-ready PDFs Lulu prints. Server-only (the database, the font file).
//
// The book is the journal's own templates walked over the ORDER's dates,
// not the journal's term: a journal is designed once and printed for
// whatever days are bought (see orderRange.ts). Blank pages pad it to the
// count that is printed (products.ts, printedPageCount), so the cover's
// spine is drawn for the book Lulu binds.

import { prisma } from "@/lib/prisma";
import { WITH_PAGES, type BookWithPages } from "@/app/planner/bookSeeding";
import { generateBook } from "@/lib/generateBook";
import { buildPlannerPdf, printReadinessProblems } from "@/lib/plannerPdf";
import { resolveFontFamily, type PlannerTheme } from "@/lib/theme";
import { PLANNER_TRIMS, trimKeyForWidth, type PlannerTrimKey } from "@/lib/planner-trims";
import { MONTH_NAMES } from "@/lib/pageLevels";
import { printedPageCount } from "./products";
import type { OrderRange } from "./orderRange";

/** Something about the order the customer can fix, said so they can. */
export class OrderError extends Error {}

/** A journal, with every page and module, by its owner - for an order
 *  placed by someone signed in, or a renewal placed by the server. */
export async function loadJournal(ownerId: string, plannerId: string): Promise<BookWithPages | null> {
  return prisma.planner.findFirst({ where: { id: plannerId, ownerId, isTemplate: false }, include: WITH_PAGES });
}

export type Interior = {
  bytes: ArrayBuffer;
  /** Pages printed, blanks included. */
  pageCount: number;
  /** The book's own pages, before padding. */
  bookPages: number;
  trim: PlannerTrimKey;
  /** What would stop a printer taking the file - an unembedded font, a
   *  missing bleed - in words. Empty when it is fit to send. */
  problems: string[];
};

/** The journal's interior for the order's days. */
export function buildInterior(journal: BookWithPages, range: OrderRange): Interior {
  const theme = journal.theme as PlannerTheme | null;
  const book = generateBook({ ...journal, startDate: range.start, endDate: range.end }, resolveFontFamily(theme?.fontFamily));
  if (book.pages.length === 0) {
    throw new OrderError("This journal has no pages to print yet - add some pages to it first.");
  }
  const pageCount = printedPageCount(book.pages.length);
  const last = book.pages[book.pages.length - 1].pageGrid;
  const built = buildPlannerPdf([
    ...book.pages.map((page) => ({ pageGrid: page.pageGrid, elements: page.elements })),
    ...Array.from({ length: pageCount - book.pages.length }, () => ({ pageGrid: last, elements: [] })),
  ]);
  return {
    bytes: built.bytes,
    pageCount,
    bookPages: book.pages.length,
    trim: trimKeyForWidth(book.pages[0].pageGrid.widthPx),
    problems: printReadinessProblems(built),
  };
}

/** The trim's finished size in inches - the sheet less its bleed. */
export function trimInches(trim: PlannerTrimKey): { widthIn: number; heightIn: number } {
  const spec = PLANNER_TRIMS[trim];
  return { widthIn: (spec.widthPx - spec.bleedPx * 2) / 300, heightIn: (spec.heightPx - spec.bleedPx * 2) / 300 };
}

/** "4 Jan - 3 Apr 2027", or across a new year "4 Jan 2027 - 3 Jan 2028" -
 *  for the cover and the order. */
export function rangeLabel(range: OrderRange): string {
  const day = (d: Date) => `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
  const sameYear = range.start.getUTCFullYear() === range.end.getUTCFullYear();
  return sameYear
    ? `${day(range.start)} – ${day(range.end)} ${range.end.getUTCFullYear()}`
    : `${day(range.start)} ${range.start.getUTCFullYear()} – ${day(range.end)} ${range.end.getUTCFullYear()}`;
}

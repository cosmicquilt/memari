// What a page's modules are DRAWN with, as opposed to what is stored.
//
// A stored module is a template: the daily page's hours say MONDAY 1 and a
// month's title says whatever month it was seeded with, because a template
// has to say something. What the editor shows is that template filled in
// for the occurrence being edited - the book's first day, or February's
// own layout's February - with the week's day columns rotated to the
// book's week start, or with the dates taken out entirely on an undated
// book. The stored values never change; only the drawing does, so nothing
// saved can bake a date into a template.
//
// That drawing used to be worked out in ONE place, the page load, and only
// for the elements it handed over. Everything drawn after it - the live
// re-render during a resize, the optimistic render of a drop, and every
// render a server action sends back - started again from the raw stored
// props, so the template showed through: dragging the daily page's hours
// turned its THURSDAY tab into MONDAY for the length of the drag, and a
// commit left MONDAY there until the next reload.
//
// So the context is computed by one function, from the book and the page,
// and applied by another. The page load, the editor and the server actions
// all call these two; none of them decides what a page is dated as.

import type { PageGrid } from "./grid";
import { withDates, withoutDates } from "./moduleRegistry";
import { occurrences, type OccurrenceContext, type PageLevel } from "./pageLevels";
import {
  renderModuleInstance,
  type ModuleInstanceForRender,
  type RenderedPolotnoElement,
} from "./renderModuleInstance";
import { rotateWeekDays, type DayLabel } from "./weekDays";

export type PageRenderContext = {
  /** False on a book you write the dates into yourself: dates come out. */
  dated: boolean;
  /** The occurrence this page is edited AS. Null when the book has no term
   *  yet, and the stored values stand. */
  occurrence: OccurrenceContext | null;
  /** The day columns this page's hourly grid shows, rotated to the book's
   *  week start. Null on a page with no hourly grid. */
  dayLabels: DayLabel[] | null;
};

/** The parts of a book this needs - structural, so a Prisma row with its
 *  pages and instances fits, and so does a test's plain object. */
export type RenderContextBook = {
  dated?: boolean | null;
  startDate?: Date | null;
  endDate?: Date | null;
  theme?: unknown;
  pages: Array<{
    id: string;
    level: PageLevel;
    variantKey: string | null;
    position: number;
    moduleInstances: Array<{ moduleType: { slug: string }; propValues: unknown }>;
  }>;
};

/**
 * The context a page of `book` is drawn in.
 *
 * The occurrence is the page's OWN layout's - a variant page is edited as
 * its occurrence, and the default layout as the term's first, which is the
 * one a person can check against a calendar. Day rotation reads both pages
 * of the page's spread (left three days, right four), because the rotation
 * needs all seven at once.
 */
export function renderContextForPage(book: RenderContextBook, pageId: string): PageRenderContext | null {
  const page = book.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const weekStartDay = (book.theme as { weekStartDay?: number } | null | undefined)?.weekStartDay ?? 0;
  const dated = book.dated !== false;

  const list = occurrences(page.level, book.startDate ?? null, book.endDate ?? null, weekStartDay);
  const index = page.variantKey ? (list ?? []).findIndex((o) => o.key === page.variantKey) : 0;
  const occurrence: OccurrenceContext | null =
    list && list.length > 0 && index >= 0
      ? { ...list[index], level: page.level, index, total: list.length }
      : null;

  // The spread this page is one side of: same level, same layout, in
  // binding order. Page 0 is the left.
  const spread = book.pages
    .filter((p) => p.level === page.level && (p.variantKey ?? null) === (page.variantKey ?? null))
    .sort((a, b) => a.position - b.position);
  const labelsOf = (p: RenderContextBook["pages"][number] | undefined) =>
    ((p?.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core")?.propValues as
      | { dayLabels?: DayLabel[] }
      | null
      | undefined)?.dayLabels ?? []) as DayLabel[];
  const rotated = rotateWeekDays(labelsOf(spread[0]), labelsOf(spread[1]), weekStartDay);
  const hasHours = page.moduleInstances.some((mi) => mi.moduleType.slug === "hourly-grid-core");
  const dayLabels = !hasHours ? null : spread.indexOf(page) === 0 ? rotated.left : rotated.right;

  return { dated, occurrence, dayLabels };
}

/**
 * A module's stored props, as its page draws them. Null context draws the
 * stored values as they are.
 */
export function propsForRender(
  slug: string,
  propValues: unknown,
  context: PageRenderContext | null | undefined
): unknown {
  if (!context) return propValues;
  const rotated =
    slug === "hourly-grid-core" && context.dayLabels
      ? { ...((propValues ?? {}) as object), dayLabels: context.dayLabels }
      : propValues;
  if (!context.dated) return withoutDates(slug, rotated);
  return context.occurrence ? withDates(slug, rotated, context.occurrence) : rotated;
}

/**
 * Draws a module as its page shows it. Every drawing of a module that sits
 * on a page goes through this - the page load, the editor's live and
 * optimistic renders, and the renders a server action sends back - so a
 * module is never drawn once dated and once as its template.
 */
export function renderOnPage(
  instance: ModuleInstanceForRender,
  pageGrid: PageGrid,
  fontFamily: string,
  context: PageRenderContext | null | undefined
): RenderedPolotnoElement[] {
  return renderModuleInstance(
    { ...instance, propValues: propsForRender(instance.moduleType.slug, instance.propValues, context) },
    pageGrid,
    fontFamily
  );
}

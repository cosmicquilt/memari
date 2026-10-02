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

import { eventsForDays, type StoredEvent } from "./calendarEvents";
import { dayUnitColumns, type PageGrid } from "./grid";
import type { HourlyGridEvent } from "./modules/hourlyGridCore";
import { isSpineSlug, withDates, withDaysUnder, withWeekStart, withoutDates } from "./moduleRegistry";
import { WEEKDAY_NAMES, columnDates, occurrences, type OccurrenceContext, type PageLevel } from "./pageLevels";
import { effectiveZone } from "./timeZone";
import {
  renderModuleInstance,
  type ModuleInstanceForRender,
  type RenderedPolotnoElement,
} from "./renderModuleInstance";
import { rotateWeekDays, type DayLabel } from "./weekDays";

export type PageRenderContext = {
  /** The level of the page - what a setting may offer can depend on it (the
   *  day chart's "Along the bottom"). Optional for a context built before
   *  it existed. */
  level?: PageLevel;
  /** False on a book you write the dates into yourself: dates come out. */
  dated: boolean;
  /** The occurrence this page is edited AS. Null when the book has no term
   *  yet, and the stored values stand. */
  occurrence: OccurrenceContext | null;
  /** The day columns this page's spine shows - the hours on a week, the
   *  calendar on a month - rotated to the book's week start. Null on a page
   *  whose spine names no days. */
  dayLabels: DayLabel[] | null;
  /** The book's week start, 0 = Sunday. Every module that prints weekdays
   *  starts on it - see the registry's `weekStart`. */
  weekStartDay: number;
  /** The columns the page's spine spans, which `dayLabels` divide between
   *  them - so a module can be told which day it sits under (daysUnder).
   *  Null on a page with no spine. Optional for a context built before it
   *  existed. */
  spineColumns?: { columnStart: number; columnSpan: number } | null;
  /** The calendar events falling on this page's columns, already indexed to
   *  them. Null when nothing was passed in, when the page has no hours, and
   *  on an undated book - a book with no dates cannot carry dated marks. */
  events: HourlyGridEvent[] | null;
  /** WHICH DAY EACH COLUMN IS, as "YYYY-MM-DD", in the same order as
   *  `dayLabels`. Null on a page with no hours or no dates, and per entry for
   *  a column whose head is not a weekday.
   *
   *  Carried rather than left to the browser to work out: the editor turns a
   *  click into an instant, and it must land on the day the tab shows. This
   *  is the same columnDates call the tab's own number comes from. */
  columnDates: Array<string | null> | null;
};

/** The parts of a book this needs - structural, so a Prisma row with its
 *  pages and instances fits, and so does a test's plain object. */
export type RenderContextBook = {
  dated?: boolean | null;
  /** The book's OWN zone - null when it follows its owner's default. */
  timeZone?: string | null;
  /** The owner's default, which a book with no zone of its own follows. Not
   *  a column on the book: the caller looks it up and hands it in, so this
   *  stays a pure function of what it is given. */
  ownerTimeZone?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  theme?: unknown;
  pages: Array<{
    id: string;
    level: PageLevel;
    variantKey: string | null;
    position: number;
    moduleInstances: Array<{
      moduleType: { slug: string };
      propValues: unknown;
      columnStart?: number | null;
      columnSpan?: number;
    }>;
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
export function renderContextForPage(
  book: RenderContextBook,
  pageId: string,
  /** The owner's stored events, unfiltered. Placing them is this function's
   *  job because only it knows which occurrence the page is drawn as and in
   *  what order its columns ended up. Omit it and the page draws none, which
   *  is what every caller did before events existed. */
  events?: StoredEvent[]
): PageRenderContext | null {
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
  const dayLabels = spreadDayLabels(spread, weekStartDay)[spread.indexOf(page)] ?? null;
  const hasHours = page.moduleInstances.some((mi) => mi.moduleType.slug === "hourly-grid-core");
  const spine = page.moduleInstances.find((mi) => isSpineSlug(mi.moduleType.slug));
  const spineColumns =
    spine && typeof spine.columnStart === "number" && typeof spine.columnSpan === "number"
      ? { columnStart: spine.columnStart, columnSpan: spine.columnSpan }
      : null;

  // EVENTS ARE DATED THINGS, so they need all three: a real occurrence to be
  // dated against, columns to sit in, and a book that admits dates at all.
  // columnDates is the same rule the day tab's own number comes from, so an
  // event cannot land under a date the tab does not show.
  const grid = dated && occurrence && dayLabels && hasHours ? columnDates(page.level, occurrence.start, dayLabels) : null;
  // In the BOOK's zone: an event is an instant, and the page prints the
  // wall-clock time here. This one argument is the whole of the fix for a
  // 9am New York meeting printing in the 1pm row - every drawing of a page
  // comes through this call, so none of them can disagree about the clock.
  const placed =
    grid && events
      ? eventsForDays(events, grid.map((date) => ({ date })), effectiveZone(book.timeZone, book.ownerTimeZone))
      : null;

  return {
    level: page.level,
    dated,
    occurrence,
    dayLabels,
    weekStartDay,
    spineColumns,
    events: placed,
    columnDates: grid ? grid.map((d) => (d ? d.toISOString().slice(0, 10) : null)) : null,
  };
}

/**
 * The day columns each page of a spread shows, turned to the week start:
 * the left page's three and the right page's four, taken from whichever
 * spine names them - the hours on a week, the calendar on a month. Null for
 * a page whose spine names no days.
 *
 * ONE function for the editor and the book. The book used to take the
 * stored labels as they were, so a Monday journal's PDF printed SUNDAY in
 * the first column, dated as the last day of its week, while the editor
 * showed MONDAY there. Found 2026-09-30.
 */
export function spreadDayLabels(
  spread: Array<{ moduleInstances: Array<{ moduleType: { slug: string }; propValues: unknown }> } | undefined>,
  weekStartDay: number
): Array<DayLabel[] | null> {
  const labelsOf = (p: (typeof spread)[number]) => {
    const spine = p?.moduleInstances.find((mi) => isSpineSlug(mi.moduleType.slug));
    const labels = (spine?.propValues as { dayLabels?: unknown } | null | undefined)?.dayLabels;
    return Array.isArray(labels) ? (labels as DayLabel[]) : null;
  };
  const rotated = rotateWeekDays(labelsOf(spread[0]) ?? [], labelsOf(spread[1]) ?? [], weekStartDay);
  return spread.map((p, i) => {
    const own = labelsOf(p);
    if (!own) return null;
    return i === 0 ? rotated.left : i === 1 ? rotated.right : own;
  });
}

/**
 * THE DAY OVER EACH OF A MODULE'S DAY COLUMNS, left to right: 0 Sunday to 6
 * Saturday, or null where its column is under no day - the sidebar, or past
 * the hours (horizontal resizing's "fourth column"). Read off the spine:
 * its day labels split its columns between them, a day column each.
 *
 * Null - nothing to tell the module - where the spine's labels are not a
 * day column each: the daily page names one day across all its columns,
 * and naming every group of a strip under it that same day says nothing.
 */
export function daysUnder(
  placement: { columnStart: number | null; columnSpan: number },
  context: PageRenderContext,
  dayColumns: number
): Array<number | null> | null {
  const spine = context.spineColumns;
  const labels = context.dayLabels;
  if (!spine || !labels || labels.length === 0 || placement.columnStart === null) return null;
  if (spine.columnSpan !== labels.length * dayColumns) return null;
  const count = Math.max(1, Math.round(placement.columnSpan / dayColumns));
  return Array.from({ length: count }, (_, u) => {
    const column = placement.columnStart! + u * dayColumns;
    if (column < spine.columnStart || column >= spine.columnStart + spine.columnSpan) return null;
    const label = labels[Math.floor((column - spine.columnStart) / dayColumns)];
    const index = WEEKDAY_NAMES.indexOf(String(label?.name ?? "").trim().toUpperCase());
    return index < 0 ? null : index;
  });
}

/**
 * A module's stored props, as its page draws them. Null context draws the
 * stored values as they are. `placement` - where the module sits, in grid
 * columns - lets it read the days over it (daysUnder); without one it is
 * drawn as if under none in particular, as before.
 */
export function propsForRender(
  slug: string,
  propValues: unknown,
  context: PageRenderContext | null | undefined,
  placement?: { columnStart: number | null; columnSpan: number; dayColumns: number }
): unknown {
  if (!context) return propValues;
  // The events go in beside the rotated day labels, not after the dating
  // hook: they are already placed against the columns this context describes,
  // and `withDates` only ever rewrites those labels.
  const hours = slug === "hourly-grid-core";
  // A spine's day names turn with the week. The hours' labels carry their own
  // dates, so they can always turn. The calendar's dates live in its cells,
  // which only its dating hook recomputes for the week start - so it turns
  // when it is being dated, or has no dates to disagree with.
  const turnsDays =
    !!context.dayLabels && isSpineSlug(slug) && (hours || context.occurrence !== null || !context.dated);
  const events = hours && context.events;
  const rotated =
    turnsDays || events
      ? {
          ...((propValues ?? {}) as object),
          ...(turnsDays ? { dayLabels: context.dayLabels } : {}),
          ...(events ? { events: context.events } : {}),
        }
      : propValues;
  const turned = withWeekStart(slug, rotated, context.weekStartDay);
  const days = placement ? daysUnder(placement, context, placement.dayColumns) : null;
  const weekly = days ? withDaysUnder(slug, turned, days) : turned;
  if (!context.dated) return withoutDates(slug, weekly);
  return context.occurrence ? withDates(slug, weekly, context.occurrence) : weekly;
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
    {
      ...instance,
      propValues: propsForRender(instance.moduleType.slug, instance.propValues, context, {
        columnStart: instance.columnStart,
        columnSpan: instance.columnSpan,
        dayColumns: dayUnitColumns(pageGrid),
      }),
    },
    pageGrid,
    fontFamily
  );
}

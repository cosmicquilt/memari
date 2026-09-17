// What a page STARTS AS: the arrangement of modules a fresh planner is
// seeded with, and the one `resetPlannerToTemplate` puts back.
//
// This was a few hundred lines of bootstrap inside actions.ts - a run of
// `ensureX` helpers, each one asking "is this module here? no? create it
// at these coordinates". That works for exactly one layout per cadence,
// which is what the product had. It cannot answer "give me a second
// weekly layout", and the business model is a planner being a few
// templates plus a date range, so a second one is the whole point.
//
// The layouts are DATA here, and applying them is one pure function. A new
// layout is an entry rather than a code path; two callers cannot drift
// about what "the original layout" was, because there is only one
// description of it; and the placements can be tested without a database,
// which is what pageLayouts.test.mts does.
//
// The drift was not hypothetical. actions.ts already carried three shared
// constants specifically so the seed and the reset could not disagree, and
// its own comment records the time they did: "this one was missing, so the
// reset restored the block's rowSpan but never its columns, leaving it at
// its pre-migration width on every reset."

import { computeMonthCalendar } from "@/lib/monthCalendar";
import { MIN_ROW_SPAN } from "@/lib/moduleRegistry";
import type { PageLevel } from "@/lib/pageLevels";

/** One module, where it goes, and what it starts with. */
export type LayoutPlacement = {
  slug: string;
  /** 0 = left page of the spread, 1 = right. */
  page: 0 | 1;
  columnStart: number;
  rowStart: number;
  /** null takes the module type's own default span. */
  columnSpan: number | null;
  rowSpan: number | null;
  locked: boolean;
  propValues: Record<string, unknown>;
};

/**
 * How a group decides it is already present.
 *
 * Not by ROW. The month's Notes box was once guarded by `rowStart === 18`
 * while the create used 23, so on any planner seeded after that row moved
 * the guard never matched and a second Notes box was added every time the
 * bootstrap ran. A guard keyed on the geometry it is guarding goes stale
 * the moment that geometry moves.
 */
export type PresenceRule =
  | { by: "slug" }
  | { by: "labeled-box-column"; columnStart: number }
  | { by: "labeled-box-heading"; heading: string; columnStart: number };

export type LayoutGroup = {
  name: string;
  /**
   * Every placement is decided against its OWN page, so one page having a
   * to-do does not stop the other getting one.
   *
   * There was a `seed: "each" | "all"` switch here for the sidebar, on the
   * reasoning that its three boxes should be all-or-nothing. They already
   * are: the rule they are guarded by asks about a COLUMN, which is the
   * same question for all three, so both settings produced identical
   * output and a sabotage that flipped it could not be detected. A switch
   * whose settings cannot be told apart is the dead-switch defect this
   * codebase has been bitten by twice, so it is gone and the presence rule
   * carries the meaning on its own.
   */
  present: PresenceRule;
  placements: LayoutPlacement[];
};

export type PageLayout = {
  key: string;
  /** Which repeating set this layout is the template for. It used to name
   *  a planner type, back when a week planner and a month planner were two
   *  separate books; they are two LEVELS of one book now, so the layout
   *  belongs to the level. */
  level: PageLevel;
  title: string;
  groups: LayoutGroup[];
};

/** What the caller knows about a module already on a page. */
export type ExistingInstance = {
  slug: string;
  columnStart: number | null;
  heading?: string;
};

function satisfies(rule: PresenceRule, existing: ExistingInstance[]): boolean {
  switch (rule.by) {
    case "slug":
      return existing.length > 0;
    case "labeled-box-column":
      return existing.some(
        (e) => e.slug === "labeled-box" && e.columnStart === rule.columnStart
      );
    case "labeled-box-heading":
      return existing.some(
        (e) =>
          e.slug === "labeled-box" &&
          e.columnStart === rule.columnStart &&
          e.heading === rule.heading
      );
  }
}

/**
 * The placements a page pair is MISSING - exactly what the bootstrap
 * should create, and nothing it already has.
 *
 * Pure: no database, no module types, no ids. That is what lets the test
 * check the layout against a known-good arrangement directly.
 */
export function missingPlacements(
  layout: PageLayout,
  pages: [ExistingInstance[], ExistingInstance[]]
): LayoutPlacement[] {
  const out: LayoutPlacement[] = [];
  for (const group of layout.groups) {
    for (const placement of group.placements) {
      // A slug rule only ever looks at instances of that slug; the
      // labeled-box rules carry their own slug test.
      const scoped =
        group.present.by === "slug"
          ? pages[placement.page].filter((e) => e.slug === placement.slug)
          : pages[placement.page];
      if (satisfies(group.present, scoped)) continue;
      out.push(placement);
    }
  }
  return out;
}

// --- the layouts ------------------------------------------------------

const HOUR_DEFAULTS = {
  startTime: "05:30",
  endTime: "23:30",
  intervalMinutes: 30,
  hourLineStyle: "full",
  dayBorder: false,
};

/**
 * The weekly spread, as measured off the reference PDF.
 *
 * A function of the page's row count, because the two trims differ only in
 * height: 36 rows on 7x10, 34 on Letter. Everything above Notes is fixed -
 * week-title holds type that cannot shrink, and the other two boxes were
 * sized against the reference - so the difference lands on Notes, the
 * largest box, where two dots are least visible.
 *
 * The left page reserves column 0 for the sidebar; the right page has no
 * sidebar, so its day columns take the full width rather than leaving a
 * gap for something that is not there.
 */
export function weekLayout(gridRows: number): PageLayout {
  const belowGrid = Math.max(MIN_ROW_SPAN, gridRows - 21);
  const day = (name: string, date: number) => ({ name, date });
  return {
    key: "week-default",
    level: "WEEKLY",
    title: "My First Planner",
    groups: [
      {
        name: "week title",
        present: { by: "slug" },
        placements: [
          {
            slug: "week-title",
            page: 0,
            columnStart: 0,
            rowStart: 0,
            columnSpan: null,
            rowSpan: null,
            locked: true,
            propValues: { weekNumber: 1, weekTotal: 52, dateRangeLabel: "DEC 31 - JAN 6" },
          },
        ],
      },
      {
        name: "hourly grid",
        present: { by: "slug" },
        placements: [
          {
            slug: "hourly-grid-core",
            page: 0,
            columnStart: 6,
            rowStart: 0,
            columnSpan: 18,
            rowSpan: null,
            locked: true,
            propValues: {
              dayCount: 3,
              dayLabels: [day("SUNDAY", 1), day("MONDAY", 2), day("TUESDAY", 3)],
              ...HOUR_DEFAULTS,
              events: [],
            },
          },
          {
            slug: "hourly-grid-core",
            page: 1,
            columnStart: 0,
            rowStart: 0,
            columnSpan: 24,
            rowSpan: null,
            locked: true,
            propValues: {
              dayCount: 4,
              dayLabels: [
                day("WEDNESDAY", 4),
                day("THURSDAY", 5),
                day("FRIDAY", 6),
                day("SATURDAY", 7),
              ],
              ...HOUR_DEFAULTS,
              events: [],
            },
          },
        ],
      },
      {
        // One decision for all three: if the sidebar already holds
        // anything the user put there, the template does not push its own
        // boxes in beside it.
        name: "sidebar boxes",
        present: { by: "labeled-box-column", columnStart: 0 },
        placements: (
          [
            ["Things I'm Grateful For", 3, 7],
            ["Reminders", 10, 11],
            ["Notes", 21, belowGrid],
          ] as Array<[string, number, number]>
        ).map(([heading, rowStart, rowSpan]) => ({
          slug: "labeled-box",
          page: 0 as const,
          columnStart: 0,
          rowStart,
          columnSpan: null,
          rowSpan,
          locked: false,
          // templateHeading is the "full reset" target - captured at the
          // one point the app itself ever sets this heading, and never
          // touched again.
          propValues: { heading, ruled: false, templateHeading: heading },
        })),
      },
      {
        // On BOTH pages of the reference spread - confirmed against the
        // PDF's own extracted text, where "TO - DO" is the last block on
        // each. Row 21 leaves row 20 clear as a one-row gap under the
        // hourly block.
        name: "to-do below the grid",
        present: { by: "slug" },
        placements: [
          {
            slug: "todo-checklist",
            page: 0,
            columnStart: 6,
            rowStart: 21,
            columnSpan: 18,
            rowSpan: belowGrid,
            locked: false,
            propValues: { dayCount: 3 },
          },
          {
            slug: "todo-checklist",
            page: 1,
            columnStart: 0,
            rowStart: 21,
            columnSpan: 24,
            rowSpan: belowGrid,
            locked: false,
            propValues: { dayCount: 4 },
          },
        ],
      },
    ],
  };
}

/**
 * The matter: the pages printed once, at the front and the back.
 *
 * NO LOCKED SPINE, and that is the whole character of them. Every other level
 * is built around a block that owns the page - the hours, the calendar - and
 * the free zones sit in what is left. Matter has none, so the page is an
 * empty lattice and a module can go anywhere on it. It is the easiest kind of
 * page in the app and the most open.
 *
 * Which also means the template here is a STARTING POINT rather than a
 * structure: nothing is locked, so every box can be moved, resized, retitled
 * or deleted. It exists because a blank page is a worse first impression than
 * a page with something sensible on it - the same reason the weekly spread
 * seeds its sidebar rather than leaving three empty columns.
 *
 * Built from labeled-box alone. "Blank or ruled" needs no new module: it IS
 * labeled-box, with `ruled` deciding which. A page-sized one with no heading
 * is a notes page.
 */
function matterLayout(
  key: string,
  level: PageLevel,
  title: string,
  boxes: Array<[heading: string, rowStart: number, rowSpan: number, ruled: boolean]>
): PageLayout {
  return {
    key,
    level,
    title,
    groups: [
      {
        // One decision for the whole page: if anything is already here, the
        // template does not push its own boxes in beside it. Matter is the
        // level people will rearrange most, and re-seeding over that would
        // be the worst place in the app to do it.
        name: "matter boxes",
        present: { by: "labeled-box-column", columnStart: 0 },
        placements: boxes.map(([heading, rowStart, rowSpan, ruled]) => ({
          slug: "labeled-box",
          page: 0 as const,
          columnStart: 0,
          // Full width. A matter page has no sidebar to leave room for.
          columnSpan: 24,
          rowStart,
          rowSpan,
          locked: false,
          propValues: { heading, ruled, templateHeading: heading },
        })),
      },
    ],
  };
}

/**
 * The front matter: the first page of the book.
 *
 * Whose book it is, what the term is for, and how its owner will know it
 * worked. Three boxes rather than one blank page, because the question a
 * planner opens with is the reason somebody bought it.
 */
export function frontMatterLayout(gridRows: number): PageLayout {
  const tail = Math.max(MIN_ROW_SPAN, gridRows - 22);
  return matterLayout("front-matter-default", "FRONT_MATTER", "Beginning", [
    ["This Planner Belongs To", 0, 4, false],
    ["What I Want From These Months", 4, 9, true],
    ["How I Will Know It Worked", 13, 9, true],
    ["Anything Else", 22, tail, true],
  ]);
}

/**
 * The back matter: the last page.
 *
 * One ruled page. Every planner ends with somewhere to write that is not
 * about any particular day, and a ruled full-page box is exactly that - the
 * thing the memory calls "blank or ruled needs no new module".
 */
export function backMatterLayout(gridRows: number): PageLayout {
  return matterLayout("back-matter-default", "BACK_MATTER", "Ending", [
    ["Notes", 0, gridRows, true],
  ]);
}

/**
 * The daily page.
 *
 * ONE page, not a spread. A week and a month are each a thing you look at
 * whole, so they open flat; a day is a day, and ninety of them as spreads is
 * a book twice the size for no more content. Two consecutive days end up
 * facing each other in the bound book anyway, which is what a day-per-page
 * planner looks like.
 *
 * Built from the same modules as the weekly spread with the hours narrowed
 * to a single column, rather than from a new "daily" primitive. The hours
 * ALREADY carry the date - the day tab is the page's title - so a day-title
 * module would be a second place for the same fact.
 *
 * The day's own name and date are filled in at generation time: the template
 * says MONDAY because a template has to say something, and hourly-grid-core's
 * `dated` hook replaces it with whichever day this copy is for. See the
 * registry.
 */
export function dayLayout(gridRows: number): PageLayout {
  const belowGrid = Math.max(MIN_ROW_SPAN, gridRows - 21);
  return {
    key: "day-default",
    level: "DAILY",
    title: "Daily page",
    groups: [
      {
        name: "the day's hours",
        present: { by: "slug" },
        placements: [
          {
            slug: "hourly-grid-core",
            page: 0,
            // Column 6 onward, leaving the sidebar its usual six columns -
            // a daily page keeps the spread's proportions so the two read
            // as one book rather than two designs.
            columnStart: 6,
            rowStart: 0,
            columnSpan: 18,
            rowSpan: null,
            locked: true,
            propValues: {
              dayCount: 1,
              dayLabels: [{ name: "MONDAY", date: 1 }],
              ...HOUR_DEFAULTS,
              events: [],
            },
          },
        ],
      },
      {
        name: "sidebar boxes",
        present: { by: "labeled-box-column", columnStart: 0 },
        placements: (
          [
            ["Today's Focus", 0, 10],
            ["Notes", 10, 11],
            ["Tomorrow", 21, belowGrid],
          ] as Array<[string, number, number]>
        ).map(([heading, rowStart, rowSpan]) => ({
          slug: "labeled-box",
          page: 0 as const,
          columnStart: 0,
          rowStart,
          columnSpan: null,
          rowSpan,
          locked: false,
          propValues: { heading, ruled: false, templateHeading: heading },
        })),
      },
      {
        name: "to-do below the hours",
        present: { by: "slug" },
        placements: [
          {
            slug: "todo-checklist",
            page: 0,
            columnStart: 6,
            rowStart: 21,
            columnSpan: 18,
            rowSpan: belowGrid,
            locked: false,
            propValues: { dayCount: 3 },
          },
        ],
      },
    ],
  };
}

/**
 * The monthly spread.
 *
 * The grid is 16 rows, not the module type's default. With the header at
 * one cell less the insets, a span of 1 + weekCount * n gives every week
 * row exactly n whole cells; at five weeks that is 6, 11, 16, 21. Sixteen
 * is three cells a week - half of one for the date strip and two and a
 * half to write in - and leaves a one cell gap above Notes with Notes
 * reaching the foot of the page.
 */
export const MONTH_GRID_ROW_SPAN = 16;

export function monthLayout(gridRows: number): PageLayout {
  // A fixed month rather than "the current month" - see the bootstrap's
  // own header comment.
  const calendar = computeMonthCalendar(2024, 1);
  const dayNames = [
    "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY",
  ];
  const grid = (page: 0 | 1, startColumn: number, dayCount: number, columnStart: number, columnSpan: number): LayoutPlacement => ({
    slug: "month-grid-core",
    page,
    columnStart,
    rowStart: 0,
    columnSpan,
    rowSpan: MONTH_GRID_ROW_SPAN,
    locked: true,
    propValues: {
      dayCount,
      dayLabels: dayNames.slice(startColumn, startColumn + dayCount).map((name) => ({ name })),
      weekCount: calendar.weekCount,
      cells: calendar.weeks.map((week) => week.slice(startColumn, startColumn + dayCount)),
    },
  });
  const notes = (page: 0 | 1, columnStart: number, columnSpan: number): LayoutPlacement => ({
    slug: "labeled-box",
    page,
    columnStart,
    // One cell clear of the calendar, and down to the foot of the page
    // rather than stopping short of it.
    rowStart: MONTH_GRID_ROW_SPAN + 1,
    columnSpan,
    rowSpan: gridRows - (MONTH_GRID_ROW_SPAN + 1),
    locked: false,
    propValues: { heading: "Notes", ruled: false },
  });
  return {
    key: "month-default",
    level: "MONTHLY",
    // The BOOK's title comes from the weekly layout, which is the one that
    // creates it. This names the layout, not a planner of its own - there
    // is no separate month planner any more.
    title: "Monthly spread",
    groups: [
      {
        name: "month title",
        present: { by: "slug" },
        placements: [
          {
            slug: "month-title",
            page: 0,
            columnStart: 0,
            rowStart: 0,
            columnSpan: null,
            rowSpan: null,
            locked: true,
            propValues: { monthName: "JANUARY" },
          },
        ],
      },
      {
        name: "month grid",
        present: { by: "slug" },
        placements: [grid(0, 0, 3, 6, 18), grid(1, 3, 4, 0, 24)],
      },
      {
        // Identified by its HEADING, not its row - see PresenceRule.
        name: "notes below the grid",
        present: { by: "labeled-box-heading", heading: "Notes", columnStart: 6 },
        placements: [notes(0, 6, 18)],
      },
      {
        name: "notes below the grid (right)",
        present: { by: "labeled-box-heading", heading: "Notes", columnStart: 0 },
        placements: [notes(1, 0, 24)],
      },
      {
        name: "sidebar boxes",
        present: { by: "labeled-box-column", columnStart: 0 },
        placements: (
          [
            // Row 2 - month-title occupies rows 0-1, same convention as
            // week-title.
            ["Monthly Mantra", 2, 4],
            ["Priorities", 6, 6],
            ["Reminders", 12, 7],
            // Runs to the foot of the page rather than to a fixed span.
            ["Tentative Dates", 19, gridRows - 19],
          ] as Array<[string, number, number]>
        ).map(([heading, rowStart, rowSpan]) => ({
          slug: "labeled-box",
          page: 0 as const,
          columnStart: 0,
          rowStart,
          columnSpan: null,
          rowSpan,
          locked: false,
          propValues: { heading, ruled: false, templateHeading: heading },
        })),
      },
    ],
  };
}

/** Every layout the app ships, by key. */
export const PAGE_LAYOUTS = {
  "week-default": weekLayout,
  "month-default": monthLayout,
} as const;

// --- accessors for the reset -----------------------------------------
//
// resetPlannerToTemplate rebuilds two specific regions rather than the
// whole spread, so it needs the layout's numbers in its own shape. These
// read them OUT of the layout instead of restating them, which is the
// whole point of the file: the seed and the reset cannot disagree about
// what the original arrangement was, because there is only one of it.

function groupOf(layout: PageLayout, name: string): LayoutGroup {
  const group = layout.groups.find((g) => g.name === name);
  if (!group) throw new Error(`${layout.key} has no group named "${name}"`);
  return group;
}

export function weekSidebarBoxes(
  gridRows: number
): Array<{ heading: string; rowStart: number; rowSpan: number }> {
  return groupOf(weekLayout(gridRows), "sidebar boxes").placements.map((p) => ({
    heading: String((p.propValues as { heading?: string }).heading ?? ""),
    rowStart: p.rowStart,
    rowSpan: p.rowSpan ?? 0,
  }));
}

export function weekTodoPlacements(gridRows: number): Array<{
  /** Named, not indexed - resetPlannerToTemplate reads it this way, and
   *  adapting here is this accessor's whole job. */
  page: "left" | "right";
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  dayCount: number;
}> {
  return groupOf(weekLayout(gridRows), "to-do below the grid").placements.map((p) => ({
    page: p.page === 0 ? ("left" as const) : ("right" as const),
    columnStart: p.columnStart,
    columnSpan: p.columnSpan ?? 0,
    rowStart: p.rowStart,
    rowSpan: p.rowSpan ?? 0,
    dayCount: Number((p.propValues as { dayCount?: number }).dayCount ?? 0),
  }));
}

/** Where each page's locked hourly block sits. */
export function weekHourlyPlacements(): Record<"left" | "right", { columnStart: number; columnSpan: number }> {
  const [left, right] = groupOf(weekLayout(36), "hourly grid").placements;
  return {
    left: { columnStart: left.columnStart, columnSpan: left.columnSpan ?? 0 },
    right: { columnStart: right.columnStart, columnSpan: right.columnSpan ?? 0 },
  };
}

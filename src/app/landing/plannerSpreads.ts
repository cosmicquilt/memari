// The spreads the prebuilt planners are made of (plannerTemplates.ts): a
// planner names one for each part of the book - its front pages, its month,
// its week, its day - and "Use this planner" lays the whole book out from
// them (planner/archetypeWeek.ts, createJournalFromPlanner).
//
// They are layouts like the hero's (heroSpreads.ts), drawn by the same
// renderers and checked by the same test (spreads.test.mts: every module
// fits its cells and its floor, nothing overlaps, every page is full), but
// not turned through on the landing page and not written in: the gallery
// shows layouts empty, as printing them gives you. So the writing below is
// the least the type asks for.
//
// THE IRREGULAR INCOME PLANNER (2026-10-15), the planner research's first
// niche (handoff/research, Gemini A report: "Irregular Income & Pay-Period
// Budget"): freelancers, gig and tipped workers, anyone whose pay is never
// the same twice. Its profile: a minimum baseline income page, pay-period
// budgets, a rule for what to do with a good month, a weekly safe-to-spend,
// a 90-day forecast of irregular bills, sinking funds and debt bars.
//
// Data only.

import { BELOW_ROW, type Hand, type Slot } from "./archetypes";
import type { HeroSpread } from "./heroSpreads";
import { LIBRARY_SPREADS } from "./plannerLibrary";
import { LIBRARY_SPREADS_2 } from "./plannerLibrary2";

const at = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>): Slot => ({
  slug,
  columnStart,
  rowStart,
  columnSpan,
  rowSpan,
  props,
});
/** A box with a heading: plain, lined or dotted. */
const box = (heading: string, rule: "none" | "lined" | "dotted" = "none") => ({ heading, rule, ruled: rule === "lined", templateHeading: heading });

/** Never seen - the gallery draws these empty - but every spread has one. */
const UNWRITTEN: Pick<HeroSpread, "hand" | "doodles" | "events" | "calendar"> = {
  hand: {
    words: { font: "caveat", caps: false, weight: 500, scale: 1.42 },
    banner: { font: "marker", caps: true, scale: 1 },
    pen: { color: "#1d1c21", width: 3.6, kind: "ink" },
    accent: { color: "#24439c", width: 3.6, kind: "ink" },
    highlight: { color: "#ffe45c", width: 46, kind: "highlighter" },
  } satisfies Hand,
  doodles: { style: "minimal", big: [], small: [] },
  events: [],
  calendar: [],
};

const FIRST_PLANNERS: HeroSpread[] = [
  // ============================================================== ADHD
  // The research's second niche (Gemini A report, "ADHD Brain-Dump & Done
  // List"): a day of three things and what actually got done, beside open
  // dotted space to empty a head onto; stars that count up rather than
  // streaks to break; and less of everything - r/adhdwomen found drawing
  // next month's spread "too much". No week: a day page and a month.
  {
    key: "pages-adhd",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: false,
      pages: [
        [
          at("dopamine-menu", 0, 0, 12, 16),
          // What gets you moving, written on a good day for a bad one.
          at("labeled-box", 12, 0, 12, 16, box("When I'm Stuck", "lined")),
          at("someday-maybe", 0, 16, 12, 20),
          at("labeled-box", 12, 16, 12, 20, box("Don't Forget", "lined")),
        ],
        [at("brain-dump", 0, 0, 24, 26, { rule: "dotted" }), at("project-tracker", 0, 26, 24, 10)],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-adhd",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: false,
      inside: "dotted",
      sidebar: [
        ["labeled-box", 12, box("This Month", "lined")],
        ["labeled-box", 11, box("What Helped", "lined")],
        ["labeled-box", 11, box("Wins", "lined")],
      ],
      belowLeft: [at("star-count", 6, 17, 18, 5), at("brain-dump", 6, 22, 18, 14, { rule: "dotted" })],
      belowRight: [at("project-tracker", 0, 17, 24, 10), at("labeled-box", 0, 27, 12, 9, box("Month Review", "lined")), at("done-list", 12, 27, 12, 9)],
    },
    ...UNWRITTEN,
  },
  {
    // A page a day: three things and what actually got done down the side,
    // and the day itself as open dots rather than hours - a brain dump with
    // the date on it. Focus blocks and a short list under it.
    key: "day-adhd-dots",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: false,
      firstDay: 1,
      hours: { intervalMode: "off", offModeRule: "dotted" },
      hoursRows: 24,
      sidebar: [
        // Four rows: the heading and exactly three. Rows fill their box, so
        // at six it printed five numbered lines under "Big Three".
        ["daily-big-three", 4],
        ["done-list", 20],
        ["labeled-box", 12, box("Tomorrow", "lined")],
      ],
      below: [at("focus-blocks", 6, 25, 18, 1, { groups: 1 }), at("todo-checklist", 6, 26, 18, 10, { dayCount: 1 })],
    },
    ...UNWRITTEN,
  },

  // ====================================================== irregular income
  {
    // The front of the book: the plan, made once and read every month.
    key: "pages-irregular-income",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          // The month you can always cover: the bills that must be paid,
          // added up. Below it the pay is a surplus, above it a problem.
          at("column-table", 0, 0, 12, 16, { heading: "Baseline Month", columns: ["Must pay", "Amount"], weights: [3, 1.3], totalsRow: true, totalsLabel: "Baseline" }),
          // The rule for a good month, written before one comes.
          at("labeled-box", 12, 0, 12, 16, box("When There's Extra", "lined")),
          at("sinking-funds", 0, 16, 24, 10),
          at("savings-goal", 0, 26, 12, 5, { heading: "Buffer", endLabel: "One month" }),
          at("debt-payoff", 12, 26, 12, 5),
          at("labeled-box", 0, 31, 24, 5, box("Money Goals", "lined")),
        ],
        [
          // The bills that don't come monthly - insurance, car tax, a
          // renewal - looked at three months ahead.
          at("column-table", 0, 0, 24, 18, { heading: "Irregular Bills, Next 90 Days", columns: ["Bill", "Due", "Amount", "Saved"], weights: [2.2, 1, 1.2, 1] }),
          at("subscription-audit", 0, 18, 12, 18),
          // Self-employed: tax is nobody else's job. By the quarter, as
          // US estimated tax is paid.
          at("column-table", 12, 18, 12, 9, { heading: "Tax Set-Aside", columns: ["Quarter", "Set aside", "Paid"], weights: [1.2, 1.3, 1] }),
          at("labeled-box", 12, 27, 12, 9, box("Money Notes", "lined")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    // The month: paydays and bills on the calendar, every payment in the
    // income log, and the month's pay split into the two paychecks most
    // people budget by.
    key: "month-irregular-income",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        ["labeled-box", 13, box("Bills Due", "lined")],
        ["labeled-box", 11, box("Set Aside", "lined")],
        ["labeled-box", 10, box("Month Wins", "lined")],
      ],
      belowLeft: [at("income-log", 6, 17, 18, 19)],
      belowRight: [
        at("paycheck-budget", 0, 17, 12, 10, { heading: "Paycheck 1" }),
        at("paycheck-budget", 12, 17, 12, 10, { heading: "Paycheck 2" }),
        at("labeled-box", 0, 27, 12, 9, box("Month Review", "lined")),
        at("savings-goal", 12, 27, 12, 5, { heading: "Buffer", endLabel: "One month" }),
        at("labeled-box", 12, 32, 12, 4, box("Next Month", "lined")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    // The week: what is safe to spend, where it went, and what came in.
    key: "week-irregular-income",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["labeled-box", 9, box("Safe to Spend", "lined")],
        ["labeled-box", 12, box("Bills Due", "lined")],
        ["grocery-list", 12],
      ],
      belowLeft: [at("spending-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("income-log", 0, BELOW_ROW, 12, 15),
        at("savings-goal", 12, BELOW_ROW, 12, 5, { heading: "Buffer", endLabel: "One month" }),
        at("debt-payoff", 12, BELOW_ROW + 5, 12, 5),
        at("labeled-box", 12, BELOW_ROW + 10, 12, 5, box("Notes", "lined")),
      ],
    },
    ...UNWRITTEN,
  },
];

/** Every planner's spreads: the first two, and the library (2026-10-21,
 *  plannerLibrary.ts). */
export const PLANNER_SPREADS: HeroSpread[] = [...FIRST_PLANNERS, ...LIBRARY_SPREADS, ...LIBRARY_SPREADS_2];

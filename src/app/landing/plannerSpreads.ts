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
import { LIBRARY_SPREADS, prompts } from "./plannerLibrary";
import { LIBRARY_SPREADS_2 } from "./plannerLibrary2";
import { CHALLENGE_SPREADS } from "./challenges";

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

/** The irregular income planner's buffer, counted in weeks of the Baseline
 *  Month covered: the savings bar's 10, 20 ... 100 between "$0" and "One
 *  month" said ten of nothing. */
const BUFFER = { heading: "Buffer, Weeks Covered", total: 4, milestoneEvery: 1, segments: "boxes", numbers: "every", startLabel: "", endLabel: "One month" };

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
          // What gets you moving, written on a good day for a bad one: the
          // known ways to start, asked, since a bad day can't invent them.
          at(
            "prompted-lines",
            12,
            0,
            12,
            16,
            prompts("When I'm Stuck", ["Make it tiny: the first two minutes", "Change where I am", "Who I can work beside", "What I'm really avoiding"], 2),
          ),
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
      // Wins and a done list were one look back twice; what was let go
      // instead, in a planner of less of everything.
      belowRight: [at("project-tracker", 0, 17, 24, 10), at("labeled-box", 0, 27, 12, 9, box("Month Review", "lined")), at("labeled-box", 12, 27, 12, 9, box("Dropped, and That's Fine", "lined"))],
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
      // Headed for what it is beside Big Three: the rest, only if there's
      // time.
      below: [at("focus-blocks", 6, 25, 18, 1, { groups: 1 }), at("todo-checklist", 6, 26, 18, 10, { dayCount: 1, heading: "If There's Time" })],
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
          at("savings-goal", 0, 26, 12, 5, BUFFER),
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
          // The other half of When There's Extra: what to cut or draw on in
          // a lean month, planned before one comes.
          at("labeled-box", 12, 27, 12, 9, box("When It's a Slow Month", "lined")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    // The month: paydays and bills on the calendar, the weeks' income added
    // up against the baseline, and the bills split by the halves of the
    // month, which works however the pay lands (two numbered paychecks a
    // month is the salary this planner's readers don't have).
    key: "month-irregular-income",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        // The bills are in the two half-month tables; here, the month
        // against the Baseline Month on the front. "Came in" is the total
        // of Came In, by Week.
        ["prompted-lines", 13, prompts("Against the Baseline", ["Baseline", "Came in", "Over or under", "Extra went to"], 1)],
        ["labeled-box", 11, box("Set Aside", "lined")],
        ["labeled-box", 10, box("Month Wins", "lined")],
      ],
      // Every payment is logged on the week, where it lands (paid daily, a
      // month's log overflows); the month adds the weeks up, and keeps
      // what is owed.
      belowLeft: [
        at("column-table", 6, 17, 18, 9, { heading: "Came In, by Week", columns: ["Week", "Came in", "Set aside", "Spent"], weights: [0.8, 1.2, 1.2, 1.2], totalsRow: true, totalsLabel: "Month" }),
        at("column-table", 6, 26, 18, 10, { heading: "Owed to Me", columns: ["Who", "For", "Amount", "Paid"], weights: [1.4, 1.6, 1.1, 0.8] }),
      ],
      belowRight: [
        at("paycheck-budget", 0, 17, 12, 10, { heading: "1st to 15th" }),
        at("paycheck-budget", 12, 17, 12, 10, { heading: "16th to End" }),
        at("labeled-box", 0, 27, 12, 9, box("Month Review", "lined")),
        at("savings-goal", 12, 27, 12, 5, BUFFER),
        at("labeled-box", 12, 32, 12, 4, box("Next Month", "lined")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    // The week: what is safe to spend, where it went, what came in, and
    // what is coming. The Buffer bar is on the front and the month, Payoff
    // on the front: neither re-shaded every week.
    key: "week-irregular-income",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        // The sum laid out, not a blank box.
        ["prompted-lines", 9, prompts("Safe to Spend", ["In the bank", "Bills before next pay", "Set aside", "Safe to spend"], 1)],
        ["labeled-box", 12, box("Bills Due", "lined")],
        ["grocery-list", 12],
      ],
      belowLeft: [at("spending-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("income-log", 0, BELOW_ROW, 12, 15), at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("Week Ahead", ["Pay I expect", "One money job"], 5))],
    },
    ...UNWRITTEN,
  },
];

/** Every planner's spreads: the first two, and the library (2026-10-21,
 *  plannerLibrary.ts). */
export const PLANNER_SPREADS: HeroSpread[] = [...FIRST_PLANNERS, ...LIBRARY_SPREADS, ...LIBRARY_SPREADS_2, ...CHALLENGE_SPREADS];

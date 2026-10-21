// THE PLANNER LIBRARY (2026-10-21): "build more prebuilt planners, make sure
// to flesh them out extremely and think of what would be best for each user
// and usable, convenient ... growth, planning and philosophy ... a large
// diverse library". Whole books like the first two (plannerSpreads.ts), one
// for each kind of life or practice, each part a spread of its own.
//
// What every one of them follows, from the research (handoff/research:
// data/FINDINGS.md, data/reddit-useful.md, the Gemini A report's profiles):
//
//   - Set up already, and light. People quit planners because setup is work
//     and pages fill with decoration ("I didn't even make it to February",
//     "I've over decorated my planner and now I hate it"): every box has a
//     job, and plain note boxes are named for what goes in them.
//   - Credit, not guilt. Done lists beside to-do lists; habits counted by
//     the week, not as streaks to break ("Why do calendars punish you the
//     moment you have a bad day??"); a plan for the day you miss.
//   - No quotes printed for you ("Please tone down the cheesy inspirational
//     quotes", 142 votes): a commonplace book to keep your own instead.
//   - Scheduled things are calendar events, never a module (classes, shifts,
//     appointments, races go on the hours).
//   - Methods are described, never named for their trademarks: the next
//     actions planner follows a well-known capture method without its name.
//
// Faith and recovery planners keep each tradition's own words, and like the
// held hero weeks should be read by someone of that tradition before they are
// promoted.
//
// Data only. Checked by spreads.test.mts like every planner spread.

import { BELOW_ROW, type Hand, type Slot } from "./archetypes";
import type { HeroSpread } from "./heroSpreads";

export const at = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>): Slot => ({
  slug,
  columnStart,
  rowStart,
  columnSpan,
  rowSpan,
  props,
});
/** A box with a heading: plain, lined or dotted. */
export const box = (heading: string, rule: "none" | "lined" | "dotted" = "lined") => ({ heading, rule, ruled: rule === "lined", templateHeading: heading });
/** A table with its own columns. */
export const table = (heading: string, columns: string[], weights?: number[], extra: Record<string, unknown> = {}) => ({ heading, columns, ...(weights ? { weights } : {}), ...extra });
/** Questions, each with lines under it. */
export const prompts = (heading: string, list: string[], linesPerPrompt = 2, extra: Record<string, unknown> = {}) => ({ heading, prompts: list, linesPerPrompt, ...extra });
/** A checklist written out: the same steps each time. */
export const steps = (heading: string, items: string[]) => ({ heading, items, dayCount: 1 });

/** Never seen - the gallery draws these empty - but every spread has one. */
export const UNWRITTEN: Pick<HeroSpread, "hand" | "doodles" | "events" | "calendar"> = {
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

export const LAST = 35;

export const LIBRARY_SPREADS: HeroSpread[] = [
  // ======================================================== PLANNING
  // ------------------------------------------------ time-blocked deep work
  // Hours blocked out before the day starts, the deep work protected, the
  // shallow work batched, and a shutdown that ends the working day. A day
  // page for the blocks, a week to plan them, and the quarter's projects and
  // rules at the front.
  {
    key: "pages-time-block",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 14, prompts("This Quarter", ["What would make this quarter a success?", "Which projects get my deep work?", "What am I saying no to?"])),
          at("column-table", 0, 14, 24, 12, table("Deep Work Projects", ["Project", "Next milestone", "Hours a week"], [2.2, 2, 1])),
          at("labeled-box", 0, 26, 12, 10, box("Shallow Work to Batch")),
          at("labeled-box", 12, 26, 12, 10, box("Rules for My Week")),
        ],
        [
          // A week of where the hours really went, before planning them.
          at("column-table", 0, 0, 24, 14, table("Time Audit", ["Day", "Deep hours", "Shallow hours", "Best hours"], [1, 1, 1, 1.4])),
          at("todo-checklist", 0, 14, 12, 22, steps("Shutdown Ritual", ["Inbox captured", "Calendar checked", "Loose ends written down", "Tomorrow planned", "Done for the day"])),
          at("labeled-box", 12, 14, 12, 22, box("Ideas for Later")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-time-block",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      hours: { startTime: "06:00", endTime: "22:00", intervalMinutes: 60 },
      // As tall as sixteen hours draw, no taller (2026-10-21: the template's
      // 20 rows left half an inch blank under them).
      hoursRows: 18,
      sidebar: [
        ["prompted-lines", 12, prompts("Weekly Plan", ["Deep work goal", "Shallow work budget", "Must-dos", "Meetings to prep"], 1, { promptLines: [2, 1, 2, 1] })],
        ["weekly-priorities", 7],
        ["done-list", 14],
      ],
      // Shallow work in a column under each day, batched rather than
      // scattered; the deep work blocks to colour in along the bottom.
      belowLeft: [at("todo-checklist", 6, 19, 18, 11, { heading: "Shallow Work", dayCount: 3 }), at("labeled-box", 6, 30, 18, 5, box("Wins")), at("focus-blocks", 6, LAST, 18, 1)],
      belowRight: [at("todo-checklist", 0, 19, 24, 11, { heading: "Shallow Work", dayCount: 4 }), at("weekly-reflection", 0, 30, 24, 5), at("focus-blocks", 0, LAST, 24, 1)],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-time-block",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 0,
      hours: { startTime: "06:00", endTime: "22:00" },
      hoursRows: 19,
      sidebar: [
        ["daily-big-three", 4],
        ["todo-checklist", 14, { heading: "Shallow Work", dayCount: 1 }],
        ["todo-checklist", 8, steps("Shutdown", ["Inbox captured", "Tomorrow planned", "Loose ends noted", "Done for the day"])],
        ["labeled-box", 10, box("Notes")],
      ],
      below: [at("focus-blocks", 6, 20, 18, 1, { groups: 1 }), at("done-list", 6, 21, 18, 8), at("labeled-box", 6, 29, 18, 7, box("Ideas & Interruptions"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ capture and next actions
  // The capture method: everything out of your head into an inbox, sorted
  // into projects and next actions by where you can do them, and a weekly
  // review that keeps the whole thing trustworthy (without the review, the
  // method's users say, it falls apart).
  {
    key: "pages-next-actions",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 22, table("Projects", ["Project", "Next action", "Due"], [2, 2.4, 0.8])),
          at("someday-maybe", 0, 22, 12, 14),
          at("waiting-on", 12, 22, 12, 14),
        ],
        [
          at("prompted-lines", 0, 0, 24, 16, prompts("Horizons", ["Purpose: why I do any of it", "Vision: three to five years out", "Goals: this year and next", "Areas I keep up"])),
          at("labeled-box", 0, 16, 12, 20, box("Checklists")),
          at("labeled-box", 12, 16, 12, 20, box("Reference")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-next-actions",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Projects Started")],
        ["labeled-box", 11, box("Projects Finished")],
        ["labeled-box", 11, box("Someday, Now?")],
      ],
      belowLeft: [at("project-tracker", 6, 17, 18, 19)],
      belowRight: [at("monthly-review", 0, 17, 12, 19), at("waiting-on", 12, 17, 12, 19)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-next-actions",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["brain-dump", 10, { heading: "Inbox" }],
        ["labeled-box", 11, box("@Calls")],
        ["labeled-box", 12, box("@Errands")],
      ],
      belowLeft: [at("labeled-box", 6, BELOW_ROW, 18, 15, box("@Computer"))],
      belowRight: [
        at("labeled-box", 0, BELOW_ROW, 12, 15, box("@Home")),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("Weekly Review", ["Inboxes to zero", "Calendar: last week and next", "Every project has a next action", "Waiting on: chase", "Someday: anything for now?"], 1)),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ twelve-week sprint
  // A year's goals worked in twelve weeks: a vision, up to three goals, the
  // weekly actions that move them, and a score each week (actions done over
  // actions planned) instead of a streak.
  {
    key: "pages-twelve-week",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 14, prompts("Vision", ["Where I want to be in three years", "What these twelve weeks move forward"], 3)),
          at("smart-goal", 0, 14, 12, 11, { heading: "Goal 1" }),
          at("smart-goal", 12, 14, 12, 11, { heading: "Goal 2" }),
          at("smart-goal", 0, 25, 12, 11, { heading: "Goal 3" }),
          at("progress-meter", 12, 25, 12, 11, { heading: "84 Days", total: 84, milestoneEvery: 7, numbers: "milestones" }),
        ],
        [
          at("column-table", 0, 0, 24, 18, table("Weekly Actions", ["Goal", "Action", "Which weeks"], [1, 2.6, 1])),
          at("column-table", 0, 18, 12, 18, table("Weekly Scores", ["Week", "Planned", "Done", "Score"], [1, 1, 1, 1])),
          at("prompted-lines", 12, 18, 12, 11, prompts("Week Six Check", ["What's working?", "What will I change?", "What will I drop?"], 1)),
          at("labeled-box", 12, 29, 12, 7, box("Week Twelve Reward")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-twelve-week",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["prompted-lines", 12, prompts("This Week's Actions", ["Goal 1", "Goal 2", "Goal 3"])],
        ["weekly-priorities", 7],
        ["done-list", 14],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3 })],
      belowRight: [
        at("habit-tracker", 0, BELOW_ROW, 12, 15, { heading: "Actions Done", habits: ["", "", "", "", "", ""], totalColumn: true }),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("Weekly Score", ["Actions planned", "Actions done", "Score: done over planned", "One change for next week"], 1)),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ college semester
  // A semester read off the syllabuses once, at the start: every deadline in
  // one table, big assignments broken back into steps from the due date. The
  // week is kind to an ADHD brain - three priorities, a brain dump, what got
  // done, focus blocks to colour in.
  {
    key: "pages-semester",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 12, table("My Classes", ["Class", "Professor", "Office hours", "Goal grade"], [1.6, 1.4, 1.4, 0.9])),
          at("column-table", 0, 12, 24, 24, table("Syllabus Deadlines", ["Date", "Class", "What", "Weight"], [0.9, 1.1, 2.4, 0.8])),
        ],
        [
          at("exam-countdown", 0, 0, 12, 12),
          at("labeled-box", 12, 0, 12, 12, box("Semester Goals")),
          at("prompted-lines", 0, 12, 12, 24, prompts("Break It Down", ["Big assignment", "Due", "Steps, back from the due date"], 2, { promptLines: [1, 1, 8] })),
          at("column-table", 12, 12, 12, 24, table("Grades", ["Class", "Work", "Score"], [1, 1.6, 0.8])),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-semester",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Due This Month")],
        ["labeled-box", 11, box("Exams")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("assignment-tracker", 6, 17, 18, 19)],
      belowRight: [at("project-tracker", 0, 17, 24, 10), at("monthly-review", 0, 27, 12, 9), at("labeled-box", 12, 27, 12, 9, box("Next Month"))],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-semester",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7],
        ["brain-dump", 8],
        ["labeled-box", 6, box("Ask in Class")],
        ["done-list", 12],
      ],
      belowLeft: [at("assignment-tracker", 6, BELOW_ROW, 18, 14), at("focus-blocks", 6, LAST, 18, 1)],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 8, { dayCount: 4 }),
        at("habit-tracker", 0, 29, 24, 6, { heading: "Every Day", habits: ["Meds", "Water", "Meals", "Bed on time"] }),
        at("focus-blocks", 0, LAST, 24, 1),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ small online shop
  // A maker's or seller's year: what each product costs and earns, who
  // supplies it, launches, the content that sells it; the month's sales and
  // costs; the week's orders, things to make and to ship.
  {
    key: "pages-small-shop",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 16, table("Products & Prices", ["Product", "Cost", "Price", "Margin"], [2.2, 0.9, 0.9, 0.9])),
          at("column-table", 0, 16, 12, 20, table("Suppliers", ["Supplier", "For", "Contact"], [1.2, 1, 1.2])),
          at("column-table", 12, 16, 12, 20, table("Launch Plan", ["Date", "Product", "Where"], [0.9, 1.5, 1])),
        ],
        [
          at("content-plan", 0, 0, 24, 14),
          at("subscription-audit", 0, 14, 12, 12, { heading: "Tools & Fees" }),
          at("labeled-box", 12, 14, 12, 12, box("Product Ideas")),
          at("savings-goal", 0, 26, 12, 10, { heading: "Sales Goal", endLabel: "This year" }),
          at("labeled-box", 12, 26, 12, 10, box("Shop Policies")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-small-shop",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Launches")],
        ["labeled-box", 11, box("Restock")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("income-log", 6, 17, 18, 19, { heading: "Sales" })],
      belowRight: [at("budget", 0, 17, 12, 19, { heading: "Costs" }), at("content-plan", 12, 17, 12, 10), at("monthly-review", 12, 27, 12, 9)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-small-shop",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-priorities", 7],
        ["labeled-box", 12, box("To Make")],
        ["labeled-box", 14, box("To Ship")],
      ],
      belowLeft: [at("order-tracker", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("content-plan", 0, BELOW_ROW, 12, 15), at("spending-log", 12, BELOW_ROW, 12, 15)],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ teacher, the school year
  // A secondary teacher with several classes (the research's multi-prep
  // teacher): the classes and the year at the front, starting in August; the
  // month's dates, duties and parent contacts; the week's lessons, grading
  // and copies to make.
  {
    key: "pages-teacher-year",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("column-table", 0, 0, 16, 12, table("My Classes", ["Period", "Class", "Room", "Students"], [0.8, 1.8, 0.8, 0.9])),
          at("labeled-box", 16, 0, 8, 12, box("Bell Times")),
          at("future-log-months", 0, 12, 24, 24, { heading: "The Year Ahead", prompts: ["August", "September", "October", "November", "December", "January"] }),
        ],
        [
          at("future-log-months", 0, 0, 24, 24, { heading: "The Year Ahead", prompts: ["February", "March", "April", "May", "June", "July"] }),
          at("column-table", 0, 24, 24, 12, table("Contacts", ["Name", "Role", "Contact"], [1.3, 1, 1.5])),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-teacher-year",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Dates & Deadlines")],
        ["labeled-box", 11, box("Duties")],
        ["labeled-box", 11, box("Next Month")],
      ],
      belowLeft: [at("column-table", 6, 17, 18, 19, table("Parent Contact Log", ["Date", "Student", "Reason", "Follow-up"], [0.8, 1.2, 1.6, 1]))],
      belowRight: [at("grading-tracker", 0, 17, 12, 19), at("monthly-review", 12, 17, 12, 19)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-teacher-year",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      hours: { startTime: "06:30", endTime: "18:30", intervalMinutes: 30 },
      // Twelve hours draw 14 rows: the rest goes to the lessons (2026-10-21:
      // at the template's 20 an inch and a half was left blank).
      hoursRows: 14,
      sidebar: [
        ["weekly-priorities", 7],
        ["labeled-box", 13, box("Copies & Prep")],
        ["labeled-box", 13, box("Notes")],
      ],
      belowLeft: [at("lesson-planner", 6, 15, 18, 15), at("labeled-box", 6, 30, 18, 6, box("Duties This Week"))],
      belowRight: [
        at("grading-tracker", 0, 15, 12, 15),
        at("column-table", 12, 15, 12, 15, table("Parent Contact", ["Student", "About", "Done"], [1.2, 1.6, 0.6])),
        at("labeled-box", 0, 30, 24, 6, box("Next Week")),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== GROWTH
  // ------------------------------------------------ habits, without streaks
  // A few habits, each with its reason and a two-minute version for bad days;
  // counted by the week (most days is a win) rather than as a streak to
  // break; a Sunday reset; and a plan written in advance for the day you
  // miss. People abandon trackers that start with fifteen habits and punish
  // one missed day - this starts with five.
  {
    key: "pages-habits",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("values-list", 0, 0, 12, 12, { heading: "What Matters to Me" }),
          at("prompted-lines", 12, 0, 12, 12, prompts("Who I'm Becoming", ["I'm the kind of person who", "So this year I will"], 3)),
          at("column-table", 0, 12, 24, 12, table("My Habits", ["Habit", "Why", "Two-minute version"], [1.3, 1.6, 1.6])),
          at("habit-stacking", 0, 24, 24, 12),
        ],
        [
          at("column-table", 0, 0, 24, 14, table("Make It Easy", ["Habit", "Cue", "Easier by", "Reward"], [1.2, 1, 1.4, 1])),
          at("thirty-day-challenge", 0, 14, 12, 10),
          at("labeled-box", 12, 14, 12, 10, box("Habits I'm Breaking")),
          at("prompted-lines", 0, 24, 24, 12, prompts("When I Miss a Day", ["How I'll start again tomorrow", "What got in the way, and what would help"], 3)),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-habits",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "none",
      sidebar: [
        ["labeled-box", 12, box("This Month's Habits")],
        ["lessons-learned", 11, { heading: "What Helped" }],
        ["labeled-box", 11, box("Wins")],
      ],
      // Days done each week, not a chain: a total per habit per week.
      belowLeft: [at("habit-tracker", 6, 17, 18, 19, { heading: "Habits by Week", habits: ["", "", "", "", ""], columns: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5"], totalColumn: true })],
      belowRight: [at("star-count", 0, 17, 24, 5), at("monthly-review", 0, 22, 12, 14), at("labeled-box", 12, 22, 12, 14, box("Next Month I'll Try"))],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-habits",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["prompted-lines", 12, prompts("Sunday Reset", ["What worked last week?", "What made it hard?", "One thing to make easier"])],
        ["weekly-priorities", 7],
        ["done-list", 14],
      ],
      belowLeft: [at("habit-tracker", 6, BELOW_ROW, 18, 15, { heading: "Habits", habits: ["", "", "", "", ""], totalColumn: true })],
      belowRight: [at("weekly-reflection", 0, BELOW_ROW, 12, 15), at("labeled-box", 12, BELOW_ROW, 12, 15, box("Notes"))],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ reading journal
  // Books read, a reading goal, a to-be-read list with who recommended each,
  // a guilt-free did-not-finish list, and whole review pages; a month for
  // what's being read, the book club and the month's wrap-up.
  {
    key: "pages-reading-journal",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("books-read", 0, 0, 24, 20),
          at("progress-meter", 0, 20, 12, 8, { heading: "Reading Goal", total: 52, milestoneEvery: 4, numbers: "milestones" }),
          at("column-table", 12, 20, 12, 16, table("To Be Read", ["Title", "Author", "Who said read it"], [1.6, 1.2, 1.2])),
          at("labeled-box", 0, 28, 12, 8, box("Didn't Finish, and That's Fine")),
        ],
        [
          at("prompted-lines", 0, 0, 12, 36, prompts("Book Review", ["Title and author", "Started, finished", "Rating", "What stayed with me", "A line worth keeping"], 2, { promptLines: [1, 1, 1, 6, 4] })),
          at("prompted-lines", 12, 0, 12, 36, prompts("Book Review", ["Title and author", "Started, finished", "Rating", "What stayed with me", "A line worth keeping"], 2, { promptLines: [1, 1, 1, 6, 4] })),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-reading-journal",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Reading Now")],
        ["labeled-box", 11, box("Up Next")],
        ["labeled-box", 11, box("A Line I Loved")],
      ],
      belowLeft: [at("reading-progress", 6, 17, 18, 19)],
      belowRight: [
        at("prompted-lines", 0, 17, 12, 19, prompts("Book Club", ["Book", "When and where", "Questions to bring", "What others said"], 2, { promptLines: [1, 1, 4, 4] })),
        at("prompted-lines", 12, 17, 12, 19, prompts("Month Wrap-Up", ["Books finished", "Favourite", "Surprise", "Disappointment"])),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ GLP-1 meal planner
  // For people on a weekly GLP-1 medication: meals planned around protein,
  // protein, water and fibre counted a day at a time, each injection logged
  // with its site so they rotate, side effects scored 0 to 3, and questions
  // gathered for the doctor. A record to bring to appointments, not advice.
  {
    key: "pages-glp1",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("measurements", 0, 0, 12, 12, { heading: "Starting Point" }),
          at("prompted-lines", 12, 0, 12, 12, prompts("Why I'm Doing This", ["What I want to feel", "What I want to be able to do"], 3)),
          at("column-table", 0, 12, 24, 14, table("Injection Sites", ["Date", "Site", "Dose", "Notes"], [1, 1.4, 0.8, 1.6])),
          at("labeled-box", 0, 26, 12, 10, box("Protein Foods I Like")),
          at("labeled-box", 12, 26, 12, 10, box("Non-Scale Victories")),
        ],
        [
          at("column-table", 0, 0, 24, 12, table("Dose Changes", ["Date", "Medication", "New dose", "How it went"], [0.9, 1.3, 0.9, 1.9])),
          at("column-table", 0, 12, 24, 14, table("Questions for My Doctor", ["Date", "Question", "Answer"], [0.8, 2.2, 2])),
          at("labeled-box", 0, 26, 12, 10, box("What Helps on Hard Days")),
          at("labeled-box", 12, 26, 12, 10, box("Notes")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-glp1",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      // Measurements at full width: five columns in the sidebar shrank their
      // headings to 4pt (2026-10-21).
      sidebar: [
        ["labeled-box", 12, box("Non-Scale Victories")],
        ["labeled-box", 11, box("Questions for My Doctor")],
        ["labeled-box", 11, box("Refills & Pharmacy")],
      ],
      belowLeft: [
        at("measurements", 6, 17, 18, 5),
        at("mood-chart-month", 6, 22, 18, 7),
        at("column-table", 6, 29, 18, 7, table("Labs & Results", ["Date", "What", "Result"], [0.9, 1.6, 1.3])),
      ],
      belowRight: [at("monthly-review", 0, 17, 12, 19), at("labeled-box", 12, 17, 12, 19, box("Next Month"))],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-glp1",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["meal-planner", 12],
        ["grocery-list", 10, { heading: "High-Protein Groceries" }],
        ["labeled-box", 11, box("Wins This Week")],
      ],
      // Protein, water and fibre a day at a time, under every day, both
      // pages in the same rows.
      belowLeft: [
        at("habit-tracker", 6, BELOW_ROW, 18, 12, { heading: "Side Effects, 0 to 3", habits: ["Nausea", "Fatigue", "Reflux", "Appetite"] }),
        at("icon-strip", 6, 33, 18, 1, { heading: "Protein", icon: "circle", count: 4 }),
        at("water-week", 6, 34, 18, 1),
        at("icon-strip", 6, LAST, 18, 1, { heading: "Fibre", icon: "leaf", count: 3 }),
      ],
      belowRight: [
        at("column-table", 0, BELOW_ROW, 12, 12, table("Injection", ["Day", "Dose", "Site", "Missed"], [1, 0.9, 1.2, 0.9])),
        at("labeled-box", 12, BELOW_ROW, 12, 12, box("For My Doctor")),
        at("icon-strip", 0, 33, 24, 1, { heading: "Protein", icon: "circle", count: 4 }),
        at("water-week", 0, 34, 24, 1),
        at("icon-strip", 0, LAST, 24, 1, { heading: "Fibre", icon: "leaf", count: 3 }),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ a training block
  // Training for a race or a stronger lift: the goal and the plan week by
  // week at the front, paces and personal bests, gear and a race-day list;
  // the week's sessions, runs, strength, rest and sleep; the month's lifts,
  // mileage and measurements.
  {
    key: "pages-training-block",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 12, 14, prompts("The Goal", ["Race or goal", "Date", "Target", "Why it matters"], 2, { promptLines: [1, 1, 1, 3] })),
          at("column-table", 12, 0, 12, 14, table("Paces & Zones", ["Zone", "Pace or HR", "Feels like"], [0.8, 1.2, 1.4])),
          at("column-table", 0, 14, 24, 22, table("Plan by Week", ["Week", "Build or deload", "Key session", "Total"], [0.7, 1.4, 2, 0.8])),
        ],
        [
          at("column-table", 0, 0, 12, 14, table("Personal Bests", ["Event or lift", "Best", "Date"], [1.6, 1, 0.9])),
          at("column-table", 12, 0, 12, 14, table("Gear", ["Item", "Since", "Miles or notes"], [1.4, 0.8, 1.3])),
          at("stretch-routine", 0, 14, 12, 12),
          at("labeled-box", 12, 14, 12, 12, box("Niggles & Recovery")),
          at("measurements", 0, 26, 12, 10),
          at("todo-checklist", 12, 26, 12, 10, steps("Race Day", ["Bib and pins", "Shoes and socks", "Fuel and water", "Watch charged", "Warm layer"])),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-training-block",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("This Month's Focus")],
        ["labeled-box", 11, box("Races & Tests")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("progressive-overload", 6, 17, 18, 19)],
      belowRight: [
        at("column-table", 0, 17, 12, 10, table("Weekly Volume", ["Week", "Planned", "Done"], [0.8, 1, 1])),
        at("measurements", 12, 17, 12, 10),
        at("monthly-review", 0, 27, 24, 9),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-training-block",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      sidebar: [
        ["weekly-workout-plan", 12],
        ["energy-chart", 8],
        ["labeled-box", 13, box("How My Body Feels")],
      ],
      belowLeft: [at("run-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("workout-log", 0, BELOW_ROW, 12, 15, { heading: "Strength", columns: ["Exercise", "Sets", "Reps", "Weight", "RPE"], weights: [2.6, 0.7, 0.7, 1, 0.7] }), at("rest-day-marker", 12, BELOW_ROW, 12, 6), at("sleep-log", 12, 27, 12, 9)],
    },
    ...UNWRITTEN,
  },

  // ======================================================== PHILOSOPHY
  // ------------------------------------------------ Stoic practice
  // The Stoic day: a morning to prepare for what will test you, an evening
  // to review it (Seneca's nightly self-examination), what is and isn't in
  // your control; a weekly theme to practise; and the four virtues, the view
  // from above and a commonplace book of the lines you choose to keep.
  {
    key: "pages-stoic-practice",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 16, prompts("The Four Virtues", ["Wisdom: where I need it", "Courage: what I'm avoiding", "Justice: what I owe others", "Temperance: what I overdo"])),
          at("dichotomy-of-control", 0, 16, 12, 10),
          at("memento-mori", 12, 16, 12, 10),
          at("negative-visualisation", 0, 26, 12, 10),
          at("commonplace-book", 12, 26, 12, 10),
        ],
        [
          at("column-table", 0, 0, 24, 20, table("Weekly Themes", ["Week", "Theme", "How I'll practise it"], [0.7, 1.4, 2.4])),
          at("prompted-lines", 0, 20, 14, 16, prompts("The View From Above", ["What's troubling me", "How it looks from far away", "What actually matters here"])),
          at("labeled-box", 14, 20, 10, 16, box("My Rules for Living")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-stoic-practice",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: true,
      sidebar: [
        ["prompted-lines", 12, prompts("This Week's Theme", ["Theme", "How I'll practise it", "Where it will be hard"])],
        ["weekly-priorities", 7],
        ["commonplace-book", 14],
      ],
      belowLeft: [at("negative-visualisation", 6, BELOW_ROW, 18, 8), at("labeled-box", 6, 29, 18, 7, box("Where I Fell Short"))],
      belowRight: [at("weekly-reflection", 0, BELOW_ROW, 12, 15, { heading: "The Week Reviewed" }), at("dichotomy-of-control", 12, BELOW_ROW, 12, 15)],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-stoic-practice",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: true,
      firstDay: 0,
      hours: { startTime: "06:00", endTime: "22:00", intervalMinutes: 60, compactHourRows: true },
      hoursRows: 10,
      sidebar: [
        ["stoic-morning-page", 13],
        ["daily-big-three", 4],
        ["dichotomy-of-control", 10],
        ["labeled-box", 9, box("Reading")],
      ],
      below: [at("stoic-evening-review", 6, 11, 18, 13), at("commonplace-book", 6, 24, 18, 12)],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ mindful practice
  // A Buddhist and Taoist practice of attention: why you sit, what you hope
  // to soften and grow, a passage read slowly; a day of loving-kindness,
  // three good things and the day's verse, and the evening noticed; the
  // month's minutes on the cushion and what was let go.
  {
    key: "pages-mindful",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 14, prompts("Intentions", ["Why I practise", "What I hope to soften", "What I hope to grow"])),
          at("column-table", 0, 14, 12, 12, table("Practice Plan", ["Practice", "When", "How long"], [1.4, 1, 0.9])),
          at("labeled-box", 12, 14, 12, 12, box("Commitments")),
          at("metta-practice", 0, 26, 12, 10),
          at("wu-wei-reflection", 12, 26, 12, 10),
        ],
        [
          at("prompted-lines", 0, 0, 24, 18, prompts("Reading Slowly", ["Passage", "What it says", "What it asks of me"], 3, { promptLines: [2, 3, 4] })),
          at("labeled-box", 0, 18, 12, 18, box("Questions to Sit With")),
          at("labeled-box", 12, 18, 12, 18, box("Noticed This Year")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-mindful",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: true,
      inside: "none",
      sidebar: [
        ["labeled-box", 12, box("This Month's Intention")],
        ["lessons-learned", 11, { heading: "What I Noticed" }],
        ["labeled-box", 11, box("Grateful For")],
      ],
      belowLeft: [at("meditation-minutes", 6, 17, 18, 10), at("mood-chart-month", 6, 27, 18, 9)],
      belowRight: [at("monthly-review", 0, 17, 12, 19, { heading: "Month Reflection" }), at("labeled-box", 12, 17, 12, 19, box("Letting Go"))],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-mindful",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: true,
      firstDay: 0,
      // No hours: an open, dotted day.
      hours: { intervalMode: "off", offModeRule: "dotted" },
      hoursRows: 22,
      sidebar: [
        ["metta-practice", 8],
        ["gratitude-three", 8],
        ["tao-daily-verse", 10],
        ["labeled-box", 10, box("Noticing")],
      ],
      below: [at("rating-strip", 6, 23, 18, 6, { heading: "Today", items: ["Calm", "Kindness", "Presence"] }), at("labeled-box", 6, 29, 18, 7, box("Evening"))],
    },
    ...UNWRITTEN,
  },

  // ======================================================== FAITH
  // ------------------------------------------------ Bible study and prayer
  // The research's sixth niche (strong on Etsy and Amazon both): a reading
  // plan through the year, prayer requests and answered prayers, sermon
  // notes each week, a SOAP study and verse mapping; the month's theme and
  // small group notes.
  {
    key: "pages-bible-study",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("progress-meter", 0, 0, 24, 10, { heading: "Through the Bible", total: 365, milestoneEvery: 30, numbers: "milestones" }),
          at("column-table", 0, 10, 24, 26, table("Reading Plan", ["Week", "Old Testament", "New Testament", "Psalms"], [0.6, 1.4, 1.4, 1])),
        ],
        [
          at("column-table", 0, 0, 24, 20, table("Prayer Requests", ["Date", "For", "Request", "Answered"], [0.8, 1.2, 2.4, 1])),
          at("labeled-box", 0, 20, 12, 16, box("Verses to Memorise")),
          at("labeled-box", 12, 20, 12, 16, box("Answered Prayers")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-bible-study",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("This Month's Theme")],
        ["labeled-box", 11, box("Serving & Giving")],
        ["labeled-box", 11, box("Answered Prayers")],
      ],
      belowLeft: [at("prompted-lines", 6, 17, 18, 19, prompts("The Month in Scripture", ["What I read", "What God is teaching me", "How I'll live it"], 4))],
      belowRight: [at("sermon-notes", 0, 17, 12, 19, { heading: "Small Group Notes" }), at("monthly-review", 12, 17, 12, 19)],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-bible-study",
    layout: {
      kind: "week",
      font: "serif",
      weekStartsMonday: false,
      sidebar: [
        ["prayer-list", 12],
        ["labeled-box", 10, box("Memory Verse")],
        ["gratitude-three", 11],
      ],
      belowLeft: [at("sermon-notes", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("soap-study", 0, BELOW_ROW, 12, 15), at("verse-mapping", 12, BELOW_ROW, 12, 15)],
    },
    ...UNWRITTEN,
  },

  // ======================================================== RECOVERY
  // ------------------------------------------------ one day at a time
  // Early recovery (the research's twelfth niche): your reasons and the
  // people to call at the front, with a plan for when a craving comes; a day
  // that starts with "just for today" and ends with an honest inventory, a
  // HALT check between; the month's days counted up, never reset.
  {
    key: "pages-one-day",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 16, prompts("My Reasons", ["Why I stopped", "What I'm protecting", "What I'm building"], 3)),
          at("column-table", 0, 16, 12, 20, table("People I Can Call", ["Name", "Phone", "Best time"], [1.2, 1.3, 0.9])),
          at("labeled-box", 12, 16, 12, 20, box("When a Craving Comes")),
        ],
        [
          at("progress-meter", 0, 0, 24, 8, { heading: "My First 90 Days", total: 90, milestoneEvery: 30, numbers: "milestones" }),
          at("meeting-log", 0, 8, 12, 28),
          at("sponsor-contact-log", 12, 8, 12, 14, { heading: "Support Contacts" }),
          at("labeled-box", 12, 22, 12, 14, box("Milestones")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-one-day",
    layout: {
      kind: "month",
      font: "serif",
      weekStartsMonday: false,
      inside: "none",
      sidebar: [
        ["labeled-box", 12, box("This Month")],
        ["recovery-gratitude-list", 11],
        ["labeled-box", 11, box("Milestones")],
      ],
      belowLeft: [at("star-count", 6, 17, 18, 5, { heading: "Days, Counted Up" }), at("mood-chart-month", 6, 22, 18, 14)],
      belowRight: [at("meeting-log", 0, 17, 12, 19), at("monthly-review", 12, 17, 12, 19)],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-one-day",
    layout: {
      kind: "day",
      font: "serif",
      weekStartsMonday: false,
      firstDay: 1,
      hours: { startTime: "07:00", endTime: "22:00" },
      hoursRows: 17,
      sidebar: [
        ["prompted-lines", 10, prompts("Just for Today", ["Today I will", "Today I won't", "Who I'll reach out to"])],
        ["halt-check-in", 8],
        ["recovery-gratitude-list", 8],
        ["labeled-box", 10, box("Craving Notes")],
      ],
      below: [
        at("rating-strip", 6, 18, 18, 6, { heading: "Cravings", items: ["Morning", "Afternoon", "Evening"], scaleMin: 0, scaleMax: 5 }),
        at("step-ten-inventory", 6, 24, 18, 12),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== HEALTH & WORK
  // ------------------------------------------------ chronic illness flare log
  // The research's eighth niche: a one-minute daily check-in (energy and
  // pain, the symptoms that matter, spoons), every dose taken or skipped, and
  // a month that rolls the days up into patterns to bring to appointments.
  // The care team, medicines and a flare plan at the front.
  {
    key: "pages-flare-log",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: true,
      pages: [
        [
          at("column-table", 0, 0, 24, 12, table("Care Team", ["Name", "Role", "Phone"], [1.4, 1.2, 1.2])),
          at("column-table", 0, 12, 24, 14, table("Medicines", ["Medicine", "Dose", "When", "For"], [1.6, 0.8, 1, 1.4])),
          at("prompted-lines", 0, 26, 24, 10, prompts("My Flare Plan", ["Early signs", "What helps", "Who to tell", "When to call the doctor"], 1)),
        ],
        [
          at("column-table", 0, 0, 24, 16, table("Questions for Appointments", ["Date", "Question", "Answer"], [0.8, 2.2, 2])),
          at("column-table", 0, 16, 24, 12, table("Flares", ["Started", "Ended", "Trigger?", "What helped"], [0.9, 0.9, 1.2, 2])),
          at("labeled-box", 0, 28, 24, 8, box("Notes")),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "month-flare-log",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 12, box("Good Days")],
        ["labeled-box", 11, box("Hard Days")],
        ["labeled-box", 11, box("Questions to Ask")],
      ],
      belowLeft: [at("mood-chart-month", 6, 17, 18, 9), at("period-tracker", 6, 26, 18, 10)],
      belowRight: [
        at("column-table", 0, 17, 24, 10, table("Patterns", ["Week", "Spoons, on average", "Worst symptom", "Notes"], [0.7, 1.2, 1.3, 1.8])),
        at("monthly-review", 0, 27, 12, 9),
        at("labeled-box", 12, 27, 12, 9, box("Next Month")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "day-flare-log",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 0,
      hours: { startTime: "07:00", endTime: "22:00" },
      hoursRows: 17,
      // The 1 to 10 scale under the hours, at full width: in the sidebar its
      // numbers came out at 2.3pt (2026-10-21).
      sidebar: [
        ["symptom-severity", 9],
        ["labeled-box", 9, box("What Helped")],
        ["labeled-box", 9, box("Questions for My Doctor")],
        ["labeled-box", 9, box("Notes")],
      ],
      below: [
        at("spoon-count", 6, 18, 18, 1, { groups: 1 }),
        at("energy-pain-scale", 6, 19, 18, 6),
        at("medication-doses", 6, 25, 18, 5),
        at("food-diary", 6, 30, 18, 6),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ night-shift nurse
  // The research's eleventh niche, now that the hours run past midnight: a
  // week of 7 PM to 7 AM, sleep logged and meals prepared around it, a
  // self-care check, water under every night; licences, CEUs, PTO and
  // overtime at the front. Shifts themselves are calendar events.
  {
    key: "pages-night-nurse",
    layout: {
      kind: "pages",
      font: "sans",
      weekStartsMonday: false,
      pages: [
        [
          at("column-table", 0, 0, 24, 14, table("Licences & CEUs", ["Course or licence", "Hours", "Date", "Renews"], [2, 0.7, 0.9, 0.9])),
          at("pto-meter", 0, 14, 12, 8),
          at("labeled-box", 12, 14, 12, 8, box("Unit Numbers")),
          at("todo-checklist", 0, 22, 12, 14, steps("Shift Bag", ["Badge", "Stethoscope", "Pens and tape", "Snacks and water", "Phone charger", "Spare scrubs"])),
          at("labeled-box", 12, 22, 12, 14, box("Sleep Plan")),
        ],
        [
          at("column-table", 0, 0, 12, 18, table("Overtime & Pay", ["Date", "Hours", "Rate", "Total"], [1, 0.8, 0.8, 0.9])),
          at("labeled-box", 12, 0, 12, 18, box("Good Shifts")),
          at("meal-planner", 0, 18, 24, 18, { heading: "Meal Prep" }),
        ],
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-night-nurse",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: false,
      // Past midnight, marked +1 (hourlyGridCore, 2026-10-20).
      hours: { startTime: "19:00", endTime: "07:00", intervalMinutes: 30 },
      // Twelve hours draw 14 rows (2026-10-21: the template's 20 left an
      // inch and a half blank); the rest is before and after the shift.
      hoursRows: 14,
      sidebar: [
        ["sleep-log", 12],
        ["meal-planner", 10],
        ["self-care-checklist", 11],
      ],
      belowLeft: [at("labeled-box", 6, 15, 18, 10, box("Before Shift")), at("labeled-box", 6, 25, 18, 10, box("After Shift: Winding Down")), at("water-week", 6, LAST, 18, 1)],
      belowRight: [at("todo-checklist", 0, 15, 24, 12, { dayCount: 4 }), at("labeled-box", 0, 27, 24, 8, box("Notes")), at("water-week", 0, LAST, 24, 1)],
    },
    ...UNWRITTEN,
  },
];

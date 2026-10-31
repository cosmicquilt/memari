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
          // Six wide: a checklist draws a column a day from its width, so at
          // twelve it printed every step twice (2026-10-29 audit).
          at("todo-checklist", 0, 14, 6, 22, steps("Shutdown Ritual", ["Inbox captured", "Calendar checked", "Loose ends noted", "Tomorrow planned", "Done for the day"])),
          at("labeled-box", 6, 14, 18, 22, box("Ideas for Later")),
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
        // Four rows print exactly three priorities (seven printed six); the
        // rest go to the done list.
        ["weekly-priorities", 4],
        ["done-list", 17],
      ],
      // Shallow work in a column under each day, batched rather than
      // scattered; the deep work blocks to colour in along the bottom.
      belowLeft: [at("todo-checklist", 6, 19, 18, 11, { heading: "Shallow Work", dayCount: 3 }), at("labeled-box", 6, 30, 18, 5, box("Wins")), at("focus-blocks", 6, LAST, 18, 1)],
      // The look-back asks what the blocks did: Wins and Done! already say
      // what went well, and three questions did not fit five rows.
      belowRight: [
        at("todo-checklist", 0, 19, 24, 11, { heading: "Shallow Work", dayCount: 4 }),
        at("weekly-reflection", 0, 30, 24, 5, { prompts: ["Deep hours this week", "What broke my blocks?"], linesPerPrompt: 1 }),
        at("focus-blocks", 0, LAST, 24, 1),
      ],
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
        // The same five steps as the front's Shutdown Ritual.
        ["todo-checklist", 8, steps("Shutdown", ["Inbox captured", "Calendar checked", "Loose ends noted", "Tomorrow planned", "Done for the day"])],
        ["labeled-box", 10, box("Where I Left Off")],
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
        ["labeled-box", 12, box("Areas to Look At")],
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
      // The weekly review is steps to tick, not questions; six wide, since a
      // checklist draws a column a day from its width and at twelve printed
      // every step twice.
      belowRight: [
        at("labeled-box", 0, BELOW_ROW, 18, 15, box("@Home")),
        at("todo-checklist", 18, BELOW_ROW, 6, 15, steps("Weekly Review", ["Inboxes emptied", "Calendar checked", "Every project moving", "Waiting-ons chased", "Someday looked at"])),
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
          // A box a week: the method's rhythm is the week, not the day.
          at("progress-meter", 12, 25, 12, 11, { heading: "12 Weeks", total: 12, milestoneEvery: 6, numbers: "every" }),
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
      // The goals' actions are the week's priorities: no second list to
      // compete with them, and the tracker's totals give the score's counts.
      sidebar: [
        ["prompted-lines", 19, prompts("This Week's Actions", ["Goal 1", "Goal 2", "Goal 3"], 3)],
        ["done-list", 14],
      ],
      belowLeft: [at("todo-checklist", 6, BELOW_ROW, 18, 15, { dayCount: 3, heading: "Other Tasks" })],
      belowRight: [
        at("habit-tracker", 0, BELOW_ROW, 12, 15, { heading: "Actions Done", habits: ["", "", "", "", "", ""], totalColumn: true }),
        at("prompted-lines", 12, BELOW_ROW, 12, 15, prompts("Weekly Score", ["Score: done over planned", "One change for next week"], 3)),
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
        // Every graded item from five syllabuses (40 to 70 of them) needs the
        // whole page, and its score goes on the same row rather than in a
        // second Grades table asking for the same items again. Office hours
        // are calendar events; a classmate to ask for missed notes is not.
        // One exam countdown fit one exam, and this page prints once a
        // semester: a table holds every exam's date (2026-10-29 audit).
        [at("column-table", 0, 0, 24, 36, table("Syllabus Deadlines", ["Date", "Class", "What", "Weight", "Score"], [0.9, 1.1, 2.4, 0.8, 0.8]))],
        [
          at("column-table", 0, 0, 24, 10, table("My Classes", ["Class", "Professor", "Email or office", "Classmate", "Goal grade"], [1.4, 1.2, 1.4, 1.2, 0.8])),
          at("column-table", 0, 10, 12, 12, table("Exam Dates", ["Date", "Class", "Covers"], [0.9, 1.1, 2])),
          at("labeled-box", 12, 10, 12, 12, box("Semester Goals")),
          at("prompted-lines", 0, 22, 24, 14, prompts("Break It Down", ["Big assignment", "Due", "Steps, back from the due date"], 2, { promptLines: [1, 1, 8] })),
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
      // The deadlines once, in the Assignments table (exam dates are the
      // calendar's); the month's big assignments broken back into steps.
      sidebar: [
        ["column-table", 12, table("Grade Check", ["Class", "Grade now"], [1.6, 1])],
        ["labeled-box", 11, box("Study For")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("assignment-tracker", 6, 17, 18, 19)],
      belowRight: [
        at("prompted-lines", 0, 17, 12, 10, prompts("Break It Down", ["Big assignment and due date", "Steps, back from the due date"], 1, { promptLines: [1, 5] })),
        at("prompted-lines", 12, 17, 12, 10, prompts("Break It Down", ["Big assignment and due date", "Steps, back from the due date"], 1, { promptLines: [1, 5] })),
        at("monthly-review", 0, 27, 12, 9, { linesPerPrompt: 1 }),
        at("labeled-box", 12, 27, 12, 9, box("Next Month")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-semester",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      // Three priorities, as the planner says: four rows print 1 to 3.
      sidebar: [
        ["weekly-priorities", 4],
        ["brain-dump", 11],
        ["labeled-box", 6, box("Ask in Class")],
        ["done-list", 12],
      ],
      // A to-do list under every day, both pages in the same rows.
      belowLeft: [
        at("todo-checklist", 6, BELOW_ROW, 18, 6, { dayCount: 3 }),
        at("assignment-tracker", 6, 27, 18, 8),
        at("focus-blocks", 6, LAST, 18, 1),
      ],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 6, { dayCount: 4 }),
        at("habit-tracker", 0, 27, 24, 8, { heading: "Every Day", habits: ["Meds", "Water", "Meals", "Bed on time"] }),
        at("focus-blocks", 0, LAST, 24, 1),
      ],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ small online shop
  // A maker's or seller's year: what each product costs and earns, who
  // supplies it, launches, ideas for the content that sells it; the month's
  // sales, costs and best sellers; the week's orders, things to make and
  // messages to answer.
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
          // A bank of ideas: the week has its own content plan by day.
          at("column-table", 0, 0, 24, 14, table("Content Ideas", ["Idea", "Where to post", "Used"], [2.6, 1.2, 0.6])),
          at("subscription-audit", 0, 14, 12, 12, { heading: "Tools & Fees" }),
          at("labeled-box", 12, 14, 12, 12, box("Product Ideas")),
          // Per cent of the owner's own target: "$0" to "This year" read as
          // a goal of $100.
          at("savings-goal", 0, 26, 12, 10, { heading: "Sales Goal", startLabel: "0%", endLabel: "Goal" }),
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
      // Launch dates are the front's Launch Plan and the calendar's; the
      // month holds the work to get them ready.
      sidebar: [
        ["labeled-box", 12, box("Launch Prep")],
        ["labeled-box", 11, box("Restock")],
        ["labeled-box", 11, box("Wins")],
      ],
      // A row per channel a week: a shop's orders are too many to log one
      // by one, and "From" was a freelancer's column.
      belowLeft: [at("income-log", 6, 17, 18, 19, { heading: "Sales", columns: ["Week", "Where sold", "Orders", "Amount", "Set aside"], weights: [0.7, 1.4, 0.8, 1, 1.1] })],
      belowRight: [
        at("budget", 0, 17, 12, 19, { heading: "Costs" }),
        at("labeled-box", 12, 17, 12, 10, box("Best Sellers")),
        at("monthly-review", 12, 27, 12, 9, { linesPerPrompt: 1 }),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-small-shop",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      // Three priorities (four rows print 1 to 3); shipping is the Orders
      // table's Ship by and Sent, so the second box is for messages.
      sidebar: [
        ["weekly-priorities", 4],
        ["labeled-box", 15, box("To Make")],
        ["labeled-box", 14, box("To Reply")],
      ],
      belowLeft: [at("order-tracker", 6, BELOW_ROW, 18, 15)],
      belowRight: [at("content-plan", 0, BELOW_ROW, 12, 15), at("spending-log", 12, BELOW_ROW, 12, 15)],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ teacher, the school year
  // A secondary teacher with several classes (the research's multi-prep
  // teacher): the classes and the year at the front, starting in August; the
  // month's preparation, units and parent contacts; the week's lessons by
  // class and day, grading, copies, make-up work and students to check on.
  {
    key: "pages-teacher-year",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          at("column-table", 0, 0, 16, 12, table("My Classes", ["Period", "Class", "Room", "Students"], [0.8, 1.8, 0.8, 0.9])),
          // Bell times are the periods, and periods are calendar events.
          at("labeled-box", 16, 0, 8, 12, box("Sub Plans: Where They Are")),
          // Two lines a month: at three the sixth month did not fit, and
          // January and July never printed.
          at("future-log-months", 0, 12, 24, 24, { heading: "The Year Ahead", prompts: ["August", "September", "October", "November", "December", "January"], linesPerPrompt: 2 }),
        ],
        [
          // Dated, the second log starts six months after the book does, so
          // the two never print the same months.
          at("future-log-months", 0, 0, 24, 24, { heading: "The Year Ahead", prompts: ["February", "March", "April", "May", "June", "July"], linesPerPrompt: 2, monthOffset: 6 }),
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
      // Dates are the calendar's, and duties a rota of times (calendar
      // events too): the sidebar holds what to get ready and where each
      // class is in its units.
      sidebar: [
        ["labeled-box", 12, box("To Prepare")],
        ["labeled-box", 11, box("Units This Month")],
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
        ["weekly-priorities", 4],
        ["labeled-box", 16, box("Copies & Prep")],
        ["labeled-box", 13, box("Students to Check On")],
      ],
      // A plan book's grid, each class by the days of the week.
      belowLeft: [
        at("lesson-planner", 6, 15, 18, 15, table("Lesson Plan", ["Class", "Mon", "Tue", "Wed", "Thu", "Fri"], [1.2, 1, 1, 1, 1, 1])),
        at("labeled-box", 6, 30, 18, 6, box("Make-Up Work")),
      ],
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
          at("prompted-lines", 12, 0, 12, 12, prompts("Who I'm Becoming", ["I'm the kind of person who", "So from now on I will"], 3)),
          at("column-table", 0, 12, 24, 12, table("My Habits", ["Habit", "Why", "Two-minute version"], [1.3, 1.6, 1.6])),
          at("habit-stacking", 0, 24, 24, 12),
        ],
        [
          at("column-table", 0, 0, 24, 14, table("Make It Easy", ["Habit", "Cue", "Easier by", "Reward"], [1.2, 1, 1.4, 1])),
          // A count, not a chain of dated days: ten, twenty and thirty marked.
          at("thirty-day-challenge", 0, 14, 12, 10, { heading: "30 Times, Any Days", numbers: "milestones" }),
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
      // The tracker's rows name the habits; the sidebar holds the version
      // for a bad day.
      sidebar: [
        ["labeled-box", 12, box("Two-Minute Versions")],
        ["lessons-learned", 11, { heading: "What Helped" }],
        ["labeled-box", 11, box("Wins")],
      ],
      // Days done each week, not a chain: a total per habit per week.
      belowLeft: [at("habit-tracker", 6, 17, 18, 19, { heading: "Habits by Week", habits: ["", "", "", "", ""], columns: ["Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5"], totalColumn: true })],
      // No stars by week beside the tracker's totals, and the look ahead is
      // its own box, not the review's third question.
      belowRight: [
        at("monthly-review", 0, 17, 12, 19, { prompts: ["What worked?", "What got in the way?"] }),
        at("labeled-box", 12, 17, 12, 19, box("Next Month I'll Try")),
      ],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-habits",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      // The reset looks ahead, with the plan for a missed day written before
      // it comes; the one look back is the reflection.
      sidebar: [
        ["prompted-lines", 12, prompts("Sunday Reset", ["Where each habit fits", "One thing to make easier", "If I miss a day"])],
        // Three priorities, not six; the rows go to the done list.
        ["weekly-priorities", 4],
        ["done-list", 17],
      ],
      belowLeft: [at("habit-tracker", 6, BELOW_ROW, 18, 15, { heading: "Habits", habits: ["", "", "", "", ""], totalColumn: true })],
      belowRight: [at("weekly-reflection", 0, BELOW_ROW, 24, 15, { prompts: ["What went well?", "What got in the way?", "What I'll change"] })],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ reading journal
  // Books read, a reading goal, a to-be-read list with who recommended each,
  // a guilt-free did-not-finish list, and whole review pages; a month for
  // what's being read, a book review, the book club and the month's wrap-up.
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
      // A review a month: a year's meter printed fresh every month told a
      // different story from the front's reading goal. No "line worth
      // keeping" here, since the sidebar's A Line I Loved asks it.
      belowLeft: [at("prompted-lines", 6, 17, 18, 19, prompts("Book Review", ["Title and author", "Started, finished", "Rating", "What stayed with me"], 2, { promptLines: [1, 1, 1, 11] }))],
      belowRight: [
        // The meeting's date and place are a calendar event.
        at("prompted-lines", 0, 17, 12, 19, prompts("Book Club", ["Book", "Questions to bring", "What others said"], 2, { promptLines: [1, 6, 6] })),
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
          // One set of numbers, with the dose it started on.
          at("prompted-lines", 0, 0, 12, 12, prompts("Starting Point", ["Date started", "Starting dose", "Weight", "Waist"], 1)),
          at("prompted-lines", 12, 0, 12, 12, prompts("Why I'm Doing This", ["What I want to feel", "What I want to be able to do"], 3)),
          at("column-table", 0, 12, 24, 14, table("Injection Sites", ["Date", "Site", "Dose", "Notes"], [1, 1.4, 0.8, 1.6])),
          at("labeled-box", 0, 26, 12, 10, box("Protein Foods I Like")),
          // What a circle in the week's strips is worth, set with the care
          // team. Non-scale victories are the month's.
          at("prompted-lines", 12, 26, 12, 10, prompts("My Daily Targets", ["Protein", "Water", "Fibre"], 1)),
        ],
        [
          at("column-table", 0, 0, 24, 12, table("Dose Changes", ["Date", "Medication", "New dose", "How it went"], [0.9, 1.3, 0.9, 1.9])),
          at("column-table", 0, 12, 24, 14, table("Questions for My Doctor", ["Date", "Question", "Answer"], [0.8, 2.2, 2])),
          at("labeled-box", 0, 26, 12, 10, box("What Helps on Hard Days")),
          at("labeled-box", 12, 26, 12, 10, box("Foods That Don't Sit Well")),
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
      // The review's third question already looks at next month.
      belowRight: [at("monthly-review", 0, 17, 12, 19), at("labeled-box", 12, 17, 12, 19, box("Meals That Worked"))],
    },
    ...UNWRITTEN,
  },
  {
    key: "week-glp1",
    layout: {
      kind: "week",
      font: "sans",
      weekStartsMonday: true,
      // Side effects scored a digit a day (the compact squares hold one),
      // and the week's one dose with its site; the injection day itself is
      // a weekly calendar event.
      sidebar: [
        ["habit-tracker", 12, { heading: "Side Effects, 0 to 3", habits: ["Nausea", "Constipation", "Reflux", "Fatigue"] }],
        ["grocery-list", 10, { heading: "High-Protein Groceries" }],
        ["prompted-lines", 11, prompts("This Week's Dose", ["Dose", "Site", "How I felt after"], 2)],
      ],
      // Meals written under each day (a meal planner's cells hold only a
      // tick); protein, water and fibre a day at a time, under every day,
      // both pages in the same rows.
      belowLeft: [
        at("todo-checklist", 6, BELOW_ROW, 18, 12, { heading: "Meals", dayCount: 3 }),
        at("icon-strip", 6, 33, 18, 1, { heading: "Protein", icon: "circle", count: 4 }),
        at("water-week", 6, 34, 18, 1),
        at("icon-strip", 6, LAST, 18, 1, { heading: "Fibre", icon: "leaf", count: 3 }),
      ],
      belowRight: [
        at("todo-checklist", 0, BELOW_ROW, 24, 12, { heading: "Meals", dayCount: 4 }),
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
          // The two checklists six wide: a checklist draws a column a day
          // from its width, so at twelve each printed its list twice.
          at("stretch-routine", 0, 14, 6, 12),
          at("labeled-box", 6, 14, 18, 12, box("Niggles & Recovery")),
          at("todo-checklist", 0, 26, 6, 10, steps("Race Day", ["Bib and pins", "Shoes and socks", "Fuel and water", "Watch charged", "Warm layer"])),
          // The baseline, named apart from the month's Measurements.
          at("measurements", 6, 26, 18, 10, { heading: "Starting Point" }),
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
      // Races are calendar events: the sidebar keeps how they went.
      sidebar: [
        ["labeled-box", 12, box("This Month's Focus")],
        ["labeled-box", 11, box("Results")],
        ["labeled-box", 11, box("Wins")],
      ],
      belowLeft: [at("progressive-overload", 6, 17, 18, 19)],
      belowRight: [
        at("column-table", 0, 17, 12, 10, table("Weekly Volume", ["Week", "Planned", "Done"], [0.8, 1, 1])),
        at("measurements", 12, 17, 12, 10),
        // A line each, so all three questions fit nine rows.
        at("monthly-review", 0, 27, 24, 9, { linesPerPrompt: 1 }),
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
      // Sessions for a runner or a lifter, rest counted once (the Rest
      // tracker), sleep in its log, and the week's phase from the front's
      // Plan by Week.
      sidebar: [
        ["weekly-workout-plan", 12, { habits: ["Run", "Strength", "Cross-train", "Mobility"] }],
        ["energy-chart", 8],
        ["prompted-lines", 7, prompts("This Week", ["Build or deload", "Key session"], 1)],
        ["labeled-box", 6, box("How My Body Feels")],
      ],
      belowLeft: [at("run-log", 6, BELOW_ROW, 18, 15)],
      belowRight: [
        at("workout-log", 0, BELOW_ROW, 12, 15, { heading: "Strength", columns: ["Exercise", "Sets", "Reps", "Weight", "RPE"], weights: [2.6, 0.7, 0.7, 1, 0.7] }),
        at("rest-day-marker", 12, BELOW_ROW, 12, 6, { habits: ["Rest day", "Active rest"] }),
        at("sleep-log", 12, 27, 12, 9),
      ],
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
        // Three priorities, not six; the rows go to the commonplace book.
        ["weekly-priorities", 4],
        ["commonplace-book", 17],
      ],
      // Two lines a question, so the response prints under the loss; the
      // review returns to the week's theme (Where I Fell Short already
      // asks what did not go well).
      belowLeft: [at("negative-visualisation", 6, BELOW_ROW, 18, 8, { linesPerPrompt: 2 }), at("labeled-box", 6, 29, 18, 7, box("Where I Fell Short"))],
      belowRight: [
        at("weekly-reflection", 0, BELOW_ROW, 12, 15, { heading: "The Week Reviewed", prompts: ["Where I kept the theme", "Next week's theme"] }),
        at("dichotomy-of-control", 12, BELOW_ROW, 12, 15),
      ],
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
      // Shorter questions: the preset's shrank to 5.5pt six columns wide.
      // No Reading box beside the commonplace book, which keeps the day's
      // reading already; its rows go to the morning.
      sidebar: [
        ["stoic-morning-page", 22, { prompts: ["In my control today", "Obstacles to expect", "Virtue I'll need"] }],
        ["daily-big-three", 4],
        ["dichotomy-of-control", 10],
      ],
      below: [at("stoic-evening-review", 6, 11, 18, 13), at("commonplace-book", 6, 24, 18, 12)],
    },
    ...UNWRITTEN,
  },

  // ------------------------------------------------ mindful practice
  // A Buddhist and Taoist practice of attention: why you sit, what you hope
  // to soften and grow, a passage read slowly; a day of loving-kindness,
  // three good things and the day's passage, and the evening noticed; the
  // month's sittings counted and what was let go.
  {
    key: "pages-mindful",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: true,
      pages: [
        [
          at("prompted-lines", 0, 0, 24, 14, prompts("Intentions", ["Why I practise", "What I hope to soften", "What I hope to grow"])),
          // Eleven rows for the metta: at ten, All beings did not fit.
          at("column-table", 0, 14, 12, 11, table("Practice Plan", ["Practice", "When", "How long"], [1.4, 1, 0.9])),
          at("labeled-box", 12, 14, 12, 11, box("Commitments")),
          at("metta-practice", 0, 25, 12, 11),
          at("wu-wei-reflection", 12, 25, 12, 11),
        ],
        [
          at("prompted-lines", 0, 0, 24, 18, prompts("Reading Slowly", ["Passage", "What it says", "What it asks of me"], 3, { promptLines: [2, 3, 4] })),
          at("labeled-box", 0, 18, 12, 18, box("Questions to Sit With")),
          // Front pages print once a book, and a book is often a quarter.
          at("labeled-box", 12, 18, 12, 18, box("Noticed")),
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
        ["labeled-box", 12, box("Intention")],
        ["lessons-learned", 11, { heading: "What I Noticed" }],
        ["labeled-box", 11, box("Grateful For")],
      ],
      // Sittings counted, not dated: 31 numbered boxes read as the days,
      // a gap as a broken chain, and February printed 31 too.
      belowLeft: [at("meditation-minutes", 6, 17, 18, 10, { heading: "Sittings", numbers: "milestones", milestoneEvery: 10 }), at("mood-chart-month", 6, 27, 18, 9)],
      belowRight: [
        at("monthly-review", 0, 17, 12, 19, { heading: "Month Reflection", prompts: ["Where practice was steady", "What softened", "What I'm carrying forward"] }),
        at("labeled-box", 12, 17, 12, 19, box("Letting Go")),
      ],
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
      // Eleven rows print all five metta stages, five rows the three good
      // things; the passage is headed for either tradition.
      sidebar: [
        ["metta-practice", 11],
        ["gratitude-three", 5],
        ["tao-daily-verse", 10, { heading: "Today's Passage" }],
        ["labeled-box", 10, box("Noticing")],
      ],
      below: [at("rating-strip", 6, 23, 18, 6, { heading: "Today", items: ["Calm", "Kindness", "Presence"] }), at("labeled-box", 6, 29, 18, 7, box("Evening"))],
    },
    ...UNWRITTEN,
  },

  // ======================================================== FAITH
  // ------------------------------------------------ Bible study and prayer
  // The research's sixth niche (strong on Etsy and Amazon both): a reading
  // plan and the books read, prayer requests and questions to study, sermon
  // notes each week, a SOAP study, verse mapping and each day's reading
  // ticked; the month's theme and small group.
  {
    key: "pages-bible-study",
    layout: {
      kind: "pages",
      font: "serif",
      weekStartsMonday: false,
      pages: [
        [
          // Each book of the Bible written in as it is finished: no count to
          // fill, so no canon is assumed (66 books, 73 in a Catholic Bible,
          // more in the Orthodox), and no Genesis-to-Revelation order, since
          // the plan reads both Testaments and the Psalms side by side. It
          // holds what this book finished, so it makes sense in every book,
          // where a 66-box meter started again each quarter. Half the page
          // each: fifteen books (a plan through the Bible in a year finishes
          // about sixteen a quarter; nine rows were full by the second
          // month) and fifteen weeks, more than the fourteen a quarter
          // touches.
          at("column-table", 0, 0, 24, 18, table("Books Read", ["Book", "Finished", "What stayed with me"], [1.2, 0.8, 2.6])),
          at("column-table", 0, 18, 24, 18, table("Reading Plan", ["Week", "Old Testament", "New Testament", "Psalms"], [0.6, 1.4, 1.4, 1])),
        ],
        [
          at("column-table", 0, 0, 24, 20, table("Prayer Requests", ["Date", "For", "Request", "Answered"], [0.8, 1.2, 2.4, 1])),
          at("labeled-box", 0, 20, 12, 16, box("Verses to Memorise")),
          // Answers are the table's Answered column and the month's box.
          at("labeled-box", 12, 20, 12, 16, box("Questions to Study")),
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
      // A row a meeting: a small group meets weekly and has no speaker.
      belowRight: [
        at("column-table", 0, 17, 12, 19, table("Small Group", ["Date", "Passage", "What I took away"], [0.8, 1.4, 2.4])),
        at("monthly-review", 12, 17, 12, 19),
      ],
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
      // Each day's reading ticked off along the bottom, across both pages;
      // SOAP's lines set so its Prayer fits (at the preset's it was dropped).
      belowLeft: [at("sermon-notes", 6, BELOW_ROW, 18, 14), at("icon-strip", 6, LAST, 18, 1, { heading: "Read", icon: "book", count: 1 })],
      belowRight: [
        at("soap-study", 0, BELOW_ROW, 12, 14, { promptLines: [2, 2, 3, 2] }),
        at("verse-mapping", 12, BELOW_ROW, 12, 14),
        at("icon-strip", 0, LAST, 24, 1, { heading: "Read", icon: "book", count: 1 }),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== RECOVERY
  // ------------------------------------------------ one day at a time
  // Early recovery (the research's twelfth niche): your reasons and the
  // people to call at the front, with a plan for when a craving comes and
  // the warning signs to watch for; a day that starts with "just for today"
  // and ends with an honest inventory, a HALT check between; the month's
  // days counted up, never reset.
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
          // Steps written in advance, not a blank box.
          at("prompted-lines", 12, 16, 12, 20, prompts("When a Craving Comes", ["What I'll do first", "Who I'll call", "Where I'll go", "What I'll tell myself"], 3)),
        ],
        [
          // Front pages print in every book: "My First 90 Days" was untrue
          // from the second on. Counted up: the next box shaded for each day
          // kept, so a missed day leaves no gap and resets nothing; no day
          // numbers to be wrong.
          at("progress-meter", 0, 0, 24, 8, { heading: "Days Kept", total: 90, milestoneEvery: 30, numbers: "none" }),
          // Kept beside the month's log: ninety meetings in ninety days, or a
          // court card, runs past its rows.
          at("meeting-log", 0, 8, 12, 28),
          at("sponsor-contact-log", 12, 8, 12, 14, { heading: "Support Contacts" }),
          // Milestones are the month's; the front holds the relapse plan. A
          // ruled list rather than prompts: the Layouts page's similar
          // layouts vary a front page by its note boxes, and this is its
          // last one.
          at("labeled-box", 12, 22, 12, 14, box("Triggers & Warning Signs")),
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
        ["recovery-gratitude-list", 11, { heading: "Grateful This Month" }],
        ["labeled-box", 11, box("Milestones")],
      ],
      // Seven stars a week (the preset's ten were for no week). Its strips
      // are labelled by week, so no heading would print.
      belowLeft: [at("star-count", 6, 17, 18, 5, { count: 7 }), at("mood-chart-month", 6, 22, 18, 14)],
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
        // From "no" to "very": HALT asks how much, and 1 to 5 had no none.
        ["halt-check-in", 8, { scaleMin: 0, scaleMax: 3, scaleHead: "words", lowLabel: "no", highLabel: "very" }],
        ["recovery-gratitude-list", 8],
        ["labeled-box", 10, box("Craving Notes")],
      ],
      // The inventory a line a question, so all six print (at two lines
      // Afraid was dropped), and with credit beside the failings: where I
      // was kind, and whether I owe an apology.
      below: [
        at("rating-strip", 6, 18, 18, 5, { heading: "Cravings", items: ["Morning", "Afternoon", "Evening"], scaleMin: 0, scaleMax: 5 }),
        at("step-ten-inventory", 6, 23, 18, 13, { prompts: ["Resentful", "Selfish", "Dishonest", "Afraid", "Where was I kind?", "Do I owe an apology?"], linesPerPrompt: 1 }),
      ],
    },
    ...UNWRITTEN,
  },

  // ======================================================== HEALTH & WORK
  // ------------------------------------------------ chronic illness flare log
  // The research's eighth niche: a one-minute daily check-in (energy and
  // pain, the symptoms that matter, spoons), every dose taken or skipped, and
  // a month that rolls the days up into patterns to bring to appointments.
  // The care team, medicines, conditions and allergies and a flare plan at
  // the front.
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
          // What a doctor reading the book needs first. A ruled box, not a
          // table: the Layouts page's similar layouts vary a front page by
          // its note boxes, and this was its last one.
          at("labeled-box", 0, 28, 24, 8, box("Conditions & Allergies")),
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
      // Flare days marked on the month, for every illness (a cycle calendar
      // was for some); the review a line a question so all three fit, and
      // the medicine changes a doctor will ask about. The plain mini month,
      // which draws the same: as the Period Tracker the Layouts page and the
      // editor named it a period calendar.
      belowLeft: [at("mood-chart-month", 6, 17, 18, 9), at("mini-month", 6, 26, 18, 10, { heading: "Flare Days", mark: "box" })],
      belowRight: [
        at("column-table", 0, 17, 24, 10, table("Patterns", ["Week", "Spoons, on average", "Worst symptom", "Notes"], [0.7, 1.2, 1.3, 1.8])),
        at("monthly-review", 0, 27, 12, 9, { linesPerPrompt: 1 }),
        at("labeled-box", 12, 27, 12, 9, box("Medicine Changes")),
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
      // The 0 to 10 scale under the hours, at full width: in the sidebar its
      // numbers came out at 2.3pt (2026-10-21). Pain and energy are rated
      // there once, so the severity list leaves them out. Questions for the
      // doctor are the front's and the month's; the doses get rows for a
      // day of five or more; and the food diary prints both its questions
      // in the sidebar (at 18 by 6 the second was dropped).
      sidebar: [
        ["symptom-severity", 9, { items: ["Stiffness", "Nausea", "Headache", "Brain fog", "Dizziness"] }],
        ["labeled-box", 9, box("What Helped")],
        ["food-diary", 9],
        ["labeled-box", 9, box("What Made It Worse")],
      ],
      below: [
        at("spoon-count", 6, 18, 18, 1, { groups: 1 }),
        at("energy-pain-scale", 6, 19, 18, 6, { scaleMin: 0 }),
        at("medication-doses", 6, 25, 18, 11),
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
          // Six wide: a checklist draws a column a day from its width, so at
          // twelve the bag list printed twice.
          at("todo-checklist", 0, 22, 6, 14, steps("Shift Bag", ["Badge", "Stethoscope", "Pens and tape", "Snacks and water", "Phone charger", "Spare scrubs"])),
          at("labeled-box", 6, 22, 18, 14, box("Sleep Plan")),
        ],
        [
          at("column-table", 0, 0, 12, 18, table("Overtime & Pay", ["Date", "Hours", "Rate", "Total"], [1, 0.8, 0.8, 0.9])),
          at("labeled-box", 12, 0, 12, 18, box("Good Shifts")),
          // Meals that suit a night, kept to come back to: a week's
          // breakfast-lunch-dinner grid printed once fit neither.
          at("column-table", 0, 18, 24, 18, table("Go-To Shift Meals", ["Meal", "When I eat it", "Prep time"], [2.2, 1.2, 1])),
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
      // inch and a half blank); the rest is a to-do list under every night,
      // what changes week to week, and water.
      hoursRows: 14,
      // The sleep log's day, not a date (the week is dated) and four columns
      // that print at 7pt in six; meals named for a night, not a day.
      sidebar: [
        ["sleep-log", 12, { columns: ["Day", "Bed", "Woke", "Hrs"], weights: [1.2, 1, 1, 0.7] }],
        ["meal-planner", 10, { habits: ["Before shift", "On break", "After shift", "Snacks"] }],
        ["self-care-checklist", 11],
      ],
      belowLeft: [
        at("todo-checklist", 6, 15, 18, 12, { dayCount: 3 }),
        at("labeled-box", 6, 27, 18, 8, box("Sleep Plan This Week")),
        at("water-week", 6, LAST, 18, 1),
      ],
      belowRight: [
        at("todo-checklist", 0, 15, 24, 12, { dayCount: 4 }),
        at("labeled-box", 0, 27, 24, 8, box("For My Days Off")),
        at("water-week", 0, LAST, 24, 1),
      ],
    },
    ...UNWRITTEN,
  },
];

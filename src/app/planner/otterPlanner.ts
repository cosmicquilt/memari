// THE PLANNER THE OTTER BUILDS: the quiz's answers (lib/otterQuiz.ts) made
// into the spreads of a book, as the spec set out (draft 2, 19 October):
//
//   1. Start from the base week for "what fills your week" - the landing
//      page's week for that person (archetypes.ts), or the base week.
//   2. Put in what the answers ask for, in this order: the follow-up (2),
//      a practice (15), what to keep an eye on (9), the to-do style (12),
//      what else there should be room for (13). Each goes in the cells of
//      a module the answers did not ask for - plain note boxes first - and
//      only where it fits; whatever it displaces was the layout's default.
//   3. What has no room waits on the pages at the front, and the otter
//      says so. So do the one-time pages: a year in pixels, a savings goal,
//      books read.
//   4. Month and day pages, when chosen, start from a plain month and day
//      of note boxes and take the picks made for them the same way.
//
// THE PAGES ARE TEMPLATES (the editorial audit, 2026-10-29). A week spread
// prints on every week of the book, a day on every day, the front once. So
// nothing goes on a page that does not make sense on every one of its
// repeats: a module printed once a book goes to the front, never on a week;
// a grid of seven days never goes on a day or a month page; a daily
// practice never prints once at the front. What has no page of its kind in
// the book is left out, and the otter says so. Whatever lands is printed
// whole: a table's column heads at their size, every prompt of a prompted
// module (fitted).
//
// Every spread is checked by the hero's own test (similarLayouts.ts's
// valid: every module fits its cells and its floor, nothing overlaps, every
// page is full), change by change, so whatever the answers, the result is a
// real layout - otterPlanner.test.mts runs thousands of answer sets through
// it. And it is made into a journal by the code that makes every other
// layout one (archetypeWeek.ts's createJournalFromParts).
//
// SERVER-ONLY: it reads the module registry.

import type { FontChoice } from "@/lib/theme";
import { HERO_BY_KEY, type HeroSpread, type HoursSettings } from "@/app/landing/heroSpreads";
import { BELOW_ROW } from "@/app/landing/archetypes";
import { LANDING_PAGE_GRID } from "@/app/landing/spreads";
import { slotsOf, valid, withSlot, type SlotRef } from "@/app/landing/similarLayouts";
import type { PlannerPart } from "@/app/landing/plannerTemplates";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { getMinRowSpanForSlug, moduleDefinition, moduleSchemaDefaults, slugsDrawnBy } from "@/lib/moduleRegistry";
import { promptedLinesSpan, tableColumnSpan } from "@/lib/moduleCatalogue";
import type { DayIcon } from "@/lib/dayIcons";
import { guessLine, one, routedAnswers, type Answers, type ScheduleEntry } from "@/lib/otterQuiz";

export type OtterPart = { part: PlannerPart; spread: HeroSpread };

export type OtterPlan = {
  parts: OtterPart[];
  weekStartDay: 0 | 1;
  dated: boolean;
  /** The book's first and last day, "YYYY-MM-DD"; null when undated. */
  startISO: string | null;
  endISO: string | null;
  font: FontChoice;
  /** "I think you're a night-owl college student who tracks sleep." */
  guess: string;
  /** What the otter has to own up to: what went to the front for want of
   *  room, what it left out. */
  notes: string[];
  /** Weekly calendar events (question 16). */
  schedule: ScheduleEntry[];
  /** Icons on days (question 17). */
  dayIcons: DayIcon[];
};

// ------------------------------------------------------------ the pieces

type Slot = { slug: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number; props?: Record<string, unknown> };

const box = (heading: string, lined = true) => ({ heading, rule: lined ? "lined" : "none", ruled: lined, templateHeading: heading });
const at = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>): Slot => ({ slug, columnStart, rowStart, columnSpan, rowSpan, props });

/** The base week for each answer to question 1 - the week the landing page
 *  shows for that person. */
const WEEK_BASE: Record<string, string> = {
  school: "student",
  office: "nine-to-five",
  shifts: "nurse",
  teaching: "teacher",
  business: "maker",
  home: "parent",
  training: "fitness",
  health: "chronic-illness",
  everything: "base",
};

/** A follow-up that changes the week: a home with no kids starts from the
 *  home week (heroExtras.ts), not the parent's with its kids' boxes; a
 *  lifter and a mix from the training week (heroExtras.ts), whose workout
 *  log has a day column, not the runner's. A yogi stays on the runner's
 *  week, its runs and lifts replaced (FOLLOW): on the training week the
 *  page's biggest cell was a table of sets, reps and weights. */
const BASE_BY_FOLLOW: Record<string, Record<string, string>> = {
  home: { none: "home" },
  training: { lifting: "training", mix: "training" },
};

/** A spread's layout with none of the hero's writing: what is printed. */
function bare(def: HeroSpread, key: string): HeroSpread {
  return { key, layout: structuredClone(def.layout), hand: def.hand, doodles: def.doodles, events: [], calendar: [] };
}

const BLANK = bare(HERO_BY_KEY.base, "otter-blank");

/** A month of note boxes, for the month picks to take over: month-family's
 *  cells (heroExtras.ts), which the hero's test already passes. One box for
 *  the month's goals, ideas and wins, what is next, and the month's review
 *  across the foot - no "Important Dates": a date is a calendar event, on
 *  the month grid beside it. All three questions of the review print at one
 *  line each (at two, the third did not fit). */
function plainMonth(): HeroSpread {
  return {
    ...BLANK,
    key: "otter-month",
    layout: {
      kind: "month",
      font: "sans",
      weekStartsMonday: true,
      inside: "lined",
      sidebar: [
        ["labeled-box", 18, box("Goals")],
        ["labeled-box", 16, box("Notes")],
      ],
      belowLeft: [at("labeled-box", 6, 17, 18, 9, box("Ideas")), at("labeled-box", 6, 26, 18, 10, box("Wins"))],
      belowRight: [at("labeled-box", 0, 17, 12, 10, box("To Do")), at("labeled-box", 12, 17, 12, 10, box("Next Month")), at("monthly-review", 0, 27, 24, 9, { linesPerPrompt: 1 })],
    },
  };
}

/** A day round the big three (four rows: its heading and three lines) and
 *  a list: day-adhd's cells. What got done, not a second box for "Today"
 *  on a page that is all today. */
function plainDay(): HeroSpread {
  return {
    ...BLANK,
    key: "otter-day",
    layout: {
      kind: "day",
      font: "sans",
      weekStartsMonday: true,
      firstDay: 1,
      hours: { startTime: "07:00", endTime: "22:00" },
      hoursRows: 17,
      sidebar: [
        ["daily-big-three", 4],
        ["labeled-box", 18, box("Notes")],
        ["labeled-box", 14, box("Tomorrow")],
      ],
      below: [at("todo-checklist", 6, 18, 18, 10, { dayCount: 1 }), at("done-list", 6, 28, 18, 8)],
    },
  };
}

// ------------------------------------------------------------ what is wanted

/** Another module, printed in a want's place on one kind of page: a day's
 *  habits as one Done column, not a week of seven. */
type Variant = { slug: string; props?: Record<string, unknown> };

/** A module the answers ask for, the parts it may go on (first choice
 *  first), and what else the answer says about it. */
type Want = {
  slug: string;
  parts: PlannerPart[];
  props?: Record<string, unknown>;
  /** A strip a day, under every day of a week or along a day's hours. */
  strip?: boolean;
  /** Printed once, at the front, whatever its module's cadence: the exam
   *  dates of a term. */
  once?: boolean;
  /** What prints instead on a kind of page. */
  on?: Partial<Record<PlannerPart, Variant>>;
  /** The cells it takes first: a module's slug, or a plain box's heading -
   *  the base week's module the answer contradicts (a freelancer's orders). */
  replaces?: string;
  /** Already answered by any of these on the page, a module's slug or a
   *  heading: a sleep log is the sleep, a table of meals the meal plan. */
  or?: string[];
  /** A practice: first claim on a cell split in two for want of room. */
  practice?: boolean;
  /** What the otter calls it, when not its heading. */
  name?: string;
  /** The same answer's module for another kind of page (a week's mood
   *  chart, a month's): once one of them is in, the others left out for
   *  want of their page go unsaid. */
  alt?: string;
};

/** Where a module goes by the page it is made for (the registry's cadence),
 *  when an answer does not say. Whether it may go there is fits's. */
function partsFor(slug: string): PlannerPart[] {
  switch (PALETTE_INFO_BY_SLUG.get(slug)?.cadence) {
    case "journal":
      return ["front"];
    case "month":
      return ["month", "week"];
    case "day":
      return ["day", "week"];
    case "week":
      return ["week", "month", "day"];
    default:
      return ["week", "day", "month"];
  }
}
const want = (slug: string, parts?: PlannerPart[], props?: Record<string, unknown>, more?: Omit<Want, "slug" | "parts" | "props">): Want => ({ slug, parts: parts ?? partsFor(slug), props, ...more });
const strip = (slug: string): Want => ({ slug, parts: ["week", "day"], strip: true });

const primitiveOf = (slug: string) => moduleDefinition(slug)?.primitive ?? slug;
/** Modules that are a list or a box: as true of a month as of a week. */
const LISTS = new Set(["column-table", "todo-checklist", "labeled-box"]);
/** Week modules that are as true of one day: boxes and lists, not a grid
 *  of seven days. */
const DAY_OK = new Set(["labeled-box", "sketch-box", "todo-checklist", "brain-dump", "done-list", "gratitude-three", "kids-said"]);

/**
 * Whether a want makes sense on every page of a part: once a book only at
 * the front, and at the front only what is printed once; on a day, what is
 * made for a day; on a month, what is made for a month or is a list; on a
 * week, anything that repeats but a month's meter or grid.
 */
function fits(w: Want, part: PlannerPart): boolean {
  if (w.on?.[part]) return true;
  if (w.strip) return part === "week" || part === "day";
  const cadence = PALETTE_INFO_BY_SLUG.get(w.slug)?.cadence ?? null;
  if (part === "front") return Boolean(w.once) || cadence === "journal" || PLAIN.has(w.slug);
  if (cadence === "journal") return false;
  if (part === "day") return cadence === "day" || DAY_OK.has(w.slug);
  const list = LISTS.has(primitiveOf(w.slug));
  if (part === "month") return cadence === "month" || (cadence !== "day" && list);
  return cadence !== "month" || list;
}

/** A term's exams, once at the front: what each is and when, and the grade
 *  after. Each date is a calendar event too (the otter says so). */
const EXAM_DATES = want("column-table", ["front"], { heading: "Exam Dates", columns: ["Class", "Exam", "Date", "Grade"], weights: [1.4, 2.2, 1, 0.9] }, { once: true });
const EXAM_NOTE = "Put each exam in your calendar too, so it prints on its day.";
/** Rest days, not sleep: the sleep is the sleep log's or the chart's. And
 *  rest counted once: a plan beside the rest days has no Rest row (as the
 *  training-block week, plannerLibrary.ts). */
const REST_DAYS = { habits: ["Rest day", "Active rest"] };
/** Lifts on a week: last week's, this week's and next week's, not the
 *  catalogue's four weeks of a month (the runner's week, archetypes.ts). */
const OVERLOAD_WEEK = { columns: ["Lift", "Last wk", "This wk", "Next wk"], weights: [2.2, 1, 1, 1] };
/** A day's sleep: a rating of the night, not a week's bedtimes or a log of
 *  nights. One to five, as every rating in a sidebar: ten circles in six
 *  columns printed their numbers at 2.3pt. */
const SLEEP_DAY: Variant = { slug: "energy-pain-scale", props: { heading: "Sleep", items: ["Sleep"], scaleMax: 5 } };
/** A chore chart's people: me, and a column to name for each other one. */
const choreColumns = (others: number) => ({ columns: ["Me", ...Array.from({ length: others }, () => "")] });
/** The week's lesson plan, or on a day the day's periods: the module's
 *  own columns but its Day, which a day page is. */
const LESSONS = want("lesson-planner", ["week", "day"], undefined, { on: { day: { slug: "lesson-planner", props: { columns: ["Period", "Topic", "Materials"], weights: [0.9, 2.6, 2] } } } });

const FOLLOW: Record<string, Record<string, Want[]>> = {
  school: {
    "high-school": [want("assignment-tracker"), EXAM_DATES],
    // A fourth task list on the week (beside assignments, to-dos and
    // priorities) is one too many: projects go on the month.
    college: [want("assignment-tracker"), EXAM_DATES, want("project-tracker", ["month"])],
    grad: [want("project-tracker", ["week", "month"]), want("reading-progress", ["front"], { heading: "Reading Goal" })],
    // No classes to hand work in to: a study plan of their own.
    self: [want("assignment-tracker", ["week", "month"], { heading: "Study Plan", columns: ["Topic", "Task", "Due", "Done"] }), want("skill-practice"), want("language-study")],
  },
  office: {
    meetings: [want("one-on-one-agenda"), want("waiting-on")],
    // The hours are the time blocks: Day Parts under them is a second grid
    // of ticks, and took the Weekend box (2026-10-29 audit).
    deep: [strip("focus-blocks")],
    tasks: [want("todo-checklist"), want("eisenhower-matrix")],
    people: [want("one-on-one-agenda"), want("waiting-on"), want("done-list")],
  },
  shifts: {
    // A log of nights is a week's: on a month it held a third of them. The
    // shift week's sleep log is the sleep (or), so its Sleep Plan box stays.
    nights: [want("sleep-log", ["week", "day"], undefined, { on: { day: SLEEP_DAY } })],
    sometimes: [want("sleep-chart", undefined, undefined, { or: ["sleep-log"] }), want("rest-day-marker", undefined, REST_DAYS)],
    days: [],
  },
  // A lesson plan is a week's or a day's periods, never a month's.
  teaching: {
    little: [LESSONS],
    middle: [LESSONS],
    high: [LESSONS, want("grading-tracker")],
    college: [LESSONS, want("grading-tracker")],
  },
  business: {
    things: [want("order-tracker")],
    // Nothing to ship: what came in, where the orders were.
    service: [want("project-tracker", ["week", "month"]), want("income-log", ["week", "month"], undefined, { replaces: "order-tracker" })],
    content: [want("content-plan"), want("labeled-box", ["week"], box("Post Ideas"), { replaces: "order-tracker" })],
  },
  home: {
    none: [want("cleaning-rota"), want("pet-care"), want("chore-chart", ["week"], choreColumns(1))],
    one: [want("chore-chart", ["week"], choreColumns(2)), want("kids-said")],
    few: [want("chore-chart", ["week"], choreColumns(3)), want("kids-said")],
    many: [want("chore-chart", ["week"], choreColumns(5)), want("grocery-list", ["week"])],
  },
  training: {
    // A runner and a yogi start from the runner's week: they lose what is
    // not theirs, and a runner the second strength table (the workout log
    // is the first). A lifter and a mix start from the training week
    // (BASE_BY_FOLLOW), whose plan holds four rows: a lifter's rest is one
    // of them, so no second tracker of rest days, and the lifts go where
    // the runs were.
    running: [
      want("run-log"),
      want("weekly-workout-plan", ["week"], { habits: ["Easy run", "Speed", "Long run", "Strength"] }),
      want("rest-day-marker", ["week"], REST_DAYS, { replaces: "progressive-overload" }),
    ],
    lifting: [
      want("progressive-overload", ["week", "month"], undefined, { replaces: "run-log", on: { week: { slug: "progressive-overload", props: OVERLOAD_WEEK } } }),
      want("workout-log", ["week", "day"]),
      want("weekly-workout-plan", ["week"], { habits: ["Push", "Pull", "Legs", "Rest"] }),
    ],
    yoga: [
      want("stretch-routine", ["week"]),
      want("yoga-log", ["week", "month"], undefined, { replaces: "run-log" }),
      want("weekly-workout-plan", ["week"], { habits: ["Yoga", "Mobility", "Strength", "Walk"] }),
      want("rest-day-marker", ["week"], REST_DAYS, { replaces: "progressive-overload" }),
    ],
    mix: [want("weekly-workout-plan", ["week"], { habits: ["Sport", "Strength", "Cardio", "Rest"] })],
  },
  health: {
    symptoms: [want("symptom-tracker", undefined, undefined, { alt: "symptoms" }), want("symptom-severity", ["day"], undefined, { alt: "symptoms" })],
    medication: [want("medication-log", undefined, undefined, { alt: "medication" }), want("medication-doses", ["day"], undefined, { alt: "medication" })],
    // One to five: at ten, in a day's sidebar, its numbers printed at 2.3pt.
    energy: [strip("spoon-count"), want("energy-pain-scale", undefined, { scaleMax: 5 })],
    appointments: [],
  },
  everything: {
    organized: [want("todo-checklist"), want("weekly-priorities", ["week"])],
    habits: [want("habit-tracker", ["week", "day"], undefined, { on: { day: { slug: "habit-tracker", props: { heading: "Habits", columns: ["Done"] } } } })],
    // The sidebar's plain Money box becomes the week's bills: beside a log
    // of spending, a box for "Money" was two places for one thing, and the
    // log is too wide for the box's cells.
    money: [want("labeled-box", ["week"], box("Bills"), { replaces: "Money" }), want("spending-log"), want("budget")],
    calmer: [want("gratitude-three", ["week", "day"], undefined, { name: "gratitude" }), want("mood-chart-week", ["week"])],
  },
};

/** The pages printed once that come with what fills the week, whatever the
 *  follow-up: a desk job's days off counted, a home's birthdays and gift
 *  ideas. They were lifted off the nine-to-five and parent weeks; those
 *  weeks no longer print them every week (2026-10-29 audit), so they are
 *  asked for here. */
const FRONT_BY_FILLS: Record<string, Want[]> = {
  office: [want("pto-meter", ["front"])],
  home: [want("birthday-calendar", ["front"]), want("gift-log", ["front"])],
};

/** What the otter says about a follow-up's answer: scheduled things are
 *  calendar events, never boxes on a page. */
const FOLLOW_NOTES: Record<string, Record<string, string>> = {
  school: { "high-school": EXAM_NOTE, college: EXAM_NOTE },
  health: { appointments: "Add your appointments to the calendar so each one prints on its day." },
};

const HABIT_ROWS: Record<string, number> = { few: 3, some: 5, many: 8 };

function trackWants(answers: Answers, fills: string): Want[] {
  const out: Want[] = [];
  const noMonths = !(answers.pages ?? []).includes("month");
  for (const pick of answers.track ?? []) {
    switch (pick) {
      case "habits": {
        const habits = Array.from({ length: HABIT_ROWS[one(answers, "habitCount") ?? "some"] ?? 5 }, () => "");
        // A day's habits are one column to tick, not a week of seven.
        out.push(want("habit-tracker", ["week", "day"], { heading: "Habits", habits, totalColumn: true }, { on: { day: { slug: "habit-tracker", props: { heading: "Habits", habits, columns: ["Done"] } } } }));
        break;
      }
      case "sleep":
        // A day's sleep is a rating of the night, not a week's bedtimes.
        out.push(want("sleep-chart", ["week", "day"], undefined, { or: ["sleep-log"], on: { day: SLEEP_DAY } }));
        break;
      case "mood":
        out.push(want("mood-chart-week", ["week"], undefined, { alt: "mood" }), want("mood-chart-month", ["month"], undefined, { alt: "mood" }), want("year-in-pixels", ["front"], undefined, { alt: "mood" }));
        break;
      case "water":
        out.push(strip("water-week"));
        break;
      case "workouts":
        // Not a bodybuilding split for someone whose week is not training.
        out.push(want("weekly-workout-plan", ["week"], fills === "training" ? undefined : { habits: ["Cardio", "Strength", "Stretch", "Rest"] }, { alt: "workouts" }), want("workout-log", ["day"], undefined, { alt: "workouts" }));
        break;
      case "money": {
        out.push(want("spending-log", ["week", "month"]));
        const how = one(answers, "money");
        // A paycheck a month or a fortnight is not one every week: on a
        // week, the bills that week.
        if (how === "steady") out.push(want("paycheck-budget", ["month", "week"], undefined, { on: { week: { slug: "paycheck-budget", props: { heading: "Bills" } } } }));
        if (how === "varies") out.push(want("income-log", ["month", "week"]), want("sinking-funds", ["front"]));
        if (how === "saving") out.push(want("budget", ["month", "week"]), want("savings-goal", ["front"]), want("debt-payoff", ["front"]));
        break;
      }
      case "meals":
        // Kept knowingly a tick grid (breakfast, lunch, dinner, a snack;
        // its description says so): what is kept an eye on is whether they
        // were eaten. A table to write each day's meals in needs 18 columns
        // by 9 rows, on most base weeks the week's main module; where a
        // base already has one, or a box for meals, that is the meals (or).
        out.push(want("meal-planner", ["week"], undefined, { alt: "meals", or: ["Meals"] }), want("grocery-list", ["week"]), want("food-diary", ["day"], undefined, { alt: "meals" }));
        break;
      case "period":
        // With no month pages, the year's grid at the front: every month of
        // any book's three is in it (one mini month printed once is one).
        out.push(want("period-tracker", ["month", "front"], undefined, noMonths ? { on: { front: { slug: "year-in-pixels", props: { heading: "Cycle" } } } } : undefined));
        break;
      case "reading":
        out.push(want("books-read", ["front"]), want("reading-progress", ["front"], { heading: "Reading Goal" }));
        break;
    }
  }
  return out;
}

function todoWants(answers: Answers): Want[] {
  switch (one(answers, "todo")) {
    case "three":
      return [want("weekly-priorities", ["week"], undefined, { alt: "three" }), want("daily-big-three", ["day"], undefined, { alt: "three" })];
    case "dump":
      // The dump is the to-do list: in its cells, not the big three's four
      // rows beside it.
      return [want("brain-dump", ["week", "day"], undefined, { replaces: "todo-checklist" })];
    case "adhd":
      // A dopamine menu is a standing list: on a week, or written once at
      // the front - not a fresh one every day (day-adhd, heroExtras.ts).
      return [want("brain-dump", ["week", "day"], undefined, { alt: "busy" }), want("done-list", ["week", "day"]), want("daily-big-three", ["day"], undefined, { alt: "busy" }), want("dopamine-menu", ["week", "front"], undefined, { once: true }), strip("focus-blocks")];
    case "list":
      return [want("todo-checklist", ["week", "day"])];
    default:
      return [];
  }
}

function roomWants(answers: Answers): Want[] {
  const out: Want[] = [];
  for (const pick of answers.room ?? []) {
    if (pick === "gratitude") out.push(want("gratitude-three", ["day", "week"], undefined, { name: "gratitude" }));
    // With no week pages, the month's look back.
    if (pick === "reflection") out.push(want("weekly-reflection", ["week", "month"], undefined, { on: { month: { slug: "monthly-review", props: { linesPerPrompt: 1 } } } }));
    if (pick === "goals") out.push(want("smart-goal", ["front"]), want("ninety-day-sprint", ["front"]));
    // A box to draw in already on the page is the doodles: one, not two.
    if (pick === "doodles") out.push(want("sketch-box", ["week", "day", "front"], { heading: "Doodles" }, { or: ["sketch-box"] }));
    if (pick === "notes") out.push(want("labeled-box", ["week", "day", "front"], box("Notes")));
  }
  return out;
}

function practiceWants(answers: Answers): Want[] {
  // routedAnswers keeps only practices the quiz offered; each one's id is
  // its module's slug. Each goes by its own cadence (fits): a daily one on
  // a day or a week, a weekly one on a week, never once at the front.
  return (answers.practices ?? []).map((slug) =>
    slug === "meditation-minutes"
      ? // A month's sitting days; with no month pages, the year's grid.
        want(slug, ["month", "front"], undefined, { practice: true, on: (answers.pages ?? []).includes("month") ? undefined : { front: { slug: "year-in-pixels", props: { heading: "Sitting" } } } })
      : want(slug, undefined, undefined, { practice: true }),
  );
}

// ------------------------------------------------------------ fitting in

const floorOf = (slug: string, columnSpan: number, props?: Record<string, unknown>) =>
  getMinRowSpanForSlug(slug, LANDING_PAGE_GRID, columnSpan, { ...moduleSchemaDefaults(slug), ...(props ?? {}) });

/** Modules a person never asks for by name: the page's plain boxes. They
 *  give way first. */
const PLAIN = new Set(["labeled-box", "sketch-box"]);
const TABLES = new Set(slugsDrawnBy("column-table"));
const PROMPTED = new Set(slugsDrawnBy("prompted-lines"));
/** Modules whose body is rows: given more room, they have more lines. */
const FILLS = new Set(slugsDrawnBy("column-table", "todo-checklist", "prompted-lines", "labeled-box"));
/** The boxes the quiz itself puts in (where a once-a-book module was): the
 *  first a box the answers ask for takes over. */
const FILLERS = ["Next Week", "Ideas", "Notes"];

const refKey = (ref: SlotRef) => `${ref.list}.${ref.index}`;
const headingOf = (slug: string, props?: Record<string, unknown>) => String(props?.heading ?? moduleSchemaDefaults(slug).heading ?? "");

/** What the otter calls a want: what was picked, else its heading, else its
 *  palette name - "water", not "water (week)". */
function nameOf(w: Want): string {
  const heading = w.props?.heading;
  const name = w.name ?? (typeof heading === "string" && heading ? heading : (PALETTE_INFO_BY_SLUG.get(w.slug)?.name ?? w.slug));
  return name.replace(/ \((week|month)\)$/, "").toLowerCase();
}

/**
 * The props a module prints WHOLE with in cells this size, or null: at its
 * floor; a table wide enough for its column heads (tableColumnSpan, the
 * catalogue's own measure; `width`); and every prompt of a prompted module
 * - at its own lines when they fit, else a line each with the spare shared
 * (promptLineCounts stops at the first prompt that does not fit, so a SOAP
 * study in six rows printed "Scripture" and nothing else).
 */
function fitted(slug: string, props: Record<string, unknown> | undefined, columnSpan: number, rowSpan: number, width = true): { props?: Record<string, unknown> } | null {
  if (floorOf(slug, columnSpan, props) > rowSpan) return null;
  const all = { ...moduleSchemaDefaults(slug), ...(props ?? {}) } as { columns?: string[]; weights?: number[]; prompts?: string[]; linesPerPrompt?: number; promptLines?: number[] };
  if (width && TABLES.has(slug) && all.columns?.length && columnSpan < tableColumnSpan(all.columns, all.weights)) return null;
  if (PROMPTED.has(slug) && all.prompts?.length) {
    const own = promptedLinesSpan(all.prompts, all.linesPerPrompt ?? 1, all.promptLines);
    if (columnSpan >= own.columnSpan && rowSpan >= own.rowSpan) return { props };
    const least = promptedLinesSpan(all.prompts, 1, []);
    if (columnSpan < least.columnSpan || rowSpan < least.rowSpan) return null;
    return { props: { ...(props ?? {}), linesPerPrompt: 1, promptLines: [] } };
  }
  return { props };
}

/** A module already on the page, made shorter: at least its floor, and
 *  every prompt kept (at a line each if need be), or not at all - a strip
 *  under a food diary printed "What did I eat?" and dropped the rest. */
function shortened(slug: string, props: Record<string, unknown> | undefined, columnSpan: number, rowSpan: number): { props?: Record<string, unknown> } | null {
  return fitted(slug, props, columnSpan, rowSpan, false);
}

/** The bottom row of a zone under the hours, as [first column, width]. */
const ZONES: Record<string, Record<string, [number, number]>> = {
  week: { belowLeft: [6, 18], belowRight: [0, 24] },
  day: { below: [6, 18] },
};

/**
 * A strip a day along the bottom of every zone under the hours - so on a
 * week under all seven days, both pages in the same row (the rule since
 * 2026-10-19: "a strip a day runs the whole week") - by taking a row from
 * whatever sits above the strips already there (two at most to a zone: the
 * student's week stacks focus blocks and water). Null when one of them
 * cannot spare it.
 */
function withStrip(def: HeroSpread, slug: string): HeroSpread | null {
  const zones = ZONES[def.layout.kind];
  if (!zones) return null;
  const layout = structuredClone(def.layout) as unknown as Record<string, Slot[]>;
  const foot = LANDING_PAGE_GRID.gridRows;
  for (const [list, [columnStart, columnSpan]] of Object.entries(zones)) {
    const slots = layout[list];
    if (!Array.isArray(slots)) return null;
    let band = foot;
    while (slots.some((s) => s.rowSpan === 1 && s.rowStart === band - 1 && s.columnStart === columnStart && s.columnSpan === columnSpan)) band--;
    if (foot - band >= 2) return null;
    const above = slots.filter((s) => s.rowSpan > 1 && s.rowStart + s.rowSpan === band);
    if (above.length === 0) return null;
    for (const s of above) {
      const shorter = shortened(s.slug, s.props, s.columnSpan, s.rowSpan - 1);
      if (!shorter) return null;
      s.rowSpan -= 1;
      s.props = shorter.props;
    }
    slots.push({ slug, columnStart, rowStart: band - 1, columnSpan, rowSpan: 1 });
  }
  const next = { ...def, layout: layout as unknown as HeroSpread["layout"] };
  return valid(next) ? next : null;
}

/**
 * Room made by splitting a cell at least 18 columns wide in two, top to
 * bottom: the module there keeps the top, at least its floor, and the want
 * takes the rows under it, as many as it needs and up to its own height.
 * The five daily prayers do not fit any one cell of a week, but fit under
 * the habits the same person asked for (2026-10-29 audit). Null when no
 * cell can be split.
 */
function withSplit(def: HeroSpread, w: Want): HeroSpread | null {
  const layout = def.layout as unknown as Record<string, unknown>;
  const cells: Array<{ list: string; index: number; s: Slot }> = [];
  for (const list of ["belowLeft", "belowRight", "below"]) {
    const slots = layout[list];
    if (!Array.isArray(slots)) continue;
    (slots as Slot[]).forEach((s, index) => {
      if (s.columnSpan >= 18 && s.rowSpan > 1) cells.push({ list, index, s });
    });
  }
  cells.sort((a, b) => b.s.rowSpan - a.s.rowSpan);
  for (const { list, index, s } of cells) {
    const own = moduleDefinition(w.slug)?.db.defaultRowSpan ?? 0;
    for (let rows = floorOf(w.slug, s.columnSpan, w.props); rows < s.rowSpan; rows++) {
      const mine = fitted(w.slug, w.props, s.columnSpan, rows);
      if (!mine) continue;
      // As tall as it is made, if the module above can spare it and keeps
      // at least as many rows: a stoic evening review grown to its own
      // eleven left a to-do list four (2026-10-29).
      let take = rows;
      while (take < own && s.rowSpan - take - 1 >= take + 1 && shortened(s.slug, s.props, s.columnSpan, s.rowSpan - take - 1)) take++;
      const theirs = shortened(s.slug, s.props, s.columnSpan, s.rowSpan - take);
      const grown = fitted(w.slug, w.props, s.columnSpan, take);
      if (!theirs || !grown) break;
      const next = structuredClone(def.layout) as unknown as Record<string, Slot[]>;
      next[list][index] = { ...s, rowSpan: s.rowSpan - take, props: theirs.props };
      next[list].push({ slug: w.slug, columnStart: s.columnStart, rowStart: s.rowStart + s.rowSpan - take, columnSpan: s.columnSpan, rowSpan: take, props: grown.props });
      const out = { ...def, layout: next as unknown as HeroSpread["layout"] };
      if (valid(out)) return out;
      break;
    }
  }
  return null;
}

/**
 * Put what is wanted into a spread, best first: each into the cells of a
 * module nobody asked for - the cells of what it replaces first, then plain
 * boxes, then the layout's own defaults - where it fits whole, and the
 * spread still passes. A module already on the page takes what the answer
 * says about it (how many habits). What finds no cells takes half of one
 * big enough to split, practices first; what still has none is returned,
 * for the front pages.
 */
function fillSpread(start: HeroSpread, wants: Want[]): { def: HeroSpread; left: Want[] } {
  let def = start;
  const asked = new Set(wants.map((w) => w.slug));
  // Cells already holding something asked for stay put.
  const kept = new Set(slotsOf(def).filter((s) => asked.has(s.slug) && !PLAIN.has(s.slug)).map(refKey));
  const unplaced: Want[] = [];
  for (const w of wants) {
    const on = slotsOf(def);
    const answered = w.or && on.find((s) => w.or!.some((x) => s.slug === x || headingOf(s.slug, s.props) === x));
    if (answered) {
      kept.add(refKey(answered));
      continue;
    }
    if (PLAIN.has(w.slug)) {
      // A box with the heading wanted is the box wanted.
      if (on.some((s) => PLAIN.has(s.slug) && headingOf(s.slug, s.props) === headingOf(w.slug, w.props))) continue;
    } else {
      const same = on.find((s) => s.slug === w.slug);
      if (same) {
        if (w.props) {
          const next = withSlot(def, same, w.slug, { ...(same.props ?? {}), ...w.props });
          if (valid(next)) def = next;
        }
        kept.add(refKey(same));
        continue;
      }
    }
    if (w.strip) {
      const next = withStrip(def, w.slug);
      if (next) def = next;
      else unplaced.push(w);
      continue;
    }
    const filler = (s: SlotRef) => PLAIN.has(s.slug) && FILLERS.includes(headingOf(s.slug, s.props));
    const candidates = on
      .filter((s) => !kept.has(refKey(s)) && s.rowSpan > 1)
      .map((s) => ({ s, fit: fitted(w.slug, w.props, s.columnSpan, s.rowSpan) }))
      .filter((c): c is { s: SlotRef; fit: { props?: Record<string, unknown> } } => c.fit !== null)
      // What it replaces first; then plain boxes (the quiz's own first);
      // then the closest fit, so a small module does not take the biggest
      // cells while a big one is still to come.
      .sort(
        (a, b) =>
          Number(!replacedBy(a.s, w)) - Number(!replacedBy(b.s, w)) ||
          Number(!PLAIN.has(a.s.slug)) - Number(!PLAIN.has(b.s.slug)) ||
          Number(!filler(a.s)) - Number(!filler(b.s)) ||
          a.s.rowSpan * a.s.columnSpan - b.s.rowSpan * b.s.columnSpan,
      );
    let placed = false;
    for (const { s, fit } of candidates) {
      const next = withSlot(def, s, w.slug, fit.props);
      if (!valid(next)) continue;
      def = next;
      kept.add(refKey(s));
      placed = true;
      break;
    }
    if (!placed) unplaced.push(w);
  }
  const left: Want[] = [];
  for (const w of [...unplaced.filter((u) => u.practice), ...unplaced.filter((u) => !u.practice)]) {
    const next = w.strip || PLAIN.has(w.slug) ? null : withSplit(def, w);
    if (next) def = next;
    else left.push(w);
  }
  return { def, left };
}

const replacedBy = (s: SlotRef, w: Want) => Boolean(w.replaces) && (s.slug === w.replaces || (PLAIN.has(s.slug) && headingOf(s.slug, s.props) === w.replaces));

// ------------------------------------------------------------ the quiz's week

/** The quiz's words over a hero's where the hero's are theirs alone or say
 *  less than they could: "This Week" over a habit tracker is "Habits". */
const QUIZ_HEADINGS: Record<string, Record<string, string>> = {
  base: { "When It's Sorted": "Looking Forward To" },
  student: { "This Week": "Habits" },
};

/** The same, by the follow-up, where the base week is another person's
 *  job: a freelancer from the maker's week has no supplies to buy and
 *  nothing to make but invoices; a creator, messages to answer (as the
 *  small shop's week, plannerLibrary.ts); a professor, students to email,
 *  and no school to be after. */
const FOLLOW_HEADINGS: Record<string, Record<string, Record<string, string>>> = {
  business: { service: { "To Make": "To Invoice", Supplies: "To Reply" }, content: { Supplies: "To Reply" } },
  teaching: { college: { "Parent Emails": "Student Emails", "After School": "After Class" } },
};

/** A once-a-book module lifted off a week, and whether it goes to the front
 *  instead: only where the answers say it is theirs. (The PTO meter and the
 *  gift log are no longer on any base week: FRONT_BY_FILLS asks for them.) */
const LIFT: Record<string, (answers: Answers, fills: string) => Want | null> = {
  "savings-goal": (a, fills) => ((a.track ?? []).includes("money") || (fills === "everything" && one(a, "follow") === "money") ? want("savings-goal", ["front"]) : null),
};

/**
 * The base week as the quiz prints it every week: the hero's layout with
 * none of their writing, the quiz's headings over theirs (QUIZ_HEADINGS),
 * one box to draw in (a second is a box for reminders), and every module
 * printed once a book - the base week's Lisbon fund and someday list - a
 * plain box instead, lifted to the front when the answers make it theirs.
 */
function quizWeek(hero: HeroSpread, answers: Answers, fills: string): { def: HeroSpread; lifted: Want[] } {
  let def = bare(hero, `otter-week-${hero.key}`);
  const lifted: Want[] = [];
  const renames = { ...(QUIZ_HEADINGS[hero.key] ?? {}), ...(FOLLOW_HEADINGS[fills]?.[one(answers, "follow") ?? ""] ?? {}) };
  for (const s of slotsOf(def)) {
    const to = typeof s.props?.heading === "string" ? renames[s.props.heading] : undefined;
    if (to) def = withSlot(def, s, s.slug, { ...s.props, heading: to, ...(s.props?.templateHeading !== undefined ? { templateHeading: to } : {}) });
  }
  const sketches = slotsOf(def)
    .filter((s) => s.slug === "sketch-box")
    .sort((a, b) => b.rowSpan * b.columnSpan - a.rowSpan * a.columnSpan);
  for (const s of sketches.slice(1)) def = withSlot(def, s, "labeled-box", box("Reminders"));
  for (const s of slotsOf(def)) {
    if (PALETTE_INFO_BY_SLUG.get(s.slug)?.cadence !== "journal") continue;
    const taken = new Set(slotsOf(def).map((x) => headingOf(x.slug, x.props)));
    def = withSlot(def, s, "labeled-box", box(FILLERS.find((h) => !taken.has(h)) ?? "Notes"));
    const lift = LIFT[s.slug]?.(answers, fills);
    if (lift) lifted.push(lift);
  }
  return { def, lifted };
}

/** Bedtimes a night owl can mark, to 4 AM (the same moons, later). */
const OWL_BEDTIMES = ["🌕 4AM", "🌖 3AM", "🌗 2AM", "🌘 1AM", "🌒 12AM", "🌑 11PM"];

/** A bedtime chart for the hours the answers keep: to 4 AM for a night
 *  owl; none for nights, whose bed is in the morning (the sleep log takes
 *  any time) - a box for before the shift instead. */
function forTheHours(def: HeroSpread, answers: Answers): HeroSpread {
  const rhythm = one(answers, "rhythm");
  if (rhythm !== "nights" && rhythm !== "owl") return def;
  let out = def;
  for (const s of slotsOf(def)) {
    if (s.slug !== "sleep-chart") continue;
    const next = rhythm === "nights" ? withSlot(out, s, "labeled-box", box("Before Shift")) : withSlot(out, s, s.slug, { ...s.props, levels: OWL_BEDTIMES });
    if (valid(next)) out = next;
  }
  return out;
}

// ------------------------------------------------------------ the front pages

const PAGE_ROWS = 36;
const COLUMN = 12;

/** A front module's height: its own (the registry's), at least its floor
 *  and a third of a page, and tall enough to print whole. */
function frontSize(w: Want): { rows: number; props?: Record<string, unknown> } | null {
  const own = moduleDefinition(w.slug)?.db.defaultRowSpan ?? 10;
  for (let rows = Math.min(PAGE_ROWS, Math.max(floorOf(w.slug, COLUMN, w.props), own, 10)); rows <= PAGE_ROWS; rows++) {
    const fit = fitted(w.slug, w.props, COLUMN, rows, false);
    if (fit) return { rows, props: fit.props };
  }
  return null;
}

/** The front's own pages, printed once: a future log of the book's months
 *  (its registry hook names them from the book's start, so only when
 *  dated) and a someday list. None for "Nothing, keep it clean". (A home's
 *  birthdays and gifts are asked for, FRONT_BY_FILLS.) */
function frontExtras(answers: Answers): Want[] {
  if ((answers.room ?? []).includes("nothing")) return [];
  const out: Want[] = [];
  if (one(answers, "dated") !== "undated") out.push(want("future-log-months", ["front"]));
  out.push(want("someday-maybe", ["front"]));
  return out;
}

/**
 * The pages at the front: what the answers want there, and what found no
 * room further in, then the front's own pages (frontExtras) - in columns
 * half a page wide, each module at its own height, spread so each column
 * ends in a module that can take its spare rows. A page with one column of
 * them has it the whole page wide. A column's rows left over go to its last
 * module that has rows to give them to; only where there is none, a box
 * for notes - one on the whole front at most - and a page with nothing on
 * it is a clean page of dots (2026-10-29: no "Notes" and "More Notes"
 * filler). Null when
 * nothing is wanted there. What does not fit in four columns is returned.
 */
function frontPages(items: Want[], extras: Want[]): { def: HeroSpread | null; left: Want[] } {
  if (items.length === 0) return { def: null, left: [] };
  type Item = { w: Want; rows: number; props?: Record<string, unknown> };
  const columns: Item[][] = [[], [], [], []];
  const used = [0, 0, 0, 0];
  const left: Want[] = [];
  const add = (w: Want, asked: boolean) => {
    const sized = frontSize(w);
    const c = sized ? used.findIndex((u) => PAGE_ROWS - u >= sized.rows) : -1;
    if (!sized || c === -1) {
      if (asked) left.push(w);
      return;
    }
    columns[c].push({ w, ...sized });
    used[c] += sized.rows;
  };
  for (const w of items) add(w, true);
  for (const w of extras) if (!items.some((x) => x.slug === w.slug)) add(w, false);
  // Spread: an empty column takes a module that can take a column's spare
  // rows (FILLS) from one that keeps another, so both end in one; a lone
  // meter moved out alone left a box of notes under it. Past one column per
  // page, a column that cannot be filled so stays empty, and the page's
  // other column has it whole.
  const fillers = (c: Item[]) => c.filter((m) => FILLS.has(m.w.slug)).length;
  for (let empty = columns.findIndex((c) => c.length === 0); empty !== -1; empty = columns.findIndex((c) => c.length === 0)) {
    const fuller = columns.filter((c) => c.length > 1).sort((a, b) => b.length - a.length);
    const both = fuller.find((c) => fillers(c) > 1);
    if (both) columns[empty].push(both.splice(both.map((m) => FILLS.has(m.w.slug)).lastIndexOf(true), 1)[0]);
    else if (fuller[0] && columns.filter((c) => c.length > 0).length < 2) columns[empty].push(fuller[0].pop()!);
    else break;
  }
  const full = columns.filter((c) => c.length > 0);
  const onPages: Array<Item[][]> = full.length >= 4 ? [[full[0], full[1]], [full[2], full[3]]] : full.length === 3 ? [[full[0], full[1]], [full[2]]] : full.length === 2 ? [[full[0]], [full[1]]] : [[full[0]], []];
  let notes = full.some((c) => c.some(({ w, props }) => w.slug === "labeled-box" && headingOf(w.slug, props) === "Notes"));
  const pages: [Slot[], Slot[]] = [[], []];
  // A page with nothing on it (one module on the whole front, as for
  // "Nothing, keep it clean") is a clean page of dots, not a box headed
  // Notes (Andrew, 2026-10-29: no "Notes" filler on the college front).
  onPages.forEach((cols, p) => {
    if (cols.length > 0) return;
    pages[p].push(at("labeled-box", 0, 0, 2 * COLUMN, PAGE_ROWS, { heading: "", rule: "dotted", showHeading: false, templateHeading: "" }));
  });
  onPages.forEach((cols, p) => {
    cols.forEach((column, c) => {
      const columnStart = cols.length === 1 ? 0 : c * COLUMN;
      const columnSpan = cols.length === 1 ? 2 * COLUMN : COLUMN;
      const rows = column.map((m) => m.rows);
      const rest = PAGE_ROWS - rows.reduce((a, b) => a + b, 0);
      let box_: Slot | null = null;
      if (rest > 0) {
        const filling = column.map((m) => FILLS.has(m.w.slug)).lastIndexOf(true);
        if (filling !== -1) rows[filling] += rest;
        else if (!notes && rest >= 4) {
          box_ = at("labeled-box", columnStart, PAGE_ROWS - rest, columnSpan, rest, box("Notes"));
          notes = true;
        } else rows[rows.length - 1] += rest;
      }
      let row = 0;
      column.forEach((m, i) => {
        pages[p].push(at(m.w.slug, columnStart, row, columnSpan, rows[i], m.props));
        row += rows[i];
      });
      if (box_) pages[p].push(box_);
    });
  });
  const def: HeroSpread = { ...BLANK, key: "otter-front", layout: { kind: "pages", font: "sans", weekStartsMonday: true, pages } };
  return valid(def) ? { def, left } : { def: null, left: items };
}

// ------------------------------------------------------------ the settings

/** The hours the answers ask for, over the spread's own. */
function hoursFrom(answers: Answers, base: HoursSettings | undefined): HoursSettings {
  const hourly = one(answers, "hourly");
  if (hourly === "lists") return { ...(base ?? {}), intervalMode: "off", offModeRule: "dotted" };
  const out: HoursSettings = { ...(base ?? {}), intervalMode: "on", offModeRule: undefined };
  if (hourly === "hour") out.intervalMinutes = 60;
  if (hourly === "half") {
    out.intervalMinutes = 30;
    out.compactHourRows = undefined;
  }
  // An end before the start runs on past midnight, marked +1 (2026-10-20).
  const ranges: Record<string, [string, string]> = { early: ["05:00", "21:00"], day: ["07:00", "23:00"], owl: ["10:00", "02:00"], nights: ["19:00", "07:00"] };
  const range = ranges[one(answers, "rhythm") ?? ""];
  if (range) [out.startTime, out.endTime] = range;
  return out;
}

/** The spread with its week start, font and hours set - the hours only if
 *  the spread still passes with them (every base does today), else its
 *  own. */
function settle(def: HeroSpread, answers: Answers, font: FontChoice): HeroSpread {
  const weekStartsMonday = one(answers, "weekStart") !== "sunday";
  let out: HeroSpread = { ...def, layout: { ...def.layout, font, weekStartsMonday } as HeroSpread["layout"] };
  const layout = out.layout;
  if (layout.kind === "week" || layout.kind === "day") {
    const next = { ...out, layout: { ...layout, hours: hoursFrom(answers, layout.hours) } as HeroSpread["layout"] };
    if (valid(next)) out = next;
  }
  if (layout.kind === "month") {
    const dotted = one(answers, "todo") === "adhd" || one(answers, "hourly") === "lists";
    out = { ...out, layout: { ...layout, inside: dotted ? "dotted" : "lined" } };
  }
  return out;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The book's term: its first day from question 8, three months long, as
 *  Create offers. How long a printed book runs is chosen when ordering. */
function termFrom(answers: Answers, weekStartDay: 0 | 1, today: Date): { startISO: string; endISO: string } {
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const weekStart = new Date(day.getTime() - ((day.getUTCDay() - weekStartDay + 7) % 7) * 86_400_000);
  const picked = answers.details?.startDate;
  let start: Date;
  switch (one(answers, "start")) {
    case "this-week":
      start = weekStart;
      break;
    case "next-week":
      start = new Date(weekStart.getTime() + 7 * 86_400_000);
      break;
    case "pick":
      start = picked && /^\d{4}-\d{2}-\d{2}$/.test(picked) && !Number.isNaN(Date.parse(`${picked}T00:00:00Z`)) ? new Date(`${picked}T00:00:00Z`) : new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
      break;
    default:
      start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  }
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, start.getUTCDate() - 1));
  return { startISO: iso(start), endISO: iso(end) };
}

/** Question 16's rows, cleaned: a title, at least one day, and a start and
 *  end that differ - an end before the start is the next morning, a night
 *  shift. */
function scheduleFrom(answers: Answers): ScheduleEntry[] {
  if (one(answers, "schedule") !== "add") return [];
  const time = (t: unknown) => (typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);
  return (answers.details?.schedule ?? [])
    .map((e) => ({ title: String(e.title ?? "").trim().slice(0, 60), days: [...new Set((e.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))], from: time(e.from), to: time(e.to) }))
    .filter((e): e is ScheduleEntry => Boolean(e.title && e.days.length > 0 && e.from && e.to && e.from !== e.to))
    .slice(0, 8);
}

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Question 17's icons, from the book's first day. */
function dayIconsFrom(answers: Answers, startISO: string | null): DayIcon[] {
  if (!startISO) return [];
  const d = answers.details ?? {};
  const weekday = (n: unknown, fallback: number) => (Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6 ? (n as number) : fallback);
  const date = (n: unknown, fallback: number) => (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 28 ? (n as number) : fallback);
  const icons: DayIcon[] = [];
  for (const pick of answers.marks ?? []) {
    if (pick === "trash") icons.push({ id: "otter-trash", icon: "trash", start: startISO, rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[weekday(d.trashDay, 2)]}`, skips: [], name: "Trash" });
    if (pick === "recycling") icons.push({ id: "otter-recycling", icon: "recycling", start: startISO, rrule: `FREQ=WEEKLY;${d.recyclingEvery === 2 ? "INTERVAL=2;" : ""}BYDAY=${BYDAY[weekday(d.recyclingDay, 2)]}`, skips: [], name: "Recycling" });
    if (pick === "payday") {
      const rule = d.paydayEvery === "month" ? `FREQ=MONTHLY;BYMONTHDAY=${date(d.paydayDay, 1)}` : `FREQ=WEEKLY;${d.paydayEvery === "fortnight" ? "INTERVAL=2;" : ""}BYDAY=${BYDAY[weekday(d.paydayDay, 5)]}`;
      icons.push({ id: "otter-payday", icon: "coins", start: startISO, rrule: rule, skips: [], name: "Payday" });
    }
    if (pick === "bills") icons.push({ id: "otter-bills", icon: "envelope", start: startISO, rrule: `FREQ=MONTHLY;BYMONTHDAY=${date(d.billsDate, 1)}`, skips: [], name: "Bills due" });
  }
  return icons;
}

// ------------------------------------------------------------ the plan

const PART_ORDER: PlannerPart[] = ["front", "month", "week", "day"];
const PART_WORDS: Record<PlannerPart, string> = { front: "the front pages", month: "your month", week: "your week", day: "your day" };
const PAGE_WORDS: Record<PlannerPart, string> = { front: "front", month: "month", week: "week", day: "day" };

/** The whole planner the answers make. `font` is the reveal's choice; until
 *  then the base week's. */
export function planFromAnswers(input: Answers, font?: FontChoice, today = new Date()): OtterPlan {
  const answers = routedAnswers(input);
  const fills = one(answers, "fills") ?? "everything";
  const follow = one(answers, "follow") ?? "";
  const base = HERO_BY_KEY[BASE_BY_FOLLOW[fills]?.[follow] ?? WEEK_BASE[fills] ?? "base"] ?? HERO_BY_KEY.base;
  const chosenFont: FontChoice = font ?? base.layout.font;
  const pages = new Set(answers.pages?.length ? answers.pages : ["week"]);
  const inner: Array<"month" | "week" | "day"> = (["month", "week", "day"] as const).filter((p) => pages.has(p));
  const week = inner.includes("week") ? quizWeek(base, answers, fills) : null;
  // A recovery gratitude list is the gratitude: not two lists of it, from
  // "Feel calmer" or from the room asked for.
  const recoveryGratitude = (answers.practices ?? []).includes("recovery-gratitude-list");
  const wants = [...(FOLLOW[fills]?.[follow] ?? []), ...practiceWants(answers), ...trackWants(answers, fills), ...todoWants(answers), ...roomWants(answers), ...(week?.lifted ?? []), ...(FRONT_BY_FILLS[fills] ?? [])].filter(
    (w) => !(recoveryGratitude && w.slug === "gratitude-three"),
  );
  const notes: string[] = [];
  const followNote = FOLLOW_NOTES[fills]?.[follow];
  if (followNote) notes.push(followNote);

  // Each want to the first of its parts the book has and it makes sense on
  // (fits), as its variant there; what has none is left out, and said -
  // unless the same answer's module for another page is in (alt).
  const routed = new Map<PlannerPart, Want[]>(PART_ORDER.map((p) => [p, []]));
  const pageless: Want[] = [];
  const answered = new Set<string>();
  for (const w of wants) {
    const part = w.parts.find((p) => (p === "front" || (inner as PlannerPart[]).includes(p)) && fits(w, p));
    if (!part) {
      pageless.push(w);
      continue;
    }
    const variant = w.on?.[part];
    routed.get(part)!.push(variant ? { ...w, slug: variant.slug, props: variant.props } : w);
    if (w.alt) answered.add(w.alt);
  }
  for (const w of pageless) {
    const could = w.parts.filter((p) => fits(w, p));
    if (could.length > 0 && !(w.alt && answered.has(w.alt))) notes.push(`Your book has no ${could.map((p) => PAGE_WORDS[p]).join(" or ")} pages, so I left out ${nameOf(w)}.`);
  }

  const parts: OtterPart[] = [];
  const front: Want[] = [...routed.get("front")!];
  const adhdDay = HERO_BY_KEY["day-adhd"];
  const starts: Record<"month" | "week" | "day", () => HeroSpread> = {
    month: plainMonth,
    week: () => week!.def,
    // A busy brain's day is the ADHD day's: a brain dump, a done list.
    day: () => (one(answers, "todo") === "adhd" && adhdDay ? bare(adhdDay, "otter-day") : plainDay()),
  };
  for (const part of inner) {
    const start = settle(starts[part](), answers, chosenFont);
    const { def, left } = fillSpread(start, routed.get(part)!);
    parts.push({ part, spread: forTheHours(def, answers) });
    for (const w of left) {
      // Only what makes sense once waits at the front: a box to write or
      // draw in. A done list printed once is not a done list.
      if (PLAIN.has(w.slug)) {
        front.push(w);
        notes.push(`No room for ${nameOf(w)} on ${PART_WORDS[part]}, so I put one at the front.`);
      } else {
        notes.push(`No room for ${nameOf(w)} on ${PART_WORDS[part]}. Swap it in from the Modules panel if you want it.`);
      }
    }
  }
  const unique = front.filter((w, i) => front.findIndex((x) => x.slug === w.slug && JSON.stringify(x.props) === JSON.stringify(w.props)) === i);
  const { def: frontDef, left: dropped } = frontPages(unique, frontExtras(answers));
  if (frontDef) parts.unshift({ part: "front", spread: settle(frontDef, answers, chosenFont) });
  for (const w of dropped) notes.push(`I ran out of pages for ${nameOf(w)}. Add it from the Modules panel.`);

  const weekStartDay: 0 | 1 = one(answers, "weekStart") === "sunday" ? 0 : 1;
  const dated = one(answers, "dated") !== "undated";
  const term = dated ? termFrom(answers, weekStartDay, today) : { startISO: null, endISO: null };
  return {
    parts,
    weekStartDay,
    dated,
    startISO: term.startISO,
    endISO: term.endISO,
    font: chosenFont,
    guess: guessLine(answers),
    notes: [...new Set(notes)],
    schedule: dated ? scheduleFrom(answers) : [],
    dayIcons: dated ? dayIconsFrom(answers, term.startISO) : [],
  };
}

/** Its parts' names, for the reveal's tabs. */
export const OTTER_PART_NAMES: Record<PlannerPart, string> = { front: "Front pages", month: "Month", week: "Week", day: "Day" };
export { BELOW_ROW };

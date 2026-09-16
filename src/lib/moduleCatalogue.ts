// The module catalogue: every planner module Memari offers, as data.
//
// A hundred-odd named collections from the bullet-journal and Passion
// Planner communities, planner-insert shops and the niches this project
// set out to serve - and, sorted by what is actually DRAWN rather than by
// subject, almost all of them are one of ten primitives with a different
// set of words. A water tracker, a medication log, a salah tracker and a
// plant-watering chart are one row-by-column tracker with four label sets.
//
// So this file holds no geometry and no code. Each entry names a
// primitive, a place in the palette, the rhythm it repeats on, and its
// words. moduleRegistry.ts's `catalogue()` turns that into a real module -
// schema defaults, palette card, preview, the lot - and every one of them
// inherits how it is drawn from the primitive, which is what keeps a
// hundred modules from being a hundred things to maintain.
//
// TYPE-ONLY IMPORTS from the registry, deliberately. The registry imports
// this file's data at runtime, so a value import back would be a cycle;
// types are erased, so these are not.
import type { Cadence, Category } from "@/lib/moduleRegistry";

export type CatalogueEntry = {
  /** The ModuleType slug. Stable - it is a database key. */
  slug: string;
  /** Which primitive draws it. */
  primitive: string;
  /** Shown in the properties panel and as the palette card's caption. */
  name: string;
  category: Category;
  cadence: Cadence;
  /** Both the schema defaults and the palette preview - see `catalogue()`. */
  props: Record<string, unknown>;
  /** A shorter caption, where the full name does not fit a card. */
  paletteName?: string;
  rowSpan?: number;
  columnSpan?: number;
  /**
   * Whether the palette offers a card for it. Defaults to true.
   *
   * Retiring a module is NOT deleting its entry. A slug is a database key:
   * every ModuleInstance ever placed points at a ModuleType row by slug, so
   * removing the entry drops the row, and every planner that used it loses
   * a module. Setting this to false keeps the row, keeps the renderer, and
   * keeps existing instances drawing exactly as they did - it only stops
   * the palette offering a new one.
   */
  inPalette?: boolean;
};

// Shorthand for the four shapes that repeat, so an entry below reads as
// its content rather than as punctuation.
const table = (columns: string[], weights: number[], extra: Record<string, unknown> = {}) => ({
  columns,
  weights,
  ...extra,
});

/**
 * How wide a table has to be for its own column heads to fit at full size.
 *
 * Every column-table preset inherited the primitive's default of 6 columns
 * - a SIDEBAR - and 23 of the 27 of them could not print their own heads
 * there. A four-column spending log at 6 wide came out "Date | Item |
 * Categ… | Amo…", and at the narrowest sizes the heads vanish outright,
 * because truncateToWidth returns "" when not even one character plus the
 * ellipsis fits. So they dropped from the palette unreadable, and nothing
 * caught it: the house-style sweep only asks that a mark stay inside its
 * box, and a truncated head does.
 *
 * Derived rather than written down, for the usual reason - 23 hand-set
 * numbers would be correct today and wrong the first time someone renames
 * a column. It is the same arithmetic columnTable does, in the same terms:
 * a column gets `width * weight / totalWeight`, loses CELL_PADDING_PT on
 * each side, and its head is set at COLUMN_HEAD_FONT_PT.
 *
 * Solved for the full head size, not the 6pt and 5pt fallbacks below it.
 * Those exist for a box a user has deliberately made narrow; a module's
 * own default should not start out already using them.
 *
 * moduleCatalogue.test.mts checks the result against the real renderer,
 * because this is an estimate of a measurement - see SAFE_CHAR_WIDTH_RATIO
 * on why nothing here can measure a string.
 */
import { estimateTextWidthPx } from "@/lib/modules/textFit";

const CELL_PADDING_PX = (4 / 72) * 300;
const HEAD_FONT_PX = (7 / 72) * 300;
const CELL_PX = 75;
const BOX_INSET_PX = 6;

export function tableColumnSpan(columns: string[], weights?: number[]): number {
  const w = columns.map((_, c) => Math.max(0.0001, weights?.[c] ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  const inkWidth = columns.reduce((widest, head, c) => {
    const needed = estimateTextWidthPx(head, HEAD_FONT_PX) + CELL_PADDING_PX * 2;
    return Math.max(widest, (needed * total) / w[c]);
  }, 0);
  // Ink is the allocation less the box inset at each end.
  return Math.max(4, Math.ceil((inkWidth + BOX_INSET_PX * 2) / CELL_PX));
}

/**
 * How wide and how tall a prompted-lines module has to be for its own
 * questions.
 *
 * Same defect as the tables, in the other axis. Every prompted-lines
 * preset inherited a default of 8 rows, and a block is a whole cell for
 * the question plus `linesPerPrompt` cells to answer on - so an Examen
 * with five movements showed two of them and silently dropped the rest.
 * A module that prints 40% of its own content is not a smaller version of
 * itself; it is a different, wrong module.
 *
 * Width is the same arithmetic as a table's, with the prompt's own font
 * and labeledBox's horizontal inset: a stoic morning page at 6 columns
 * printed "What obstacle should I expec…".
 */
const PROMPT_FONT_PX = (8 / 72) * 300;
const PROMPT_PADDING_PX = (8 / 72) * 300;

export function promptedLinesSpan(
  prompts: string[],
  linesPerPrompt: number
): { columnSpan: number; rowSpan: number } {
  const lines = Math.max(1, Math.round(linesPerPrompt) || 1);
  const widest = prompts.reduce(
    (w, prompt) => Math.max(w, estimateTextWidthPx(prompt, PROMPT_FONT_PX) + PROMPT_PADDING_PX * 2),
    0
  );
  return {
    // At least a SIDEBAR COLUMN wide. The width above is what the prompt
    // needs, and the answer lines underneath need room too: "Today I am"
    // is a short prompt and derived a four-cell box - one inch to write a
    // whole affirmation on. Six cells is 1.5in, which is this planner's
    // own column and the width Erin Condren made the North American
    // standard, so it is the narrowest thing anyone writes a sentence in.
    columnSpan: Math.max(6, Math.ceil((widest + BOX_INSET_PX * 2) / CELL_PX)),
    // One cell of header, a whole block per prompt, and one more cell for
    // the box inset. The content area is 75*(rowSpan-1) MINUS 6: the final
    // band is 69px, which is the price lattice-aligned content pays and is
    // written up in moduleFrame's contentTopPx. Without that extra cell
    // every one of these came out exactly one prompt short - six pixels
    // short, silently, which is the whole reason that trade-off is
    // documented where it is.
    rowSpan: 2 + prompts.length * (1 + lines),
  };
}

export const CATALOGUE: CatalogueEntry[] = [
  // ─────────────────────────────────────────────────────────── Core planning
  {
    slug: "brain-dump",
    primitive: "labeled-box",
    name: "Brain Dump",
    category: "Core planning",
    cadence: "day",
    props: { heading: "Brain Dump", ruled: false },
    columnSpan: 6,
    rowSpan: 10,
  },
  {
    slug: "weekly-priorities",
    primitive: "todo-checklist",
    name: "Weekly Priorities",
    category: "Core planning",
    cadence: "week",
    paletteName: "Priorities",
    props: { heading: "Priorities", dayCount: 1 },
    columnSpan: 6,
    rowSpan: 11,
  },
  {
    slug: "ivy-lee-six",
    primitive: "todo-checklist",
    name: "Ivy Lee Six",
    category: "Core planning",
    cadence: "day",
    // Exactly six rows, ranked. The constraint IS the method, so the row
    // span is fixed rather than left to whatever the box is dragged to.
    props: { heading: "Six Tasks", dayCount: 1 },
    rowSpan: 7,
    columnSpan: 6,
  },
  {
    slug: "eisenhower-matrix",
    primitive: "axis-matrix",
    name: "Eisenhower Matrix",
    category: "Core planning",
    cadence: "week",
    paletteName: "Eisenhower",
    props: {
      heading: "Eisenhower",
      xLeft: "Not urgent",
      xRight: "Urgent",
      yTop: "Vital",
      yBottom: "Minor",
      quadrants: ["Schedule", "Do", "Delete", "Delegate"],
    },
  },
  {
    slug: "time-blocking-column",
    primitive: "habit-tracker",
    // Named for what it DRAWS. It is four day-parts across a week, not a
    // column of hourly slots - the slug promised the latter and delivered
    // the former. The slug itself is a database key and instances point at
    // it, so only the name moves.
    name: "Day Parts",
    category: "Core planning",
    cadence: "week",
    props: {
      heading: "Time Blocks",
      habits: ["Morning", "Midday", "Afternoon", "Evening"],
      columns: [],
    },
    columnSpan: 24,
    rowSpan: 6,
  },
  {
    slug: "monthly-review",
    primitive: "prompted-lines",
    name: "Monthly Review",
    category: "Core planning",
    cadence: "month",
    props: {
      heading: "Monthly Review",
      prompts: ["What worked?", "What did not?", "What changes next month?"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "future-log",
    primitive: "habit-tracker",
    name: "Future Log",
    category: "Core planning",
    cadence: "journal",
    props: {
      heading: "Future Log",
      habits: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
      columns: ["Dates", "Events", "Notes"],
    },
    rowSpan: 8,
  },
  {
    slug: "project-tracker",
    primitive: "column-table",
    name: "Project Tracker",
    category: "Core planning",
    cadence: "month",
    paletteName: "Projects",
    props: { heading: "Projects", ...table(["Project", "Next action", "Due", "Status"], [2, 3, 1, 1.2]) },
  },
  {
    slug: "someday-maybe",
    primitive: "todo-checklist",
    name: "Someday / Maybe",
    category: "Core planning",
    cadence: "journal",
    paletteName: "Someday",
    props: { heading: "Someday", dayCount: 1 },
    columnSpan: 6,
    rowSpan: 13,
  },
  {
    slug: "waiting-on",
    primitive: "column-table",
    name: "Waiting On",
    category: "Core planning",
    cadence: "week",
    props: { heading: "Waiting On", ...table(["Who", "What", "Since"], [1.4, 3, 1]) },
  },
  {
    slug: "daily-big-three",
    primitive: "todo-checklist",
    name: "Daily Big 3",
    category: "Core planning",
    cadence: "day",
    paletteName: "Big 3",
    props: { heading: "Big Three", dayCount: 1 },
    rowSpan: 4,
    columnSpan: 6,
  },
  {
    slug: "abc-priority-list",
    primitive: "column-table",
    name: "ABC Priority List",
    category: "Core planning",
    cadence: "day",
    paletteName: "ABC List",
    // A narrow code column beside the task - Franklin Covey's method.
    props: { heading: "Priorities", ...table(["", "Task", "Done"], [0.5, 5, 0.7]) },
  },
  {
    slug: "index",
    primitive: "column-table",
    name: "Index",
    category: "Core planning",
    cadence: "journal",
    // The one thing a printed book does that an app cannot.
    props: { heading: "Index", ...table(["Topic", "Page"], [5, 1]) },
    columnSpan: 9,
    rowSpan: 20,
  },

  // ──────────────────────────────────────────────────────────── Health & body
  {
    slug: "mood-tracker",
    primitive: "rating-strip",
    name: "Mood Tracker",
    category: "Health & body",
    cadence: "week",
    paletteName: "Mood",
    props: {
      heading: "Mood",
      items: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      scaleMin: 1,
      scaleMax: 5,
      shape: "circle",
    },
    rowSpan: 10,
  },
  {
    slug: "year-in-pixels",
    primitive: "habit-tracker",
    name: "Year in Pixels",
    category: "Health & body",
    cadence: "journal",
    paletteName: "Year in Pixels",
    props: {
      heading: "Year in Pixels",
      habits: Array.from({ length: 31 }, (_, i) => String(i + 1)),
      columns: ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    },
    columnSpan: 24,
    rowSpan: 33,
  },
  {
    // RETIRED FROM THE PALETTE - superseded by water-week below.
    //
    // Both print a week of water. This one spends 10 rows on it, a quarter
    // of the page; the icon strip does the same week in 2, and prints twice
    // the marks doing it. That alone would only make it the lesser of two
    // offers. What settles it is that the eight rows are labelled "Glass 1"
    // through "Glass 8", and a row that says which glass it is tells the
    // person drinking it nothing they do not already know. Take the labels
    // away and there is no water tracker left - just a blank 8-by-7 grid,
    // which is what the habit-tracker primitive already is.
    //
    // Kept registered, not deleted: see CatalogueEntry.inPalette.
    slug: "water-intake",
    primitive: "habit-tracker",
    name: "Water Intake",
    category: "Health & body",
    cadence: "week",
    paletteName: "Water",
    inPalette: false,
    props: {
      heading: "Water",
      habits: ["Glass 1", "Glass 2", "Glass 3", "Glass 4", "Glass 5", "Glass 6", "Glass 7", "Glass 8"],
      columns: [],
    },
    rowSpan: 10,
  },
  {
    slug: "sleep-log",
    primitive: "column-table",
    name: "Sleep Log",
    category: "Health & body",
    cadence: "week",
    paletteName: "Sleep",
    props: { heading: "Sleep", ...table(["Date", "Bed", "Woke", "Hrs", "Quality"], [1.2, 1, 1, 0.6, 1.5]) },
    columnSpan: 14,
  },
  {
    slug: "medication-log",
    primitive: "habit-tracker",
    name: "Medication Log",
    category: "Health & body",
    cadence: "week",
    paletteName: "Medication",
    props: { heading: "Medication", habits: ["Morning", "Midday", "Evening", "Night"], columns: [] },
    rowSpan: 6,
  },
  {
    slug: "symptom-tracker",
    primitive: "habit-tracker",
    name: "Symptom Tracker",
    category: "Health & body",
    cadence: "week",
    paletteName: "Symptoms",
    props: { heading: "Symptoms", habits: ["Pain", "Fatigue", "Nausea", "Headache", "Brain fog"], columns: [] },
    rowSpan: 8,
  },
  {
    // Eight rows, not the primitive's five. A mini-month with `markable`
    // on draws a box under every date, and that box is what turns a
    // calendar you read into one you fill in - so it needs the full six
    // week rows plus the weekday strip and heading. At five it printed
    // half the month and dropped the rest: 52 marks against 80.
    slug: "period-tracker",
    primitive: "mini-month",
    name: "Period Tracker",
    category: "Health & body",
    cadence: "month",
    paletteName: "Cycle",
    props: { year: 2026, month: 1, heading: "Cycle", markable: true },
    rowSpan: 8,
  },
  {
    slug: "measurements",
    primitive: "column-table",
    name: "Measurements",
    category: "Health & body",
    cadence: "month",
    props: { heading: "Measurements", ...table(["Date", "Weight", "Chest", "Waist", "Hips"], [1.3, 1, 1, 1, 1]) },
    columnSpan: 12,
  },
  {
    // Was a to-do list, and so shipped as an empty box with a heading.
    //
    // "Self-care" names a practice without saying what is in it, which is
    // the one thing a preset is FOR: a blank list under that heading is the
    // primitive with a word on top, and the person who wanted it is left
    // doing the part they wanted help with. todo-checklist cannot fix that
    // - it draws blank rows and has nowhere to put a suggestion - so the
    // fix is the other primitive. Named rows by a week is what this always
    // wanted to be, and it is a habit tracker.
    slug: "self-care-checklist",
    primitive: "habit-tracker",
    name: "Self-Care Tracker",
    category: "Health & body",
    cadence: "week",
    paletteName: "Self-Care",
    props: {
      heading: "Self-Care",
      // Six kinds of looking after yourself, short enough to read in the
      // name column and general enough to be worth printing: moving,
      // daylight, eating, sleep, other people, rest.
      habits: ["Moved", "Outside", "Ate well", "Slept 7h", "Reached out", "Rest"],
      columns: [],
    },
    rowSpan: 8,
  },
  {
    slug: "energy-pain-scale",
    primitive: "rating-strip",
    name: "Energy & Pain Scale",
    category: "Health & body",
    cadence: "day",
    paletteName: "Energy",
    props: {
      heading: "Today",
      items: ["Energy", "Pain", "Mood", "Sleep"],
      scaleMin: 1,
      scaleMax: 10,
      shape: "circle",
    },
  },

  // ───────────────────────────────────────────────────────────────────── Food
  {
    slug: "meal-planner",
    primitive: "habit-tracker",
    name: "Meal Planner",
    category: "Food",
    cadence: "week",
    paletteName: "Meals",
    props: { heading: "Meals", habits: ["Breakfast", "Lunch", "Dinner", "Snack"], columns: [] },
    rowSpan: 6,
  },
  {
    slug: "grocery-list",
    primitive: "todo-checklist",
    name: "Grocery List",
    category: "Food",
    cadence: "week",
    paletteName: "Groceries",
    props: { heading: "Groceries", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "macro-log",
    primitive: "column-table",
    name: "Calorie & Macro Log",
    category: "Food",
    cadence: "day",
    paletteName: "Macros",
    props: {
      heading: "Macros",
      ...table(["Meal", "Cals", "P", "C", "F"], [2.6, 1, 0.7, 0.7, 0.7], {
        totalsRow: true,
        totalsLabel: "Total",
      }),
    },
    columnSpan: 11,
  },
  {
    slug: "food-diary",
    primitive: "prompted-lines",
    name: "Food Diary",
    category: "Food",
    cadence: "day",
    props: {
      heading: "Food Diary",
      prompts: ["What did I eat?", "How did I feel after?"],
      linesPerPrompt: 3,
    },
  },
  {
    slug: "recipe-card",
    primitive: "prompted-lines",
    name: "Recipe Card",
    category: "Food",
    cadence: "journal",
    paletteName: "Recipe",
    props: {
      heading: "Recipe",
      prompts: ["Ingredients", "Method"],
      linesPerPrompt: 5,
    },
  },
  {
    slug: "recipes-to-try",
    primitive: "todo-checklist",
    name: "Recipes to Try",
    category: "Food",
    cadence: "journal",
    paletteName: "To Cook",
    props: { heading: "To Cook", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "restaurant-log",
    primitive: "column-table",
    name: "Restaurant Log",
    category: "Food",
    cadence: "journal",
    paletteName: "Eating Out",
    props: { heading: "Eating Out", ...table(["Place", "Dish", "Verdict"], [2, 2.4, 1.4]) },
  },
  {
    slug: "in-season-produce",
    primitive: "habit-tracker",
    name: "In Season",
    category: "Food",
    cadence: "journal",
    paletteName: "In Season",
    props: {
      heading: "In Season",
      habits: ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      columns: [""],
    },
    columnSpan: 18,
    rowSpan: 14,
  },

  // ────────────────────────────────────────────────────────────────── Fitness
  {
    slug: "workout-log",
    primitive: "column-table",
    name: "Workout Log",
    category: "Fitness",
    cadence: "day",
    paletteName: "Workout",
    props: { heading: "Workout", ...table(["Exercise", "Sets", "Reps", "Weight"], [3, 0.8, 0.8, 1.2]) },
  },
  {
    slug: "weekly-workout-plan",
    primitive: "habit-tracker",
    name: "Weekly Workout Plan",
    category: "Fitness",
    cadence: "week",
    paletteName: "Training",
    props: { heading: "Training", habits: ["Push", "Pull", "Legs", "Cardio", "Rest"], columns: [] },
    rowSpan: 7,
  },
  {
    slug: "step-counter",
    primitive: "progress-meter",
    name: "Step Counter",
    category: "Fitness",
    cadence: "month",
    paletteName: "Steps",
    props: { heading: "Steps", total: 31, milestoneEvery: 7, numbered: true },
  },
  {
    slug: "run-log",
    primitive: "column-table",
    name: "Run Log",
    category: "Fitness",
    cadence: "week",
    paletteName: "Runs",
    props: { heading: "Runs", ...table(["Date", "Distance", "Time", "Pace", "Feel"], [1.2, 1.2, 1, 1, 1.4]) },
    columnSpan: 13,
  },
  {
    slug: "progressive-overload",
    primitive: "column-table",
    name: "Progressive Overload",
    category: "Fitness",
    cadence: "month",
    paletteName: "Overload",
    props: { heading: "Overload", ...table(["Lift", "Wk 1", "Wk 2", "Wk 3", "Wk 4"], [2.2, 1, 1, 1, 1]) },
    columnSpan: 13,
  },
  {
    slug: "stretch-routine",
    primitive: "todo-checklist",
    name: "Stretch Routine",
    category: "Fitness",
    cadence: "week",
    paletteName: "Stretches",
    props: { heading: "Stretches", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "rest-day-marker",
    primitive: "habit-tracker",
    name: "Rest Days",
    category: "Fitness",
    cadence: "week",
    paletteName: "Rest",
    props: { heading: "Rest", habits: ["Rest day", "Active rest", "Slept 8h"], columns: [] },
    rowSpan: 5,
  },

  // ──────────────────────────────────────────────────────────────────── Money
  {
    slug: "spending-log",
    primitive: "column-table",
    name: "Spending Log",
    category: "Money",
    cadence: "week",
    paletteName: "Spending",
    props: {
      heading: "Spending",
      ...table(["Date", "Item", "Category", "Amount"], [1.2, 2.6, 1.6, 1.2], {
        totalsRow: true,
        totalsLabel: "Total",
      }),
    },
    columnSpan: 13,
  },
  {
    slug: "budget",
    primitive: "column-table",
    name: "Budget",
    category: "Money",
    cadence: "month",
    props: {
      heading: "Budget",
      ...table(["Category", "Planned", "Actual", "Diff"], [2.4, 1.2, 1.2, 1], {
        totalsRow: true,
        totalsLabel: "Total",
      }),
    },
    columnSpan: 13,
  },
  {
    slug: "savings-goal",
    primitive: "progress-meter",
    name: "Savings Goal",
    category: "Money",
    cadence: "journal",
    paletteName: "Savings",
    props: { heading: "Savings", total: 100, milestoneEvery: 10, numbered: true },
  },
  {
    slug: "debt-payoff",
    primitive: "progress-meter",
    name: "Debt Payoff",
    category: "Money",
    cadence: "journal",
    paletteName: "Payoff",
    props: { heading: "Payoff", total: 100, milestoneEvery: 10, numbered: true },
  },
  {
    slug: "bill-tracker",
    primitive: "habit-tracker",
    name: "Bill Payment Tracker",
    category: "Money",
    cadence: "journal",
    paletteName: "Bills",
    props: {
      heading: "Bills",
      habits: ["Rent", "Power", "Water", "Phone", "Internet"],
      columns: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
    },
    rowSpan: 8,
  },
  {
    // Eight rows, not the primitive's five. A mini-month with `markable`
    // on draws a box under every date, and that box is what turns a
    // calendar you read into one you fill in - so it needs the full six
    // week rows plus the weekday strip and heading. At five it printed
    // half the month and dropped the rest: 52 marks against 80.
    slug: "no-spend-challenge",
    primitive: "mini-month",
    name: "No-Spend Challenge",
    category: "Money",
    cadence: "month",
    paletteName: "No-Spend",
    props: { year: 2026, month: 1, heading: "No-Spend", markable: true },
    rowSpan: 8,
  },
  {
    slug: "subscription-audit",
    primitive: "column-table",
    name: "Subscription Audit",
    category: "Money",
    cadence: "journal",
    paletteName: "Subs",
    props: { heading: "Subscriptions", ...table(["Service", "Cost", "Renews", "Keep"], [2.4, 1, 1.2, 0.8]) },
    columnSpan: 12,
  },
  {
    slug: "zero-based-budget",
    primitive: "column-table",
    name: "Zero-Based Budget",
    category: "Money",
    cadence: "month",
    paletteName: "Zero-Based",
    props: {
      heading: "Every Pound",
      ...table(["Allocation", "Amount"], [4, 1.4], { totalsRow: true, totalsLabel: "Remaining" }),
    },
    columnSpan: 11,
  },

  // ─────────────────────────────────────────────────────────── Home & family
  {
    slug: "cleaning-rota",
    primitive: "habit-tracker",
    name: "Cleaning Rota",
    category: "Home & family",
    cadence: "week",
    paletteName: "Cleaning",
    props: {
      heading: "Cleaning",
      habits: ["Kitchen", "Bathroom", "Floors", "Laundry", "Bins"],
      columns: [],
    },
    rowSpan: 8,
  },
  {
    slug: "chore-chart",
    primitive: "habit-tracker",
    name: "Chore Chart",
    category: "Home & family",
    cadence: "week",
    paletteName: "Chores",
    // Person columns rather than day columns - the reason the tracker's
    // columns became configurable at all.
    props: {
      heading: "Chores",
      habits: ["Dishes", "Rubbish", "Tidy", "Pets", "Shopping"],
      columns: ["Me", "You", "Kid 1", "Kid 2"],
    },
    rowSpan: 8,
  },
  {
    slug: "home-maintenance",
    primitive: "column-table",
    name: "Home Maintenance",
    category: "Home & family",
    cadence: "journal",
    paletteName: "Maintenance",
    props: { heading: "Maintenance", ...table(["Task", "Last done", "Every", "Next"], [2.6, 1.3, 1.2, 1.3]) },
    columnSpan: 14,
  },
  {
    slug: "plant-care",
    primitive: "habit-tracker",
    name: "Plant Care",
    category: "Home & family",
    cadence: "week",
    paletteName: "Plants",
    props: { heading: "Plants", habits: ["Monstera", "Fern", "Succulents", "Herbs"], columns: [] },
    rowSpan: 7,
  },
  {
    slug: "birthday-calendar",
    primitive: "habit-tracker",
    name: "Birthday Calendar",
    category: "Home & family",
    cadence: "journal",
    paletteName: "Birthdays",
    props: {
      heading: "Birthdays",
      habits: ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      columns: [""],
    },
    columnSpan: 18,
    rowSpan: 14,
  },
  {
    slug: "packing-list",
    primitive: "todo-checklist",
    name: "Packing List",
    category: "Home & family",
    cadence: "journal",
    paletteName: "Packing",
    props: { heading: "Packing", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "gift-log",
    primitive: "column-table",
    name: "Gift Log",
    category: "Home & family",
    cadence: "journal",
    paletteName: "Gifts",
    props: { heading: "Gifts", ...table(["Person", "Idea", "Budget", "Got it"], [1.6, 2.4, 1.2, 0.9]) },
    columnSpan: 13,
  },
  {
    slug: "pet-care",
    primitive: "habit-tracker",
    name: "Pet Care",
    category: "Home & family",
    cadence: "week",
    paletteName: "Pets",
    props: { heading: "Pets", habits: ["Fed am", "Fed pm", "Walk", "Meds", "Water"], columns: [] },
    rowSpan: 8,
  },

  // ────────────────────────────────────────────────────── Philosophy & faith
  //
  // The wording below is either traditional - the Examen's five movements,
  // SOAP, Lectio Divina, structures centuries old and nobody's property -
  // or plainly descriptive. It is deliberately NOT lifted from a modern
  // curated set: Five Minute Journal, Panda Planner and Daily Stoic prompt
  // sets are protected even though the practices behind them are ancient.
  //
  // The set-text modules ship EMPTY for the same reason one level up. The
  // originals are public domain; the translations people actually want -
  // Hays' Meditations, Mitchell's Tao Te Ching, ESV, NIV, Sahih
  // International - are not, and Lulu ships internationally. A user can
  // paste their own. A curated pack is a later layer, once clearance is
  // worth paying for.
  {
    slug: "stoic-morning-page",
    primitive: "prompted-lines",
    name: "Stoic Morning Page",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Stoic AM",
    props: {
      heading: "Morning",
      prompts: ["What is in my control today?", "What obstacle should I expect?", "Which virtue will I need?"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "stoic-evening-review",
    primitive: "prompted-lines",
    name: "Stoic Evening Review",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Stoic PM",
    props: {
      heading: "Evening",
      prompts: ["What did I do badly?", "What did I do well?", "What did I leave undone?"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "dichotomy-of-control",
    primitive: "column-table",
    name: "Dichotomy of Control",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Control",
    props: {
      heading: "Control",
      ...table(["Up to me", "Not up to me"], [1, 1]),
    },
  },
  {
    slug: "memento-mori",
    primitive: "progress-meter",
    name: "Memento Mori",
    category: "Philosophy & faith",
    cadence: "journal",
    paletteName: "Memento Mori",
    // Weeks, not days - a box a week is the form this is always drawn in.
    props: { heading: "Weeks", total: 52, milestoneEvery: 13, numbered: true },
  },
  {
    slug: "negative-visualisation",
    primitive: "prompted-lines",
    name: "Negative Visualisation",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Premeditatio",
    props: {
      heading: "Premeditatio",
      prompts: ["What might I lose?", "How would I meet it?"],
      linesPerPrompt: 3,
    },
  },
  {
    slug: "tao-daily-verse",
    primitive: "prompted-lines",
    name: "Tao Reflection",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Tao",
    props: {
      heading: "Tao",
      prompts: ["The passage", "What it says plainly", "What it says underneath"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "wu-wei-reflection",
    primitive: "prompted-lines",
    name: "Wu Wei Reflection",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Wu Wei",
    props: {
      heading: "Wu Wei",
      prompts: ["Where did I force something?", "What would yielding have looked like?"],
      linesPerPrompt: 3,
    },
  },
  {
    slug: "examen",
    primitive: "prompted-lines",
    name: "Examen",
    category: "Philosophy & faith",
    cadence: "day",
    // The five movements, in their traditional order.
    props: {
      heading: "Examen",
      prompts: ["Gratitude", "Ask for light", "Review the day", "Ask forgiveness", "Resolve for tomorrow"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "soap-study",
    primitive: "prompted-lines",
    name: "SOAP Study",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "SOAP",
    props: {
      heading: "SOAP",
      prompts: ["Scripture", "Observation", "Application", "Prayer"],
      linesPerPrompt: 3,
    },
    columnSpan: 8,
  },
  {
    slug: "verse-mapping",
    primitive: "prompted-lines",
    name: "Verse Mapping",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Verse Map",
    props: {
      heading: "Verse Map",
      prompts: ["The verse", "Other translations", "Cross references", "What it asks of me"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "prayer-list",
    primitive: "todo-checklist",
    name: "Prayer List",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Prayers",
    props: { heading: "Prayers", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "sermon-notes",
    primitive: "prompted-lines",
    name: "Sermon Notes",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Sermon",
    props: {
      heading: "Sermon",
      prompts: ["Speaker and passage", "Main points", "Application"],
      linesPerPrompt: 3,
    },
  },
  {
    slug: "salah-tracker",
    primitive: "habit-tracker",
    name: "Salah Tracker",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Salah",
    // Five fixed prayers as the COLUMNS and days as the rows - the
    // transpose of a habit tracker, and the case that made the tracker's
    // columns configurable at all.
    props: {
      heading: "Salah",
      habits: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      columns: ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"],
    },
    rowSpan: 9,
  },
  {
    slug: "ramadan-log",
    primitive: "habit-tracker",
    name: "Ramadan Log",
    category: "Philosophy & faith",
    cadence: "month",
    paletteName: "Ramadan",
    props: {
      heading: "Ramadan",
      habits: Array.from({ length: 30 }, (_, i) => String(i + 1)),
      columns: ["Fast", "Taraweeh", "Quran", "Sadaqah", "Dhikr"],
    },
    columnSpan: 18,
    rowSpan: 32,
  },
  {
    slug: "quran-reading-plan",
    primitive: "progress-meter",
    name: "Quran Reading Plan",
    category: "Philosophy & faith",
    cadence: "journal",
    paletteName: "Quran",
    // Thirty juz, one a day through Ramadan.
    props: { heading: "Juz", total: 30, milestoneEvery: 10, numbered: true },
  },
  {
    slug: "metta-practice",
    primitive: "prompted-lines",
    name: "Metta Practice",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Metta",
    props: {
      heading: "Metta",
      prompts: ["Myself", "Someone I love", "Someone neutral", "Someone difficult", "All beings"],
      linesPerPrompt: 1,
    },
  },
  {
    slug: "meditation-minutes",
    primitive: "progress-meter",
    name: "Meditation Minutes",
    category: "Philosophy & faith",
    cadence: "month",
    paletteName: "Sitting",
    props: { heading: "Sitting", total: 31, milestoneEvery: 7, numbered: true },
  },
  {
    slug: "mussar-trait",
    primitive: "habit-tracker",
    name: "Mussar Trait",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Middah",
    props: { heading: "Middah", habits: ["Noticed", "Practised", "Reflected"], columns: [] },
    rowSpan: 5,
  },
  {
    slug: "lectio-divina",
    primitive: "prompted-lines",
    name: "Lectio Divina",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Lectio",
    // Four movements, fixed by tradition.
    props: {
      heading: "Lectio Divina",
      prompts: ["Lectio - read", "Meditatio - reflect", "Oratio - respond", "Contemplatio - rest"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "omer-counter",
    primitive: "progress-meter",
    name: "Omer Counter",
    category: "Philosophy & faith",
    cadence: "journal",
    paletteName: "Omer",
    // Exactly 49, counted in weeks of seven. The count IS the practice.
    props: { heading: "Omer", total: 49, milestoneEvery: 7, numbered: true },
  },
  {
    slug: "dhikr-counter",
    primitive: "progress-meter",
    name: "Dhikr Counter",
    category: "Philosophy & faith",
    cadence: "day",
    paletteName: "Dhikr",
    props: { heading: "Dhikr", total: 33, milestoneEvery: 11, numbered: false },
  },
  {
    slug: "parashah-study",
    primitive: "prompted-lines",
    name: "Parashah Study",
    category: "Philosophy & faith",
    cadence: "week",
    paletteName: "Parashah",
    props: {
      heading: "Parashah",
      prompts: ["This week's portion", "What stood out", "What it asks of me"],
      linesPerPrompt: 2,
    },
  },

  // ────────────────────────────────────────────────────── Self-help & growth
  {
    slug: "gratitude-three",
    primitive: "labeled-box",
    name: "Three Good Things",
    category: "Self-help & growth",
    cadence: "day",
    paletteName: "Gratitude",
    props: { heading: "Grateful For", ruled: true },
    columnSpan: 6,
    rowSpan: 5,
  },
  {
    slug: "daily-affirmation",
    primitive: "prompted-lines",
    name: "Daily Affirmation",
    category: "Self-help & growth",
    cadence: "day",
    paletteName: "Affirmation",
    props: { heading: "Today", prompts: ["Today I am"], linesPerPrompt: 2 },
  },
  {
    slug: "thirty-day-challenge",
    primitive: "progress-meter",
    name: "30-Day Challenge",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "30 Days",
    props: { heading: "30 Days", total: 30, milestoneEvery: 10, numbered: true },
  },
  {
    slug: "ninety-day-sprint",
    primitive: "progress-meter",
    name: "90-Day Sprint",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "90 Days",
    props: { heading: "90 Days", total: 90, milestoneEvery: 10, numbered: true },
  },
  {
    slug: "smart-goal",
    primitive: "prompted-lines",
    name: "SMART Goal",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "SMART",
    props: {
      heading: "SMART Goal",
      prompts: ["Specific", "Measurable", "Achievable", "Relevant", "Time-bound"],
      linesPerPrompt: 1,
    },
    columnSpan: 10,
  },
  {
    slug: "values-list",
    primitive: "labeled-box",
    name: "Values",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "Values",
    props: { heading: "Values", ruled: true },
    columnSpan: 6,
    rowSpan: 10,
  },
  {
    slug: "habit-stacking",
    primitive: "column-table",
    name: "Habit Stacking",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "Stacking",
    props: { heading: "Habit Stacking", ...table(["After I", "I will"], [1, 1]) },
    columnSpan: 12,
  },
  {
    slug: "weekly-reflection",
    primitive: "prompted-lines",
    name: "Weekly Reflection",
    category: "Self-help & growth",
    cadence: "week",
    paletteName: "Reflection",
    props: {
      heading: "Reflection",
      prompts: ["What went well?", "What did not?", "What next week?"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "lessons-learned",
    primitive: "labeled-box",
    name: "Lessons Learned",
    category: "Self-help & growth",
    cadence: "month",
    paletteName: "Lessons",
    props: { heading: "Lessons", ruled: true },
    columnSpan: 6,
    rowSpan: 8,
  },
  {
    slug: "comfort-zone-challenge",
    primitive: "todo-checklist",
    name: "One Brave Thing a Month",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "Brave Thing",
    props: { heading: "One Brave Thing" },
    columnSpan: 6,
    rowSpan: 13,
  },

  // ────────────────────────────────────────────────────── Creative & leisure
  {
    slug: "books-read",
    primitive: "column-table",
    name: "Books Read",
    category: "Creative & leisure",
    cadence: "journal",
    paletteName: "Books",
    props: { heading: "Books", ...table(["Title", "Author", "Rating", "Done"], [3, 2, 1, 0.9]) },
  },
  {
    slug: "reading-progress",
    primitive: "progress-meter",
    name: "Reading Progress",
    category: "Creative & leisure",
    cadence: "journal",
    paletteName: "Reading",
    props: { heading: "Books This Year", total: 24, milestoneEvery: 6, numbered: true },
  },
  {
    slug: "watchlist",
    primitive: "todo-checklist",
    name: "Watchlist",
    category: "Creative & leisure",
    cadence: "journal",
    props: { heading: "Watchlist", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "listening-log",
    primitive: "column-table",
    name: "Listening Log",
    category: "Creative & leisure",
    cadence: "month",
    paletteName: "Listening",
    props: { heading: "Listening", ...table(["Album", "Artist", "Rating"], [2.6, 2.2, 1]) },
  },
  {
    slug: "sketch-box",
    primitive: "labeled-box",
    name: "Sketch Box",
    category: "Creative & leisure",
    cadence: "week",
    paletteName: "Sketch",
    props: { heading: "Sketch", ruled: false },
    columnSpan: 12,
    rowSpan: 12,
  },
  {
    slug: "writing-prompt",
    primitive: "prompted-lines",
    name: "Writing Prompt",
    category: "Creative & leisure",
    cadence: "day",
    paletteName: "Writing",
    props: {
      heading: "Writing",
      prompts: ["The prompt", "Where it went"],
      linesPerPrompt: 5,
    },
  },
  {
    slug: "language-study",
    primitive: "column-table",
    name: "Language Study",
    category: "Creative & leisure",
    cadence: "week",
    paletteName: "Vocab",
    props: { heading: "Vocabulary", ...table(["Word", "Meaning", "In a sentence"], [1.4, 1.6, 3]) },
    columnSpan: 14,
  },
  {
    slug: "skill-practice",
    primitive: "habit-tracker",
    name: "Skill Practice",
    category: "Creative & leisure",
    cadence: "week",
    paletteName: "Practice",
    props: { heading: "Practice", habits: ["Warm-up", "Technique", "Repertoire", "Free play"], columns: [] },
    rowSpan: 7,
  },

  // ───────────────────────────────────────────────────────────────── Recovery
  {
    slug: "step-ten-inventory",
    primitive: "prompted-lines",
    name: "Step Ten Inventory",
    category: "Recovery",
    cadence: "day",
    paletteName: "Daily Inventory",
    props: {
      heading: "Daily Inventory",
      prompts: ["Resentful", "Selfish", "Dishonest", "Afraid"],
      linesPerPrompt: 2,
    },
  },
  {
    slug: "step-four-inventory",
    primitive: "column-table",
    name: "Step 4 Inventory",
    category: "Recovery",
    cadence: "journal",
    paletteName: "Step 4",
    props: { heading: "Resentments", ...table(["Person", "Cause", "Affects my", "My part"], [1.5, 2.2, 1.6, 1.8]) },
    columnSpan: 14,
  },
  {
    slug: "recovery-gratitude-list",
    primitive: "todo-checklist",
    name: "Gratitude List",
    category: "Recovery",
    cadence: "day",
    paletteName: "Gratitude List",
    props: { heading: "Grateful Today", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "sponsor-contact-log",
    primitive: "column-table",
    name: "Sponsor Contact Log",
    category: "Recovery",
    cadence: "week",
    paletteName: "Sponsor",
    props: { heading: "Contact", ...table(["Date", "Called", "Spoke", "Note"], [1.2, 0.9, 0.9, 2.6]) },
  },
  {
    slug: "meeting-log",
    primitive: "column-table",
    name: "Meeting Log",
    category: "Recovery",
    cadence: "week",
    paletteName: "Meetings",
    // The signature column is what makes this a printed page rather than
    // an app - a court card needs a wet signature.
    props: { heading: "Meetings", ...table(["Date", "Group", "Format", "Signature"], [1.2, 2, 1.2, 2]) },
    columnSpan: 14,
  },

  // ─────────────────────────────────────────────────────────────────── Travel
  {
    slug: "trip-itinerary",
    primitive: "column-table",
    name: "Trip Itinerary",
    category: "Travel",
    cadence: "journal",
    paletteName: "Itinerary",
    props: { heading: "Itinerary", ...table(["Day", "Where", "What", "Booked"], [0.9, 1.8, 2.8, 0.9]) },
  },
  {
    slug: "places-been",
    primitive: "todo-checklist",
    name: "Places to Go",
    category: "Travel",
    cadence: "journal",
    paletteName: "Places",
    props: { heading: "Places", dayCount: 1 },
    columnSpan: 6,
  },
  {
    slug: "water-week",
    primitive: "icon-strip",
    name: "Water (week)",
    category: "Health & body",
    cadence: "week",
    paletteName: "Water",
    props: { heading: "Water", icon: "droplet", count: 8 },
  },
  {
    slug: "focus-blocks",
    primitive: "icon-strip",
    name: "Focus Blocks",
    category: "Self-help & growth",
    cadence: "day",
    paletteName: "Focus",
    // groups: 1 is the sidebar case - one run of marks for something that
    // is not a day. See IconStripConfig.groups.
    props: { heading: "Focus blocks", icon: "flame", count: 10 },
    columnSpan: 6,
  },
  {
    slug: "water-plants",
    primitive: "icon-strip",
    name: "Water Plants",
    category: "Home & family",
    cadence: "week",
    paletteName: "Water Plants",
    // Four a day, not eight: a potted plant is six strokes converging in a
    // small square, and at eight a day across a week they merge. See the
    // catalogue proof, where the 1-column column is the one that tells.
    props: { heading: "Water plants", icon: "plant", count: 4 },
  },
  {
    slug: "month-tracker",
    primitive: "habit-tracker",
    name: "Monthly Tracker",
    category: "General",
    cadence: "month",
    paletteName: "Month Tracker",
    // TRANSPOSED on purpose. The conventional monthly grid is 31 COLUMNS,
    // and 31 quarter-inch columns is 7.75in against our 6in of content -
    // it cannot fit, and the usual fix (shrinking cells) is the single
    // most complained-about failure in printed trackers, because a cell
    // under about 0.15in cannot be written in. 31 ROWS of the 36 fits with
    // room to spare and keeps every cell a full quarter inch.
    //
    // Needs 18 columns: below about 14 the tracker switches to its compact
    // layout, where a row is a name row plus a square and 31 of them do
    // not fit.
    props: {
      heading: "Month",
      habits: Array.from({ length: 31 }, (_, i) => String(i + 1)),
      columns: ["No spend", "Moved", "Outdoors", "No alcohol", "Early night"],
    },
    columnSpan: 18,
    rowSpan: 33,
  },
  {
    slug: "week-day-boxes",
    primitive: "habit-tracker",
    name: "Week in Boxes",
    category: "Core planning",
    cadence: "week",
    paletteName: "Day Boxes",
    // Seven named rows and one blank column to write in - the horizontal
    // weekly that sits opposite a dashboard page. One column rather than
    // none: an empty column list falls back to a week of day letters.
    props: {
      heading: "This Week",
      habits: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      columns: [""],
    },
    columnSpan: 18,
    rowSpan: 9,
  },
  {
    slug: "password-log",
    primitive: "column-table",
    name: "Password Log",
    category: "Core planning",
    cadence: "journal",
    paletteName: "Passwords",
    props: { heading: "Passwords", ...table(["Site", "Username", "Hint"], [1.4, 1.2, 1]) },
    columnSpan: 7,
    rowSpan: 16,
  },
  {
    slug: "pros-and-cons",
    primitive: "column-table",
    name: "Pros and Cons",
    category: "Self-help & growth",
    cadence: "journal",
    paletteName: "Pros / Cons",
    props: { heading: "Pros and Cons", ...table(["For", "Against"], [1, 1]) },
    columnSpan: 12,
  },
  {
    slug: "travel-budget",
    primitive: "column-table",
    name: "Travel Budget",
    category: "Travel",
    cadence: "journal",
    paletteName: "Trip Budget",
    props: {
      heading: "Trip Budget",
      ...table(["Item", "Planned", "Actual"], [3, 1.2, 1.2], { totalsRow: true, totalsLabel: "Total" }),
    },
    columnSpan: 12,
  },
  {
    slug: "country-map",
    primitive: "habit-tracker",
    name: "Countries Visited",
    category: "Travel",
    cadence: "journal",
    paletteName: "Countries",
    props: {
      heading: "Countries Visited",
      habits: ["Africa", "Asia", "Europe", "N America", "S America", "Oceania"],
      columns: [""],
    },
    columnSpan: 18,
    rowSpan: 8,
  },
  {
    slug: "trip-journal",
    primitive: "prompted-lines",
    name: "Trip Journal",
    category: "Travel",
    cadence: "day",
    paletteName: "Trip Diary",
    props: {
      heading: "Today",
      prompts: ["Where we went", "Best moment", "Worth remembering"],
      linesPerPrompt: 2,
    },
  },
];

// A table's default width is its own heads' requirement, unless the entry
// asked for something wider. Applied here rather than repeated on 27
// entries, and only where the entry has not stated a span itself.
for (const entry of CATALOGUE) {
  if (entry.primitive === "column-table") {
    const props = entry.props as { columns?: string[]; weights?: number[] };
    if (!props.columns) continue;
    entry.columnSpan = Math.max(entry.columnSpan ?? 0, tableColumnSpan(props.columns, props.weights));
  } else if (entry.primitive === "prompted-lines") {
    const props = entry.props as { prompts?: string[]; linesPerPrompt?: number };
    if (!props.prompts) continue;
    const needed = promptedLinesSpan(props.prompts, props.linesPerPrompt ?? 1);
    entry.columnSpan = Math.max(entry.columnSpan ?? 0, needed.columnSpan);
    entry.rowSpan = Math.max(entry.rowSpan ?? 0, needed.rowSpan);
  }
}

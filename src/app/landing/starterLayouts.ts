// THE LAYOUTS GALLERY'S CONTENTS (memari.studio/layouts, 2026-10-08): weeks,
// months, days and pages of modules to start from, made by us so that the
// first people to use Memari have something to begin with rather than an
// empty page.
//
// Every one is a spread the landing page's journal turns through
// (heroSpreads.ts), so what is seen there is what you get - shown WITHOUT
// the people: no name, nothing written in. "Use this" makes the layout,
// empty (planner/archetypeWeek.ts), so that is what the gallery shows.
// Andrew, the same day: "you only did weeks and not other sample layouts
// like months or full modules, didnt even vary or turn off increments" -
// the first version offered only the people's weeks, because only those
// could be made then. Now every kind can.
//
// Each `line` is checked against the spread's own modules and hours in
// heroSpreads.ts / heroExtras.ts / archetypes.ts. Change one there, change
// its line here.
//
// Never a count of how many people used one, and never a maker's name,
// until there are real ones (Andrew, 2026-10-08: "Popular, no credit").
// GALLERY_LABEL is the one word over them; the research he commissioned the
// same day recommends one that says we made them ("Starter layouts"), which
// is his to choose.

import { HERO_BY_KEY } from "./heroSpreads";
import { spreadPlacements } from "./spreads";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { describeModule } from "@/lib/moduleDescriptions";

export const GALLERY_LABEL = "Popular";

export type StarterKind = "week" | "month" | "day" | "pages";

export type Starter = {
  /** The spread's key: heroSpreads', and /app/from/<key>'s. */
  key: string;
  kind: StarterKind;
  title: string;
  /** What is on it, in a sentence. */
  line: string;
  /** How its hours are set, where they differ from the template's. */
  hours?: string;
  /** The prebuilt planner it was made for (plannerTemplates.ts): listed
   *  there rather than among the weeks and months, still usable alone. */
  planner?: string;
};

const W = (key: string, title: string, line: string, hours?: string): Starter => ({ key, kind: "week", title, line, hours });

/** In the order shown, broadest first. Faith and recovery are left out while
 *  they are held for a read-through (archetypes.ts, `held`). */
const ALL: Starter[] = [
  W("student", "Student", "Every assignment with its class and due date, an exams box, a bedtime chart for the truth about exam week, and focus blocks to colour in."),
  W("nine-to-five", "9 to 5", "An Eisenhower matrix to sort the week, the day split into parts, what you are waiting on, notes for your one to one, and your days off counted."),
  W("classic", "Classic", "Half-hour rows from 5:30 in the morning to 11:30 at night, a notes box and a to-do list. The plainest week, to build your own on."),
  W("rapid-log", "Rapid log", "No hours: dotted days to list tasks, events and notes as they come, with priorities, a mood chart, habits and a done list.", "Increments off, dotted"),
  W("focus", "Deep work", "Three things a day, a brain dump, someday and maybe, a to-do list and an Eisenhower matrix.", "By the hour, 6:00 to 24:00"),
  W("nurse", "Shift work", "Built round nights: a sleep log and bedtime chart, rest days marked, meals planned ahead, water counted, and a self-care check."),
  W("teacher", "Teacher", "Each period's topic and materials, and the grading pile by class with the day each goes back."),
  W("parent", "Parent", "Meals and the grocery list, chores shared out, gifts to buy, a to-do list, and the things the kids said."),
  W("home", "Home", "Short hours leave room for meals, groceries, a cleaning rota, chores, pet care and the plants.", "By the hour in short rows, 6 AM to 10 PM"),
  W("adhd", "ADHD", "Three things a day, a brain dump, a done list that counts what you finished, focus blocks, and a dopamine menu for when you are stuck."),
  W("maker", "Maker", "Orders and the day each ships, projects with their next step, what to post when, and what it all cost."),
  W("wellness", "Wellness", "Priorities, a mood tracker, three good things, habits, meals and the plants to water."),
  W("fitness", "Running", "Runs and lifts logged, the week's training plan, progressive overload, stretches, and energy and bedtime beside them."),
  W("training", "Training and recovery", "The week's plan, workouts and runs logged, stretches, an energy and pain scale and a sleep log."),
  W("money", "Money", "A no-spend challenge, groceries, every purchase, a budget, and bars to fill for savings and debt."),
  W("philosophy", "Stoic", "Morning and evening Stoic pages, the dichotomy of control, Franklin's thirteen virtues and a commonplace book."),
  W("chronic-illness", "Chronic illness", "Spoons to spend, energy and pain on one scale, symptoms through the day, and every dose ticked off."),
  W("lisbon", "Travel", "Blank days for wherever the day goes, with a packing list, an itinerary, a budget and a sketch box.", "Increments off, blank"),
  W("creative", "Creative", "A daily affirmation, a watchlist, writing prompts, a sketch box and a to-do list."),
  { key: "month-family", kind: "month", title: "Family month", line: "Lined days for the family calendar, with notes, a chore chart, gifts to buy, a yoga log and the things the kids said." },
  { key: "month-money", kind: "month", title: "Money month", line: "A no-spend calendar, a budget, a zero-based budget, a subscription audit, and bars for savings and debt." },
  { key: "month-student", kind: "month", title: "Student month", line: "Dotted days, a thirty-day exam countdown, a mood chart for the month, a climbing log, the albums you listened to and lessons learned." },
  { key: "day-adhd", kind: "day", title: "ADHD day", line: "A page a day: the hours beside three things for today, a brain dump, a done list, focus blocks, a to-do list and a dopamine menu.", hours: "Half hours, 7 AM to 10 PM" },
  { key: "day-stoic", kind: "day", title: "Stoic day", line: "A page a day: the hours beside the morning and evening Stoic pages, the dichotomy of control, memento mori and a commonplace book.", hours: "By the hour in short rows, 6 AM to 10 PM" },
  { key: "pages-trip", kind: "pages", title: "Trip pages", line: "Two pages for a trip: an itinerary, a packing list, a budget, places to go, where you ate, a trip journal and a sketch box." },
  { key: "pages-reading", kind: "pages", title: "Reading pages", line: "Books read, reading progress, albums, a watchlist and a commonplace book." },
  { key: "pages-kitchen", kind: "pages", title: "Kitchen pages", line: "Meals for the week, groceries, recipes to try, a recipe card and sourdough starter feedings." },
  // The prebuilt planners' parts (plannerSpreads.ts).
  { key: "pages-irregular-income", kind: "pages", planner: "irregular-income", title: "Irregular income pages", line: "A baseline month, a rule for when there's extra, sinking funds, irregular bills ninety days ahead, subscriptions, tax set aside by the quarter, and bars for the buffer and debt." },
  { key: "month-irregular-income", kind: "month", planner: "irregular-income", title: "Irregular income month", line: "Lined days for paydays and bills, every payment logged, two paychecks budgeted, what to set aside, the buffer, and a month review." },
  { key: "pages-adhd", kind: "pages", planner: "adhd", title: "ADHD pages", line: "A dopamine menu, what to do when you're stuck, someday and maybe, things not to forget, a dotted brain dump and your projects." },
  { key: "month-adhd", kind: "month", planner: "adhd", title: "ADHD month", line: "Dotted days, stars that add up for each week, a brain dump, your projects, what helped, wins and a done list." },
  { key: "day-adhd-dots", kind: "day", planner: "adhd", title: "ADHD day", line: "A page a day: three things, what you actually got done and tomorrow down the side, the day as open dots, focus blocks and a short list.", hours: "Increments off, dotted" },
  { key: "week-irregular-income", kind: "week", planner: "irregular-income", title: "Irregular income week", line: "What is safe to spend, bills due, groceries, every purchase, what came in, and bars for the buffer and debt." },
];

export const STARTERS: Starter[] = ALL.filter((s) => HERO_BY_KEY[s.key] && !HERO_BY_KEY[s.key].held);

export const STARTER_BY_KEY: Record<string, Starter> = Object.fromEntries(STARTERS.map((s) => [s.key, s]));

/** The ones the gallery lists among the weeks, months, days and pages: not
 *  a planner's parts, which are shown with their planner. */
export const LISTED_STARTERS: Starter[] = STARTERS.filter((s) => !s.planner);

/** The few the landing page shows, one of each kind, ending in "View more"
 *  (2026-10-08: "there should be less layouts and just say view more at
 *  end"). */
export const HOME_KEYS = ["student", "month-family", "day-adhd", "rapid-log", "pages-trip", "nine-to-five"].filter((key) => STARTER_BY_KEY[key]);

export const KIND_SECTIONS: Array<[kind: StarterKind, heading: string, lede: string]> = [
  ["week", "Weeks", "A spread for every week: the hours across both pages, and everything around them. Some set the hours differently, by the hour, a shorter day, or no hours at all."],
  ["month", "Months", "The month's calendar across a spread, with room under it for the things you track by the month."],
  ["day", "Days", "A page for every day, its hours beside the day's own lists. Shown as two facing days."],
  ["pages", "Pages", "Pages of modules and nothing else, for the front of a journal: a trip, a reading year, the kitchen."],
];

/** "Use this week", "Use these pages". */
export function actionLabel(kind: StarterKind): string {
  return kind === "pages" ? "Use these pages" : `Use this ${kind}`;
}

/** What "Use this" makes, said plainly. */
export function makesWhat(kind: StarterKind): string {
  switch (kind) {
    case "month":
      return "Opens a monthly journal of your own with this as its month spread, from next month for three months.";
    case "day":
      return "Opens a daily journal of your own with this as its page for every day, from next month for three months.";
    case "pages":
      return "Opens a weekly journal of your own with these two pages at the front, from next month for three months.";
    default:
      return "Opens a weekly journal of your own with this as its weekly spread, from next month for three months.";
  }
}

export type ModuleSummary = { slug: string; name: string; description: string };

function summary(slug: string): ModuleSummary {
  const info = PALETTE_INFO_BY_SLUG.get(slug);
  return { slug, name: info?.name ?? slug, description: describeModule(slug) ?? "" };
}

/** The modules on a layout, in the order they are placed: each kind once,
 *  except a note box or a plain table, which is listed by its own heading -
 *  "Exams" and "After Midterms" are two different things on the page, and
 *  so are a baseline month and a tax set-aside. */
export function modulesOf(key: string): ModuleSummary[] {
  const spread = HERO_BY_KEY[key];
  if (!spread) return [];
  const seen = new Set<string>();
  const out: ModuleSummary[] = [];
  for (const slot of spreadPlacements(spread)) {
    if (slot.locked) continue;
    const named = slot.slug === "labeled-box" || slot.slug === "column-table";
    const heading = named && typeof slot.props?.heading === "string" && slot.props.heading ? slot.props.heading : null;
    const id = heading ? `${slot.slug}:${heading.toLowerCase()}` : slot.slug;
    if (seen.has(id)) continue;
    seen.add(id);
    const base = summary(slot.slug);
    if (!heading) {
      out.push(base);
      continue;
    }
    if (slot.slug === "column-table") {
      const columns = Array.isArray(slot.props.columns) ? (slot.props.columns as string[]) : [];
      const list = columns.length > 1 ? `${columns.slice(0, -1).join(", ")} and ${columns[columns.length - 1]}` : columns.join("");
      out.push({ ...base, name: `${heading} (table)`, description: `A table headed ${heading}, with columns for ${list.toLowerCase()}${slot.props.totalsRow ? ", added up at the bottom" : ""}.` });
      continue;
    }
    // A named box says what it is for, not the generic note box's line
    // eight times over.
    const rule = { lined: "ruled with lines", dotted: "on dots", graph: "on a grid" }[String(slot.props.rule ?? (slot.props.ruled ? "lined" : "none"))] ?? "left blank";
    out.push({ ...base, name: `${heading} (note box)`, description: `A box headed ${heading}, ${rule}, to write in.` });
  }
  return out;
}

/** Modules to start with: one of each kind people reach for first. */
export const STARTER_MODULES: ModuleSummary[] = [
  "habit-tracker",
  "weekly-priorities",
  "brain-dump",
  "water-week",
  "mood-chart-week",
  "sleep-chart",
  "eisenhower-matrix",
  "done-list",
  "meal-planner",
  "savings-goal",
  "books-read",
  "gratitude-three",
]
  .filter((slug) => PALETTE_INFO_BY_SLUG.has(slug))
  .map(summary);

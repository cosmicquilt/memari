// PREBUILT PLANNERS (2026-10-15): whole books to start from, not one spread.
// Andrew: "do these and start with build order" - the build order from the
// planner research (handoff/research, Gemini A report), whose planners are
// books: front pages, months and weeks made for one kind of person.
//
// A planner names the spread each part of its book is laid out as
// (plannerSpreads.ts). "Use this planner" (app/from/<key>) makes a journal
// with exactly those parts - front pages, months, weeks, days - each laid
// out from its spread (planner/archetypeWeek.ts, createJournalFromPlanner).
// The spreads are layouts in their own right too: the gallery lists them
// under their planner, and each can still be used alone.
//
// Data only.

import { HERO_BY_KEY } from "./heroSpreads";

export type PlannerTemplate = {
  /** /layouts/<key> and app/from/<key>. Stable. */
  key: string;
  title: string;
  /** Who it is for, in a phrase. */
  forWhom: string;
  /** What is in it, in a sentence. Checked against its spreads. */
  line: string;
  /** The spread each part of the book is laid out as, by key. */
  front?: string;
  month?: string;
  week?: string;
  day?: string;
};

/** Every planner, as written - PLANNERS below is the ones that can be made. */
export const ALL_PLANNERS: PlannerTemplate[] = [
  {
    key: "irregular-income",
    title: "Irregular income budget",
    forWhom: "Freelance, gig and tipped work, or any pay that changes month to month.",
    line: "A baseline month you can always cover, a rule for when there's extra, irregular bills ninety days ahead, tax set aside by the quarter, every payment logged, and each paycheck budgeted on its own.",
    front: "pages-irregular-income",
    month: "month-irregular-income",
    week: "week-irregular-income",
  },
  {
    key: "adhd",
    title: "ADHD brain dump & done list",
    forWhom: "ADHD brains, and anyone who plans in bursts and loses the thread.",
    line: "Three things a day and a list of what you actually got done, the rest of the day as open dots to empty your head onto, focus blocks, stars that add up instead of streaks to break, and a dopamine menu for when you're stuck.",
    front: "pages-adhd",
    month: "month-adhd",
    day: "day-adhd-dots",
  },
];

/** The parts of a book a planner can lay out, in book order. */
export const PLANNER_PARTS = ["front", "month", "week", "day"] as const;
export type PlannerPart = (typeof PLANNER_PARTS)[number];

export const PART_NAMES: Record<PlannerPart, string> = {
  front: "Front pages",
  month: "Every month",
  week: "Every week",
  day: "Every day",
};

/** A planner's parts that it has, with their spreads' keys, in book order. */
export function partsOf(planner: PlannerTemplate): Array<{ part: PlannerPart; key: string }> {
  return PLANNER_PARTS.flatMap((part) => (planner[part] ? [{ part, key: planner[part]! }] : []));
}

/** Every planner whose spreads all exist and none is held. */
export const PLANNERS: PlannerTemplate[] = ALL_PLANNERS.filter((planner) => partsOf(planner).every(({ key }) => HERO_BY_KEY[key] && !HERO_BY_KEY[key].held));

export const PLANNER_BY_KEY: Record<string, PlannerTemplate> = Object.fromEntries(PLANNERS.map((p) => [p.key, p]));

/** The planner a spread belongs to, if it was made for one. */
export const PLANNER_OF_SPREAD: Record<string, string> = Object.fromEntries(PLANNERS.flatMap((p) => partsOf(p).map(({ key }) => [key, p.key])));

/** The spread a planner's card shows: its week, else its month, else its
 *  day - the page used most. */
export function coverSpreadOf(planner: PlannerTemplate): string {
  return planner.week ?? planner.month ?? planner.day ?? planner.front!;
}

/** What "Use this planner" makes, said plainly. */
export function plannerMakes(planner: PlannerTemplate): string {
  const parts = partsOf(planner).map(({ part }) =>
    part === "front" ? "the front pages" : `a ${part === "day" ? "page" : `${part} spread`} for every ${part}`
  );
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Opens a journal of your own with all of it: ${list}, from next month for three months.`;
}

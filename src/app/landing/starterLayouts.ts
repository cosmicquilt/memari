// THE LAYOUTS GALLERY'S CONTENTS (memari.studio/layouts, 2026-10-08): weeks
// and modules to start from, made by us so that the first people to use
// Memari have something to begin with rather than an empty page.
//
// The weeks are the hero's people's (archetypes.ts) - the same layouts, so a
// week seen turning in the journal is the week you get - shown WITHOUT the
// people: no name, no age, nothing written in. What "Use this week" makes is
// the layout, empty, so that is what the gallery shows and describes.
//
// Never a count of how many people used one, and never a person's name as
// its maker, until there are real ones (Andrew, 2026-10-08: "Popular, no
// credit"). GALLERY_LABEL is the one word over them; the research he
// commissioned the same day recommends a label that says we made them
// ("Starter layouts", "Staff picks"), which is his to choose - see the
// session notes. One constant, so the choice is one line.

import { PEOPLE_BY_KEY, layoutPlacements } from "./archetypes";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { describeModule } from "@/lib/moduleDescriptions";

export const GALLERY_LABEL = "Popular";

export type StarterWeek = {
  /** The person's key: the spread's, and /app/from/<key>'s. */
  key: string;
  title: string;
  /** What is on it, in a sentence. */
  line: string;
};

/** In the hero's order, the faith and recovery weeks left out while they
 *  are held for a read-through (archetypes.ts, `held`). */
export const STARTER_WEEKS: StarterWeek[] = [
  { key: "student", title: "Student", line: "Every assignment with its class and due date, an exams box, a bedtime chart for the truth about exam week, and focus blocks to colour in." },
  { key: "nine-to-five", title: "9-to-5", line: "An Eisenhower matrix to sort the week, the day split into parts, what you are waiting on, notes for your one-to-one, and your days off counted." },
  { key: "nurse", title: "Shift work", line: "Built round nights: a sleep log and bedtime chart, rest days marked, meals planned ahead, water counted, and a self-care check." },
  { key: "teacher", title: "Teacher", line: "Each period's topic and materials, and the grading pile by class with the day each goes back." },
  { key: "maker", title: "Maker", line: "Orders and the day each ships, projects with their next step, what to post when, and what it all cost." },
  { key: "parent", title: "Parent", line: "Meals and the grocery list, chores shared out, gifts to buy, a to-do list, and the things the kids said." },
  { key: "fitness", title: "Training", line: "The week's training plan, runs and lifts logged, progressive overload, stretches, and energy and sleep beside them." },
  { key: "adhd", title: "ADHD", line: "Three things a day, a brain dump, a done list that counts what you finished, focus blocks, and a dopamine menu for when you are stuck." },
  { key: "philosophy", title: "Stoic", line: "Morning and evening Stoic pages, the dichotomy of control, Franklin's thirteen virtues and a commonplace book." },
  { key: "chronic-illness", title: "Chronic illness", line: "Spoons to spend, energy and pain on one scale, symptoms through the day, and every dose ticked off." },
].filter((week) => PEOPLE_BY_KEY[week.key] && !PEOPLE_BY_KEY[week.key].held);

export const STARTER_WEEK_BY_KEY: Record<string, StarterWeek> = Object.fromEntries(STARTER_WEEKS.map((w) => [w.key, w]));

export type ModuleSummary = { slug: string; name: string; description: string };

function summary(slug: string): ModuleSummary {
  const info = PALETTE_INFO_BY_SLUG.get(slug);
  return { slug, name: info?.name ?? slug, description: describeModule(slug) ?? "" };
}

/** The modules on a week, in the order they are placed: each kind once,
 *  except a note box, which is listed by its own heading - "Exams" and
 *  "After Midterms" are two different things on the page. */
export function modulesOfWeek(key: string): ModuleSummary[] {
  const person = PEOPLE_BY_KEY[key];
  if (!person) return [];
  const seen = new Set<string>();
  const out: ModuleSummary[] = [];
  for (const slot of layoutPlacements(person.layout)) {
    const heading = slot.slug === "labeled-box" && typeof slot.props?.heading === "string" ? slot.props.heading : null;
    const id = heading ? `${slot.slug}:${heading.toLowerCase()}` : slot.slug;
    if (seen.has(id)) continue;
    seen.add(id);
    const base = summary(slot.slug);
    out.push(heading ? { ...base, name: `${heading} (note box)` } : base);
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

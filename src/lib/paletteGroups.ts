// THE PALETTE'S GROUPS AND THEIR SECTIONS (2026-10-05, the palette revamp).
//
// The twelve groups are moduleRegistry's CATEGORIES. Inside each, modules
// are sectioned by the page they are made for - Daily, Weekly, Monthly, the
// beginning and end of the book - except where something else matters
// more: Basics by KIND (the blank building blocks), and Philosophy & faith
// by TRADITION, so someone looking for the Stoic pages sees five instead
// of scanning twenty-two. Drafted on the palette mockup and built as drawn
// (https://claude.ai/artifact/RoEE2EzZ79tGymWVTXkuvL).
//
// Also here: what each module PRINTS, in a line, from its own settings -
// the browser's "On the page", so no module is described by nothing.

import { CATEGORIES, PALETTE_MODULES, moduleDefinition, type Cadence, type Category } from "./moduleRegistry";

/** One line under each group's name in the browser. */
export const GROUP_BLURBS: Record<Category, string> = {
  Basics: "Blank building blocks. Every other module is one of these with its words filled in.",
  Planning: "Priorities, schedules and lists for getting things done.",
  "Mood & health": "Mood, energy, sleep, symptoms and medication.",
  Food: "Meal plans, groceries, recipes and what you ate.",
  Fitness: "Workouts, runs, steps and rest days.",
  Money: "Spending, budgets, bills and savings.",
  "Home & family": "Chores, plants, pets, birthdays and gifts.",
  "Philosophy & faith": "Daily practices from Stoic, Taoist, Buddhist, Christian, Islamic and Jewish traditions.",
  Growth: "Goals, gratitude, reflection and challenges.",
  "Hobbies & learning": "Reading, watching, listening, drawing and practice.",
  Recovery: "Twelve-step inventories, meetings and gratitude.",
  Travel: "Trips, budgets, packing and places.",
};

/** Basics, by what they are. */
const BASIC_KINDS: Array<[string, string[]]> = [
  ["Write", ["labeled-box", "prompted-lines", "text-block", "quote-block"]],
  ["Lists & tables", ["todo-checklist", "column-table"]],
  ["Trackers", ["habit-tracker", "month-tracker", "icon-strip", "rating-strip", "progress-meter", "day-chart"]],
  ["Calendars & grids", ["mini-month", "axis-matrix"]],
];

/** Philosophy & faith, by tradition. */
const FAITH_TRADITIONS: Array<[string, string[]]> = [
  ["Stoic", ["stoic-morning-page", "stoic-evening-review", "dichotomy-of-control", "memento-mori", "negative-visualisation"]],
  ["Taoist", ["tao-daily-verse", "wu-wei-reflection"]],
  ["Buddhist & meditation", ["metta-practice", "meditation-minutes"]],
  ["Christian", ["examen", "lectio-divina", "soap-study", "verse-mapping", "prayer-list", "sermon-notes"]],
  ["Islamic", ["salah-tracker", "ramadan-log", "quran-reading-plan", "dhikr-counter"]],
  ["Jewish", ["mussar-trait", "omer-counter", "parashah-study"]],
];

/** Everyone else, by the page a module is made for. */
export const CADENCE_SECTIONS: Record<Cadence, string> = {
  day: "Daily pages",
  week: "Weekly pages",
  month: "Monthly pages",
  journal: "Beginning & end of the book",
};

/** A module's page, in a word, for a card: "Weekly". */
export const CADENCE_LABELS: Record<Cadence, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  journal: "Beginning & end",
};

/** Sections in the order they are shown, whichever group they are in. */
export const SECTION_ORDER: string[] = [
  ...BASIC_KINDS.map(([name]) => name),
  ...FAITH_TRADITIONS.map(([name]) => name),
  ...Object.values(CADENCE_SECTIONS),
];

const ORDER_WITHIN = new Map<string, number>();
for (const [, slugs] of [...BASIC_KINDS, ...FAITH_TRADITIONS]) slugs.forEach((slug, i) => ORDER_WITHIN.set(slug, i));

export type PaletteModuleInfo = {
  slug: string;
  /** The card's caption. */
  label: string;
  /** The full name, for the browser's detail. */
  name: string;
  group: Category;
  section: string;
  cadence: Cadence | null;
  previewProps: Record<string, unknown>;
  /** Its place inside its section. */
  order: number;
};

function sectionFor(slug: string, group: Category, cadence: Cadence | null): string {
  const lists = group === "Basics" ? BASIC_KINDS : group === "Philosophy & faith" ? FAITH_TRADITIONS : null;
  if (lists) {
    const found = lists.find(([, slugs]) => slugs.includes(slug));
    if (found) return found[0];
  }
  return cadence ? CADENCE_SECTIONS[cadence] : "Any page";
}

/** Every module the palette offers, with its group and section. */
export const PALETTE_INFO: PaletteModuleInfo[] = PALETTE_MODULES.map((m, index) => {
  const definition = moduleDefinition(m.slug);
  const group = (m.category ?? "Basics") as Category;
  const cadence = definition?.cadence ?? null;
  return {
    slug: m.slug,
    label: m.label,
    name: definition?.label ?? definition?.db.name ?? m.label,
    group,
    section: sectionFor(m.slug, group, cadence),
    cadence,
    previewProps: m.previewProps as Record<string, unknown>,
    order: ORDER_WITHIN.get(m.slug) ?? 100 + index,
  };
});

export const PALETTE_INFO_BY_SLUG = new Map(PALETTE_INFO.map((m) => [m.slug, m]));

/** A group's modules, sectioned, sections and modules in order. */
export function sectionsOf(modules: PaletteModuleInfo[]): Array<{ section: string; modules: PaletteModuleInfo[] }> {
  const bySection = new Map<string, PaletteModuleInfo[]>();
  for (const m of modules) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section)!.push(m);
  }
  return [...bySection.entries()]
    .sort(([a], [b]) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b))
    .map(([section, list]) => ({ section, modules: list.sort((a, b) => a.order - b.order) }));
}

/** The groups, in the palette's order. */
export const GROUPS: Category[] = [...CATEGORIES];

function shortList(items: unknown[], keep = 6): string {
  const words = items.map((i) => String(i)).filter((w) => w.trim());
  if (words.length <= keep) return words.join(" · ");
  return `${words.slice(0, 3).join(" · ")} … ${words[words.length - 1]} (${words.length})`;
}

/**
 * WHAT A MODULE PRINTS, in a line, from its own settings: the prompts, the
 * rows and columns, the scale. True of every module, written by nothing -
 * so the browser says something exact about the hundred that have no
 * longer description, and the same about the ones that do.
 */
export function whatItPrints(slug: string, props: Record<string, unknown>): string {
  const primitive = moduleDefinition(slug)?.primitive ?? slug;
  const p = props as Record<string, never>;
  const heading = typeof p.heading === "string" && p.heading ? (p.heading as string) : null;
  switch (primitive) {
    case "prompted-lines": {
      const listed = shortList((p.prompts as unknown[]) ?? []);
      const n = Number(p.linesPerPrompt ?? 1);
      return `Prompts: ${listed}${listed.endsWith("?") ? "" : "."} ${n} line${n === 1 ? "" : "s"} each.`;
    }
    case "habit-tracker": {
      const rows = (p.habits as unknown[]) ?? ["Habit", "Habit"];
      const cols = (p.columns as unknown[]) ?? [];
      return `Rows: ${shortList(rows)}. ${cols.filter((c) => String(c).trim()).length ? `Columns: ${shortList(cols)}.` : "One column per day of your page."}`;
    }
    case "column-table":
      return `Columns: ${shortList(((p.columns as unknown[]) ?? []).filter((c) => String(c).trim()), 8)}.`;
    case "todo-checklist":
      return `${p.numbered ? "A numbered checklist" : "A checklist"}${heading ? ` headed ${heading}` : ""}.`;
    case "progress-meter":
      return p.total ? `${p.total} marks to fill${p.milestoneEvery ? `, a milestone every ${p.milestoneEvery}` : ""}.` : "A row of marks to fill.";
    case "icon-strip":
      return `${p.count ?? 8} ${p.icon ?? "mark"}s for each day.`;
    case "rating-strip":
      return `Rate ${shortList((p.items as unknown[]) ?? [])} from ${p.scaleMin ?? 1} to ${p.scaleMax ?? 5}.`;
    case "day-chart":
      return `A ${p.span ?? "week"} of days plotted against ${shortList((p.levels as unknown[]) ?? [])}.`;
    case "mini-month":
      return `A small month calendar${heading ? ` headed ${heading}` : ""}.`;
    case "axis-matrix": {
      const named = ((p.quadrants as unknown[]) ?? []).filter((q) => String(q).trim());
      return `Four boxes on two axes, ${p.xLeft} to ${p.xRight} and ${p.yBottom} to ${p.yTop}${named.length ? `: ${shortList(named)}` : ""}.`;
    }
    case "labeled-box":
      return heading ? `A box headed ${heading}.` : "A box with a heading.";
    case "text-block":
    case "quote-block":
      return `Set text: “${p.body ?? ""}”${p.attribution ? ` (${p.attribution})` : ""}`;
    default:
      return heading ? `A module headed ${heading}.` : "";
  }
}

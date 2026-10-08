// SIMILAR LAYOUTS (Andrew, 2026-10-08): beside a layout in the Layouts
// popup, "similar layouts, showing previews of other layouts that are the
// same with different module setting and swapped out modules". Made here
// from the layout itself, and each one usable ("Use this") like the layout
// it came from.
//
// A variation changes the layout in the ways a person would:
//
//   the hours   by the hour, a shorter day, a 24-hour clock, or none (a
//               dotted list) - or back on, for a layout that has them off
//   a month     its days lined, dotted or blank
//   note boxes  ruled another way
//   a module    swapped for another of its kind (the palette's group) that
//               fits the same cells - a mood chart where the habits were
//
// and is kept only if it passes the hero's own check (spreads.ts,
// spreadProblems: every module fits its cells and its floor, nothing
// overlaps, the pages are full) and its hours still fit theirs. So a
// variation is a real layout, not a guess. The same key always makes the
// same one: "student~2" is the second variation of the student week, which
// is what "Use this" is sent.
//
// Server-only: it reads the module registry.

import { HERO_BY_KEY, type HeroSpread, type HoursSettings } from "./heroSpreads";
import { STARTER_BY_KEY, type StarterKind } from "./starterLayouts";
import { LANDING_PAGE_GRID, spreadPlacements, spreadProblems } from "./spreads";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { getMinRowSpanForSlug, moduleSchemaDefaults } from "@/lib/moduleRegistry";

/** How many variations a layout offers. */
const VARIATIONS = 4;
/** "student~2". */
const SEP = "~";

export type LayoutEntry = {
  key: string;
  baseKey: string;
  kind: StarterKind;
  title: string;
  line: string;
  hours?: string;
  /** What this variation changed, in words; empty for the layout itself. */
  changes: string[];
  def: HeroSpread;
};

// ------------------------------------------------------------ the slots

type Tuple = [slug: string, rowSpan: number, props?: Record<string, unknown>];
type SlotLike = { slug: string; columnSpan: number; rowSpan: number; props?: Record<string, unknown> };
/** Where a module sits in a layout's description, to read and to replace. */
type SlotRef = { list: string; index: number; slug: string; columnSpan: number; rowSpan: number; props?: Record<string, unknown> };

const SIDEBAR_COLUMNS = 6;

function slotsOf(def: HeroSpread): SlotRef[] {
  const layout = def.layout as unknown as Record<string, unknown>;
  const refs: SlotRef[] = [];
  if (Array.isArray(layout.sidebar)) {
    (layout.sidebar as Tuple[]).forEach(([slug, rowSpan, props], index) => refs.push({ list: "sidebar", index, slug, columnSpan: SIDEBAR_COLUMNS, rowSpan, props }));
  }
  for (const list of ["belowLeft", "belowRight", "below"]) {
    if (!Array.isArray(layout[list])) continue;
    (layout[list] as SlotLike[]).forEach((s, index) => refs.push({ list, index, slug: s.slug, columnSpan: s.columnSpan, rowSpan: s.rowSpan, props: s.props }));
  }
  if (Array.isArray(layout.pages)) {
    (layout.pages as SlotLike[][]).forEach((page, p) =>
      page.forEach((s, index) => refs.push({ list: `pages.${p}`, index, slug: s.slug, columnSpan: s.columnSpan, rowSpan: s.rowSpan, props: s.props }))
    );
  }
  return refs;
}

/** The layout with one module changed: a deep enough copy that the
 *  original is never touched. */
function withSlot(def: HeroSpread, ref: SlotRef, slug: string, props: Record<string, unknown> | undefined): HeroSpread {
  const layout = structuredClone(def.layout) as unknown as Record<string, unknown>;
  if (ref.list === "sidebar") {
    (layout.sidebar as Tuple[])[ref.index] = [slug, ref.rowSpan, props];
  } else if (ref.list.startsWith("pages.")) {
    const page = (layout.pages as SlotLike[][])[Number(ref.list.slice(6))];
    page[ref.index] = { ...page[ref.index], slug, props };
  } else {
    const list = layout[ref.list] as SlotLike[];
    list[ref.index] = { ...list[ref.index], slug, props };
  }
  return { ...def, layout: layout as unknown as HeroSpread["layout"] };
}

// ------------------------------------------------------------ the changes

/** One change: what it says, and how it is made. A swap names the cells it
 *  changes and the module it brings, so a variation changes each once and
 *  never brings the same module twice. */
type Move = { describe: string; apply: (def: HeroSpread) => HeroSpread; slot?: string; adds?: string };

const HOUR_MOVES: Array<{ when: (h: HoursSettings) => boolean; set: HoursSettings | "on"; describe: string }> = [
  { when: (h) => (h.intervalMinutes ?? 30) !== 60 && h.intervalMode !== "off", set: { intervalMinutes: 60 }, describe: "Hours by the hour" },
  { when: (h) => h.intervalMode !== "off", set: { intervalMode: "off", offModeRule: "dotted" }, describe: "No hours: dotted days for a list" },
  { when: (h) => !h.startTime && h.intervalMode !== "off", set: { startTime: "07:00", endTime: "22:00" }, describe: "A shorter day, 7 AM to 10 PM" },
  { when: (h) => h.timeFormat !== "24" && h.intervalMode !== "off", set: { timeFormat: "24" }, describe: "A 24-hour clock" },
  { when: (h) => h.intervalMode === "off", set: "on", describe: "Half-hour rows in the hours" },
];

function settingMoves(def: HeroSpread): Move[] {
  const moves: Move[] = [];
  const layout = def.layout;
  if (layout.kind === "week" || layout.kind === "day") {
    const hours = layout.hours ?? {};
    for (const m of HOUR_MOVES) {
      if (!m.when(hours)) continue;
      const next: HoursSettings = m.set === "on" ? { ...hours, intervalMode: "on", offModeRule: undefined } : { ...hours, ...m.set };
      moves.push({ describe: m.describe, apply: (d) => ({ ...d, layout: { ...(d.layout as typeof layout), hours: next } }) });
    }
  }
  if (layout.kind === "month") {
    const now = layout.inside ?? "none";
    const words = { lined: "Lined days", dotted: "Dotted days", none: "Blank days" } as const;
    for (const inside of ["dotted", "lined", "none"] as const) {
      if (inside !== now) moves.push({ describe: `${words[inside]} in the month`, apply: (d) => ({ ...d, layout: { ...(d.layout as typeof layout), inside } }) });
    }
  }
  // Every note box ruled another way - each way it can be.
  const boxes = slotsOf(def).filter((s) => s.slug === "labeled-box");
  if (boxes.length > 0) {
    const ruleOf = (b: SlotRef) => String(b.props?.rule ?? (b.props?.ruled ? "lined" : "none"));
    const words = { lined: "Note boxes ruled with lines", dotted: "Note boxes on dots", graph: "Note boxes on a grid", none: "Note boxes left blank" } as const;
    for (const to of ["dotted", "lined", "graph", "none"] as const) {
      if (boxes.every((b) => ruleOf(b) === to)) continue;
      moves.push({
        describe: words[to],
        apply: (d) => slotsOf(d).filter((s) => s.slug === "labeled-box").reduce((acc, s) => withSlot(acc, s, s.slug, { ...(s.props ?? {}), rule: to, ruled: to === "lined" }), d),
      });
    }
  }
  return moves;
}

/**
 * WHAT EACH MODULE CAN BE SWAPPED FOR: another that does the same job a
 * different way. Chosen by hand, because the palette's groups are too broad
 * to swap within - "Planning" holds both a brain dump and a password log,
 * and swapping by group put the one in place of the other. A module not
 * here is not swapped, nor is anything of a practice (a Stoic page, a
 * prayer list): those are chosen, not interchangeable.
 */
const ALTERNATIVES: Record<string, string[]> = {
  // Planning
  "weekly-priorities": ["daily-big-three", "ivy-lee-six", "abc-priority-list"],
  "daily-big-three": ["weekly-priorities", "ivy-lee-six"],
  "ivy-lee-six": ["daily-big-three", "weekly-priorities"],
  "abc-priority-list": ["weekly-priorities", "todo-checklist"],
  "todo-checklist": ["done-list", "abc-priority-list"],
  "done-list": ["todo-checklist"],
  "brain-dump": ["someday-maybe", "waiting-on"],
  "someday-maybe": ["brain-dump"],
  "waiting-on": ["someday-maybe", "project-tracker"],
  "project-tracker": ["waiting-on"],
  "one-on-one-agenda": ["waiting-on"],
  "eisenhower-matrix": ["abc-priority-list", "daily-big-three"],
  "time-blocking-column": ["week-day-boxes"],
  "week-day-boxes": ["time-blocking-column"],
  "assignment-tracker": ["project-tracker"],
  "order-tracker": ["project-tracker"],
  "content-plan": ["project-tracker"],
  // Mood and health
  "mood-tracker": ["mood-chart-week", "energy-chart"],
  "mood-chart-week": ["mood-tracker", "energy-chart"],
  "energy-chart": ["mood-chart-week", "energy-pain-scale"],
  "energy-pain-scale": ["spoon-count", "energy-chart"],
  "spoon-count": ["energy-pain-scale"],
  "symptom-tracker": ["energy-pain-scale"],
  "sleep-chart": ["sleep-log"],
  "sleep-log": ["sleep-chart"],
  "medication-log": ["pill-tracker"],
  "pill-tracker": ["medication-log"],
  "self-care-checklist": ["habit-tracker"],
  "habit-tracker": ["self-care-checklist"],
  "water-week": ["self-care-checklist"],
  "dopamine-menu": ["self-care-checklist"],
  // Food
  "meal-planner": ["food-diary"],
  "grocery-list": ["recipes-to-try"],
  "recipes-to-try": ["recipe-card", "grocery-list"],
  "recipe-card": ["recipes-to-try"],
  "food-diary": ["meal-planner"],
  // Fitness
  "workout-log": ["progressive-overload", "run-log"],
  "run-log": ["workout-log", "step-counter"],
  "progressive-overload": ["workout-log"],
  "weekly-workout-plan": ["rest-day-marker"],
  "stretch-routine": ["rest-day-marker"],
  // Money
  "spending-log": ["budget"],
  budget: ["zero-based-budget", "spending-log"],
  "zero-based-budget": ["budget"],
  "savings-goal": ["debt-payoff"],
  "debt-payoff": ["savings-goal"],
  "bill-tracker": ["subscription-audit"],
  "subscription-audit": ["bill-tracker"],
  // Home and family
  "chore-chart": ["cleaning-rota"],
  "cleaning-rota": ["chore-chart"],
  "gift-log": ["birthday-calendar"],
  // Growth
  "gratitude-three": ["daily-affirmation", "weekly-reflection"],
  "daily-affirmation": ["gratitude-three"],
  "weekly-reflection": ["gratitude-three"],
  // Hobbies and learning
  "books-read": ["reading-progress"],
  "reading-progress": ["books-read"],
  "listening-log": ["watchlist"],
  watchlist: ["listening-log"],
  "sketch-box": ["writing-prompt"],
  "writing-prompt": ["sketch-box"],
  // Travel
  "trip-itinerary": ["trip-journal"],
  "trip-journal": ["trip-itinerary"],
  "restaurant-log": ["places-been"],
  "places-been": ["country-map", "restaurant-log"],
};

function swapMoves(def: HeroSpread): Move[] {
  const on = new Set(slotsOf(def).map((s) => s.slug));
  const moves: Move[] = [];
  for (const slot of slotsOf(def)) {
    const info = PALETTE_INFO_BY_SLUG.get(slot.slug);
    if (!info) continue;
    for (const other of ALTERNATIVES[slot.slug] ?? []) {
      const otherInfo = PALETTE_INFO_BY_SLUG.get(other);
      if (!otherInfo || on.has(other)) continue;
      const floor = getMinRowSpanForSlug(other, LANDING_PAGE_GRID, slot.columnSpan, moduleSchemaDefaults(other));
      // Fits, and fills: a module needing far fewer rows would leave its
      // cells mostly empty.
      if (floor > slot.rowSpan || floor < slot.rowSpan / 3) continue;
      moves.push({
        slot: `${slot.list}.${slot.index}`,
        adds: other,
        describe: `${otherInfo.name} in place of ${info.name}`,
        apply: (d) => {
          const ref = slotsOf(d).find((s) => s.list === slot.list && s.index === slot.index);
          return ref ? withSlot(d, ref, other, undefined) : d;
        },
      });
    }
  }
  return moves;
}

// ------------------------------------------------------------ checking

/** The hero's check, and the hours or the month still fitting theirs. */
function valid(def: HeroSpread): boolean {
  if (spreadProblems(def).length > 0) return false;
  for (const p of spreadPlacements(def)) {
    if (!p.locked || !p.slug.endsWith("-core")) continue;
    if (getMinRowSpanForSlug(p.slug, LANDING_PAGE_GRID, p.columnSpan, p.props) > p.rowSpan) return false;
  }
  return true;
}

/** A small, repeatable shuffle: the same layout always offers the same
 *  variations. */
function rng(seedText: string) {
  let seed = 2166136261;
  for (const c of seedText) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const cache = new Map<string, LayoutEntry[]>();

/** A layout's variations, in order: "~1" to "~4". */
export function variationsOf(baseKey: string): LayoutEntry[] {
  const hit = cache.get(baseKey);
  if (hit) return hit;
  const starter = STARTER_BY_KEY[baseKey];
  const base = HERO_BY_KEY[baseKey];
  if (!starter || !base) return [];
  const settings = settingMoves(base);
  const swaps = swapMoves(base);
  const rand = rng(baseKey);
  const order = [...swaps];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out: LayoutEntry[] = [];
  const seen = new Set<string>([JSON.stringify(base.layout)]);
  // With fewer than three ways to change its settings, a layout's
  // variations also take turns at changing none, so they do not all share
  // one change.
  const settingTurns: Array<Move | null> = settings.length >= 3 ? settings : [...settings, null];
  const uses = new Map<Move, number>();
  let s = 0;
  for (let attempt = 0; out.length < VARIATIONS && attempt < 24; attempt++) {
    // Each variation: a setting change, and one or two modules swapped -
    // never the same cells twice, never the same module brought twice.
    const picked: Move[] = [];
    const setting = settingTurns.length ? settingTurns[s++ % settingTurns.length] : null;
    if (setting) picked.push(setting);
    const cells = new Set<string>();
    const brought = new Set<string>();
    const want = out.length % 2 === 0 ? 2 : 1;
    // The swaps used least so far first, so the variations differ in their
    // modules too, not only in their settings.
    const byUse = [...order].sort((x, y) => (uses.get(x) ?? 0) - (uses.get(y) ?? 0));
    for (const move of byUse) {
      if (cells.size >= want) break;
      if (move.slot && !cells.has(move.slot) && !(move.adds && brought.has(move.adds))) {
        cells.add(move.slot);
        if (move.adds) brought.add(move.adds);
        picked.push(move);
      }
    }
    if (picked.length === 0) continue;
    // Keep as much as passes: without the last swap, then without any.
    for (let take = picked.length; take >= 1; take--) {
      const def = picked.slice(0, take).reduce((d, m) => m.apply(d), base);
      const sig = JSON.stringify(def.layout);
      if (seen.has(sig) || !valid(def)) continue;
      seen.add(sig);
      for (const m of picked.slice(0, take)) uses.set(m, (uses.get(m) ?? 0) + 1);
      const key = `${baseKey}${SEP}${out.length + 1}`;
      out.push({ key, baseKey, kind: starter.kind, title: starter.title, line: starter.line, changes: picked.slice(0, take).map((m) => m.describe), def: { ...def, key } });
      break;
    }
  }
  cache.set(baseKey, out);
  return out;
}

/** A layout or one of its variations, by key. */
export function resolveLayout(key: string): LayoutEntry | null {
  const [baseKey, n] = key.split(SEP);
  const starter = STARTER_BY_KEY[baseKey];
  const def = HERO_BY_KEY[baseKey];
  if (!starter || !def) return null;
  if (n === undefined) return { key, baseKey, kind: starter.kind, title: starter.title, line: starter.line, hours: starter.hours, changes: [], def };
  return variationsOf(baseKey).find((v) => v.key === key) ?? null;
}

/** What is shown beside a layout: its variations - and beside a variation,
 *  the layout it came from and its other variations. */
export function similarTo(key: string): LayoutEntry[] {
  const entry = resolveLayout(key);
  if (!entry) return [];
  const family = [resolveLayout(entry.baseKey)!, ...variationsOf(entry.baseKey)];
  return family.filter((e) => e.key !== key);
}

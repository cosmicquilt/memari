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
import { getMinRowSpanForSlug, moduleSchemaDefaults } from "@/lib/moduleRegistry";
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

const box = (heading: string, lined = true) => ({ heading, rule: lined ? "lined" : "none", ruled: lined, templateHeading: heading });
const at = (slug: string, columnStart: number, rowStart: number, columnSpan: number, rowSpan: number, props?: Record<string, unknown>) => ({ slug, columnStart, rowStart, columnSpan, rowSpan, props });

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

/** A spread's layout with none of the hero's writing: what is printed. */
function bare(def: HeroSpread, key: string): HeroSpread {
  return { key, layout: structuredClone(def.layout), hand: def.hand, doodles: def.doodles, events: [], calendar: [] };
}

const BLANK = bare(HERO_BY_KEY.base, "otter-blank");

/** A month of note boxes, for the month picks to take over: month-family's
 *  cells (heroExtras.ts), which the hero's test already passes. */
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
        ["labeled-box", 9, box("This Month")],
        ["labeled-box", 9, box("Goals")],
        ["labeled-box", 16, box("Notes")],
      ],
      belowLeft: [at("labeled-box", 6, 17, 18, 9, box("Important Dates")), at("labeled-box", 6, 26, 18, 10, box("Wins"))],
      belowRight: [at("labeled-box", 0, 17, 12, 10, box("To Do")), at("labeled-box", 12, 17, 12, 10, box("Next Month")), at("labeled-box", 0, 27, 24, 9, box("Look Back"))],
    },
  };
}

/** A day of note boxes round the big three and a list: day-adhd's cells. */
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
        ["daily-big-three", 6],
        ["labeled-box", 14, box("Notes")],
        ["labeled-box", 16, box("Tomorrow")],
      ],
      below: [at("todo-checklist", 6, 18, 18, 10, { dayCount: 1 }), at("labeled-box", 6, 28, 18, 8, box("Today"))],
    },
  };
}

// ------------------------------------------------------------ what is wanted

/** A module the answers ask for, the parts it may go on (first choice
 *  first), and its name for the otter's notes. */
type Want = { slug: string; parts: PlannerPart[]; props?: Record<string, unknown>; strip?: boolean };

/** Where a module goes by the page it is made for (the registry's cadence),
 *  when an answer does not say. */
function partsFor(slug: string): PlannerPart[] {
  switch (PALETTE_INFO_BY_SLUG.get(slug)?.cadence) {
    case "journal":
      return ["front"];
    case "month":
      return ["month", "week", "front"];
    case "day":
      return ["day", "week", "front"];
    default:
      return ["week", "day", "month", "front"];
  }
}
const want = (slug: string, parts?: PlannerPart[], props?: Record<string, unknown>): Want => ({ slug, parts: parts ?? partsFor(slug), props });
/** A strip a day, under every day of a week or along a day's hours. */
const strip = (slug: string): Want => ({ slug, parts: ["week", "day"], strip: true });

const FOLLOW: Record<string, Record<string, Want[]>> = {
  school: {
    "high-school": [want("assignment-tracker"), want("exam-countdown")],
    college: [want("assignment-tracker"), want("exam-countdown"), want("project-tracker", ["month", "week"])],
    grad: [want("project-tracker", ["week", "month"]), want("reading-progress")],
    self: [want("skill-practice"), want("language-study")],
  },
  office: {
    meetings: [want("one-on-one-agenda"), want("waiting-on")],
    deep: [want("time-blocking-column"), strip("focus-blocks")],
    tasks: [want("todo-checklist"), want("eisenhower-matrix")],
    people: [want("one-on-one-agenda"), want("waiting-on"), want("done-list")],
  },
  shifts: {
    nights: [want("sleep-log")],
    sometimes: [want("sleep-chart"), want("rest-day-marker")],
    days: [],
  },
  teaching: {
    little: [want("lesson-planner")],
    middle: [want("lesson-planner")],
    high: [want("lesson-planner"), want("grading-tracker")],
    college: [want("lesson-planner"), want("grading-tracker")],
  },
  business: {
    things: [want("order-tracker")],
    service: [want("project-tracker", ["week", "month"]), want("income-log")],
    content: [want("content-plan")],
  },
  home: {
    none: [want("cleaning-rota"), want("pet-care")],
    one: [want("chore-chart"), want("kids-said")],
    few: [want("chore-chart"), want("kids-said")],
    many: [want("chore-chart"), want("grocery-list")],
  },
  training: {
    running: [want("run-log")],
    lifting: [want("progressive-overload", ["week", "month"]), want("workout-log", ["week", "day"])],
    yoga: [want("stretch-routine"), want("yoga-log", ["week", "month"])],
    mix: [want("weekly-workout-plan")],
  },
  health: {
    symptoms: [want("symptom-tracker"), want("symptom-severity", ["day"])],
    medication: [want("medication-log"), want("medication-doses", ["day"])],
    energy: [strip("spoon-count"), want("energy-pain-scale")],
    appointments: [],
  },
  everything: {
    organized: [want("todo-checklist"), want("weekly-priorities", ["week"])],
    habits: [want("habit-tracker", ["week", "day"])],
    money: [want("spending-log"), want("budget")],
    calmer: [want("gratitude-three", ["week", "day"]), want("mood-chart-week", ["week"])],
  },
};

const HABIT_ROWS: Record<string, number> = { few: 3, some: 5, many: 8 };

function trackWants(answers: Answers): Want[] {
  const out: Want[] = [];
  for (const pick of answers.track ?? []) {
    switch (pick) {
      case "habits": {
        const rows = HABIT_ROWS[one(answers, "habitCount") ?? "some"] ?? 5;
        out.push(want("habit-tracker", ["week", "day"], { habits: Array.from({ length: rows }, () => "") }));
        break;
      }
      case "sleep":
        out.push(want("sleep-chart", ["week", "day"]));
        break;
      case "mood":
        out.push(want("mood-chart-week", ["week"]), want("mood-chart-month", ["month"]), want("year-in-pixels", ["front"]));
        break;
      case "water":
        out.push(strip("water-week"));
        break;
      case "workouts":
        out.push(want("weekly-workout-plan", ["week"]), want("workout-log", ["day"]));
        break;
      case "money": {
        out.push(want("spending-log", ["week", "month"]));
        const how = one(answers, "money");
        if (how === "steady") out.push(want("paycheck-budget", ["month", "front"]));
        if (how === "varies") out.push(want("income-log", ["month", "week"]), want("sinking-funds", ["front"]));
        if (how === "saving") out.push(want("budget", ["month", "week"]), want("savings-goal", ["front"]), want("debt-payoff", ["front"]));
        break;
      }
      case "meals":
        out.push(want("meal-planner", ["week"]), want("grocery-list", ["week"]), want("food-diary", ["day"]));
        break;
      case "period":
        out.push(want("period-tracker", ["month", "front"]));
        break;
      case "reading":
        out.push(want("books-read", ["front"]), want("reading-progress", ["front"]));
        break;
    }
  }
  return out;
}

function todoWants(answers: Answers): Want[] {
  switch (one(answers, "todo")) {
    case "three":
      return [want("weekly-priorities", ["week"]), want("daily-big-three", ["day"])];
    case "dump":
      return [want("brain-dump", ["week", "day"])];
    case "adhd":
      return [want("brain-dump", ["week", "day"]), want("done-list", ["week", "day"]), want("daily-big-three", ["day"]), want("dopamine-menu", ["week", "day"]), strip("focus-blocks")];
    case "list":
      return [want("todo-checklist", ["week", "day"])];
    default:
      return [];
  }
}

function roomWants(answers: Answers): Want[] {
  const out: Want[] = [];
  for (const pick of answers.room ?? []) {
    if (pick === "gratitude") out.push(want("gratitude-three", ["day", "week"]));
    if (pick === "reflection") out.push(want("weekly-reflection", ["week"]));
    if (pick === "goals") out.push(want("smart-goal", ["front"]), want("ninety-day-sprint", ["front"]));
    if (pick === "doodles") out.push(want("sketch-box", ["week", "day", "front"], { heading: "Doodles" }));
    if (pick === "notes") out.push(want("labeled-box", ["week", "day", "front"], box("Notes")));
  }
  return out;
}

function practiceWants(answers: Answers): Want[] {
  // routedAnswers keeps only practices the quiz offered; each one's id is
  // its module's slug.
  return (answers.practices ?? []).map((slug) => want(slug));
}

// ------------------------------------------------------------ fitting in

const floorOf = (slug: string, columnSpan: number, props?: Record<string, unknown>) =>
  getMinRowSpanForSlug(slug, LANDING_PAGE_GRID, columnSpan, { ...moduleSchemaDefaults(slug), ...(props ?? {}) });

/** Modules a person never asks for by name: the page's plain boxes. They
 *  give way first. */
const PLAIN = new Set(["labeled-box", "sketch-box"]);
const refKey = (ref: SlotRef) => `${ref.list}.${ref.index}`;
const nameOf = (slug: string) => PALETTE_INFO_BY_SLUG.get(slug)?.name ?? slug;

/** The bottom row of a zone under the hours, as [first column, width]. */
const ZONES: Record<string, Record<string, [number, number]>> = {
  week: { belowLeft: [6, 18], belowRight: [0, 24] },
  day: { below: [6, 18] },
};

/**
 * A strip a day along the bottom of every zone under the hours - so on a
 * week under all seven days, both pages in the same row (the rule since
 * 2026-10-19: "a strip a day runs the whole week") - by taking a row from
 * whatever sits on the bottom row. Null when one of them cannot spare it.
 */
function withStrip(def: HeroSpread, slug: string): HeroSpread | null {
  const zones = ZONES[def.layout.kind];
  if (!zones) return null;
  const layout = structuredClone(def.layout) as unknown as Record<string, Array<{ slug: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number; props?: Record<string, unknown> }>>;
  const last = LANDING_PAGE_GRID.gridRows - 1;
  for (const [list, [columnStart, columnSpan]] of Object.entries(zones)) {
    const slots = layout[list];
    if (!Array.isArray(slots)) return null;
    const bottom = slots.filter((s) => s.rowStart + s.rowSpan === last + 1);
    for (const s of bottom) {
      if (s.rowSpan - 1 < floorOf(s.slug, s.columnSpan, s.props)) return null;
      s.rowSpan -= 1;
    }
    slots.push({ slug, columnStart, rowStart: last, columnSpan, rowSpan: 1 });
  }
  const next = { ...def, layout: layout as unknown as HeroSpread["layout"] };
  return valid(next) ? next : null;
}

/** The modules a spread places, by slug - a strip counts once. */
const placedSlugs = (def: HeroSpread) => new Set(slotsOf(def).map((s) => s.slug));

/**
 * Put what is wanted into a spread, best first: each into the cells of a
 * module nobody asked for - plain boxes first, then the layout's own
 * defaults - where it fits, and the spread still passes. What finds no
 * cells is returned, for the front pages.
 */
function fillSpread(start: HeroSpread, wants: Want[]): { def: HeroSpread; left: Want[] } {
  let def = start;
  const asked = new Set(wants.map((w) => w.slug));
  // Cells already holding something asked for stay put.
  const kept = new Set(slotsOf(def).filter((s) => asked.has(s.slug) && !PLAIN.has(s.slug)).map(refKey));
  const left: Want[] = [];
  for (const w of wants) {
    if (!PLAIN.has(w.slug) && placedSlugs(def).has(w.slug)) continue;
    if (w.strip) {
      const next = withStrip(def, w.slug);
      if (next) def = next;
      else left.push(w);
      continue;
    }
    const candidates = slotsOf(def)
      .filter((s) => !kept.has(refKey(s)) && s.rowSpan > 1 && !(PLAIN.has(w.slug) && s.slug === w.slug))
      .map((s) => ({ s, floor: floorOf(w.slug, s.columnSpan, w.props) }))
      .filter(({ s, floor }) => floor <= s.rowSpan)
      // Plain boxes first; then the closest fit, so a small module does not
      // take the biggest cells while a big one is still to come.
      .sort((a, b) => Number(!PLAIN.has(a.s.slug)) - Number(!PLAIN.has(b.s.slug)) || a.s.rowSpan * a.s.columnSpan - b.s.rowSpan * b.s.columnSpan);
    let placed = false;
    for (const { s } of candidates) {
      const next = withSlot(def, s, w.slug, w.props);
      if (!valid(next)) continue;
      def = next;
      kept.add(refKey(s));
      placed = true;
      break;
    }
    if (!placed) left.push(w);
  }
  return { def, left };
}

// ------------------------------------------------------------ the front pages

const PAGE_ROWS = 36;
const COLUMN = 12;

/**
 * The pages at the front: what the answers want there, and what found no
 * room further in, in columns half a page wide - two to a page - each
 * module at its own height (at least a third of a page, so nothing is a
 * sliver), the rest of a column a note box. Null when there is nothing for
 * them. What does not fit in four columns is returned.
 */
function frontPages(items: Want[]): { def: HeroSpread | null; left: Want[] } {
  if (items.length === 0) return { def: null, left: [] };
  const columns: Array<Array<{ w: Want; rows: number }>> = [[], [], [], []];
  const used = [0, 0, 0, 0];
  const left: Want[] = [];
  for (const w of items) {
    const rows = Math.min(PAGE_ROWS, Math.max(floorOf(w.slug, COLUMN, w.props), 10));
    const c = used.findIndex((u) => PAGE_ROWS - u >= rows);
    if (c === -1) {
      left.push(w);
      continue;
    }
    columns[c].push({ w, rows });
    used[c] += rows;
  }
  const pages: [ReturnType<typeof at>[], ReturnType<typeof at>[]] = [[], []];
  columns.forEach((column, c) => {
    const page = pages[c < 2 ? 0 : 1];
    const columnStart = (c % 2) * COLUMN;
    let row = 0;
    column.forEach(({ w, rows }, i) => {
      // The column's last module takes a sliver too small for a box.
      const rest = PAGE_ROWS - (row + rows);
      const span = i === column.length - 1 && rest > 0 && rest < 4 ? rows + rest : rows;
      page.push(at(w.slug, columnStart, row, COLUMN, span, w.props));
      row += span;
    });
    if (row < PAGE_ROWS) page.push(at("labeled-box", columnStart, row, COLUMN, PAGE_ROWS - row, box(row === 0 ? "Notes" : "More Notes")));
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
  // Hours past midnight are coming (the editor change agreed 19 October);
  // until then a night runs to midnight.
  const ranges: Record<string, [string, string]> = { early: ["05:00", "21:00"], day: ["07:00", "23:00"], owl: ["10:00", "24:00"], nights: ["12:00", "24:00"] };
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

/** Question 16's rows, cleaned: a title, at least one day, a start before
 *  its end. (A night shift that ends the next morning waits for hours past
 *  midnight.) */
function scheduleFrom(answers: Answers): ScheduleEntry[] {
  if (one(answers, "schedule") !== "add") return [];
  const time = (t: unknown) => (typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : null);
  return (answers.details?.schedule ?? [])
    .map((e) => ({ title: String(e.title ?? "").trim().slice(0, 60), days: [...new Set((e.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))], from: time(e.from), to: time(e.to) }))
    .filter((e): e is ScheduleEntry => Boolean(e.title && e.days.length > 0 && e.from && e.to && e.from < e.to))
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

/** The whole planner the answers make. `font` is the reveal's choice; until
 *  then the base week's. */
export function planFromAnswers(input: Answers, font?: FontChoice, today = new Date()): OtterPlan {
  const answers = routedAnswers(input);
  const fills = one(answers, "fills") ?? "everything";
  const base = HERO_BY_KEY[WEEK_BASE[fills] ?? "base"] ?? HERO_BY_KEY.base;
  const chosenFont: FontChoice = font ?? base.layout.font;
  const pages = new Set(answers.pages?.length ? answers.pages : ["week"]);
  const inner: Array<"month" | "week" | "day"> = (["month", "week", "day"] as const).filter((p) => pages.has(p));
  const follow = FOLLOW[fills]?.[one(answers, "follow") ?? ""] ?? [];
  const wants = [...follow, ...practiceWants(answers), ...trackWants(answers), ...todoWants(answers), ...roomWants(answers)];
  const notes: string[] = [];

  // Each want to the first of its parts the book has.
  const routed = new Map<PlannerPart, Want[]>(PART_ORDER.map((p) => [p, []]));
  for (const w of wants) {
    const part = w.parts.find((p) => p === "front" || (inner as PlannerPart[]).includes(p));
    if (part) routed.get(part)!.push(w);
  }

  const parts: OtterPart[] = [];
  const front: Want[] = [...routed.get("front")!];
  const starts: Record<"month" | "week" | "day", () => HeroSpread> = {
    month: plainMonth,
    week: () => bare(base, `otter-week-${base.key}`),
    day: plainDay,
  };
  for (const part of inner) {
    const start = settle(starts[part](), answers, chosenFont);
    const { def, left } = fillSpread(start, routed.get(part)!);
    parts.push({ part, spread: def });
    for (const w of left) {
      // Only what makes sense once waits at the front: a box to write or
      // draw in. A done list printed once is not a done list.
      if (PLAIN.has(w.slug)) {
        front.push(w);
        notes.push(`No room for ${nameOf(w.slug).toLowerCase()} on ${PART_WORDS[part]}, so I put one at the front.`);
      } else {
        notes.push(`No room for ${nameOf(w.slug).toLowerCase()} on ${PART_WORDS[part]}. Swap it in from the Modules panel if you want it.`);
      }
    }
  }
  const unique = front.filter((w, i) => front.findIndex((x) => x.slug === w.slug && JSON.stringify(x.props) === JSON.stringify(w.props)) === i);
  const { def: frontDef, left: dropped } = frontPages(unique);
  if (frontDef) parts.unshift({ part: "front", spread: settle(frontDef, answers, chosenFont) });
  for (const w of dropped) notes.push(`I ran out of pages for ${nameOf(w.slug).toLowerCase()}. Add it from the Modules panel.`);

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

// The landing page's spreads are real pages: every module fits, nothing
// overlaps, nothing is shorter than its content needs, every page is full,
// and each spread has somewhere for the handwriting to go - the hours'
// slots at their times, a dotted day's rows, a month's squares.
//
// Run as part of: npm test
import { LANDING_PAGE_GRID, SPREAD_DEFS, baseSheetSpread, landingSpreads, layoutPreview, spreadPlacements, spreadProblems, type Placed } from "./spreads";
import { PEOPLE, SIDEBAR_FROM_ROW, type Slot } from "./archetypes";
import { MODULE_REGISTRY, moduleSchemaDefaults } from "@/lib/moduleRegistry";
import { promptLineCounts } from "@/lib/modules/promptedLines";
import { todoItems } from "@/lib/modules/todoChecklist";
import { renderHabitTracker } from "@/lib/modules/habitTracker";
import { columnSpanToDayCount, gridCellToPixels } from "@/lib/grid";
import { PageLevel } from "@/generated/prisma/enums";
import { BASE_SPREAD, HERO_BY_KEY, HERO_SPREADS, type HeroSpread } from "./heroSpreads";
import { WEEK_TITLE_ROW_SPAN } from "@/lib/pageLayouts";
import { PLANNER_SPREADS } from "./plannerSpreads";
import { ALL_PLANNERS, PLANNERS, partsOf } from "./plannerTemplates";
import { STARTER_BY_KEY } from "./starterLayouts";
import { CATALOGUE } from "@/lib/moduleCatalogue";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

// The sidebar starts under the week title, wherever pageLayouts puts it.
check("the sidebar starts under the week title", SIDEBAR_FROM_ROW === WEEK_TITLE_ROW_SPAN, `${SIDEBAR_FROM_ROW} vs ${WEEK_TITLE_ROW_SPAN}`);
// Every person's sidebar and zones are full: "Use this week" relies on it,
// so the weekly layout's own seeded boxes find no free cells to come back
// into (planner/archetypeWeek.ts).
for (const person of PEOPLE) {
  const sidebarRows = person.layout.sidebar.reduce((n, [, rows]) => n + rows, 0);
  check(`${person.key}: the sidebar fills its 33 rows`, sidebarRows === 33, `${sidebarRows}`);
  for (const [zone, slots, columns] of [["below-left", person.layout.belowLeft, 18], ["below-right", person.layout.belowRight, 24]] as const) {
    const cells = slots.reduce((n, s) => n + s.columnSpan * s.rowSpan, 0);
    check(`${person.key}: the ${zone} zone is full`, cells === columns * 15, `${cells} of ${columns * 15} cells`);
  }
}

check("every spread has its own key", new Set(HERO_SPREADS.map((s) => s.key)).size === HERO_SPREADS.length);
check("every person's week is in the hero", PEOPLE.every((p) => HERO_BY_KEY[p.key]));

/** Whether the hero draws the spread's calendar: hours with times. With
 *  increments off the grid can list a day's events (hourlyGridCore's
 *  offModeEventLines), but the hero passes it none (spreads.ts). */
const drawsEvents = (s: HeroSpread) => (s.layout.kind === "week" || s.layout.kind === "day") && s.layout.hours?.intervalMode !== "off";
const dayCount = (s: HeroSpread) => (s.layout.kind === "week" ? 7 : s.layout.kind === "day" ? 2 : 0);

// A STRIP A DAY RUNS THE WHOLE WEEK (2026-10-19: "it doesn't really make
// sense to only have the icon strips be on the left page like the only have
// to drink water some days of the week"). An icon strip with no group count
// of its own draws a group per day it sits under, so under one page's days
// it stops at Wednesday or starts at Thursday, and in the sidebar it is
// under no day at all. Such a strip goes on both pages, covering all seven.
const PER_DAY_STRIPS = new Set(
  (CATALOGUE as Array<{ slug: string; primitive?: string; props?: Record<string, unknown> }>)
    .filter((m) => m.primitive === "icon-strip" && !m.props?.groups)
    .map((m) => m.slug),
);
for (const spread of [...HERO_SPREADS, BASE_SPREAD, ...PLANNER_SPREADS]) {
  const layout = spread.layout;
  if (layout.kind !== "week") continue;
  const perDay = (slug: string, props?: Record<string, unknown>) => (PER_DAY_STRIPS.has(slug) || slug === "icon-strip") && !props?.groups;
  for (const [slug, , props] of layout.sidebar) {
    check(`${spread.key}: ${slug} is a strip a day, not in the sidebar`, !perDay(slug, props));
  }
  const days = new Map<string, Set<number>>();
  for (const [page, slots] of [[0, layout.belowLeft], [1, layout.belowRight]] as const) {
    for (const slot of slots) {
      if (!perDay(slot.slug, slot.props)) continue;
      const first = page === 0 ? Math.round((slot.columnStart - 6) / 6) : 3 + Math.round(slot.columnStart / 6);
      const name = `${slot.slug} ${String(slot.props?.heading ?? "")}`.trim();
      const under = days.get(name) ?? new Set<number>();
      for (let d = 0; d < Math.max(1, Math.round(slot.columnSpan / 6)); d++) under.add(first + d);
      days.set(name, under);
    }
  }
  for (const [name, under] of days) check(`${spread.key}: ${name} runs the whole week`, under.size === 7, `under ${under.size} of 7 days`);
}

// The base week, on the hero's loose sheets (heroExtras.ts): checked as
// strictly as the journal's spreads, and not among them.
check("the base week is not in the journal's turn", !HERO_SPREADS.includes(BASE_SPREAD));
for (const spread of [...HERO_SPREADS, BASE_SPREAD]) {
  // Nothing scheduled where nothing would draw it: a month's calendar draws
  // no events, the hero gives a week with increments off none (its days are
  // the person's own list), and scheduled things are never written by hand
  // instead (2026-10-06).
  if (!drawsEvents(spread)) {
    check(`${spread.key}: no calendar, where none is drawn`, spread.calendar.length === 0 && spread.events.length === 0);
  }
  check(`${spread.key}: a log only where the days are dotted or blank`, !spread.log || !drawsEvents(spread));
  check(`${spread.key}: month writing only on a month`, !spread.month || spread.layout.kind === "month");
  check(`${spread.key}: its days are its spread's`, [...spread.calendar, ...spread.events].every((e) => e.day < dayCount(spread)));
  // Handwriting stays clear of the calendar's event blocks, except a note
  // written ON one, below its title (2026-10-06: scheduled things are the
  // app's events, written around).
  const blocks = spread.calendar.flatMap((c) => (c.end > 24 ? [{ ...c, end: 24 }, { ...c, day: c.day + 1, start: 0, end: c.end - 24 }] : [c]));
  for (const e of spread.events) {
    const from = e.at;
    const to = e.until ?? e.at + 0.5;
    const under = blocks.filter((c) => c.day === e.day && from < c.end && to > c.start);
    if (e.on) {
      check(`${spread.key}: "${e.text}" is written on an event, below its title`, under.length === 1 && from >= under[0].start + 0.5 && to <= under[0].end, `${under.length} under it`);
    } else {
      check(`${spread.key}: "${e.text}" stays off their events`, under.length === 0, under.map((c) => c.title).join(", "));
    }
  }
}

for (const def of [...SPREAD_DEFS, BASE_SPREAD]) {
  const problems = spreadProblems(def);
  check(`${def.key} is a valid spread`, problems.length === 0, problems.join("; "));
}

// The prebuilt planners (plannerTemplates.ts): their spreads as strictly as
// the hero's, though the hero does not turn through them; every part a
// spread of its own kind; and one week start and one font a book, since
// Use this planner makes one journal of them (archetypeWeek.ts).
const PART_KIND = { front: "pages", month: "month", week: "week", day: "day" } as const;
for (const def of PLANNER_SPREADS) {
  const problems = spreadProblems(def);
  check(`${def.key} is a valid spread`, problems.length === 0, problems.join("; "));
  check(`${def.key}: not in the hero's turn`, !HERO_SPREADS.includes(def));
  check(`${def.key}: its own key`, HERO_BY_KEY[def.key] === def);
}
check("every planner can be made", PLANNERS.length === ALL_PLANNERS.length && PLANNERS.length > 0, `${PLANNERS.length} of ${ALL_PLANNERS.length}`);

// WHAT PRINTS CAN BE READ, AND THE HOURS FILL THEIR ROWS (2026-10-21). The
// planner library's first measure found a flare log's 0 to 10 circles
// numbered at 2.3pt (ten circles in a six-column sidebar) and three weeks
// whose hours stopped an inch and a half above the modules under them.
// Each passed every check above: a module may shrink its words to fit, and
// the hours' box counts as filled whatever the grid draws in it.
const PT = 300 / 72; // the landing page's pixels: 75 to the quarter inch
const CELL = 75;
for (const def of [...HERO_SPREADS, ...PLANNER_SPREADS]) {
  const preview = layoutPreview(def, new Date(Date.UTC(2026, 0, 5)));
  // The +1 after midnight is a superscript, small on purpose.
  const tiny = preview.pages.flatMap((page) =>
    page.marks.flatMap((m) => (m.k === "t" && m.t.trim() && m.t.trim() !== "+1" && m.z < 4 * PT ? [`"${m.t.trim()}" at ${(m.z / PT).toFixed(1)}pt`] : [])),
  );
  check(`${def.key}: no words printed under 4pt`, tiny.length === 0, tiny.slice(0, 3).join(", "));
  if (!drawsEvents(def)) continue;
  const layout = def.layout as { kind: "week" | "day"; hoursRows?: number };
  const boxBottom = LANDING_PAGE_GRID.marginPx + (layout.hoursRows ?? 20) * CELL;
  // The right page's hours: the rule under the last time is the grid's foot.
  const marks = preview.pages[1].marks;
  const times = marks.filter((m): m is Extract<typeof m, { k: "t" }> => m.k === "t" && /^\d{1,2}:\d{2}$/.test(m.t.trim()));
  check(`${def.key}: its hours print their times`, times.length > 0);
  if (times.length === 0) continue;
  const lastTime = Math.max(...times.map((t) => t.y + t.z));
  const feet = marks.flatMap((m) => (m.k === "r" && m.h <= 3 && m.w > 100 && m.y >= lastTime - 5 && m.y <= boxBottom + 2 ? [m.y] : []));
  const foot = feet.length > 0 ? Math.min(...feet) : lastTime;
  const blank = (boxBottom - foot) / CELL;
  check(`${def.key}: its hours fill their rows`, blank <= 1.2, `${blank.toFixed(1)} rows blank under them: set hoursRows to what they draw`);
}
for (const planner of ALL_PLANNERS) {
  const parts = partsOf(planner);
  check(`${planner.key}: has a week, a month or a day`, parts.some(({ part }) => part !== "front"));
  for (const { part, key } of parts) {
    const spread = HERO_BY_KEY[key];
    check(`${planner.key}: its ${part} is a spread`, !!spread, key);
    if (!spread) continue;
    check(`${planner.key}: its ${part} is a ${PART_KIND[part]} spread`, spread.layout.kind === PART_KIND[part], spread.layout.kind);
    // Listed under it in the gallery, so its picture and popup exist.
    check(`${planner.key}: ${key} is a layout of its own, filed under it`, STARTER_BY_KEY[key]?.planner === planner.key);
  }
  const layouts = parts.map(({ key }) => HERO_BY_KEY[key]?.layout).filter(Boolean);
  check(`${planner.key}: one week start`, new Set(layouts.map((l) => l.weekStartsMonday)).size === 1);
  check(`${planner.key}: one font`, new Set(layouts.map((l) => l.font)).size === 1);
}

// WHAT A MODULE WAS GIVEN, IT PRINTS (audit 2026-10-29). A prompted-lines
// module draws only the prompts whose block fits whole, and drops the rest
// without a word: four monthly reviews printed "What worked?" and "What did
// not?" and never "What changes next month?", every month. A to-do works
// out its day columns from its width, so a list 12 wide off the hours
// printed every item twice side by side (the night nurse's Shift Bag).
// Neither broke a check above: both fit, and both fill their box.
//
// Each guard is a function so it can be shown to catch the defect it is
// for: a copy of a spread with the defect put back must be reported (the
// controls below), or the guard passes by checking nothing.
const PRINT_DATE = new Date(Date.UTC(2026, 0, 5));
/** The words printed inside a placement's box. */
function textIn(preview: ReturnType<typeof layoutPreview>, p: Placed): string[] {
  const r = gridCellToPixels(LANDING_PAGE_GRID, p);
  return preview.pages[p.page].marks.flatMap((m) =>
    m.k === "t" && m.x >= r.x - 1 && m.x < r.x + r.width && m.y >= r.y - 1 && m.y < r.y + r.height ? [m.t.trim()] : [],
  );
}
const where = (def: HeroSpread, p: Placed) => `${def.key} ${p.page ? "R" : "L"} ${p.slug} at c${p.columnStart} r${p.rowStart} ${p.columnSpan}x${p.rowSpan}`;

/** Every prompt of a prompted-lines module gets its block: its words and
 *  its lines. promptLineCounts is what the renderer draws by; the words
 *  are read off the page, so a prompt cut short is caught too. */
/** A placement's props as drawn: on a facing-days spread the right page of
 *  a challenge is its next day (spreads.ts, COUNTS_DAYS). */
const drawnProps = (def: HeroSpread, p: { slug: string; page: 0 | 1; props: Record<string, unknown> }) =>
  def.layout.kind === "day" && p.page === 1 && p.slug === "challenge-step"
    ? MODULE_REGISTRY["challenge-step"].dated!(p.props, { key: "c", label: "", start: new Date(Date.UTC(2026, 0, 6)), level: PageLevel.DAILY, index: 1, total: 2 })
    : p.props;

function droppedPrompts(def: HeroSpread): string[] {
  const preview = layoutPreview(def, PRINT_DATE);
  return spreadPlacements(def).flatMap((p) => {
    if (p.locked || MODULE_REGISTRY[p.slug]?.primitive !== "prompted-lines" || !Array.isArray(p.props.prompts)) return [];
    const prompts = (drawnProps(def, p).prompts as unknown[]).map((q) => String(q ?? "").trim());
    const fits = promptLineCounts(p.props, p.rowSpan - 1).length;
    const printed = new Set(textIn(preview, p).map((t) => t.toLowerCase()));
    const missing = prompts.filter((q, i) => i >= fits || (q !== "" && !printed.has(q.toLowerCase())));
    return missing.length > 0 ? [`${where(def, p)}: ${fits} of ${prompts.length} prompts fit, missing "${missing.join('", "')}"`] : [];
  });
}

/** A to-do prints each of its items once - or once a day, where it sits
 *  under a week's days and each day column is meant to carry the list. */
function doubledItems(def: HeroSpread): string[] {
  const preview = layoutPreview(def, PRINT_DATE);
  return spreadPlacements(def).flatMap((p) => {
    const items = p.slug === "todo-checklist" ? todoItems(p.props) : [];
    if (p.locked || items.length === 0) return [];
    const underDays = def.layout.kind === "week" && !(p.page === 0 && p.columnStart < 6);
    const want = underDays ? columnSpanToDayCount(LANDING_PAGE_GRID, p.columnSpan) : 1;
    const text = textIn(preview, p);
    const wrong = items.flatMap((item) => {
      const n = text.filter((t) => t === item).length;
      return n === want ? [] : [`"${item}" ${n}x`];
    });
    return wrong.length > 0 ? [`${where(def, p)}: each item should print ${want === 1 ? "once" : `${want} times, a day each`}, got ${wrong.join(", ")}`] : [];
  });
}

/** Two future logs on one spread are one year split in two (the teacher's
 *  and the homeschool year pages): dated, the second starts where the first
 *  stops, so no month prints twice (monthOffset, moduleRegistry.ts). Both
 *  printed September to February in a September book until 2026-10-29. */
function repeatedMonths(def: HeroSpread): string[] {
  const logs = spreadPlacements(def).filter((p) => p.slug === "future-log-months");
  if (logs.length < 2) return [];
  const dated = MODULE_REGISTRY["future-log-months"].dated!;
  const at = { key: null, label: "", start: new Date(Date.UTC(2026, 8, 1)), level: PageLevel.FRONT_MATTER, index: 0, total: 1 };
  const months = logs.flatMap((p) => (dated(p.props, at).prompts as string[]).map((m) => m.toLowerCase()));
  const twice = months.filter((m, i) => months.indexOf(m) !== i);
  return twice.length > 0 ? [`${def.key}: its future logs both print ${[...new Set(twice)].join(", ")} in a September book`] : [];
}

// Known and not yet fixed: the hero weeks are archetypes.ts's, outside
// this audit's changes. Each entry must still be reported, so the list
// cannot outlive its fix: once the week is mended, take its line out.
//   adhd: Dopamine Menu 12x8 has room for two of its three prompts at two
//     lines each; { linesPerPrompt: 1 } prints all three.
//   faith-christian (held): SOAP 18x15 with promptLines [2, 3, 4, 3] needs
//     16 rows of body and has 14, so Prayer never prints; its handwriting
//     writes a fourth line for it.
const KNOWN_DROPPED = new Set(["adhd R dopamine-menu at c12 r28 12x8", "faith-christian L soap-study at c6 r21 18x15"]);
const everySpread = [...new Map([...HERO_SPREADS, BASE_SPREAD, ...PLANNER_SPREADS].map((s) => [s.key, s])).values()];
const stillDropped = new Set<string>();
for (const def of everySpread) {
  for (const problem of droppedPrompts(def)) {
    const known = [...KNOWN_DROPPED].find((k) => problem.startsWith(`${k}:`));
    if (known) stillDropped.add(known);
    else check(`${def.key}: every prompt prints with its lines`, false, problem);
  }
  for (const problem of doubledItems(def)) check(`${def.key}: no checklist item prints twice`, false, problem);
  for (const problem of repeatedMonths(def)) check(`${def.key}: no month in two future logs`, false, problem);
}
for (const known of KNOWN_DROPPED) check(`known dropped prompt "${known}" is fixed: take it out of KNOWN_DROPPED`, stillDropped.has(known));
check("the future-log check has spreads to check", everySpread.filter((d) => spreadPlacements(d).filter((p) => p.slug === "future-log-months").length > 1).length >= 2);

// The controls: each defect put back on a copy, and caught.
const withSlot = (key: string, slug: string, change: (s: Slot) => Slot): HeroSpread => {
  const def = HERO_BY_KEY[key];
  if (def.layout.kind !== "pages") throw new Error(`${key} is not a pages spread`);
  const pages = def.layout.pages.map((slots) => slots.map((s) => (s.slug === slug ? change(s) : s))) as [Slot[], Slot[]];
  return { ...def, layout: { ...def.layout, pages } };
};
{
  // The flare log's review at its default two lines a prompt: 12x9 holds two.
  const flare = HERO_BY_KEY["month-flare-log"];
  if (flare.layout.kind !== "month") throw new Error("month-flare-log is not a month spread");
  const twoLines = (s: Slot) => (s.slug === "monthly-review" ? { ...s, props: { ...s.props, linesPerPrompt: 2 } } : s);
  const layout = { ...flare.layout, belowLeft: flare.layout.belowLeft.map(twoLines), belowRight: flare.layout.belowRight.map(twoLines) };
  check("control: a review with no room for its third prompt is reported", droppedPrompts({ ...flare, layout }).length > 0);
}
check(
  "control: a to-do list 12 wide off the hours is reported printing its items twice",
  doubledItems(withSlot("pages-night-nurse", "todo-checklist", (s) => ({ ...s, columnSpan: 12 }))).length > 0,
);
check(
  "control: a second future log with no month offset is reported",
  repeatedMonths(withSlot("pages-teacher-year", "future-log-months", (s) => ({ ...s, props: { ...s.props, monthOffset: 0 } }))).length > 0,
);

// THE WEEK'S COUNT CAN BE LEFT OFF (lib-a2-22): a layout's showWeekCount
// false prints "WEEK" over the dates, with no "n/52" - the grief week,
// where a count toward an end reads wrong. The default still counts. Kept
// through the registry's dated and undated hooks, which is how a journal's
// pages keep it.
{
  const grief = HERO_BY_KEY["week-grief"];
  const title = (def: HeroSpread) => layoutPreview(def, PRINT_DATE).pages[0].marks.flatMap((m) => (m.k === "t" && /^WEEK\b/.test(m.t) ? [m.t] : []));
  const dates = (def: HeroSpread) => layoutPreview(def, PRINT_DATE).pages[0].marks.some((m) => m.k === "t" && m.t === "JAN 5 - JAN 11");
  const student = HERO_BY_KEY["student"];
  check("a week title counts its weeks by default", /^WEEK \d+\/52$/.test(title(student)[0] ?? ""), title(student).join(", "));
  if (grief.layout.kind !== "week") throw new Error("week-grief is not a week spread");
  // The grief week's own layout sets it (plannerLibrary2.ts), and "Use this
  // week" carries it to the journal's title (archetypeWeek.ts spines).
  check("the grief week leaves the count off", grief.layout.showWeekCount === false);
  check("showWeekCount false prints WEEK alone", title(grief).join() === "WEEK", title(grief).join(", "));
  check("showWeekCount false keeps the dates", dates(grief) && dates(student));
  const titleHooks = MODULE_REGISTRY["week-title"];
  const at = { key: "w", label: "", start: new Date(Date.UTC(2026, 0, 5)), level: PageLevel.WEEKLY, index: 2, total: 13 };
  check("the dated hook keeps showWeekCount", titleHooks.dated!({ showWeekCount: false }, at).showWeekCount === false);
  check("the undated hook keeps showWeekCount", titleHooks.undated!({ showWeekCount: false }).showWeekCount === false);
  check("week-title's schema has showWeekCount, default true", moduleSchemaDefaults("week-title").showWeekCount === true);
}

// ANDREW'S FOUR CALLS (2026-10-30, with the Gemini report), held.
{
  // A year's grid prints the book's months: three for a quarter, twelve at
  // most from the book's first, and never on a month page or retyped.
  const pixels = moduleSchemaDefaults("year-in-pixels");
  const front = (start: string, end: string, level: PageLevel = PageLevel.FRONT_MATTER) => ({ key: null, label: "", start: new Date(`${start}T00:00:00Z`), end: new Date(`${end}T00:00:00Z`), level, index: 0, total: 1 });
  for (const slug of ["year-in-pixels", "bill-tracker"]) {
    const props = moduleSchemaDefaults(slug);
    const cols = (at: ReturnType<typeof front>, p = props) => MODULE_REGISTRY[slug].dated!(p, at).columns as string[];
    check(`${slug}: a quarter's book prints its three months`, cols(front("2026-11-01", "2027-01-31")).join() === "Nov,Dec,Jan", cols(front("2026-11-01", "2027-01-31")).join());
    check(`${slug}: a long book prints twelve, from its first`, cols(front("2026-09-01", "2027-12-31")).join() === "Sep,Oct,Nov,Dec,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug");
    check(`${slug}: not on a month page`, cols(front("2026-11-01", "2027-01-31", PageLevel.MONTHLY)).length === 12);
    check(`${slug}: retyped months are kept`, cols(front("2026-11-01", "2027-01-31"), { ...props, columns: ["Q1", "Q2"] }).join() === "Q1,Q2");
  }
  check("year in pixels still has twelve months undated", (pixels.columns as string[]).length === 12);
  // Do top left, as Covey drew it; the hand writes its tasks to match.
  const matrix = moduleSchemaDefaults("eisenhower-matrix");
  check("the Eisenhower reads Do, Schedule, Delegate, Delete", JSON.stringify(matrix.quadrants) === JSON.stringify(["Do", "Schedule", "Delegate", "Delete"]) && matrix.xLeft === "Urgent", JSON.stringify(matrix));
  check("the to-do list is headed To Do", moduleSchemaDefaults("todo-checklist").heading === "To Do");
  // Meals are written in on a home week; ticks are "Meals Eaten".
  check("the home week writes its meals in", spreadPlacements(HERO_BY_KEY.home).some((p) => p.slug === "weekly-meal-plan"));
  check("the tick module says what it records", moduleSchemaDefaults("meal-planner").heading === "Meals Eaten");
  // A tracker's rows print in capitals unless it asks for them as typed -
  // the setting offered for a challenge's plan, off everywhere (2026-10-30).
  const rowName = (extra: Record<string, unknown>) =>
    renderHabitTracker({ x: 0, y: 0, width: 1560, height: 964 }, { ...moduleSchemaDefaults("habit-tracker"), habits: ["Walk 30 minutes, easy"], ...extra }, "t", "Inter")
      .find((e) => e.id === "t-row0-name")?.text;
  check("tracker rows print in capitals by default", rowName({}) === "WALK 30 MINUTES, EASY", String(rowName({})));
  check("a tracker asked for its rows as typed prints them so", rowName({ rowsAsTyped: true }) === "Walk 30 minutes, easy", String(rowName({ rowsAsTyped: true })));
  check("the setting is off by default", moduleSchemaDefaults("habit-tracker").rowsAsTyped === false);
}

// EVERY DAY OF A CHALLENGE PRINTS (2026-10-30). The gallery draws a
// challenge's page as its first day; the book prints thirty, each with its
// own step through challenge-step's dated hook. So each step is printed
// here, in its own page's cell, and held to the 4pt floor and to fitting
// whole: a long step on day twelve would otherwise reach print unseen. And
// the front's plan is the pages' plan, step for step.
{
  const hook = MODULE_REGISTRY["challenge-step"];
  /** The spread with its step module given these props, in the sidebar
   *  (a [slug, rows, props] entry) or in a cell under the hours. */
  const withStep = (def: HeroSpread, props: Record<string, unknown>): HeroSpread => {
    const l = def.layout as unknown as Record<string, unknown>;
    const cell = (s: Slot) => (s.slug === "challenge-step" ? { ...s, props } : s);
    const side = (e: unknown) => (Array.isArray(e) && e[0] === "challenge-step" ? [e[0], e[1], props] : e);
    const zones = Object.fromEntries(["below", "belowLeft", "belowRight"].filter((k) => Array.isArray(l[k])).map((k) => [k, (l[k] as Slot[]).map(cell)]));
    return { ...def, layout: { ...l, ...(Array.isArray(l.sidebar) ? { sidebar: (l.sidebar as unknown[]).map(side) } : {}), ...zones } } as unknown as HeroSpread;
  };
  let printed = 0;
  for (const def of PLANNER_SPREADS) {
    for (const p of spreadPlacements(def)) {
      // a facing-days spread draws its right page as the next day (below):
      // the left page's cell is the one every day's step is tried in
      if (p.slug !== "challenge-step" || p.page !== 0) continue;
      const list = p.props.steps as string[];
      check(`${def.key}: its step module has its steps`, Array.isArray(list) && list.length > 0);
      for (let index = 0; index < list.length; index++) {
        const at = { key: "c", label: "", start: new Date(Date.UTC(2026, 0, 5 + index)), level: def.layout.kind === "day" ? PageLevel.DAILY : PageLevel.WEEKLY, index, total: list.length };
        const props = hook.dated!(p.props, at);
        const day = withStep(def, props);
        const words = textIn(layoutPreview(day, PRINT_DATE), p);
        const small = layoutPreview(day, PRINT_DATE).pages[p.page].marks.filter((m) => m.k === "t" && m.t.trim() && m.z < 4 * PT);
        // Headings print in capitals: compared without case.
        const said = words.map((w) => w.toLowerCase());
        const whole = said.includes(list[index].toLowerCase()) && said.includes(`${p.props.stepUnit} ${index + 1} of ${list.length}`.toLowerCase());
        check(`${def.key}: ${p.props.stepUnit} ${index + 1}'s step prints whole and at 4pt or more`, whole && small.length === 0, `${list[index]} -> ${words.join(" | ")}${small.length ? ` (under 4pt: ${small.length})` : ""}`);
        printed++;
      }
      const planner = ALL_PLANNERS.find((pl) => pl.day === def.key || pl.week === def.key);
      const front = planner?.front ? spreadPlacements(HERO_BY_KEY[planner.front]).find((x) => x.slug === "habit-tracker" && x.props.heading === "The Plan") : undefined;
      const rows = ((front?.props.habits as string[] | undefined) ?? []).map((h) => h.replace(/^(Week )?\d+\. /, ""));
      check(`${def.key}: the front's plan is its steps`, JSON.stringify(rows) === JSON.stringify(list), `${rows.length} rows, ${list.length} steps`);
      // Sentences, so as typed - not the tracker's capitals (his call).
      if (planner?.front && front) {
        const first = (front.props.habits as string[])[0];
        const marks = layoutPreview(HERO_BY_KEY[planner.front], PRINT_DATE).pages[front.page].marks.filter((m) => m.k === "t" && m.t === first);
        check(`${planner.front}: the plan prints as typed`, marks.length === 1, first);
      }
    }
  }
  check("the challenges' steps were printed", printed >= 200, `${printed}`);
  // FACING DAYS ARE TWO DAYS (2026-10-31, his "both pages show day 1 for all
  // the challenges"): the left page day 1, the right page day 2, each with
  // its own step - and a journal made of the spread keeps day 1's words.
  let facing = 0;
  for (const def of PLANNER_SPREADS) {
    if (def.layout.kind !== "day") continue;
    const placed = spreadPlacements(def).filter((p) => p.slug === "challenge-step");
    if (placed.length === 0) continue;
    const list = placed[0].props.steps as string[];
    const drawn = layoutPreview(def, PRINT_DATE);
    const said = (page: 0 | 1) => textIn(drawn, placed.find((p) => p.page === page)!).map((w) => w.toLowerCase());
    const left = said(0);
    const right = said(1);
    check(
      `${def.key}: the left page is day 1 and the right day 2, each with its step`,
      left.includes(`day 1 of ${list.length}`) && left.includes(list[0].toLowerCase()) && right.includes(`day 2 of ${list.length}`) && right.includes(list[1].toLowerCase()),
      `${left.join(" | ")} || ${right.join(" | ")}`
    );
    check(`${def.key}: a journal made of it keeps day 1's words on both pages`, placed.every((p) => p.props.heading === `Day 1 of ${list.length}` && (p.props.prompts as string[])[0] === list[0]));
    facing++;
  }
  check("every 30-day challenge was looked at", facing >= 9, `${facing}`);
}

// Everything, held weeks included (production: false) - checked as strictly
// as what is on the live site.
const spreads = landingSpreads(new Date(Date.UTC(2026, 8, 22)), false);
check("one spread per definition", spreads.length === SPREAD_DEFS.length);
// Held for a read-through: not on the live site.
const live = landingSpreads(new Date(Date.UTC(2026, 8, 22)), true);
check("held weeks stay off the live site", live.every((s) => !HERO_BY_KEY[s.key].held) && live.length < spreads.length);
// The student first ("start with student").
check("the student's week comes first", spreads[0].key === "student" && live[0].key === "student", spreads[0].key);
// Every kind of spread is shown.
for (const kind of ["week", "month", "day", "pages"]) check(`there are ${kind} spreads`, live.some((s) => HERO_BY_KEY[s.key].layout.kind === kind));

const hourOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
};
for (const spread of spreads) {
  const { layout } = HERO_BY_KEY[spread.key];
  for (const [index, page] of spread.pages.entries()) {
    const name = `${spread.key} page ${index}`;
    // A blank day or a lined page is few marks; an empty page is none.
    check(`${name}: something drawn`, page.marks.length > 40, `${page.marks.length} marks`);
    if (layout.kind === "week" || layout.kind === "day") {
      const hours = page.regions.find((r) => r.kind === "hours");
      const days = hours?.kind === "hours" ? hours.days : [];
      const want = layout.kind === "day" ? 1 : index === 0 ? 3 : 4;
      check(`${name}: hours found`, days.length === want, `found ${days.length}`);
      check(`${name}: every day is named`, days.every((d) => d.label.length > 0), days.map((d) => d.label).join(" "));
      if (layout.hours?.intervalMode === "off") {
        check(`${name}: the days are free, with rows to write on`, days.every((d) => d.free && d.slots.length >= 16 && d.hours.length === 0), days.map((d) => `${d.label}:${d.slots.length}`).join(" "));
      } else {
        // Each slot's time of day, read from its label: what puts "bed by
        // 10" at night and lunch at noon, whatever the increments.
        const start = hourOf(layout.hours?.startTime ?? "05:30");
        const end = hourOf(layout.hours?.endTime ?? "23:30");
        const step = (layout.hours?.intervalMinutes ?? 30) / 60;
        const count = Math.round((end - start) / step);
        check(
          `${name}: slot hours run ${start} to ${end - step}`,
          days.every((d) => d.slots.length === count && d.hours.every((h, i) => Math.abs(h - (start + i * step)) < 1e-6)),
          days.map((d) => `${d.label}:${d.slots.length}:${d.hours[0]}..${d.hours[d.hours.length - 1]}`).join(" ")
        );
      }
    } else if (layout.kind === "month") {
      const month = page.regions.find((r) => r.kind === "month");
      const cells = month?.kind === "month" ? month.cells : [];
      check(`${name}: the month's squares found`, cells.length > 0 && cells.length % (index === 0 ? 3 : 4) === 0, `${cells.length}`);
    } else {
      check(`${name}: modules only`, page.regions.every((r) => r.kind === "box") && page.regions.length > 0);
    }
  }
  if (layout.kind === "month") {
    // Every date of the month once, across the two pages.
    const dates = spread.pages.flatMap((p) => p.regions.flatMap((r) => (r.kind === "month" ? r.cells.filter((c) => c.inMonth).map((c) => c.date) : [])));
    const sorted = [...dates].sort((a, b) => (a ?? 0) - (b ?? 0));
    check(`${spread.key}: every date of the month, once`, sorted.length >= 28 && sorted.every((d, i) => d === i + 1), sorted.join(","));
  }
}
// The base week, undated: its title and its days carry no dates.
const base = baseSheetSpread();
const baseDates = base.pages.flatMap((page) =>
  page.regions.flatMap((r) =>
    r.kind === "hours"
      ? r.days.flatMap((d) => {
          const [hx, hy, hw, hh] = d.header;
          return page.marks.filter((m) => m.k === "t" && /^\d{1,2}$/.test(m.t) && m.x >= hx && m.x < hx + hw && m.y >= hy - 4 && m.y < hy + hh).map((m) => (m.k === "t" ? m.t : ""));
        })
      : []
  )
);
const baseRange = base.pages[0].marks.some((m) => m.k === "t" && / - /.test(m.t));
check("the base week is undated", baseDates.length === 0 && !baseRange, `${baseDates.join(", ")}${baseRange ? " and a date range" : ""}`);

// Consecutive weeks: the first spread is the week containing the date given
// (a Tuesday; the student's weeks start on Monday).
const firstTitle = spreads[0].pages[0].marks.find((m) => m.k === "t" && /-/.test(m.t));
check("the first spread is this week", firstTitle?.k === "t" && firstTitle.t === "SEP 21 - SEP 27", firstTitle?.k === "t" ? firstTitle.t : "no title");

// The strip carried on under the right page's days names those days: the
// day names a strip prints (MON, TUE...) are the left page's first three
// and the right page's last four, never MON to THU again (2026-10-19).
const SHORT_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
for (const key of ["student", "nurse", "adhd", "chronic-illness"]) {
  const spread = spreads.find((s) => s.key === key);
  const monday = PEOPLE.find((p) => p.key === key)?.layout.weekStartsMonday ?? false;
  const week = Array.from({ length: 7 }, (_, d) => SHORT_DAYS[(d + (monday ? 1 : 0)) % 7]);
  // Only what the strips print: a day chart beside one names all seven.
  const named = (page: 0 | 1) => {
    const strips = (spread?.pages[page].regions ?? []).flatMap((r) => (r.kind === "box" && r.slug && /water|spoon|focus|pill|yoga|starter|plants|icon-strip/.test(r.slug) ? [r.box] : []));
    return (spread?.pages[page].marks ?? []).flatMap((m) =>
      m.k === "t" && SHORT_DAYS.includes(m.t.trim().toUpperCase()) && // the names sit just above the strip's box
        strips.some(([x, y, w, h]) => m.x >= x - 1 && m.x <= x + w && m.y >= y - 24 && m.y <= y + h)
        ? [m.t.trim().toUpperCase()]
        : [],
    );
  };
  const left = named(0);
  const right = named(1);
  check(`${key}: the left page's strips name only its three days`, left.every((d) => week.slice(0, 3).includes(d)), left.join(" "));
  check(`${key}: the right page's strips name only its four days`, right.every((d) => week.slice(3).includes(d)), right.join(" "));
  // Not passed by printing nothing: the strips that name their days do.
  if (key !== "adhd") check(`${key}: its strips name their days`, left.length > 0 && right.length > 0, `${left.length} and ${right.length}`);
}

if (failures > 0) {
  console.error(`${failures} landing spread check(s) failed.`);
  process.exit(1);
}
const bytes = JSON.stringify(live).length;
console.log(`All landing spread checks passed (${spreads.length} spreads fit, fill their pages, overlap nothing and have their regions; ${(bytes / 1024).toFixed(0)} KB live).`);

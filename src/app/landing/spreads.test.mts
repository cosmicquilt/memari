// The landing page's spreads are real pages: every module fits, nothing
// overlaps, nothing is shorter than its content needs, every page is full,
// and each spread has somewhere for the handwriting to go - the hours'
// slots at their times, a dotted day's rows, a month's squares.
//
// Run as part of: npm test
import { SPREAD_DEFS, baseSheetSpread, landingSpreads, spreadProblems } from "./spreads";
import { PEOPLE, SIDEBAR_FROM_ROW } from "./archetypes";
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

/** Whether the spread's spine draws calendar events: hours with times. */
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
  // Nothing scheduled where nothing would draw it: a month's calendar and a
  // week with increments off draw no events, and scheduled things are never
  // written by hand instead (2026-10-06).
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

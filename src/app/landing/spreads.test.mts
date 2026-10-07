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

if (failures > 0) {
  console.error(`${failures} landing spread check(s) failed.`);
  process.exit(1);
}
const bytes = JSON.stringify(live).length;
console.log(`All landing spread checks passed (${spreads.length} spreads fit, fill their pages, overlap nothing and have their regions; ${(bytes / 1024).toFixed(0)} KB live).`);

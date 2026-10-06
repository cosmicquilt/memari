// The landing page's spreads are real pages: every module fits, nothing
// overlaps, nothing is shorter than its content needs, and each page has
// somewhere for the handwriting to go. (5:30 to 23:30 in half hours is 36 slots.)
//
// Run as part of: npm test
import { SPREAD_DEFS, landingSpreads, spreadProblems } from "./spreads";
import { PEOPLE, PEOPLE_BY_KEY, SIDEBAR_FROM_ROW } from "./archetypes";
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
for (const def of SPREAD_DEFS) {
  const problems = spreadProblems(def);
  check(`${def.key} is a valid spread`, problems.length === 0, problems.join("; "));
}

// Everyone, held weeks included (production: false) - they are checked as
// strictly as the ones on the live site.
const spreads = landingSpreads(new Date(Date.UTC(2026, 8, 22)), false);
check("one spread per definition", spreads.length === SPREAD_DEFS.length);
// Held for a read-through: not on the live site.
const live = landingSpreads(new Date(Date.UTC(2026, 8, 22)), true);
check("held weeks stay off the live site", live.every((s) => !PEOPLE_BY_KEY[s.key].held) && live.length < spreads.length);
// The student first ("start with student").
check("the student's week comes first", spreads[0].key === "student" && live[0].key === "student", spreads[0].key);
for (const spread of spreads) {
  for (const [index, page] of spread.pages.entries()) {
    const hours = page.regions.find((r) => r.kind === "hours");
    const days = hours?.kind === "hours" ? hours.days : [];
    check(`${spread.key} page ${index}: hours found`, days.length === (index === 0 ? 3 : 4), `found ${days.length}`);
    check(
      `${spread.key} page ${index}: every day has its slots`,
      days.every((d) => d.slots.length === 36 && d.label.length > 0),
      days.map((d) => `${d.label}:${d.slots.length}`).join(" ")
    );
    // Each slot's time of day, read from its unmarked 12-hour label: what
    // puts "bed by 10" at night and lunch at noon.
    check(
      `${spread.key} page ${index}: slot hours run 5:30 to 23:00`,
      days.every((d) => d.hours.every((h, i) => h === 5.5 + i * 0.5)),
      days.map((d) => `${d.label}:${d.hours[0]}..${d.hours[d.hours.length - 1]}`).join(" ")
    );
    check(`${spread.key} page ${index}: something drawn`, page.marks.length > 100, `${page.marks.length} marks`);
  }
}
// Consecutive weeks: the first spread is the week containing the date given
// (a Tuesday; the student's weeks start on Monday).
const firstTitle = spreads[0].pages[0].marks.find((m) => m.k === "t" && /-/.test(m.t));
check("the first spread is this week", firstTitle?.k === "t" && firstTitle.t === "SEP 21 - SEP 27", firstTitle?.k === "t" ? firstTitle.t : "no title");

if (failures > 0) {
  console.error(`${failures} landing spread check(s) failed.`);
  process.exit(1);
}
const bytes = JSON.stringify(spreads).length;
console.log(`All landing spread checks passed (${spreads.length} spreads fit, overlap nothing and have their hours; ${(bytes / 1024).toFixed(0)} KB).`);

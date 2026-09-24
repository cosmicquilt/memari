// The landing page's spreads are real pages: every module fits, nothing
// overlaps, nothing is shorter than its content needs, and each page has
// somewhere for the handwriting to go. (5:30 to 23:30 in half hours is 36 slots.)
//
// Run as part of: npm test
import { SPREAD_DEFS, landingSpreads, spreadProblems } from "./spreads";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

for (const def of SPREAD_DEFS) {
  const problems = spreadProblems(def);
  check(`${def.key} is a valid spread`, problems.length === 0, problems.join("; "));
}

const spreads = landingSpreads(new Date(Date.UTC(2026, 8, 22)));
check("one spread per definition", spreads.length === SPREAD_DEFS.length);
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
// Consecutive weeks: the first spread is the week containing the date given.
const firstTitle = spreads[0].pages[0].marks.find((m) => m.k === "t" && /-/.test(m.t));
check("the first spread is this week", firstTitle?.k === "t" && firstTitle.t === "SEP 20 - SEP 26", firstTitle?.k === "t" ? firstTitle.t : "no title");

if (failures > 0) {
  console.error(`${failures} landing spread check(s) failed.`);
  process.exit(1);
}
const bytes = JSON.stringify(spreads).length;
console.log(`All landing spread checks passed (${spreads.length} spreads fit, overlap nothing and have their hours; ${(bytes / 1024).toFixed(0)} KB).`);

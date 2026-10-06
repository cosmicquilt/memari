// THE PALETTE'S GROUPS, AS DRAFTED AND AGREED (2026-10-05). Every palette
// module lands in a group and a real section, the curated sections (Basics
// by kind, Philosophy & faith by tradition) leave nothing over, the counts
// are the mockup's, and every module says what it prints.
//
// Expected values are STATED here, not read back from the code.
//
// Run with: npx tsx src/lib/paletteGroups.test.mts

import { PALETTE_MODULES } from "./moduleRegistry";
import { GROUPS, GROUP_BLURBS, PALETTE_INFO, PALETTE_INFO_BY_SLUG, sectionsOf, whatItPrints } from "./paletteGroups";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}

const EXPECTED_COUNTS: Record<string, number> = {
  Basics: 14,
  Planning: 18,
  "Mood & health": 14,
  Food: 8,
  Fitness: 7,
  Money: 8,
  "Home & family": 8,
  "Philosophy & faith": 22,
  Growth: 13,
  "Hobbies & learning": 8,
  Recovery: 6,
  Travel: 6,
};

check(PALETTE_INFO.length === PALETTE_MODULES.length, `every palette module is listed (${PALETTE_INFO.length} of ${PALETTE_MODULES.length})`);
for (const group of GROUPS) {
  const members = PALETTE_INFO.filter((m) => m.group === group);
  check(members.length === EXPECTED_COUNTS[group], `${group}: ${members.length} modules, expected ${EXPECTED_COUNTS[group]}`);
  check(GROUP_BLURBS[group]?.length > 20, `${group} has a line to explain it`);
  for (const { section } of sectionsOf(members)) {
    check(section !== "Any page", `${group}: a module fell into "Any page" - a curated list is missing it`);
  }
}
const sectionNames = (group: string) => sectionsOf(PALETTE_INFO.filter((m) => m.group === group)).map((s) => s.section);
check(sectionNames("Basics").join("|") === "Write|Lists & tables|Trackers|Calendars & grids", `Basics by kind: ${sectionNames("Basics").join(", ")}`);
check(
  sectionNames("Philosophy & faith").join("|") === "Stoic|Taoist|Buddhist & meditation|Christian|Islamic|Jewish",
  `Philosophy & faith by tradition: ${sectionNames("Philosophy & faith").join(", ")}`
);
check(sectionNames("Planning").join("|") === "Daily pages|Weekly pages|Monthly pages|Beginning & end of the book", `Planning by page: ${sectionNames("Planning").join(", ")}`);
check(PALETTE_INFO_BY_SLUG.get("packing-list")?.group === "Travel", "Packing List moved to Travel");
check(PALETTE_INFO_BY_SLUG.get("labeled-box")?.section === "Write", "a note box is under Basics > Write");
check(PALETTE_INFO_BY_SLUG.get("tao-daily-verse")?.section === "Taoist", "Tao Reflection is under Taoist");

for (const m of PALETTE_INFO) {
  const line = whatItPrints(m.slug, m.previewProps);
  check(line.length > 8, `${m.slug} says what it prints ("${line}")`);
  check(!/undefined|NaN|\[object/.test(line), `${m.slug}: "${line}"`);
}
check(whatItPrints("salah-tracker", PALETTE_INFO_BY_SLUG.get("salah-tracker")!.previewProps).includes("Fajr"), "the Salah tracker names its prayers");

if (failures > 0) {
  console.error(`\n${failures} palette group check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(`Palette groups: ${PALETTE_INFO.length} modules in ${GROUPS.length} groups, every one sectioned and saying what it prints.`);
}

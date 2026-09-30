// The module-edits list (2026-09-30): each option draws what it says, and
// the default draws what it always did. moduleHouseStyle.test.mts runs the
// same options through the lattice and text rules; this checks the options
// themselves.
//
// Run with: npx tsx src/lib/moduleEdits.test.mts

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { PROOF_PAGE as PAGE, flatten } from "./proofSvg";
import { cellHeightPx } from "./grid";
import { hourlyPropsFromSettings, DEFAULT_HOURLY_SETTINGS } from "./modules/hourlyGridCore";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} module-edit check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All module-edit checks passed (every new option draws what it says; every default draws what it did).");
  }
});

const PITCH = cellHeightPx(PAGE);
function draw(slug: string, props: Record<string, unknown>, columnSpan = 6, rowSpan = 8): RenderedPolotnoElement[] {
  return flatten(
    renderModuleInstance(
      { id: "m", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues: props, moduleType: { slug } },
      PAGE
    )
  );
}
const ids = (elements: RenderedPolotnoElement[], pattern: RegExp) => elements.filter((e) => pattern.test(String(e.id)));
const texts = (elements: RenderedPolotnoElement[], pattern: RegExp) => ids(elements, pattern).map((e) => String(e.text));
const onColumn = (x: number) => Math.abs(((x - PAGE.marginPx) / PITCH) % 1) < 1e-6 || Math.abs(((x - PAGE.marginPx) / PITCH) % 1) > 1 - 1e-6;

// --- note box --------------------------------------------------------------
{
  const lined = draw("labeled-box", { heading: "Notes", rule: "lined" });
  const rules = ids(lined, /-rule\d+$/).length;
  const graph = draw("labeled-box", { heading: "Notes", rule: "graph" });
  check(ids(graph, /-grid-h\d+$/).length === rules, `graph has a horizontal line on every lined row (${ids(graph, /-grid-h\d+$/).length} vs ${rules})`);
  const verticals = ids(graph, /-grid-v\d+$/);
  check(verticals.length === 5, `a 6-cell graph box has 5 interior verticals (got ${verticals.length})`);
  check(verticals.every((v) => onColumn((v.x ?? 0) + (v.width ?? 0) / 2)), "every graph vertical sits on a lattice column");

  const two = draw("labeled-box", { heading: "Notes", rule: "lined", columns: 2 }, 12, 6);
  const divider = ids(two, /-column-rule$/)[0];
  check(!!divider, "two columns draw a divider");
  if (divider) {
    const x = (divider.x ?? 0) + (divider.width ?? 0) / 2;
    check(onColumn(x), "on a lattice column");
    const box = ids(two, /-border$/)[0];
    check(Math.abs(x - ((box.x ?? 0) + (box.width ?? 0) / 2)) <= PITCH / 2, "nearest the middle");
  }
  check(ids(two, /-c0-rule\d+$/).length > 0 && ids(two, /-c1-rule\d+$/).length === ids(two, /-c0-rule\d+$/).length, "both halves are ruled alike");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", columns: 2 }, 3, 6), /-column-rule$/).length === 0, "too narrow for two columns draws one");

  const numbered = draw("labeled-box", { heading: "Notes", rule: "lined", lineStart: "numbers" });
  const numbers = texts(numbered, /-start\d+$/);
  check(numbers.length === rules && numbers[0] === "1" && numbers[numbers.length - 1] === String(rules), `a number on every line, 1 to ${rules} (got ${numbers.join(",")})`);
  check(ids(draw("labeled-box", { heading: "Notes", rule: "lined", lineStart: "bullets" }), /-start\d+$/).length === rules, "a bullet on every line");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "none", lineStart: "numbers" }), /-start\d+$/).length === 0, "a blank box has no lines to start");
  check(ids(draw("labeled-box", { heading: "Notes", rule: "graph", lineStart: "numbers" }), /-start\d+$/).length === 0, "nor does graph paper");

  // What it always drew, unchanged.
  const legacy = draw("labeled-box", { heading: "Notes", ruled: true });
  check(ids(legacy, /-rule\d+$/).length === rules, "the old ruled boolean still rules the box");
  check(ids(draw("labeled-box", { heading: "Notes" }), /-(rule\d+|dot\d+-\d+|grid-[hv]\d+|start\d+)$/).length === 0, "the default is blank");
}

// --- hours -----------------------------------------------------------------
{
  const props = hourlyPropsFromSettings({ dayCount: 3, dayLabels: [{ name: "SUNDAY" }, { name: "MONDAY" }, { name: "TUESDAY" }], events: [] }, DEFAULT_HOURLY_SETTINGS);
  const times = (extra: Record<string, unknown>) => texts(draw("hourly-grid-core", { ...props, ...extra }, 18, 20), /-time$/);
  const twelve = times({});
  check(twelve.includes("1:00") && !twelve.includes("13:00"), "12-hour by default, as the reference");
  const twentyFour = times({ timeFormat: "24" });
  check(twentyFour.includes("13:00") && twentyFour.includes("05:30"), `24-hour reads 05:30 and 13:00 (got ${twentyFour.slice(0, 3).join(",")}...)`);
  check(twentyFour.every((t) => t.length === 5), "every 24-hour label is five characters, so they set at one size");
  const borders = ids(draw("hourly-grid-core", { ...props, dayBorder: true }, 18, 20), /-border$/).length;
  check(borders === 3, `a border round each of three days (got ${borders})`);
  check(ids(draw("hourly-grid-core", props, 18, 20), /^m-d\d-border$/).length === 0, "none by default");
  const settings = hourlyPropsFromSettings({}, { ...DEFAULT_HOURLY_SETTINGS, hourLineStyle: "gone", dayBorder: true, timeFormat: "24" });
  check(settings.hourLineStyle === "gone" && settings.dayBorder === true && settings.timeFormat === "24", "the journal-wide settings write all three to every grid");
}

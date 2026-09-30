// Text edited where it prints (2026-09-30): every text setting of every
// primitive has a place on its drawing, the place is its own, and editing
// there changes what that place prints - checked by typing into each place
// and drawing again.
//
// Run with: npx tsx src/lib/canvasText.test.mts

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { PROOF_PAGE as PAGE, flatten } from "./proofSvg";
import { gridCellToPixels } from "./grid";
import { MODULE_REGISTRY, cleanPropsForSave, moduleSchemaDefaults } from "./moduleRegistry";
import { canvasFields, canvasSlots, ghostValues, withItemAfter, withSlotText, withoutItem } from "./canvasText";

let failures = 0;
let checked = 0;
function check(condition: boolean, message: string) {
  checked++;
  if (!condition) {
    failures++;
    if (failures <= 40) console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} canvas text check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`All canvas text checks passed (${checked}: every text setting has its own place on the drawing, and typing there changes it).`);
  }
});

const ID = "m";
function draw(slug: string, props: Record<string, unknown>, columnSpan: number, rowSpan: number): RenderedPolotnoElement[] {
  return flatten(
    renderModuleInstance({ id: ID, locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues: props, moduleType: { slug } }, PAGE)
  );
}
function places(slug: string, props: Record<string, unknown>, columnSpan: number, rowSpan: number) {
  const fields = MODULE_REGISTRY[slug].fields;
  const defaults = moduleSchemaDefaults(slug);
  return canvasSlots({
    fields,
    values: props,
    defaults,
    real: draw(slug, props, columnSpan, rowSpan),
    ghost: draw(slug, ghostValues(fields, props, defaults), columnSpan, rowSpan),
    ghostBlanks: draw(slug, ghostValues(fields, props, defaults, false), columnSpan, rowSpan),
    instanceId: ID,
  });
}
const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

// --- every primitive, at every size ----------------------------------------------
const PRIMITIVES = Object.entries(MODULE_REGISTRY)
  .filter(([slug, d]) => d.primitive === slug && d.inPalette && canvasFields(d.fields).length > 0)
  .map(([slug]) => slug);
check(PRIMITIVES.length >= 12, `every primitive with text is covered (got ${PRIMITIVES.length})`);

for (const slug of PRIMITIVES) {
  const definition = MODULE_REGISTRY[slug];
  const props = { ...(definition.previewProps ?? {}) } as Record<string, unknown>;
  for (const columnSpan of [6, 12, 24]) {
    for (const rowSpan of [8, 14]) {
      const where = `${slug} ${columnSpan}x${rowSpan}`;
      const { slots } = places(slug, props, columnSpan, rowSpan);
      const box = gridCellToPixels(PAGE, { columnStart: 0, rowStart: 0, columnSpan, rowSpan });
      // Inside the module, give or take the box inset its content may use.
      for (const slot of slots) {
        const r = slot.rect;
        const inside = r.x >= box.x - 8 && r.y >= box.y - 8 && r.x + r.width <= box.x + box.width + 8 && r.y + r.height <= box.y + box.height + 8;
        check(inside, `${where}: ${slot.id} lies outside the module`);
        check(slot.font.sizePx > 0, `${where}: ${slot.id} has no type size`);
      }
      // No two places on top of each other - a click must mean one thing.
      for (let a = 0; a < slots.length; a++) {
        for (let b = a + 1; b < slots.length; b++) {
          check(!overlap(slots[a].rect, slots[b].rect), `${where}: ${slots[a].id} and ${slots[b].id} overlap`);
        }
      }
      // EACH PLACE IS ITS OWN: type into it, draw again, and the text is
      // printed there - on the elements it covers.
      const { lists } = places(slug, props, columnSpan, rowSpan);
      for (const slot of slots.filter((s) => !s.ghost && s.kind !== "paragraph")) {
        const edited = withSlotText(props, { lists }, slot, "Zq");
        const again = places(slug, edited, columnSpan, rowSpan).slots.find((s) => s.id === slot.id);
        const drawnAgain = draw(slug, edited, columnSpan, rowSpan).filter((e) => again?.elementIds.includes(String(e.id)));
        const printed = drawnAgain.map((e) => String(e.text ?? "")).join("").toLowerCase();
        check(!!again && printed.startsWith("z"), `${where}: typing into ${slot.id} printed "${printed}" there`);
      }
    }
  }
}

// --- adding, inserting and removing ------------------------------------------------
{
  // A to-do with no items: the first row is where the first one goes.
  const empty = places("todo-checklist", { heading: "To do" }, 12, 10);
  const add = empty.slots.find((s) => s.key === "items" && s.isNew);
  check(!!add && add.index === 0 && add.ghost, "an empty to-do offers its first row for an item");
  const one = withSlotText({ heading: "To do" }, empty, add!, "Buy milk");
  check(JSON.stringify(one.items) === '["Buy milk"]', `typing there makes it the first item (got ${JSON.stringify(one.items)})`);
  const drawnItem = draw("todo-checklist", one, 12, 10).find((e) => e.id === `${ID}-d0-row0-item`);
  check(String(drawnItem?.text ?? "") === "Buy milk", "and it prints on the first row");
  const next = places("todo-checklist", one, 12, 10).slots.find((s) => s.key === "items" && s.isNew);
  check(next?.index === 1, "then the second row is the next place");

  // Return after an item makes a new one after it; clearing one removes it.
  const prompts = { prompts: ["One", "Two", "Three"] };
  const p = places("prompted-lines", prompts, 12, 14);
  const inserted = withItemAfter(prompts, p, "prompts", 0);
  check(JSON.stringify(inserted.values.prompts) === '["One","","Two","Three"]' && inserted.index === 1, "Return after the first prompt inserts one after it");
  check(JSON.stringify(withoutItem(MODULE_REGISTRY["prompted-lines"].fields, prompts, p, "prompts", 1).prompts) === '["One","Three"]', "clearing a prompt removes it");

  // A blank inserted into a table's columns has a place of its own - the
  // extra column the next-item ghost adds must not push it onto the others.
  const inserted2 = { columns: ["Thing", "", "Cost"] };
  const table = places("column-table", inserted2, 12, 8);
  check(table.slots.some((s) => s.id === "columns#1"), `a blank column inserted between two has a place (got ${table.slots.map((s) => s.id).join(",")})`);

  // A positional list keeps the place: the matrix's corners stay corners.
  const matrix = { quadrants: ["Do", "Plan", "Give", "Drop"] };
  const m = places("axis-matrix", matrix, 12, 12);
  const cleared = withoutItem(MODULE_REGISTRY["axis-matrix"].fields, matrix, m, "quadrants", 1);
  check(JSON.stringify(cleared.quadrants) === '["Do","","Give","Drop"]', `clearing a corner leaves it blank in its place (got ${JSON.stringify(cleared.quadrants)})`);
  check(
    JSON.stringify(cleanPropsForSave("axis-matrix", { quadrants: ["", "Do", "", ""] }).quadrants) === '["","Do"]',
    "saving keeps a positional list's blanks, less the trailing ones"
  );
  check(JSON.stringify(cleanPropsForSave("prompted-lines", { prompts: ["A", "", "B", ""] }).prompts) === '["A","B"]', "and still drops an ordinary list's");

  // A week of initials, drawn for an empty list: editing one keeps the rest.
  const habits = { heading: "Habits", habits: ["Read"] };
  const h = places("habit-tracker", habits, 24, 8);
  const wed = h.slots.find((s) => s.key === "columns" && s.index === 3);
  check(!!wed && wed.value === "W", `an empty column list edits the week it draws (got ${wed?.value})`);
  const renamed = withSlotText(habits, h, wed!, "Wed");
  check(JSON.stringify(renamed.columns) === '["S","M","T","Wed","T","F","S"]', `and editing Wednesday keeps the other six (got ${JSON.stringify(renamed.columns)})`);
  const compact = places("habit-tracker", habits, 12, 8);
  check(compact.slots.filter((s) => s.key === "columns").length >= 7, "the compact layout's column heads are places too");
}

// --- places that come and go with their switches ------------------------------------
{
  const numbers = places("rating-strip", { items: ["Mood"], scaleHead: "numbers" }, 12, 8);
  check(numbers.panelKeys.has("lowLabel") && !numbers.slots.some((s) => s.key === "lowLabel"), "the scale's words have no place while the scale is numbers");
  const words = places("rating-strip", { items: ["Mood"], scaleHead: "words" }, 12, 8);
  check(words.slots.some((s) => s.key === "lowLabel") && words.slots.some((s) => s.key === "highLabel"), "and are edited where they print once it is words");
  const noTotals = places("column-table", { columns: ["Item", "Cost"] }, 12, 8);
  check(noTotals.panelKeys.has("totalsLabel"), "the totals label has no place without a totals row");
  const totals = places("column-table", { columns: ["Item", "Cost"], totalsRow: true }, 12, 8);
  check(totals.slots.some((s) => s.key === "totalsLabel"), "and has one where the totals row prints");
  const strip = places("icon-strip", { heading: "Water", icon: "droplet", count: 2 }, 12, 4);
  const first = strip.slots.find((s) => s.key === "heading");
  check(first?.elementIds[0] === `${ID}-s0-heading`, "the icon strip's heading is edited on its first strip");
  check(strip.slots.filter((s) => s.key === "stripLabels").length >= 2 && strip.slots.find((s) => s.key === "stripLabels")?.placeholder === "WATER", "each other strip's label shows the heading until it has its own");
}

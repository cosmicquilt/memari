// A module must be able to print its own words at its own default size.
//
// The catalogue is a preset library: a preset IS a set of labels over a
// primitive that already draws correctly, so the way a preset fails is not
// the way a primitive fails. It fails by being given words that do not fit
// the box it defaults to.
//
// Nothing caught that. The house-style sweep asks that every mark stay
// inside its module, and a truncated label does - "Categ…" is inside the
// box. The pitch test asks about rules, not text. The behaviour report
// asks how marks move, not what they say. So 23 of the 27 column tables
// shipped at a default width where their own heads could not be read:
// every one of them had inherited the primitive's 6-column default, which
// is a SIDEBAR, and a four-column spending log in a sidebar came out
// "Date | Item | Categ… | Amo…".
//
// Worse than the ellipsis is what happens below it. truncateToWidth
// returns "" when not even one character plus the ellipsis fits, so a
// narrow enough column drops its head silently and completely - and a
// check that looked only for "…" would have called that a pass. It did,
// once, while this was being written: a probe reported spending-log fine
// at 3 columns wide, where in fact all four heads had vanished.
//
// So the test is: render every module at its OWN default span, collect
// every string it was asked to draw, and require each to come out whole.
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { REGISTERED_SLUGS, moduleDefinition } from "./moduleRegistry";
import { getMinRowSpanForSlug } from "./moduleMinRowSpan";
import { type PageGrid } from "./grid";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};

const ELLIPSIS = "…";

function flatten(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  return elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));
}

/**
 * The strings a module was ASKED to draw, from its own props.
 *
 * Read off the preview props rather than from a per-module list, so a
 * module that gains a label set gains coverage with it. Only single-line
 * label fields: a text block's body is wrapped on purpose and a prompt's
 * lines are ruled space, neither of which is a fitting failure.
 */
const LABEL_KEYS = [
  "heading",
  "columns",
  "habits",
  "prompts",
  "rows",
  "quadrants",
  "totalsLabel",
  "xLeft",
  "xRight",
  "yTop",
  "yBottom",
];

function expectedLabels(propValues: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of LABEL_KEYS) {
    const value = propValues[key];
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string") out.push(item);
    }
  }
  return out.filter((s) => s.trim().length > 0);
}

let failures = 0;
let checked = 0;

for (const slug of REGISTERED_SLUGS) {
  const definition = moduleDefinition(slug);
  if (!definition?.render) continue;
  const propValues = (definition.previewProps ?? {}) as Record<string, unknown>;
  const wanted = expectedLabels(propValues);
  if (wanted.length === 0) continue;

  const columnSpan = Math.min(definition.db.defaultColumnSpan ?? 6, PAGE.gridColumns);
  const rowSpan = Math.max(
    getMinRowSpanForSlug(slug, PAGE, columnSpan),
    definition.db.defaultRowSpan ?? 8
  );
  checked++;

  let elements: RenderedPolotnoElement[];
  try {
    elements = flatten(
      renderModuleInstance(
        {
          id: "t",
          locked: true,
          columnStart: 0,
          rowStart: 0,
          columnSpan,
          rowSpan,
          propValues,
          moduleType: { slug },
        },
        PAGE
      )
    );
  } catch (error) {
    console.error(`  ${slug} ${columnSpan}x${rowSpan}: threw while rendering - ${error}`);
    failures++;
    continue;
  }

  // A label set one letter per line counts as drawn. axisMatrix stacks
  // its DOWN axis that way on purpose - "Above" is five text nodes with
  // ids ...-y-top-l0 through -l4 - so reading the nodes literally reports
  // every matrix in the catalogue as having lost both its vertical
  // labels. Reassembled by id stem, which is what semantic ids are for.
  const stacks = new Map<string, string[]>();
  const drawn: string[] = [];
  for (const element of elements) {
    if (element.type !== "text") continue;
    const text = String(element.text ?? "");
    const stacked = /^(.*)-l(\d+)$/.exec(String(element.id ?? ""));
    if (stacked) {
      const letters = stacks.get(stacked[1]) ?? [];
      letters[Number(stacked[2])] = text;
      stacks.set(stacked[1], letters);
    } else {
      drawn.push(text);
    }
  }
  for (const letters of stacks.values()) drawn.push(letters.join(""));

  const cut = drawn.filter((t) => t.includes(ELLIPSIS));
  // A heading is drawn UPPERCASED, so compare case-insensitively rather
  // than teaching this test the frame's own transform.
  const drawnUpper = new Set(drawn.map((t) => t.toUpperCase()));
  const lost = wanted.filter((label) => !drawnUpper.has(label.toUpperCase()));

  if (cut.length > 0 || lost.length > 0) {
    const parts: string[] = [];
    if (cut.length > 0) parts.push(`truncated ${cut.map((t) => `"${t}"`).join(", ")}`);
    if (lost.length > 0) parts.push(`lost ${lost.map((t) => `"${t}"`).join(", ")}`);
    console.error(
      `  ${slug} at its default ${columnSpan}x${rowSpan}: ${parts.join("; ")}`
    );
    failures++;
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} module(s) cannot print their own labels at their default size.`
  );
  process.exit(1);
}
console.log(`All catalogue label checks passed (${checked} modules print their labels whole).`);

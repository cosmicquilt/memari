// A module may not be shrunk to a size where it stops printing its own
// content.
//
// The defect this exists to prevent, measured before it was fixed: all 24
// named habit trackers in the catalogue could be dragged down to two rows,
// and at two rows they printed NONE of their own row names. A medication
// log with no Morning/Midday/Evening, a salah tracker with none of the five
// prayers. Nothing threw and nothing looked broken - every tracker collapses
// to the same grid-with-a-heading, so you could not even tell which module
// it was any more.
//
// The cause was that `minContentHeightPx` rules were handed `{}` for
// propValues. Five of them are written to read content and were being
// starved of it; habit-tracker did not ask for it at all. So the checks
// below come in two halves: the RULES must size to content, and BOTH call
// sites must actually pass it - because the client's floor gates the live
// shrink preview and the server's gates the commit, and a floor known to
// one and not the other is the "preview lied" family all of this exists to
// close.
import { readFileSync } from "node:fs";
import {
  REGISTERED_SLUGS,
  moduleDefinition,
  getMinRowSpanForSlug,
  moduleSchemaDefaults,
} from "./moduleRegistry";
import { renderModuleInstance } from "./renderModuleInstance";
import type { RenderedPolotnoElement } from "./renderModuleInstance";
import type { PageGrid } from "./grid";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};
/** A sidebar, an hourly-grid zone, and the full page. */
const WIDTHS = [6, 12, 18, 24];

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

const flatten = (elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] =>
  elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));

function textAt(slug: string, columnSpan: number, rowSpan: number): string[] {
  const elements = flatten(
    renderModuleInstance(
      {
        id: "t",
        locked: true,
        columnStart: 0,
        rowStart: 0,
        columnSpan,
        rowSpan,
        propValues: moduleDefinition(slug)?.previewProps ?? {},
        moduleType: { slug },
      } as never,
      PAGE,
      "Newsreader"
    ) as RenderedPolotnoElement[]
  );
  return elements.filter((e) => e.type === "text").map((e) => String(e.text));
}

/** The row names a module's own defaults say it has. */
function namedRows(slug: string): string[] {
  const props = {
    ...moduleSchemaDefaults(slug),
    ...((moduleDefinition(slug)?.previewProps ?? {}) as Record<string, unknown>),
  };
  return ((props.habits as unknown[]) ?? [])
    .filter((h): h is string => typeof h === "string" && h.trim().length > 0)
    .map((h) => h.toUpperCase());
}

// --- 1. at its own floor, a module still prints its own rows -----------
//
// The floor is the whole point: it is the shortest the editor will let
// someone drag this module. If content vanishes at that height, the floor
// is wrong.
let withRows = 0;
for (const slug of REGISTERED_SLUGS) {
  const definition = moduleDefinition(slug);
  if (!definition?.render) continue;
  const rows = namedRows(slug);
  if (rows.length === 0) continue;
  withRows++;
  for (const columnSpan of WIDTHS) {
    const floor = getMinRowSpanForSlug(slug, PAGE, columnSpan, definition.previewProps ?? {});
    // A floor pinned to the page cap cannot promise to fit - the content is
    // simply larger than any box on this page. Checked separately below.
    if (floor >= PAGE.gridRows) continue;
    const printed = textAt(slug, columnSpan, floor);
    const missing = rows.filter((row) => !printed.includes(row));
    if (missing.length > 0) {
      fail(
        `${slug} at its floor ${columnSpan}x${floor} drops ${missing.length} of its ` +
          `${rows.length} rows (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", ..." : ""})`
      );
    }
  }
}

// --- 2. a floor is a size the module can actually be given -------------
//
// Two ways a floor can be nonsense. Taller than the page is unsatisfiable
// by any box. Taller than the module's own default height means the palette
// drops it already below its own minimum, and the editor would fight the
// user the instant they touched it.
for (const slug of REGISTERED_SLUGS) {
  const definition = moduleDefinition(slug);
  if (!definition?.render) continue;
  for (const columnSpan of WIDTHS) {
    const floor = getMinRowSpanForSlug(slug, PAGE, columnSpan, definition.previewProps ?? {});
    if (floor > PAGE.gridRows) {
      fail(
        `${slug} at ${columnSpan} columns has a floor of ${floor} rows, past the page's ${PAGE.gridRows}`
      );
    }
  }
  const own = definition.db.defaultColumnSpan;
  const floorAtOwnWidth = getMinRowSpanForSlug(slug, PAGE, own, definition.previewProps ?? {});
  if (floorAtOwnWidth > definition.db.defaultRowSpan) {
    fail(
      `${slug} is dropped at ${own}x${definition.db.defaultRowSpan} but its own floor there is ` +
        `${floorAtOwnWidth} - the palette would place it below its minimum`
    );
  }
}

// --- 3. content actually moves the floor -------------------------------
//
// Guards the merge in getMinRowSpanForSlug. If propValues stopped reaching
// the rules, every check above would still pass on a module whose schema
// defaults happen to be empty - this one would not.
{
  const blank = getMinRowSpanForSlug("habit-tracker", PAGE, 24, { habits: [], columns: [] });
  const six = getMinRowSpanForSlug("habit-tracker", PAGE, 24, {
    habits: ["a", "b", "c", "d", "e", "f"],
    columns: [],
  });
  if (six <= blank) {
    fail(`naming six rows must raise the floor (blank ${blank}, six rows ${six})`);
  }
  // And the schema defaults have to be the fallback, or a palette preview -
  // which has no stored propValues at all - would size to an empty module.
  const fromDefaults = getMinRowSpanForSlug("salah-tracker", PAGE, 24);
  const explicit = getMinRowSpanForSlug(
    "salah-tracker",
    PAGE,
    24,
    moduleDefinition("salah-tracker")?.previewProps ?? {}
  );
  if (fromDefaults !== explicit) {
    fail(
      `passing nothing must fall back to the module's own schema defaults ` +
        `(got ${fromDefaults}, expected ${explicit})`
    );
  }
}

// --- 4. both sides pass the content ------------------------------------
//
// A source check, deliberately. The rules being content-aware is worth
// nothing if a call site forgets to hand them content, and the failure mode
// is not an exception - it is the client and the server quietly disagreeing
// about how short a module may be, which is exactly what this whole
// mechanism was built to stop. So no caller may use the 3-argument form.
{
  const CALLERS = [
    "src/app/planner/actions.ts",
    "src/app/planner/NativePlannerEditor.tsx",
    "src/lib/moduleMinRowSpan.ts",
  ];
  const OPENERS = "([{";
  const CLOSERS = ")]}";
  for (const file of CALLERS) {
    const source = readFileSync(file, "utf8");
    const needle = "getMinRowSpanForSlug(";
    for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
      // Walk the argument list, counting commas that are not nested inside
      // a call, object, array or string of their own.
      let depth = 0;
      let args = 1;
      let quote = "";
      for (let i = at + needle.length; i < source.length; i++) {
        const c = source[i];
        if (quote) {
          if (c === "\\") i++;
          else if (c === quote) quote = "";
          continue;
        }
        if (c === '"' || c === "'" || c === "`") quote = c;
        else if (OPENERS.includes(c)) depth++;
        else if (CLOSERS.includes(c)) {
          if (c === ")" && depth === 0) break;
          depth--;
        } else if (c === "," && depth === 0) args++;
      }
      if (args < 4) {
        const line = source.slice(0, at).split("\n").length;
        fail(
          `${file}:${line} calls getMinRowSpanForSlug with ${args} argument(s) - ` +
            `it must be given the module's propValues, or this side's floor ignores content ` +
            `while the other side's does not`
        );
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} min-row-span problem(s).`);
  process.exit(1);
}
console.log(
  `All min row span floor checks passed (${withRows} modules keep every named row at their own ` +
    `floor; no floor exceeds the page or the module's own default; both call sites pass content).`
);

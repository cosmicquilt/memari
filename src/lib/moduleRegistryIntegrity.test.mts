// A module says one true thing about itself, and drawing it never takes
// the page down.
//
// The other sweeps ask whether a module DRAWS correctly - marks on the
// pitch, inside the box, labels whole. This one asks whether it is
// DECLARED correctly, which is a different class of bug and the one the
// recent catalogue work kept producing: a preset whose palette card and
// stored defaults disagree, a prop that no schema declares so nothing ever
// reads it, a module retired from the palette in a way that also stops it
// drawing for the planners already using it.
//
// It also pins the rule the whole renderer layer is written to and that
// nothing enforced: A RENDERER IS TOTAL IN ITS CONFIG. A ModuleInstance
// stored before a prop existed simply lacks that key, and a throw inside a
// render does not blank the module - it blanks the PAGE.
import {
  REGISTERED_SLUGS,
  PALETTE_MODULES,
  MODULE_TYPE_SEED,
  moduleDefinition,
  moduleSchemaDefaults,
} from "./moduleRegistry";
import { CATALOGUE } from "./moduleCatalogue";
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { PROOF_PAGE } from "./proofSvg";
import { gridCellToPixels } from "./grid";
import { renderIconStrip } from "./modules/iconStrip";

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

function draw(slug: string, propValues: Record<string, unknown>): RenderedPolotnoElement[] {
  const definition = moduleDefinition(slug)!;
  return renderModuleInstance(
    {
      id: "t",
      locked: true,
      columnStart: 0,
      rowStart: 0,
      columnSpan: definition.db.defaultColumnSpan,
      rowSpan: definition.db.defaultRowSpan,
      propValues,
      moduleType: { slug },
    } as never,
    PROOF_PAGE,
    "Newsreader"
  ) as RenderedPolotnoElement[];
}

const flatten = (e: RenderedPolotnoElement[]): RenderedPolotnoElement[] =>
  e.flatMap((x) => (x.type === "group" ? flatten(x.children ?? []) : [x]));

const drawable = REGISTERED_SLUGS.filter((slug) => moduleDefinition(slug)?.render);

// --- 1. no renderer throws, whatever it is handed --------------------
//
// Three config shapes a renderer can actually meet: nothing at all (a row
// whose props were never written), the schema's own defaults (a fresh
// instance), and the palette's preview props (the card). The empty case is
// the one that matters and the one that was broken: hourly-grid-core, the
// spine every week page is built on, threw on a missing startTime. 126 of
// 127 renderers already coped; it was the exception.
for (const slug of drawable) {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["an empty config", {}],
    ["its schema defaults", moduleSchemaDefaults(slug)],
    ["its preview props", (moduleDefinition(slug)?.previewProps ?? {}) as Record<string, unknown>],
    // A config with only SOME keys, which is what a row written before a
    // prop existed actually looks like - neither empty nor complete.
    ["a heading and nothing else", { heading: "Partial" }],
  ];
  for (const [what, propValues] of cases) {
    try {
      draw(slug, propValues);
    } catch (error) {
      fail(`${slug} threw on ${what}: ${(error as Error).message.slice(0, 70)}`);
    }
  }
}

// --- 2. and with its real defaults it actually draws ------------------
//
// Not throwing is not the same as working. A fresh instance carries its
// schema defaults, so that case has to produce marks - otherwise a module
// can pass every check above by drawing nothing at all.
for (const slug of drawable) {
  const marks = flatten(draw(slug, moduleSchemaDefaults(slug)));
  if (marks.length === 0) {
    fail(`${slug} draws nothing at its own defaults`);
  }
}

// --- 3. a preset's card and its stored defaults agree -----------------
//
// previewProps draw the palette card; the schema defaults are what a
// freshly placed instance is filled with. Setting one and not the other
// gives a card showing one thing and a module that arrives as another -
// exactly the trap quote-block's own comment warns about, and nothing
// checked it.
//
// PRIMITIVES ARE EXEMPT, and that is not a fudge to make this pass: the
// registry documents previewProps as "the module at its narrowest
// single-day form, which is why a to-do previews at one day rather than
// the three it will take once dropped". For a primitive the card is
// deliberately a compact sample. For a PRESET the two come from one source
// - catalogue() writes spec.props into both - so any disagreement there is
// someone having set one and forgotten the other, which is the bug.
for (const slug of REGISTERED_SLUGS) {
  const definition = moduleDefinition(slug);
  const preview = (definition?.previewProps ?? {}) as Record<string, unknown>;
  const defaults = moduleSchemaDefaults(slug);
  const schema = definition?.db.configSchema as { properties?: Record<string, unknown> } | undefined;
  const declared = new Set(Object.keys(schema?.properties ?? {}));

  for (const key of Object.keys(preview)) {
    // A preview prop the schema never declares is read by nobody: it draws
    // the card and then vanishes the moment the module is placed. True of
    // primitives and presets alike.
    if (!declared.has(key)) {
      fail(`${slug}: previewProps sets "${key}", which its schema does not declare`);
    }
  }

  const isPrimitive = definition?.primitive === slug;
  if (isPrimitive) continue;
  for (const [key, value] of Object.entries(preview)) {
    if (!declared.has(key)) continue;
    if (JSON.stringify(defaults[key]) !== JSON.stringify(value)) {
      fail(
        `${slug}: the palette card shows ${key}=${JSON.stringify(value)} but a placed one ` +
          `arrives with ${JSON.stringify(defaults[key])}`
      );
    }
  }
}

// --- 4. retiring a module keeps it drawable ---------------------------
//
// A slug is a database key: every ModuleInstance points at a ModuleType by
// it. Taking a module off the palette must therefore leave the row, the
// renderer and the defaults exactly where they were - otherwise every
// planner already using it loses a module. water-intake is the live case.
{
  const retired = CATALOGUE.filter((entry) => entry.inPalette === false);
  if (retired.length === 0) {
    fail("no retired catalogue entry to check - has inPalette been removed?");
  }
  for (const entry of retired) {
    if (PALETTE_MODULES.some((m) => m.slug === entry.slug)) {
      fail(`${entry.slug} is marked inPalette: false but still appears in the palette`);
    }
    if (!MODULE_TYPE_SEED.some((t) => t.slug === entry.slug)) {
      fail(`${entry.slug} was retired out of the seed - existing instances would lose their type`);
    }
    if (!moduleDefinition(entry.slug)?.render) {
      fail(`${entry.slug} was retired out of its renderer - existing instances would draw nothing`);
    } else if (flatten(draw(entry.slug, moduleSchemaDefaults(entry.slug))).length === 0) {
      fail(`${entry.slug} is retired and now draws nothing`);
    }
  }
}

// --- 5. everything the palette offers can be drawn --------------------
for (const card of PALETTE_MODULES) {
  if (!moduleDefinition(card.slug)?.render) {
    fail(`the palette offers ${card.slug}, which has no renderer`);
  }
}
// And everything registered is seeded, or it has no row to be placed as.
for (const slug of REGISTERED_SLUGS) {
  if (!MODULE_TYPE_SEED.some((t) => t.slug === slug)) {
    fail(`${slug} is registered but not seeded - it can never be placed`);
  }
}

// --- 6. derived geometry stays derived --------------------------------
//
// icon-strip takes one group per SIDEBAR COLUMN rather than a fixed seven,
// for the same reason todoChecklist derives its day columns: a stored count
// is a second description of the box and goes wrong the moment it is
// resized. Seven groups was the old default, and squeezed into one sidebar
// column it drew seven clusters of eight marks six pixels across.
{
  const lattice = { pitchPx: 75, originX: PROOF_PAGE.marginPx, originY: PROOF_PAGE.marginPx, insetPx: 6 };
  for (const [columnSpan, wantGroups] of [[6, 1], [12, 2], [18, 3], [24, 4]] as const) {
    const geometry = gridCellToPixels(PROOF_PAGE, {
      columnStart: 0,
      rowStart: 0,
      columnSpan,
      rowSpan: 2,
    });
    const marks = renderIconStrip(geometry, { heading: "Water", icon: "droplet", count: 8 }, "s", "Newsreader", lattice);
    // Two strips in a 2-row box, so 8 glyphs per group per strip.
    const glyphs = marks.filter((m) => m.type === "figure").length;
    const wantGlyphs = wantGroups * 8 * 2;
    if (glyphs !== wantGlyphs) {
      fail(
        `icon-strip at ${columnSpan} columns drew ${glyphs} glyphs, expected ${wantGlyphs} ` +
          `(${wantGroups} group(s) of 8, two strips)`
      );
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} registry integrity problem(s).`);
  process.exit(1);
}
console.log(
  `All registry integrity checks passed (${drawable.length} renderers total in their config and ` +
    `drawing at their defaults; palette cards match stored defaults; retired modules still draw).`
);

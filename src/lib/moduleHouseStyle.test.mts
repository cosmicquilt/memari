// The house style, as a test rather than as advice.
//
// Seven modules were written at once and every one of them repeated the
// same four mistakes, because the rules existed only as comments in the
// modules that already followed them. A comment cannot be followed by a
// module that has not been written yet. So each rule below is one the
// project has actually been bitten by, and each is now checked against
// every registered module at every size it can be drawn at:
//
//   1. NOTHING LEAVES ITS BOX. The renderer sets white-space:pre and never
//      clips, so a label wider than its column prints over the module
//      beside it. Reported as "text gets cut of in headers such as log"
//      and, before that, an "Amount" column head running out of a sidebar.
//
//   2. RULES LAND ON THE LATTICE. Measured, every full-width rule in every
//      module sat exactly 6px above a dot row. Reported as "the lines dont
//      align with the dots... in log and reflection, and eisenhower and
//      spending, actually most of them".
//
//   3. HEADINGS ARE UPPERCASE AT THE HOUSE SIZE. Reported as "the title
//      text looks a bit large" and "the module headers are not all caps
//      like the current modules".
//
//   4. NO letterSpacing. monthTitle.ts measured the reference's wide
//      tracking, reproduced it, and had to take it back out: the legacy
//      Polotno route's width-constrained text box under-measures its own
//      width when letterSpacing is set and wraps to about one character
//      per line. Re-added by hand while matching the house style, which is
//      exactly the kind of thing a comment in a different file does not
//      prevent.
//
//   5. RENDERERS ARE TOTAL. Four of the seven threw on empty propValues,
//      which takes down a whole PAGE rather than one module.
//
// Row pitch has its own file, modulePitch.test.mts, because it needs to
// measure gaps rather than individual marks.
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { REGISTERED_SLUGS, moduleDefinition, slugsDrawnBy } from "./moduleRegistry";
import { HEADING_SIZES_PT } from "./modules/moduleFrame";
import { ptToPx } from "./print-spec";
import { cellHeightPx, gridCellToPixels, type PageGrid } from "./grid";
import { isHabitTrackerCompact } from "./modules/habitTracker";
import { ruleAxisOf } from "./ruleMarks";
import { textInkBand } from "@/lib/modules/textFit";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};
const PITCH = cellHeightPx(PAGE);
/** The house maximum heading size, stated rather than imported - see the
 *  heading check for why that distinction is the whole point. */
const HOUSE_HEADING_MAX_PT_PX = ptToPx(8);

/**
 * Modules written before the frame existed, with the offset each one's
 * rules actually sit at.
 *
 * Listed rather than skipped, and listed with the measured number, so the
 * debt is visible and a NEW module cannot join it by accident - adding a
 * slug here is a deliberate act with a number attached.
 *
 * It held to-do, habit-tracker, water-tracker and labeled-box too, at -6
 * and -11.9. They came off it when Andrew asked: "lined notes also not
 * aligned with dots", then "todo on proof also not aligned". The to-do
 * holds one row fewer at each height as a result, which is what made it
 * worth asking about rather than assuming.
 */
const LATTICE_DEBT: Record<string, number> = {
  // EMPTY, and that is the point of having kept it.
  //
  // It held to-do, habit-tracker, water-tracker and labeled-box at -6 and
  // -11.9, then the two spines. Every one of them came off by the same
  // move: lay the content out from the ALLOCATION rather than from the ink
  // box, which is 6px inside it. Keeping the list - with each module's
  // MEASURED offset rather than a skip - is what kept that visible long
  // enough to notice it was one fault wearing six hats.
  //
  // A new module cannot join it by accident: adding a slug here is a
  // deliberate act with a number attached.
};

/**
 * Modules whose vertical rules divide the box by WEIGHT or by a day count,
 * not by the lattice.
 *
 * A column table's columns take a share of the width so a "Date" column
 * and an "Item" column are not the same size; a day column is one seventh
 * or one third of the box. Neither can land on a lattice column, and
 * neither should - nothing is written across those rules, so there is no
 * dot for them to miss.
 *
 * What is NOT exempt is a rule that divides the box in half, like the
 * matrix's cross: that one reads directly against the dots and was
 * reported doing so - "vertical line in eisenhower not aligned" - after
 * only the horizontal arm had been snapped.
 */
const WEIGHTED_COLUMNS = new Set([
  ...slugsDrawnBy(
    "column-table",
    "todo-checklist",
    "habit-tracker",
    "rating-strip",
    "mini-month",
    "progress-meter"
  ),
  "hourly-grid-core",
  "month-grid-core",
]);

/** Modules whose heading is drawn by something other than the frame, and
 *  is a page title rather than a module heading - a different thing, set
 *  differently on purpose. */
const NOT_MODULE_HEADINGS = new Set(["week-title", "month-title", "hourly-grid-core"]);

/**
 * Modules that lay their content out in the ALLOCATION frame rather than
 * the ink box, so their own edges sit one box inset outside it.
 *
 * Derived from the primitive, not listed by slug - a hand-kept list of
 * slugs is the defect this file has already had to undo four times.
 */
const ALLOCATION_FRAME = new Set([
  ...slugsDrawnBy("todo-checklist", "icon-strip"),
  "hourly-grid-core",
  "month-grid-core",
]);

/**
 * Primitives whose "-heading" is a STRIP LABEL, not a band heading, and
 * may therefore be set at the smallest legible size.
 *
 * The 8/7/6 ladder is about a heading sitting in its own header band,
 * where there is room for it. icon-strip has no band: its label and its
 * glyphs together are one lattice cell, which is what makes the module the
 * thing it is, and 5pt is what that budget leaves - asked for as "the text
 * above the icons in a header at the smallest legible such that the total
 * height is 1 cell". A 7pt label would take 35px of the 75 and the glyphs
 * would be down to 31px, which reads as a row of dots.
 *
 * The allowance is exactly one rung and nothing else: the uppercase rule
 * and the 8pt house maximum still apply to these modules, and renaming the
 * element to dodge the check outright would have been the toothless
 * version of this.
 */
const SMALL_LABEL_HEADINGS = new Set(slugsDrawnBy("icon-strip"));
const SMALLEST_LEGIBLE_PT = 5;

/**
 * The habit tracker's COMPACT layout sizes a row as a name row plus
 * `width / 7`, so its seven day cells come out square. Seven does not
 * divide the 24-column lattice, so those rules cannot land on it and the
 * module knowingly trades pitch for square cells - see
 * getHabitTrackerRowMetricsPx. Skipped per WIDTH, not per module: its wide
 * layout is checked like everything else.
 */
const COMPACTABLE = new Set(slugsDrawnBy("habit-tracker"));

function isCompactException(slug: string, widthPx: number): boolean {
  return COMPACTABLE.has(slug) && isHabitTrackerCompact(widthPx);
}

/**
 * Modules a user can never place or edit: a spine, a page title, the
 * freeform wrapper. They are created by the template with complete props
 * and cannot arrive from the palette half-filled, so the totality rule is
 * not aimed at them - and hourly-grid-core genuinely cannot draw itself
 * from nothing, since its whole geometry is a function of its times.
 *
 * Derived from the registry rather than listed, so a new module is covered
 * by default and has to be deliberately placed outside the palette to
 * escape.
 */
function mustBeTotal(slug: string): boolean {
  const definition = moduleDefinition(slug);
  return !!definition?.inPalette;
}

/**
 * Is this offset from the nearest lattice line an ACCEPTABLE one?
 *
 * On the line, or exactly half a cell off it. A half cell divides the
 * cell, which is the rule the whole lattice rests on, and this project
 * settled some time ago that a rule must sit ON a dot or CLEARLY BETWEEN
 * two - never a near-miss. The matrix's cross is the case that needs the
 * half: sizing its square plot to land on whole cells only threw away a
 * quarter of a sidebar module.
 *
 * This still catches everything it was written for. The defect was a -6px
 * offset in every module at once, and -6 is neither 0 nor 37.5.
 */
function onPitch(off: number, expected: number): boolean {
  const half = PITCH / 2;
  return (
    Math.abs(off - expected) < 0.5 ||
    Math.abs(Math.abs(off - expected) - half) < 0.5
  );
}

function flatten(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  return elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));
}

/**
 * Where the test places a module. Stated once because the render and the
 * box it is judged against have to agree about it - computing the box at
 * rowStart 0 while rendering at rowStart 2 reported every mark in several
 * modules as escaping, which is this codebase's favourite bug wearing a
 * test's clothes.
 */
const PLACEMENT_ROW_START = 2;

function render(
  slug: string,
  columnSpan: number,
  rowSpan: number,
  propValues: unknown
): RenderedPolotnoElement[] {
  return flatten(
    renderModuleInstance(
      {
        id: "t",
        locked: true,
        columnStart: 0,
        rowStart: PLACEMENT_ROW_START,
        columnSpan,
        rowSpan,
        propValues,
        moduleType: { slug },
      },
      PAGE
    )
  );
}

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

let checked = 0;

for (const slug of REGISTERED_SLUGS) {
  const definition = moduleDefinition(slug);
  if (!definition?.render) continue;
  const preview = definition.previewProps ?? {};

  // Rule 5, and it comes first: every other rule below needs the module to
  // render at all. `{}` is not a hypothetical - it is what a row written
  // before its schema gained a key holds.
  if (mustBeTotal(slug)) {
    for (const props of [preview, {}]) {
      try {
        render(slug, 12, 10, props);
      } catch (error) {
        fail(`${slug}: threw on ${props === preview ? "preview" : "empty"} props - ${error}`);
      }
    }
  }

  for (const columnSpan of [6, 12, 18, 24]) {
    for (const rowSpan of [4, 8, 13, 20]) {
      let elements: RenderedPolotnoElement[];
      try {
        elements = render(slug, columnSpan, rowSpan, preview);
      } catch {
        continue; // already reported above
      }
      // The module's INK BOX, from the GRID - not "the first stroked
      // figure I can find", which is what this said and which is wrong for
      // exactly the modules it matters most for. A module with no outer
      // border has no such figure: icon-strip draws a row of stroked
      // glyphs and this picked the first GLYPH as the box, then reported
      // every label in the module as escaping a 25px box. scripts/
      // check-week-page.mts made the same mistake first, on hourly-grid-
      // core, and carries the same note.
      const box = gridCellToPixels(PAGE, {
        columnStart: 0,
        rowStart: PLACEMENT_ROW_START,
        columnSpan,
        rowSpan,
      });
      checked++;

      const where = `${slug} ${columnSpan}x${rowSpan}`;
      // Modules that lay out in the ALLOCATION frame so their boundaries
      // land on the lattice are entitled to the box inset on every side -
      // the allocation IS the ink box grown by that inset, so a mark on
      // the module's own edge sits exactly `inset` outside it. That is the
      // technique working, not a mark escaping.
      const slack = ALLOCATION_FRAME.has(slug) ? PAGE.boxInsetPx + 1 : 1;
      const left = box.x;
      const right = left + box.width;
      const top = box.y;
      const bottom = top + box.height;

      for (const element of elements) {
        // Rule 4.
        if (element.letterSpacing !== undefined) {
          fail(`${where}: ${element.id} sets letterSpacing - see this file's header`);
        }

        if (element.type !== "text") continue;
        const x = element.x ?? 0;
        const width = element.width ?? 0;
        const y = element.y ?? 0;
        const height = element.height ?? 0;

        // Rule 1. The BOX is what a text element may not leave; its
        // declared width is the width it was laid out against, and the
        // renderer draws the string at that position whether or not the
        // string is that wide - so this catches the layout, and the
        // shrink-then-truncate in textFit.ts is what keeps the string
        // itself inside that layout.
        if (x < left - slack || x + width > right + slack) {
          fail(
            `${where}: ${element.id} spans ${x.toFixed(0)}..${(x + width).toFixed(0)} ` +
              `outside the box ${left.toFixed(0)}..${right.toFixed(0)}`
          );
        }
        // VERTICALLY, THE INK - not the line box. Most of a line box is
        // empty (leading above, the whole descent under a capital), and
        // nothing is painted there; see textInkBand, and the 48 cases that
        // failed over marks that do not exist.
        const ink = textInkBand(y, Number(element.fontSize ?? 0), String(element.fontFamily ?? ""), String(element.text ?? ""));
        if (ink.top < top - slack || ink.bottom > bottom + slack) {
          fail(
            `${where}: ${element.id} inks ${ink.top.toFixed(0)}..${ink.bottom.toFixed(0)} ` +
              `outside the box ${top.toFixed(0)}..${bottom.toFixed(0)}`
          );
        }

        // Rule 3, for the module's own heading only.
        if (String(element.id).endsWith("-heading") && !NOT_MODULE_HEADINGS.has(slug)) {
          const text = String(element.text ?? "");
          if (text !== text.toUpperCase()) {
            fail(`${where}: heading "${text}" is not uppercase`);
          }
          // Against 8pt WRITTEN HERE, not against HEADING_SIZES_PT.
          //
          // Checking membership of the ladder made this a mirror: put 12pt
          // back at the top of the ladder and the test still passed,
          // because the ladder is what it was asking. A test has to state
          // the expected value or it only checks that the code equals
          // itself. 8pt is labeled-box's top rung and the house maximum.
          const fontSize = element.fontSize ?? 0;
          if (fontSize > HOUSE_HEADING_MAX_PT_PX + 0.5) {
            fail(
              `${where}: heading is ${((fontSize * 72) / 300).toFixed(1)}pt, ` +
                `over the house maximum of 8pt`
            );
          }
          const ladder = SMALL_LABEL_HEADINGS.has(slug)
            ? [...HEADING_SIZES_PT, SMALLEST_LEGIBLE_PT]
            : HEADING_SIZES_PT;
          if (!ladder.map(ptToPx).some((size) => Math.abs(size - fontSize) < 0.5)) {
            fail(
              `${where}: heading is ${((fontSize * 72) / 300).toFixed(1)}pt, ` +
                `not a rung of the ladder (${ladder.join("/")}pt)`
            );
          }
        }
      }

      // Rule 2.
      const widthPx = gridCellToPixels(PAGE, {
        columnStart: 0, rowStart: 0, columnSpan, rowSpan: 1,
      }).width;
      if (isCompactException(slug, widthPx)) continue;
      const debt = LATTICE_DEBT[slug];
      const offsets = elements
        // What a rule IS lives in ruleMarks.ts, shared with check:page -
        // the two described it differently, and each missed what the other
        // saw. This one used to ask for half the module's width, which left
        // a to-do's per-column row segments unexamined; it also had no
        // outline test, so it measured the module's own border against the
        // lattice the border is defined by.
        .filter((e) => e !== box && ruleAxisOf(e, PITCH) === "horizontal")
        .map((e) => {
          const centre = (e.y ?? 0) + (e.height ?? 0) / 2;
          const k = Math.round((centre - PAGE.marginPx) / PITCH);
          return { id: String(e.id), off: centre - (PAGE.marginPx + k * PITCH) };
        });
      // Rule 2, the other way up: a vertical rule that divides the box
      // rather than portioning it must land on a lattice COLUMN.
      if (!WEIGHTED_COLUMNS.has(slug)) {
        const verticals = elements
          .filter((e) => e !== box && ruleAxisOf(e, PITCH) === "vertical")
          .map((e) => {
            const centre = (e.x ?? 0) + (e.width ?? 0) / 2;
            const k = Math.round((centre - PAGE.marginPx) / PITCH);
            return { id: String(e.id), off: centre - (PAGE.marginPx + k * PITCH) };
          });
        for (const { id, off } of verticals) {
          if (onPitch(off, 0)) continue;
          {
            fail(
              `${where}: vertical rule ${id} sits ${off.toFixed(1)}px from the ` +
                `nearest lattice column - see WEIGHTED_COLUMNS`
            );
          }
        }
      }

      for (const { id, off } of offsets) {
        const expected = debt ?? 0;
        if (onPitch(off, expected)) continue;
        {
          fail(
            `${where}: rule ${id} sits ${off.toFixed(1)}px from the nearest dot row` +
              (debt === undefined
                ? " - rules must land on the lattice (see moduleFrame's contentTopPx)"
                : `, but ${slug} is recorded in LATTICE_DEBT at ${expected}px`)
          );
        }
      }
    }
  }
}

// --- the three body rules of a labeled box ----------------------------
//
// The loop above renders every module with its PREVIEW props, and a labeled
// box previews blank - so "lined" and "dotted" are drawn by nothing it does.
// They are the settings a person actually reaches for, and dotted is new, so
// they get their own pass.
//
// A DOT MUST LAND ON THE LATTICE, exactly as a rule must: the page is a 1/4in
// dot grid and a dotted box is meant to be that grid showing through. Dots a
// little off it would read as a second, wrong grid printed over the first -
// which is worse than no dots, and invisible on screen until it is on paper.
for (const rule of ["none", "lined", "dotted"] as const) {
  const elements = render("labeled-box", 12, 10, { heading: "Notes", rule });
  const marks = elements.filter((e) => typeof e.id === "string" && /-(rule|dot)\d/.test(String(e.id)));
  checked++;

  if (rule === "none") {
    if (marks.length > 0) fail(`labeled-box rule "none": drew ${marks.length} body mark(s)`);
    continue;
  }
  if (marks.length === 0) {
    fail(`labeled-box rule "${rule}": drew no body marks at all`);
    continue;
  }

  for (const mark of marks) {
    const midY = (mark.y ?? 0) + (mark.height ?? 0) / 2;
    const rowsOff = Math.abs(midY - (PAGE.marginPx + Math.round((midY - PAGE.marginPx) / PITCH) * PITCH));
    if (rowsOff > 0.51) {
      fail(`labeled-box rule "${rule}": ${mark.id} sits ${rowsOff.toFixed(1)}px off a lattice ROW`);
      break;
    }
    // A dot is on a lattice INTERSECTION - both axes - where a line spans
    // the box and only its row matters.
    if (rule === "dotted") {
      const midX = (mark.x ?? 0) + (mark.width ?? 0) / 2;
      const colsOff = Math.abs(
        midX - (PAGE.marginPx + Math.round((midX - PAGE.marginPx) / PITCH) * PITCH)
      );
      if (colsOff > 0.51) {
        fail(`labeled-box dotted: ${mark.id} sits ${colsOff.toFixed(1)}px off a lattice COLUMN`);
        break;
      }
    }
  }

  // A dotted box is a GRID, not one row of dots: several rows and several
  // columns, or the setting is drawing something else.
  if (rule === "dotted") {
    const rows = new Set(marks.map((m) => Math.round(((m.y ?? 0) + (m.height ?? 0) / 2) / PITCH)));
    const columns = new Set(marks.map((m) => Math.round(((m.x ?? 0) + (m.width ?? 0) / 2) / PITCH)));
    if (rows.size < 2 || columns.size < 2) {
      fail(`labeled-box dotted: ${rows.size} row(s) x ${columns.size} column(s) is not a grid`);
    }
  }
}

// The OLD boolean still draws. A box saved before `rule` existed holds
// `ruled: true` and nothing has migrated it; if this stops working, those
// boxes silently lose their lines.
const legacy = render("labeled-box", 12, 10, { heading: "Notes", ruled: true });
if (legacy.filter((e) => /-rule\d/.test(String(e.id))).length === 0) {
  fail('labeled-box: the legacy `ruled: true` boolean no longer draws lines');
}
checked++;

if (failures > 0) {
  console.error(`\nHouse style violated in ${failures} case(s).`);
  process.exit(1);
}
console.log(
  `All house style checks passed (${checked} module/size combinations; ` +
    `${Object.keys(LATTICE_DEBT).length} modules on the pre-frame lattice offset).`
);

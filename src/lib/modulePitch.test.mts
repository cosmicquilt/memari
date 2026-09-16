// Every ruled module's rows must be the same height, at every size it can
// be drawn at.
//
// This is the defect this project keeps meeting, and it has now been
// reported three separate times in the same words. First on the to-do:
// "instead of one row, there a little bit of a second row", then, after a
// fix that only moved it, "with more rows it still looks messed up, the
// last row is large". Then again, silently, the moment column-table and
// rating-strip were written with a half-cell band above full-cell rows -
// caught by looking at a proof sheet, which is not a thing that scales.
//
// The cause is always the same arithmetic. A module's header is one cell
// less the box inset at both ends, which leaves exactly (rowSpan - 1)
// whole cells beneath it. Any band between that header and the rows -
// column heads, a scale strip - has to be a whole number of cells too. A
// half-cell band leaves a half-cell remainder, and the remainder lands at
// the bottom as a last row half again as tall as the rest, with no rule
// under it because the border is still half a cell below.
//
// So the test is: measure the gaps between consecutive full-width
// horizontal rules, and require every one of them to be a whole number of
// the smallest. It measures the DRAWING rather than the constants, which
// is the point - the constants were right in isolation every time, and it
// was their sum that was wrong.
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { moduleDefinition, slugsDrawnBy } from "./moduleRegistry";
import { cellHeightPx, gridCellToPixels, type PageGrid } from "./grid";
import { isHabitTrackerCompact } from "./modules/habitTracker";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};

/** Modules that rule their body into rows to write on. A module without
 *  rows - a mini month, a text block, a matrix - has no pitch to check. */
const RULED = slugsDrawnBy("todo-checklist", "column-table", "rating-strip", "habit-tracker");

/**
 * The one deliberate exception, and it is worth stating rather than
 * quietly leaving out.
 *
 * The habit tracker's COMPACT layout sizes a row as a name row plus
 * `width / 7`, so each of the seven day cells comes out square. Seven does
 * not divide the 24-column lattice, so that row height is not a lattice
 * quantity and cannot be: the module is choosing square checkable cells
 * over an on-pitch row, knowingly - see getHabitTrackerRowMetricsPx, which
 * carries the same trade-off in its own comment.
 *
 * Its wide layout has a fixed one-cell row like everything else here and
 * is checked normally. So the exception is per-WIDTH, not per-module,
 * which is also the narrowest form it can take.
 */
const COMPACTABLE = new Set(slugsDrawnBy("habit-tracker"));

function isDeliberatelyOffPitch(slug: string, widthPx: number): boolean {
  const compactable = COMPACTABLE.has(slug);
  return compactable && isHabitTrackerCompact(widthPx);
}

/** Modules that rule one line per ITEM rather than filling their body, so
 *  the space under the last item is however many empty rows remain. */
const ITEM_DRIVEN = new Set(slugsDrawnBy("rating-strip"));

function flatten(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  return elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));
}

/**
 * The y of every horizontal row separator, including the box's own top and
 * bottom edges.
 *
 * A separator does NOT have to span the whole box. This asked for
 * full-width at first, on the reasoning that full-width is what makes a
 * rule a row separator rather than part of some other mark - and the
 * to-do's separators are drawn per day COLUMN, one segment each, so it saw
 * exactly one rule in the whole module (its header) and checked nothing.
 * The to-do is the module this test was written for.
 *
 * So: any horizontal hairline wider than a fifth of the box counts, and
 * segments sharing a y count once. That still excludes checkboxes (too
 * tall to be hairlines) and milestone ticks (too narrow).
 *
 * The border is included deliberately: the gap between the last rule and
 * the bottom edge is exactly where this defect shows itself, and a test
 * that stopped at the last rule would have passed on every version of it.
 */
function rowRuleYs(slug: string, columnSpan: number, rowSpan: number): number[] {
  const propValues = moduleDefinition(slug)?.previewProps ?? {};
  const elements = flatten(
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
  const box = elements.find((e) => e.type === "figure" && (e.strokeWidth ?? 0) > 0);
  if (!box) return [];
  const width = box.width ?? 0;

  const ys = new Set<number>([box.y ?? 0, (box.y ?? 0) + (box.height ?? 0)]);
  for (const element of elements) {
    if (element.type !== "figure" || element.subType !== "rect") continue;
    if (element === box) continue;
    const isHairline = (element.height ?? 0) < (element.width ?? 0) / 4;
    const wideEnough = (element.width ?? 0) > width / 5;
    // Rounded so segments of one separator, drawn per column, land on the
    // same key instead of counting as several boundaries a hair apart.
    if (isHairline && wideEnough) {
      ys.add(Math.round(((element.y ?? 0) + (element.height ?? 0) / 2) * 10) / 10);
    }
  }
  return [...ys].sort((a, b) => a - b);
}

let failures = 0;
let checked = 0;
let skipped = 0;

for (const slug of RULED) {
  if (!moduleDefinition(slug)) {
    console.error(`  ${slug}: not registered`);
    failures++;
    continue;
  }
  for (const columnSpan of [6, 12, 18, 24]) {
    const widthPx = gridCellToPixels(PAGE, {
      columnStart: 0, rowStart: 0, columnSpan, rowSpan: 1,
    }).width;
    if (isDeliberatelyOffPitch(slug, widthPx)) {
      skipped++;
      continue;
    }
    for (let rowSpan = 4; rowSpan <= 16; rowSpan++) {
      const ys = rowRuleYs(slug, columnSpan, rowSpan);
      // Fewer than four boundaries means header, one row and the border -
      // there is no pitch to be uneven yet.
      if (ys.length < 4) continue;
      checked++;

      // The first gap is the header, plus any head band above the rows -
      // deliberately not a row. Everything after it is body.
      const gaps = ys.slice(1).map((y, i) => y - ys[i]);
      const bodyGaps = gaps.slice(1);

      // Every gap but the last is exactly one pitch. The last is the only
      // one allowed to differ, and only in the two ways that mean
      // something.
      //
      // This asked for "a whole number of pitches" at first, which is
      // weaker than it sounds: it let the to-do's last row come out at 144
      // - a full row PLUS the 69px remainder, nearly double its
      // neighbours - because 144 is two pitches less the box inset, and
      // the rule could not tell that from four empty rows of slack.
      // Reported as "the bottom rows of the todos are too tall", the third
      // time this defect has been reported in the same words.
      const pitchSource = bodyGaps.length > 1 ? bodyGaps.slice(0, -1) : bodyGaps;
      const tally = new Map<number, number>();
      for (const gap of pitchSource) {
        const key = Math.round(gap * 100) / 100;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      const pitch = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];

      const offGrid: string[] = [];
      bodyGaps.forEach((gap, i) => {
        const last = i === bodyGaps.length - 1;
        if (!last) {
          if (Math.abs(gap - pitch) > 0.5) {
            offGrid.push(`${gap.toFixed(1)} (row ${i + 1}, expected ${pitch.toFixed(1)})`);
          }
          return;
        }
        // The final band is one pitch less the box's bottom inset - the
        // 6px that lattice-aligned content trades away. See moduleFrame's
        // contentTopPx.
        if (Math.abs(gap - (pitch - PAGE.boxInsetPx)) < 0.5) return;
        if (Math.abs(gap - pitch) < 0.5) return;
        // ...or, for a module that rules one line per ITEM rather than
        // filling its body, whatever empty rows are left under the last
        // item. That is blank space, not a misshapen row.
        if (ITEM_DRIVEN.has(slug)) {
          const rows = (gap + PAGE.boxInsetPx) / pitch;
          if (Math.abs(rows - Math.round(rows)) < 0.02) return;
        }
        offGrid.push(`${gap.toFixed(1)} (final band, expected ${(pitch - PAGE.boxInsetPx).toFixed(1)})`);
      });

      if (offGrid.length > 0) {
        console.error(
          `  ${slug} ${columnSpan}x${rowSpan}: row pitch is ${pitch.toFixed(1)}px but ` +
            `${offGrid.length} of ${bodyGaps.length} gap(s) disagree: ${offGrid.join("; ")}`
        );
        failures++;
      }
    }
  }
}


// ---------------------------------------------------------------------
// STRIP MODULES: a repeated strip must tile the lattice exactly.
//
// icon-strip has no rules at all - it draws glyphs and a label - so
// everything above and every check in moduleHouseStyle.test.mts passes it
// whatever it does vertically. Measuring its strips from the ink box
// instead of the allocation puts all of them 6px off the dots, which is
// the defect moduleFrame's contentTopPx exists to describe, and it was
// invisible: the module was changed to do exactly that and the whole suite
// stayed green.
//
// The observable is the strip label. Its offset from the nearest lattice
// line must be the SAME in every strip (the strips tile at the pitch) and
// must be the stated value below (they start on a lattice line, plus the
// air the design puts above the label).
//
// STRIP_LABEL_OFFSET_PX is written here rather than imported, for the
// reason the heading-ladder check carries in the other file: a test that
// asks the code what it does only proves the code equals itself. Moving
// the air above a strip label is a real decision about where every label
// in the module sits relative to the dots, and it should cost one
// deliberate edit here.
const STRIP_LABEL_OFFSET_PX = 3;
const STRIPPED = slugsDrawnBy("icon-strip");
const PITCH_PX = cellHeightPx(PAGE);

for (const slug of STRIPPED) {
  for (const columnSpan of [6, 12, 24]) {
    for (const rowSpan of [2, 3, 5]) {
      const propValues = moduleDefinition(slug)?.previewProps ?? {};
      const elements = flatten(
        renderModuleInstance(
          {
            id: "t",
            locked: true,
            columnStart: 0,
            rowStart: 2,
            columnSpan,
            rowSpan,
            propValues,
            moduleType: { slug },
          },
          PAGE
        )
      );
      const labels = elements
        .filter((e) => e.type === "text" && String(e.id).endsWith("-heading"))
        .map((e) => e.y ?? 0)
        .sort((a, b) => a - b);
      if (labels.length === 0) continue;
      checked++;

      if (labels.length !== rowSpan) {
        console.error(
          `  ${slug} ${columnSpan}x${rowSpan}: ${labels.length} strip(s) in a ${rowSpan}-cell box - ` +
            `a strip is one cell, so there should be ${rowSpan}`
        );
        failures++;
        continue;
      }

      const offsets = labels.map((y) => {
        const off = (((y - PAGE.marginPx) % PITCH_PX) + PITCH_PX) % PITCH_PX;
        return Math.round(off * 10) / 10;
      });
      if (offsets.some((off) => Math.abs(off - STRIP_LABEL_OFFSET_PX) > 0.5)) {
        console.error(
          `  ${slug} ${columnSpan}x${rowSpan}: strip label sits ${offsets.join(", ")}px below the ` +
            `lattice, expected ${STRIP_LABEL_OFFSET_PX}px in every strip`
        );
        failures++;
      }
    }
  }
}

if (failures > 0) {
  console.error(`\nRow pitch is uneven in ${failures} case(s).`);
  process.exit(1);
}
console.log(
  `All row pitch checks passed (${checked} module/size combinations, rows uniform` +
    `${skipped ? `; ${skipped} width(s) skipped as deliberately off-pitch` : ""}).`
);

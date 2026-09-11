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
import { moduleDefinition } from "./moduleRegistry";
import { gridCellToPixels, type PageGrid } from "./grid";
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
const RULED = ["todo-checklist", "column-table", "rating-strip", "habit-tracker", "water-tracker"];

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
function isDeliberatelyOffPitch(slug: string, widthPx: number): boolean {
  const compactable = slug === "habit-tracker" || slug === "water-tracker";
  return compactable && isHabitTrackerCompact(widthPx);
}

function flatten(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  return elements.flatMap((e) => (e.type === "group" ? flatten(e.children ?? []) : [e]));
}

/**
 * The y of every full-width horizontal rule, including the box's own top
 * and bottom edges.
 *
 * Full-width is what makes a rule a ROW separator rather than part of some
 * other mark - a checkbox, a day divider, a milestone tick. The border is
 * included deliberately: the gap between the last rule and the bottom edge
 * is exactly where this defect shows itself, and a test that stopped at
 * the last rule would have passed on every version of the bug.
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
  const left = box.x ?? 0;
  const width = box.width ?? 0;

  const ys = new Set<number>([box.y ?? 0, (box.y ?? 0) + (box.height ?? 0)]);
  for (const element of elements) {
    if (element.type !== "figure" || element.subType !== "rect") continue;
    if (element === box) continue;
    const isHairline = (element.height ?? 0) < (element.width ?? 0) / 4;
    const spansBox =
      Math.abs((element.x ?? 0) - left) < 1 && Math.abs((element.width ?? 0) - width) < 1;
    if (isHairline && spansBox) ys.add((element.y ?? 0) + (element.height ?? 0) / 2);
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

      // Every body gap must be a WHOLE number of row pitches.
      //
      // Not "every gap is equal", which was the first version of this and
      // was wrong: a rating strip rules a line under each ITEM, so the
      // space between the last item and the bottom border is however many
      // empty rows are left. That is blank body, not a misshapen row, and
      // it is correct for four of the five modules here.
      //
      // A whole multiple is the real invariant, and it still catches the
      // defect exactly: the half-cell head band left a final gap of 1.5
      // pitches, which is what "the last row is large" looks like in
      // numbers.
      // The pitch is the gap that occurs MOST OFTEN, tie-broken by the
      // smaller - not the smallest gap.
      //
      // Taking the smallest was the first version and it was silently
      // toothless: with the half-cell band in place the gaps came out as
      // seven rows of 75 and a final orphan of 37.5, and 37.5 is the
      // smallest, so every 75 read as "exactly two pitches" and the test
      // passed on the very defect it was written for. Checked by putting
      // the bad constant back, which is the only way to know a test of
      // this kind works at all.
      // The final band is deliberately short (see below), so it must not be
      // allowed to vote on what the pitch IS - with only two gaps it wins
      // the tie-break and every real row then reads as 1.09 of it.
      const pitchSource = bodyGaps.length > 1 ? bodyGaps.slice(0, -1) : bodyGaps;
      const tally = new Map<number, number>();
      for (const gap of pitchSource) {
        const key = Math.round(gap * 100) / 100;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      const pitch = [...tally.entries()].sort(
        (a, b) => b[1] - a[1] || a[0] - b[0]
      )[0][0];
      // The LAST band may be short by exactly the box's bottom inset, and
      // only the last.
      //
      // Content now starts on a lattice line so every rule lands on a dot
      // (see moduleFrame's contentTopPx). The box bottom is inset 6px
      // inside its allocation, so the space below the final rule comes out
      // 69px against 75px. The 6px has to be somewhere: it was previously
      // spread as a 6px offset on EVERY rule in the module, which is what
      // was reported. One band 8% short is the better half of that trade.
      const isLast = (i: number) => i === bodyGaps.length - 1;
      const offGrid = bodyGaps.filter((g, i) => {
        const rows = g / pitch;
        if (Math.abs(rows - Math.round(rows)) <= 0.01) return false;
        if (isLast(i) && Math.abs(g - (Math.ceil(rows) * pitch - PAGE.boxInsetPx)) < 0.5) {
          return false;
        }
        return true;
      });
      if (offGrid.length > 0) {
        console.error(
          `  ${slug} ${columnSpan}x${rowSpan}: row pitch is ${pitch.toFixed(1)}px but ` +
            `${offGrid.length} of ${bodyGaps.length} gap(s) are not a whole ` +
            `multiple of it (${offGrid.map((g) => `${g.toFixed(1)} = ${(g / pitch).toFixed(2)} rows`).join(", ")})`
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

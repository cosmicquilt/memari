// Standalone regression tests for grid.ts's placement/collision math — no
// test framework dependency, just plain assertions with a non-zero exit
// on failure. Run with: npx tsx src/lib/grid.test.mts
//
// This file exists because every real bug found in the drag-and-drop
// system so far (reflow running off the page, a candidate that overflows
// with nothing to collide with, findNearestFreeCell only checking the
// original overlap set instead of everything) was in this exact module,
// and none of them were visually obvious from a screenshot — they only
// showed up as specific numeric placements. Keeping these checks as a
// real file (not a throwaway script) means they run again the next time
// this file changes, instead of only being verified once and forgotten.

import { minRowSpansForStack } from "./moduleMinRowSpan";
import {
  gridCellToPixels,
  pixelsToGridCell,
  clampGridPlacement,
  rectsOverlap,
  findNearestFreeCell,
  resolveModulePlacement,
  moduleInstancesToRects,
  packStackFromTop,
  pixelHeightToRowSpan,
  gravityRepackAfterDeparture,
  pixelsToContainingCell,
  takeRowsFairly,
  followerRowsAfterGrowth,
  resolveZone,
  packedTopEdge,
  type PageGrid,
  type GridRect,
} from "./grid";

let failures = 0;

// Reported from an exit hook, so it always runs after every check no
// matter where in the file that check is written.
//
// It used to be an if/else two thirds of the way up, assigning
// process.exitCode and letting execution continue - so anything below it
// could fail while npm test still exited 0. Moving it to the end fixed
// that until the very next block of checks was appended, which put it
// back in the middle again. An exit hook cannot be outrun by an append.
process.on("exit", () => {
  if (failures > 0) {
    console.error(`
${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All grid.ts checks passed.");
  }
});
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
}

// Matches the real app's default page (see prisma/schema.prisma).
const page: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 4,
  gridRows: 30,
  boxInsetPx: 6,
  marginPx: 75,
};

// --- gridCellToPixels / pixelsToGridCell round-trip ---
{
  for (const placement of [
    { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 },
    { columnStart: 1, rowStart: 19, columnSpan: 3, rowSpan: 11 },
    { columnStart: 0, rowStart: 17, columnSpan: 1, rowSpan: 13 },
    { columnStart: 3, rowStart: 29, columnSpan: 1, rowSpan: 1 },
  ]) {
    const pixels = gridCellToPixels(page, placement);
    const back = pixelsToGridCell(page, pixels);
    assert(
      back.columnStart === placement.columnStart && back.rowStart === placement.rowStart,
      `round-trip ${JSON.stringify(placement)} -> pixels -> ${JSON.stringify(back)}`
    );
  }
}

// A cell's own center should always map back to itself, not a neighbor —
// guards against off-by-one rounding at cell boundaries.
{
  for (let col = 0; col < page.gridColumns; col++) {
    for (let row = 0; row < page.gridRows; row += 5) {
      const cellPixels = gridCellToPixels(page, { columnStart: col, rowStart: row, columnSpan: 1, rowSpan: 1 });
      const center = { x: cellPixels.x + cellPixels.width / 2, y: cellPixels.y + cellPixels.height / 2 };
      const back = pixelsToGridCell(page, center);
      assert(back.columnStart === col && back.rowStart === row, `cell (${col},${row})'s own center maps back to itself`);
    }
  }
}

// pixelsToGridCell clamps wildly out-of-range input instead of returning
// nonsense — this is what a drag/drop far outside the page relies on.
{
  const farNegative = pixelsToGridCell(page, { x: -99999, y: -99999 });
  assert(farNegative.columnStart === 0 && farNegative.rowStart === 0, "pixelsToGridCell clamps far-negative input to (0,0)");
  const farPositive = pixelsToGridCell(page, { x: 999999, y: 999999 });
  assert(
    farPositive.columnStart === page.gridColumns - 1 && farPositive.rowStart === page.gridRows - 1,
    "pixelsToGridCell clamps far-positive input to the last cell"
  );
}

// --- clampGridPlacement ---
{
  const c1 = clampGridPlacement(page, { columnStart: -5, rowStart: -5, columnSpan: 1, rowSpan: 1 });
  assert(c1.columnStart === 0 && c1.rowStart === 0, "clampGridPlacement floors negative placement to 0");
  const c2 = clampGridPlacement(page, { columnStart: 99, rowStart: 99, columnSpan: 1, rowSpan: 1 });
  assert(c2.columnStart === page.gridColumns - 1 && c2.rowStart === page.gridRows - 1, "clampGridPlacement caps oversized placement to the last cell for a 1x1 span");
  const c3 = clampGridPlacement(page, { columnStart: 3, rowStart: 25, columnSpan: 3, rowSpan: 10 });
  assert(
    c3.columnStart + 3 <= page.gridColumns && c3.rowStart + 10 <= page.gridRows,
    "clampGridPlacement accounts for span, not just position, when capping"
  );
}

// --- rectsOverlap ---
{
  const a: GridRect = { columnStart: 0, rowStart: 0, columnSpan: 2, rowSpan: 2 };
  assert(rectsOverlap(a, { columnStart: 1, rowStart: 1, columnSpan: 2, rowSpan: 2 }), "diagonally overlapping rects detected");
  assert(!rectsOverlap(a, { columnStart: 2, rowStart: 0, columnSpan: 2, rowSpan: 2 }), "touching edges (not overlapping) not flagged");
  assert(!rectsOverlap(a, { columnStart: 0, rowStart: 2, columnSpan: 2, rowSpan: 2 }), "touching edges vertically not flagged");
  assert(rectsOverlap(a, a), "a rect overlaps itself");
}

// --- moduleInstancesToRects ---
{
  const instances = [
    { id: "a", columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2 },
    { id: "b", columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 3 },
    { id: "freeform", columnStart: null, rowStart: null, columnSpan: 1, rowSpan: 1 },
  ];
  const all = moduleInstancesToRects(instances);
  assert(all.length === 2, "moduleInstancesToRects drops rows with no grid position (freeform elements)");
  assert(
    all.every((r) => r.columnStart !== undefined && typeof r.columnStart === "number"),
    "moduleInstancesToRects narrows nullable columnStart/rowStart to number"
  );

  const excluded = moduleInstancesToRects(instances, "a");
  assert(excluded.length === 1, "moduleInstancesToRects excludes the given id (e.g. the instance being resized)");
}

// --- findNearestFreeCell ---
{
  const relocated = findNearestFreeCell(
    page,
    { columnStart: 0, rowStart: 5, columnSpan: 1, rowSpan: 3 },
    [
      { columnStart: 0, rowStart: 5, columnSpan: 1, rowSpan: 3 },
      { columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 3 },
    ]
  );
  assert(
    !rectsOverlap({ ...relocated, columnSpan: 1, rowSpan: 3 }, { columnStart: 0, rowStart: 5, columnSpan: 1, rowSpan: 3 }) &&
      !rectsOverlap({ ...relocated, columnSpan: 1, rowSpan: 3 }, { columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 3 }),
    "findNearestFreeCell avoids every occupied rect, not just the one nearest the candidate"
  );

  // A fully-packed target column falls back to a different column
  // instead of returning something overlapping.
  const packedColumn: GridRect[] = Array.from({ length: 30 }, (_, i) => ({
    columnStart: 0,
    rowStart: i,
    columnSpan: 1,
    rowSpan: 1,
  }));
  const fallback = findNearestFreeCell(page, { columnStart: 0, rowStart: 15, columnSpan: 1, rowSpan: 1 }, packedColumn);
  assert(fallback.columnStart !== 0, "a fully-packed column falls back to scanning other columns");
  assert(!packedColumn.some((o) => rectsOverlap({ ...fallback, columnSpan: 1, rowSpan: 1 }, o)), "the fallback cell doesn't overlap anything");

  // A genuinely full grid (nothing fits anywhere) doesn't throw or hang
  // — it returns *something* (the clamped candidate) rather than crashing.
  const fullGrid: GridRect[] = [];
  for (let c = 0; c < page.gridColumns; c++) {
    for (let r = 0; r < page.gridRows; r++) fullGrid.push({ columnStart: c, rowStart: r, columnSpan: 1, rowSpan: 1 });
  }
  const noRoom = findNearestFreeCell(page, { columnStart: 2, rowStart: 10, columnSpan: 1, rowSpan: 1 }, fullGrid);
  assert(
    noRoom.columnStart >= 0 && noRoom.columnStart < page.gridColumns && noRoom.rowStart >= 0 && noRoom.rowStart < page.gridRows,
    "a fully-occupied grid still returns some in-bounds cell rather than throwing"
  );
}

// --- resolveModulePlacement: the sidebar-stack scenario, end to end ---
{
  // week-title (locked, rows 0-2) + Gratitude(2-8) + Reminders(8-17) +
  // Notes(17-30), all column 0 — the real app's default sidebar layout.
  const weekTitle = { id: "week-title", columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2, locked: true };
  const gratitude = { id: "gratitude", columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 6, locked: false };
  const reminders = { id: "reminders", columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 9, locked: false };
  const notes = { id: "notes", columnStart: 0, rowStart: 17, columnSpan: 1, rowSpan: 13, locked: false };

  function assertValidStack(
    label: string,
    placement: { columnStart: number; rowStart: number },
    draggedRowSpan: number,
    reflow: Array<{ id: string; rowStart: number }>,
    siblingSpans: Record<string, number>,
    siblingDefaults: Record<string, number>
  ) {
    const rects: Array<{ id: string; rowStart: number; rowSpan: number }> = [
      { id: "dragged", rowStart: placement.rowStart, rowSpan: draggedRowSpan },
      { id: "week-title", rowStart: 0, rowSpan: 2 },
      ...Object.keys(siblingSpans).map((id) => ({
        id,
        rowStart: reflow.find((r) => r.id === id)?.rowStart ?? siblingDefaults[id],
        rowSpan: siblingSpans[id],
      })),
    ];
    for (const r of rects) {
      assert(r.rowStart >= 0, `${label}: ${r.id} rowStart is non-negative`);
      assert(r.rowStart + r.rowSpan <= page.gridRows, `${label}: ${r.id} doesn't run past the page bottom`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        assert(
          !rectsOverlap(
            { ...rects[i], columnStart: 0, columnSpan: 1 },
            { ...rects[j], columnStart: 0, columnSpan: 1 }
          ),
          `${label}: ${rects[i].id} and ${rects[j].id} don't overlap`
        );
      }
    }
  }

  const siblingDefaults = { gratitude: 2, reminders: 8, notes: 17 };

  // Drag Gratitude to the very top — bounded by week-title.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 6 }, [weekTitle, reminders, notes]);
    assertValidStack("drag-gratitude-to-top", r.placement, 6, r.reflow, { reminders: 9, notes: 13 }, siblingDefaults);
    assert(r.placement.rowStart >= 2, "drag-gratitude-to-top: dragged module itself clears week-title");
  }

  // Drag Notes to an out-of-range row (39, past the 30-row grid, as an
  // un-pre-clamped drag position would be) — bounded by the page bottom.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 39, columnSpan: 1, rowSpan: 13 }, [weekTitle, gratitude, reminders]);
    assertValidStack("drag-notes-past-bottom", r.placement, 13, r.reflow, { gratitude: 6, reminders: 9 }, siblingDefaults);
  }

  // Ordinary mid-stack reorder.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 15, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes]);
    assertValidStack("drag-reminders-to-middle", r.placement, 9, r.reflow, { gratitude: 6, notes: 13 }, siblingDefaults);
  }

  // Swapping two ADJACENT items by dragging one onto the exact rowStart
  // of its neighbor — a real bug caught live on the monthly-layout
  // sidebar (4 boxes, not 3, but the mechanism is general), in BOTH
  // directions, which needed two separate fixes since a single fixed
  // tie-break rule can only ever get one direction right:
  //
  // Dragging reminders UP onto gratitude's exact rowStart (2) used to
  // compute a no-op (reminders ends up right back at its own original
  // row 8, gratitude unchanged) because the tie-break favored the
  // existing sibling over the dragged item — which, for two items that
  // were already adjacent, reconstructs the pre-drag order exactly.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes], 8);
    assert(r.placement.rowStart === 2, "dragging reminders UP onto gratitude's exact rowStart actually moves it there, not back to its own start");
    assert(
      r.reflow.some((m) => m.id === "gratitude" && m.rowStart === 11),
      "gratitude yields to the dragged item instead of the drag being a no-op"
    );
    assertValidStack("swap-adjacent-exact-tie-up", r.placement, 9, r.reflow, { gratitude: 6, notes: 13 }, siblingDefaults);
  }

  // The mirror image: dragging gratitude DOWN onto reminders' exact
  // rowStart (8) needs the *opposite* tie-break (dragged sorts after
  // the tied sibling this time) for the same underlying reason — fixing
  // only the "drag up" direction would have made this one a no-op
  // instead (this was caught exactly that way: the first fix broke this
  // direction while fixing the other one).
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 6 }, [weekTitle, reminders, notes], 2);
    assert(r.placement.rowStart === 11, "dragging gratitude DOWN onto reminders' exact rowStart lands it right after reminders' new position, not back at its own start (2)");
    assert(
      r.reflow.some((m) => m.id === "reminders" && m.rowStart === 2),
      "reminders yields to the dragged item instead of the drag being a no-op"
    );
    assertValidStack("swap-adjacent-exact-tie-down", r.placement, 6, r.reflow, { reminders: 9, notes: 13 }, siblingDefaults);
  }

  // Dragging the CURRENT bottom-most item further up so it overlaps the
  // stack's own locked upper bound (week-title) — this used to reject
  // the reorder branch entirely (any locked overlap disqualified it) and
  // fall back to plain relocation, which doesn't reflow siblings, so a
  // "drag to the very top" gesture looked like it silently did nothing.
  // Real scenario from the monthly-layout sidebar's 4-box stack, ported
  // to this file's 3-box fixtures.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes], 8);
    assert(r.placement.rowStart === 2, "dragging reminders past week-title still clamps to right after it, not overlapping it");
    assert(
      r.reflow.some((m) => m.id === "gratitude" && m.rowStart === 11),
      "gratitude still yields even though the drag overshot into the locked block above"
    );
    assertValidStack("drag-past-locked-upper-bound", r.placement, 9, r.reflow, { gratitude: 6, notes: 13 }, siblingDefaults);
  }

  // Dragging a module only PART of the way onto the sibling below it —
  // not all the way to that sibling's own exact rowStart — still
  // triggers the swap. The original bug this guards was a drag that had
  // covered most of a realistic distance computing to a no-op, because
  // the swap needed an edge-to-edge match with the sibling's own
  // rowStart before anything happened; caught live dragging the
  // second-to-last box of a 4-item stack onto the last one.
  //
  // The threshold has moved twice since. It was briefly "the dragged
  // center has entered the sibling's row range", which over-corrected:
  // entering a range means crossing its near EDGE, so going down the
  // swap fired half the sibling's height early. It is now the dragged
  // item's leading edge against the sibling's center (see grid.ts), so
  // for reminders (rowSpan 9) against notes (rows 17-30, center 23.5)
  // the boundary is row 14.5. Row 15 is still well short of notes' own
  // rowStart of 17, so this keeps testing what it was written to test.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 15, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes], 8);
    assert(r.placement.rowStart !== 8, "dragging reminders only partway onto notes still swaps, not snapping back to its own start");
    assert(
      r.reflow.some((m) => m.id === "notes" && m.rowStart === 8),
      "notes yields to the dragged item even though the drop point fell short of notes' own exact rowStart"
    );
    assertValidStack("swap-partial-drag-crosses-center", r.placement, 9, r.reflow, { gratitude: 6, notes: 13 }, siblingDefaults);
  }

  // The other side of the same fix: dragging reminders down only
  // slightly (to row 10) — short of even the CENTER-crossing threshold
  // into notes' range — should NOT trigger a swap. Confirms the fix
  // isn't simply "any overlap at all triggers a swap," which would make
  // trivial nudges surprising.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 10, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes], 8);
    assert(
      !r.reflow.some((m) => m.id === "notes"),
      "dragging reminders only barely into notes' territory (short of the center threshold) doesn't swap them"
    );
  }

  // An oversized dragged item can be clamped by its own span before its
  // center ever reaches a sibling positioned at the far end of the
  // stack — the center-crossing rule above can't fire, and falling back
  // to candidate.rowStart doesn't help either, since a large enough
  // item's own on-grid rowStart range is capped well short of the far
  // sibling's rowStart too. Caught live: a real 17-row "Notes" box
  // sitting between a 4-row "Gratitude" and a 7-row "Reminders", dragged
  // toward Reminders as far down as the grid allows — every drop
  // computed back to Notes' original slot, reading as "dragging it to
  // the bottom doesn't work," no matter how far down it was actually
  // dragged. Reproduced with this file's fixtures: a 17-row "bigNotes"
  // between gratitude(rowSpan 4, rows 2-6) and a 7-row "reminders" at
  // the very bottom (rows 23-30) — dragged to its own maximum clamp
  // (row 13, since 30-17=13) should still swap it past reminders.
  {
    const smallGratitude = { id: "gratitude", columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 4, locked: false };
    const smallReminders = { id: "reminders", columnStart: 0, rowStart: 23, columnSpan: 1, rowSpan: 7, locked: false };
    const r = resolveModulePlacement(
      page,
      { columnStart: 0, rowStart: 13, columnSpan: 1, rowSpan: 17 },
      [weekTitle, smallGratitude, smallReminders],
      6
    );
    assert(r.placement.rowStart === 13, "an oversized item dragged to its own maximum clamp lands there, all the way past its smaller sibling");
    assert(
      r.reflow.some((m) => m.id === "reminders" && m.rowStart === 6),
      "reminders yields and moves up to right after gratitude instead of the drag being a no-op"
    );
    assertValidStack(
      "swap-oversized-item-clamped-before-crossing-center",
      r.placement,
      17,
      r.reflow,
      { gratitude: 4, reminders: 7 },
      { gratitude: 2, reminders: 23 }
    );
  }

  // Dropping directly on a locked block (not a same-span sibling stack)
  // relocates instead of reflowing.
  {
    const hourlyGrid = { id: "hourly", columnStart: 1, rowStart: 0, columnSpan: 3, rowSpan: 19, locked: true };
    const r = resolveModulePlacement(page, { columnStart: 1, rowStart: 5, columnSpan: 1, rowSpan: 2 }, [hourlyGrid]);
    assert(r.reflow.length === 0, "dropping on a locked block never reflows");
    assert(!rectsOverlap({ ...r.placement, columnSpan: 1, rowSpan: 2 }, hourlyGrid), "relocated placement clears the locked block");
  }

  // More content than the column has room for — reorder can't make it
  // fit, so it must relocate instead of producing an overflowing stack.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 15, columnSpan: 1, rowSpan: 10 }, [
      weekTitle,
      gratitude,
      reminders,
      notes,
    ]);
    assert(r.reflow.length === 0, "an unfittable reorder falls back to relocation, leaving siblings untouched");
    assert(
      ![weekTitle, gratitude, reminders, notes].some((o) => rectsOverlap({ ...r.placement, columnSpan: 1, rowSpan: 10 }, o)),
      "the relocated placement clears everything already on the page"
    );
  }

  // A locked block wider than the stack (column-range overlap, not exact
  // span match) still bounds it correctly.
  {
    const wideLockedAbove = { id: "wide-locked", columnStart: 0, rowStart: 0, columnSpan: 4, rowSpan: 3, locked: true };
    const r = resolveModulePlacement(page, { columnStart: 1, rowStart: 3, columnSpan: 1, rowSpan: 5 }, [wideLockedAbove]);
    assert(!rectsOverlap({ ...r.placement, columnSpan: 1, rowSpan: 5 }, wideLockedAbove), "a wider locked block still bounds a narrower stack via column overlap");
  }
}

// --- packStackFromTop ---
{
  // A gap in the middle (deleted "reminders") closes, moving "notes" up
  // — the thing that opens after a delete, since nothing about a delete
  // triggers the drag-reflow path in resolveModulePlacement.
  const moves = packStackFromTop(2, [
    { id: "gratitude", rowStart: 2, rowSpan: 6 },
    { id: "notes", rowStart: 17, rowSpan: 13 },
  ]);
  assert(moves.length === 1 && moves[0].id === "notes" && moves[0].rowStart === 8, "packStackFromTop closes a mid-stack gap by moving only what needs to move");

  // Already packed (no gaps) — nothing to move.
  const noMoves = packStackFromTop(2, [
    { id: "gratitude", rowStart: 2, rowSpan: 6 },
    { id: "reminders", rowStart: 8, rowSpan: 9 },
  ]);
  assert(noMoves.length === 0, "packStackFromTop is a no-op on an already-contiguous stack");

  // Order in the input array doesn't matter — packing follows rowStart,
  // not array position.
  const outOfOrder = packStackFromTop(0, [
    { id: "b", rowStart: 10, rowSpan: 2 },
    { id: "a", rowStart: 0, rowSpan: 3 },
  ]);
  assert(
    outOfOrder.find((m) => m.id === "b")?.rowStart === 3 && outOfOrder.every((m) => m.id !== "a"),
    "packStackFromTop sorts by current rowStart regardless of input order"
  );

  // Empty stack: no members, nothing to move, no crash.
  assert(packStackFromTop(5, []).length === 0, "packStackFromTop on an empty stack returns no moves");
}

// --- pixelHeightToRowSpan ---
{
  // Round-trips against gridCellToPixels itself: whatever height N rows
  // actually render at must convert back to exactly N, for every N — the
  // property this function exists to guarantee for updateHourlySettings
  // (Stage 2), which trusts it to size hourly-grid-core's own rowSpan
  // from real rendered content height.
  for (const rowSpan of [1, 2, 3, 10, 19, 30]) {
    const heightPx = gridCellToPixels(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan }).height;
    assert(
      pixelHeightToRowSpan(page, heightPx) === rowSpan,
      `pixelHeightToRowSpan round-trips exactly at ${rowSpan} rows' own rendered height`
    );
  }

  // A height a hair under N rows' worth still needs N rows to contain it
  // (rounds up, never down) — a real caller's content height is rarely
  // going to land on an exact row boundary.
  const threeRowsHeight = gridCellToPixels(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 3 }).height;
  assert(
    pixelHeightToRowSpan(page, threeRowsHeight - 1) === 3,
    "pixelHeightToRowSpan rounds up, not down, for a height just under a row boundary"
  );

  // A height a hair over 2 rows' worth needs a 3rd row, not just 2.
  const twoRowsHeight = gridCellToPixels(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2 }).height;
  assert(
    pixelHeightToRowSpan(page, twoRowsHeight + 1) === 3,
    "pixelHeightToRowSpan needs a 3rd row for a height just over 2 rows' worth"
  );

  assert(pixelHeightToRowSpan(page, 0) === 1, "pixelHeightToRowSpan floors at 1 row for a zero/negligible height");
}

// --- resolveModulePlacement: reorder threshold is center-vs-center ---
{
  // Same real sidebar stack: week-title(0-2, locked), Gratitude(2-8),
  // Reminders(8-17), Notes(17-30). Spans 6, 9 and 13 — deliberately
  // unequal, which is what exposes an asymmetric threshold.
  //
  // A swap should happen when the two items' CENTERS cross, which is
  // symmetric: the crossing row is the same whichever of the pair is
  // the one being dragged. The earlier rule compared the dragged
  // center against whether it had entered the sibling's row RANGE —
  // i.e. against that sibling's near EDGE — so the threshold was off
  // by half the sibling's height, early going down and late going up.
  const weekTitle = { id: "week-title", columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2, locked: true };
  const gratitude = { id: "gratitude", columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 6, locked: false };
  const reminders = { id: "reminders", columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 9, locked: false };
  const notes = { id: "notes", columnStart: 0, rowStart: 17, columnSpan: 1, rowSpan: 13, locked: false };

  // Did the dragged module end up above the named sibling?
  function draggedIsAbove(
    r: { placement: { rowStart: number }; reflow: Array<{ id: string; rowStart: number }> },
    siblingId: string,
    siblingDefaultRow: number
  ) {
    const siblingRow = r.reflow.find((x) => x.id === siblingId)?.rowStart ?? siblingDefaultRow;
    return r.placement.rowStart < siblingRow;
  }

  // Reminders (span 9, center at rowStart+4.5) dragged DOWN past Notes
  // (rows 17-30, center 23.5). Centers cross at rowStart 19.
  //
  // Going down, the leading edge is the BOTTOM, so the threshold is
  // rowStart + 9 against Notes' center of 23.5 — i.e. row 14.5. At row
  // 13 the bottom is 22, short of it, so Reminders stays above. This is
  // the case that felt like "the one below jumps up too soon": the old
  // rule fired at Notes' top EDGE (row 17), reached at rowStart 12.5.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 13, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes], 8);
    assert(draggedIsAbove(r, "notes", 17), "reorder-threshold: reminders at row 13 stays above notes (bottom 22 < 23.5)");
  }
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 15, columnSpan: 1, rowSpan: 9 }, [weekTitle, gratitude, notes], 8);
    assert(!draggedIsAbove(r, "notes", 17), "reorder-threshold: reminders at row 15 moves below notes (bottom 24 > 23.5)");
  }

  // Notes (span 13, center at rowStart+6.5) dragged UP past Reminders
  // (rows 8-17, center 12.5). Centers cross at rowStart 6.
  //
  // Going up, the leading edge is the TOP, so the threshold is Notes'
  // own rowStart against Reminders' center of 12.5 — nothing to do with
  // Notes' height. At row 13 the top has not reached it yet; at row 12
  // it has. The old rule fired at Reminders' bottom EDGE (row 17), i.e.
  // as soon as the dragged center dipped below 17, which is why the
  // swap it produced arrived only after the item had visibly passed the
  // midpoint: "takes too long going up".
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 13, columnSpan: 1, rowSpan: 13 }, [weekTitle, gratitude, reminders], 17);
    assert(!draggedIsAbove(r, "reminders", 8), "reorder-threshold: notes at row 13 stays below reminders (top 13 > 12.5)");
  }
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 12, columnSpan: 1, rowSpan: 13 }, [weekTitle, gratitude, reminders], 17);
    assert(draggedIsAbove(r, "reminders", 8), "reorder-threshold: notes at row 12 moves above reminders (top 12 < 12.5)");
  }

  // The invariant, swept rather than spot-checked: in each direction
  // the row at which the order flips is exactly the row at which the
  // dragged item's LEADING edge passes the sibling's center. Sweeping
  // catches any future rule that reintroduces a size-dependent bias,
  // which is what the reported "too soon down, too late up" was.
  //
  // Note the two flip rows are not mirror images and are not meant to
  // be — dragging Reminders down past Notes takes half of Notes'
  // height, dragging Notes up past Reminders takes half of Reminders'.
  // Equal travel would mean the rule depended on the DRAGGED item's
  // size, which is the bias being removed.
  function flipRow(
    draggedSpan: number,
    others: Array<typeof weekTitle>,
    originalRow: number,
    siblingId: string,
    siblingDefaultRow: number,
    goingDown: boolean
  ) {
    const rows = goingDown
      ? Array.from({ length: 28 }, (_, i) => i + 2)
      : Array.from({ length: 28 }, (_, i) => 29 - i);
    for (const row of rows) {
      const r = resolveModulePlacement(page, { columnStart: 0, rowStart: row, columnSpan: 1, rowSpan: draggedSpan }, others, originalRow);
      if (draggedIsAbove(r, siblingId, siblingDefaultRow) !== goingDown) return row;
    }
    return null;
  }
  {
    // Reminders (span 9) down past Notes (center 23.5): bottom is
    // row + 9, so the first row that clears 23.5 is 15.
    const downFlip = flipRow(9, [weekTitle, gratitude, notes], 8, "notes", 17, true);
    assert(downFlip === 15, `reorder-threshold: reminders flips below notes at row 15 (got ${downFlip})`);

    // Notes (span 13) up past Reminders (center 12.5): top is the row
    // itself, so the last row still clearing 12.5 going up is 12.
    const upFlip = flipRow(13, [weekTitle, gratitude, reminders], 17, "reminders", 8, false);
    assert(upFlip === 12, `reorder-threshold: notes flips above reminders at row 12 (got ${upFlip})`);
  }
}

// --- resolveModulePlacement: minRowSpanById shrink-cascade tier ---
// Reuses the exact same sidebar-stack fixture as the block above
// (week-title rows 0-2, Gratitude(6)+Reminders(9)+Notes(13) = 28 rows,
// exactly filling the 28 rows left below week-title on this app's real
// 30-row grid) — a genuinely full zone, not a contrived one, so any
// overlapping candidate immediately needs the new shrink tier to land
// at all.
{
  const weekTitle = { id: "week-title", columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2, locked: true };
  const gratitude = { id: "gratitude", columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 6, locked: false };
  const reminders = { id: "reminders", columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 9, locked: false };
  const notes = { id: "notes", columnStart: 0, rowStart: 17, columnSpan: 1, rowSpan: 13, locked: false };
  const others = [weekTitle, gratitude, reminders, notes];

  // Omitting minRowSpanById entirely (every existing caller) must behave
  // exactly as before this change — falls through to findNearestFreeCell
  // (relocated elsewhere, empty reflow) rather than shrinking anything,
  // even though the zone is genuinely full and a shrink *would* make it
  // fit. This is the "old callers get identical output" guarantee.
  {
    const r = resolveModulePlacement(page, { columnStart: 0, rowStart: 20, columnSpan: 1, rowSpan: 2 }, others);
    assert(r.reflow.length === 0, "omitting minRowSpanById: no reflow — falls through to findNearestFreeCell, doesn't repack the stack");
  }

  // Fits once shrunk: candidate (already at its own 2-row minimum) drops
  // near the bottom (overlapping Notes), sorts in after Notes on the tie
  // (draggedOriginalRowStart omitted, same "dragged-last" default as a
  // fresh drop). deficit is exactly 2 rows short (30 total needed, 28
  // available) — shrinking Notes alone (floor 2, 11 rows shrinkable)
  // covers it without needing to touch Gratitude/Reminders at all.
  {
    const minRowSpanById = { gratitude: 2, reminders: 4, notes: 2 };
    const r = resolveModulePlacement(
      page,
      { columnStart: 0, rowStart: 20, columnSpan: 1, rowSpan: 2 },
      others,
      undefined,
      minRowSpanById
    );
    const notesMove = r.reflow.find((m) => m.id === "notes");
    assert(!r.reflow.find((m) => m.id === "gratitude"), "fits-with-shrink: gratitude untouched (shrinking notes alone was enough)");
    assert(!r.reflow.find((m) => m.id === "reminders"), "fits-with-shrink: reminders untouched (shrinking notes alone was enough)");
    assert(notesMove?.rowSpan === 11, `fits-with-shrink: notes shrinks from 13 to 11 (got ${notesMove?.rowSpan})`);
    // Lands ABOVE notes, not below. The drop is at row 20 with a 2-row
    // span, so its bottom edge is 22 against notes' center of 23.5 —
    // dropped into the upper part of notes, so it sorts in above it.
    // This used to land at row 28 (below notes) because the old rule
    // snapped the sort key to notes' rowStart whenever the dragged
    // center fell anywhere inside notes' range, producing an exact tie
    // that the "dragged-last on tie" default for fresh drops then
    // resolved downward. With a real comparison there is no tie to
    // break, and a small item dropped near the top of a large one
    // staying near the top is the less surprising outcome.
    assert(r.placement.rowStart === 17, `fits-with-shrink: dragged candidate lands at row 17, just above shrunk notes (got ${r.placement.rowStart})`);
    assert(notesMove?.rowStart === 19, `fits-with-shrink: notes repacks to row 19, below the dragged item (got ${notesMove?.rowStart})`);
    assert(r.placement.rowStart + 2 <= 30, "fits-with-shrink: dragged candidate itself stays on the page");
  }

  // Doesn't fit even at every floor: floors equal current sizes (zero
  // shrinkable room anywhere) — must fall through to the exact same
  // findNearestFreeCell relocation as the no-minRowSpanById case, not a
  // partial/broken shrink.
  {
    const minRowSpanById = { gratitude: 6, reminders: 9, notes: 13 };
    const r = resolveModulePlacement(
      page,
      { columnStart: 0, rowStart: 20, columnSpan: 1, rowSpan: 2 },
      others,
      undefined,
      minRowSpanById
    );
    assert(r.reflow.length === 0, "doesn't-fit-even-shrunk: falls through with no reflow, same as omitting minRowSpanById");
  }

  // Cascade correctly skips a sibling already at its own floor and moves
  // to the next one — dragged candidate lands at the very TOP this time
  // (rowStart 0, tolerated as bounded by week-title from above), so the
  // final merged order is [DRAGGED, gratitude, reminders, notes] — the
  // shrink must still walk from the TAIL of that order (notes first),
  // not from wherever the dragged item itself sorted.
  {
    const minRowSpanById = { notes: 13, reminders: 4, gratitude: 2 }; // notes has zero room
    const r = resolveModulePlacement(
      page,
      { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2 },
      others,
      undefined,
      minRowSpanById
    );
    assert(!r.reflow.find((m) => m.id === "notes"), "skip-at-floor-sibling: notes (zero shrinkable room) is left untouched");
    const remindersMove = r.reflow.find((m) => m.id === "reminders");
    assert(remindersMove?.rowSpan === 7, `skip-at-floor-sibling: cascade moves on to reminders, 9 -> 7 (got ${remindersMove?.rowSpan})`);
    assert(r.placement.rowStart === 2, `skip-at-floor-sibling: dragged candidate lands at the very top, row 2 (got ${r.placement.rowStart})`);
  }

  // Mid-stack insert: candidate lands between Gratitude and Reminders
  // (not at either physical end of the stack) — confirms the shrink
  // tier's placement math still slots it into the correct middle
  // position once everyone's spans are resolved, not just the
  // top/bottom edge cases above.
  {
    const minRowSpanById = { gratitude: 2, reminders: 2, notes: 2 };
    const r = resolveModulePlacement(
      page,
      { columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 2 },
      others,
      undefined,
      minRowSpanById
    );
    assert(
      r.placement.rowStart > 2 && r.placement.rowStart < 30,
      `mid-stack-shrink: dragged candidate lands strictly between week-title and the page bottom (got ${r.placement.rowStart})`
    );
    // Whole system (week-title + 3 shrunk siblings + dragged, all now
    // known) must be internally consistent: no overlaps, nothing runs
    // off the page — same invariant assertValidStack checks above,
    // recomputed inline here since the shrunk spans aren't known ahead
    // of time the way the earlier block's fixed siblingSpans are.
    const finalSpans: Record<string, number> = { gratitude: 6, reminders: 9, notes: 13 };
    for (const m of r.reflow) if (m.rowSpan !== undefined) finalSpans[m.id] = m.rowSpan;
    const finalStarts: Record<string, number> = { gratitude: 2, reminders: 8, notes: 17 };
    for (const m of r.reflow) finalStarts[m.id] = m.rowStart;
    const rects = [
      { id: "dragged", rowStart: r.placement.rowStart, rowSpan: 2 },
      { id: "week-title", rowStart: 0, rowSpan: 2 },
      ...["gratitude", "reminders", "notes"].map((id) => ({ id, rowStart: finalStarts[id], rowSpan: finalSpans[id] })),
    ];
    for (const rect of rects) {
      assert(rect.rowStart >= 0 && rect.rowStart + rect.rowSpan <= 30, `mid-stack-shrink: ${rect.id} stays on the page`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        assert(
          !rectsOverlap({ ...rects[i], columnStart: 0, columnSpan: 1 }, { ...rects[j], columnStart: 0, columnSpan: 1 }),
          `mid-stack-shrink: ${rects[i].id} and ${rects[j].id} don't overlap`
        );
      }
    }
  }
}

// --- gravityRepackAfterDeparture ---
// Same real sidebar fixture as the shrink-cascade block above
// (week-title rows 0-2 locked, Gratitude(6)@2, Reminders(9)@8,
// Notes(13)@17, total footprint 28 rows) — a cross-zone drag's own
// SOURCE zone (the one being left) needs exactly this: whoever's left
// behind closes the gap the departing module leaves, with the
// departing member's own rowSpan split as evenly as possible across
// EVERY remaining sibling (not dumped entirely on the bottom-most one
// — requested directly: "distribute gap size between however remaining
// siblings there are as evenly split as possible"). Every scenario
// below lands on the exact same 28-row total footprint the stack
// already had, just redistributed differently than a single-recipient
// version would.
{
  const weekTitle = { id: "week-title", columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2, locked: true };
  const gratitude = { id: "gratitude", columnStart: 0, rowStart: 2, columnSpan: 1, rowSpan: 6, locked: false };
  const reminders = { id: "reminders", columnStart: 0, rowStart: 8, columnSpan: 1, rowSpan: 9, locked: false };
  const notes = { id: "notes", columnStart: 0, rowStart: 17, columnSpan: 1, rowSpan: 13, locked: false };
  const siblings = [weekTitle, gratitude, reminders, notes];

  // Departing from the TOP of the stack (gratitude, rowSpan 6) — split
  // evenly 2 ways (3/3, no remainder) between the two remaining
  // siblings. reminders closes up to row 2 and grows 9 -> 12; notes
  // closes up to row 14 (right after reminders' own new end) and grows
  // 13 -> 16. Total: 12 + 16 = 28, same footprint as before.
  {
    const plan = gravityRepackAfterDeparture(gratitude, siblings.filter((s) => s.id !== "gratitude"));
    const byId = Object.fromEntries(plan.map((m) => [m.id, m]));
    assert(plan.length === 2, `gravity: departing the top touches both remaining members (got ${plan.length})`);
    assert(
      byId["reminders"]?.rowStart === 2 && byId["reminders"]?.rowSpan === 12,
      `gravity: reminders closes up to row 2 and grows 9 -> 12 (got ${JSON.stringify(byId["reminders"])})`
    );
    assert(
      byId["notes"]?.rowStart === 14 && byId["notes"]?.rowSpan === 16,
      `gravity: notes closes up to row 14 and grows 13 -> 16 (got ${JSON.stringify(byId["notes"])})`
    );
  }

  // Departing from the MIDDLE (reminders, rowSpan 9) — 9 doesn't split
  // evenly 2 ways: floor(9/2) = 4 each, remainder 1 goes to the LATER
  // member (notes, matching the "stacks grow from the bottom"
  // convention). gratitude stays at row 2 (already correctly
  // positioned) but still grows 6 -> 10 — unlike the old single-
  // recipient version, it now appears in the plan even though its own
  // rowStart didn't move, since its rowSpan did. notes closes up to
  // row 12 and grows 13 -> 18 (the extra +1 remainder row).
  {
    const plan = gravityRepackAfterDeparture(reminders, siblings.filter((s) => s.id !== "reminders"));
    const byId = Object.fromEntries(plan.map((m) => [m.id, m]));
    assert(plan.length === 2, `gravity: departing the middle now touches both remaining members, not just one (got ${plan.length})`);
    assert(
      byId["gratitude"]?.rowStart === 2 && byId["gratitude"]?.rowSpan === 10,
      `gravity: gratitude stays at row 2 but grows 6 -> 10 (got ${JSON.stringify(byId["gratitude"])})`
    );
    assert(
      byId["notes"]?.rowStart === 12 && byId["notes"]?.rowSpan === 18,
      `gravity: notes closes up to row 12 and grows 13 -> 18, taking the remainder (got ${JSON.stringify(byId["notes"])})`
    );
  }

  // Departing from the BOTTOM (notes, rowSpan 13) — floor(13/2) = 6
  // each, remainder 1 to reminders (the later of the two). gratitude
  // stays at row 2 but grows 6 -> 12; reminders closes up to row 14 and
  // grows 9 -> 16 (the extra +1 remainder row).
  {
    const plan = gravityRepackAfterDeparture(notes, siblings.filter((s) => s.id !== "notes"));
    const byId = Object.fromEntries(plan.map((m) => [m.id, m]));
    assert(plan.length === 2, `gravity: departing the bottom now touches both remaining members, not just one (got ${plan.length})`);
    assert(
      byId["gratitude"]?.rowStart === 2 && byId["gratitude"]?.rowSpan === 12,
      `gravity: gratitude stays at row 2 but grows 6 -> 12 (got ${JSON.stringify(byId["gratitude"])})`
    );
    assert(
      byId["reminders"]?.rowStart === 14 && byId["reminders"]?.rowSpan === 16,
      `gravity: reminders closes up to row 14 and grows 9 -> 16, taking the remainder (got ${JSON.stringify(byId["reminders"])})`
    );
  }

  // The locked week-title never appears in a plan, even conceptually
  // adjacent to the departure point (gratitude sits directly below it).
  {
    const plan = gravityRepackAfterDeparture(gratitude, siblings.filter((s) => s.id !== "gratitude"));
    assert(!plan.some((m) => m.id === "week-title"), "gravity: a locked sibling never appears in the repack plan");
  }

  // Exactly one remaining sibling — reduces to the original "sole
  // survivor absorbs the whole departing rowSpan" behavior (base =
  // departing.rowSpan / 1, remainder = departing.rowSpan % 1 = 0
  // always, so there's never anyone else to split with).
  {
    const twoStack = [gratitude, reminders];
    const plan = gravityRepackAfterDeparture(gratitude, twoStack.filter((s) => s.id !== "gratitude"));
    assert(
      plan.length === 1 && plan[0]?.id === "reminders" && plan[0]?.rowStart === 2 && plan[0]?.rowSpan === 15,
      `gravity: with only one remaining sibling, it alone absorbs the full departing rowSpan (got ${JSON.stringify(plan)})`
    );
  }

  // No siblings share the departing member's own column at all — empty
  // plan, no crash (this is the ordinary case for a page whose sidebar
  // only ever held the one module being dragged out).
  {
    const lone = { id: "lone", columnStart: 0, rowStart: 5, columnSpan: 1, rowSpan: 4 };
    assert(gravityRepackAfterDeparture(lone, []).length === 0, "gravity: no same-column siblings means an empty plan");
  }

  // Sibling array order doesn't matter — the function sorts by rowStart
  // internally, not input position.
  {
    const plan = gravityRepackAfterDeparture(gratitude, [notes, reminders]);
    const byId = Object.fromEntries(plan.map((m) => [m.id, m]));
    assert(
      byId["reminders"]?.rowStart === 2 &&
        byId["reminders"]?.rowSpan === 12 &&
        byId["notes"]?.rowStart === 14 &&
        byId["notes"]?.rowSpan === 16,
      `gravity: result is independent of sibling array order (got ${JSON.stringify(byId)})`
    );
  }
}

// --- pixelsToContainingCell ---
// Containment (floor) vs pixelsToGridCell's nearest (round). The whole
// point is that a point anywhere inside a cell reports that cell, where
// "nearest" flips at the midpoint — see the function's own comment for
// the sidebar-hit-testing bug that motivated it.
{
  const page = { widthPx: 2175, heightPx: 3075, gridColumns: 4, gridRows: 30, boxInsetPx: 6, marginPx: 75 };
  const cell = gridCellToPixels(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 });
  const colPitch = gridCellToPixels(page, { columnStart: 1, rowStart: 0, columnSpan: 1, rowSpan: 1 }).x - cell.x;

  // Just inside column 0's right-hand edge: contained by 0, but NEAREST
  // to gridline 1 — exactly the case that made the sidebar feel like it
  // only occupied its right half.
  const nearRightEdge = { x: page.marginPx + colPitch * 0.9, y: page.marginPx + 5 };
  assert(
    pixelsToContainingCell(page, nearRightEdge).columnStart === 0,
    "containing: a point inside column 0 reports column 0, however close to its far edge"
  );
  assert(
    pixelsToGridCell(page, nearRightEdge).columnStart === 1,
    "containing: pixelsToGridCell still rounds that same point to the nearer gridline (1) — the two differ by design"
  );

  // Dead centre of column 0 — both agree.
  const centre = { x: page.marginPx + colPitch * 0.5, y: page.marginPx + 5 };
  assert(pixelsToContainingCell(page, centre).columnStart === 0, "containing: centre of column 0 is column 0");

  // Clamped at both ends rather than running off the grid.
  assert(pixelsToContainingCell(page, { x: -9999, y: -9999 }).columnStart === 0, "containing: clamps below 0");
  assert(
    pixelsToContainingCell(page, { x: 99999, y: 99999 }).columnStart === page.gridColumns - 1,
    "containing: clamps to the last column"
  );
  assert(
    pixelsToContainingCell(page, { x: 99999, y: 99999 }).rowStart === page.gridRows - 1,
    "containing: clamps to the last row"
  );
}

// --- takeRowsFairly --------------------------------------------------------
// Round-robin, not bottom-first: making room for a taller hourly grid is
// not aimed at any one module, so they give up rows evenly.
{
  const r = takeRowsFairly([10, 10, 10], [2, 2, 2], 3);
  assert(
    r.spans.join(",") === "9,9,9" && r.unmet === 0,
    `three rows come one from each, not three from one (got ${r.spans.join(",")})`
  );
}
{
  const r = takeRowsFairly([5, 3], [2, 2], 4);
  assert(r.spans.join(",") === "2,2" && r.unmet === 0, `both reach their floors exactly (got ${r.spans.join(",")})`);
}
{
  const r = takeRowsFairly([4, 3], [2, 2], 10);
  assert(r.spans.join(",") === "2,2" && r.unmet === 7, `what cannot be found is reported (got unmet ${r.unmet})`);
}
{
  const r = takeRowsFairly([6], [6], 2);
  assert(r.spans.join(",") === "6" && r.unmet === 2, "a stack already at its floor gives nothing");
}
{
  const r = takeRowsFairly([9, 4], [2, 2], 5);
  assert(r.spans.join(",") === "6,2" && r.unmet === 0, `the smaller one stops at its floor (got ${r.spans.join(",")})`);
}
console.log("All takeRowsFairly checks passed.");

// --- followerRowsAfterGrowth -----------------------------------------------
// The rule that lived twice and disagreed: shift into free space, then give
// up height once there is none left.
{
  const rows = followerRowsAfterGrowth([{ rowSpan: 15, minRowSpan: 3 }], 5, 0, 21);
  assert(
    rows[0].rowStart === 26 && rows[0].rowSpan === 10 && rows[0].rowStart + rows[0].rowSpan === 36,
    `with no free space it shrinks by the whole delta and stays on the page (got ${JSON.stringify(rows)})`
  );
}
{
  const rows = followerRowsAfterGrowth([{ rowSpan: 15, minRowSpan: 3 }], 5, 5, 21);
  assert(rows[0].rowSpan === 15, "with enough free space below it only moves");
}
{
  const rows = followerRowsAfterGrowth(
    [{ rowSpan: 6, minRowSpan: 2 }, { rowSpan: 6, minRowSpan: 2 }], 5, 0, 10
  );
  assert(
    rows[0].rowSpan === 5 && rows[1].rowSpan === 2 && rows[0].rowStart === 15,
    `shrinking cascades bottom-up: 4 from the last, then 1 from the one above (got ${JSON.stringify(rows)})`
  );
}
{
  const rows = followerRowsAfterGrowth([{ rowSpan: 15, minRowSpan: 3 }], 0, 0, 21);
  assert(rows[0].rowStart === 21 && rows[0].rowSpan === 15, "a zero delta changes nothing");
}
console.log("All followerRowsAfterGrowth checks passed.");
// --- resolveZone -----------------------------------------------------------
// Left page: hourly at columns 6-23, rows 0-19. Sidebar is 0-5.
{
  const hourly = { columnStart: 6, rowStart: 0, columnSpan: 18, rowSpan: 20 };
  const below = resolveZone(hourly, { columnStart: 10, rowStart: 21 }, 0);
  assert(
    !!below && below.isBottomZone && below.columnStart === 6 && below.columnSpan === 18,
    `below the hours, in its columns, is the bottom zone (got ${JSON.stringify(below)})`
  );
  const side = resolveZone(hourly, { columnStart: 2, rowStart: 5 }, 0);
  assert(
    !!side && !side.isBottomZone && side.columnStart === 0 && side.columnSpan === 6,
    `left of the hours is the sidebar, six columns wide (got ${JSON.stringify(side)})`
  );
}
// The row test is the client/server difference, carried as a parameter.
{
  const hourly = { columnStart: 6, rowStart: 0, columnSpan: 18, rowSpan: 20 };
  const strict = resolveZone(hourly, { columnStart: 10, rowStart: 5 }, 0);
  assert(!!strict && !strict.isBottomZone, "with no tolerance, above the hours is NOT the bottom zone");
  const loose = resolveZone(hourly, { columnStart: 10, rowStart: 5 }, Number.POSITIVE_INFINITY);
  assert(!!loose && loose.isBottomZone, "with infinite tolerance it is - the server's column-only behaviour");
}
// Right page: the hourly block spans the full width, so there is no sidebar.
{
  const full = { columnStart: 0, rowStart: 0, columnSpan: 24, rowSpan: 20 };
  assert(resolveZone(full, { columnStart: 3, rowStart: 5 }, 0) === null, "a full-width page has no sidebar to fall back to");
  const below = resolveZone(full, { columnStart: 3, rowStart: 21 }, 0);
  assert(!!below && below.isBottomZone && below.columnSpan === 24, "but it still has a bottom zone");
}
console.log("All resolveZone checks passed.");

// --- minRowSpansForStack ---------------------------------------------------
// Only unlocked siblings sharing the candidate's exact column range give way.
{
  const P: PageGrid = { widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5 };
  const candidate = { columnStart: 0, columnSpan: 6 };
  const others = [
    { id: "sameStack", locked: false, columnStart: 0, columnSpan: 6 },
    { id: "lockedOne", locked: true, columnStart: 0, columnSpan: 6 },
    { id: "otherColumn", locked: false, columnStart: 6, columnSpan: 18 },
    { id: "otherWidth", locked: false, columnStart: 0, columnSpan: 24 },
    { id: "noSlug", locked: false, columnStart: 0, columnSpan: 6 },
  ];
  const slugs: Record<string, string> = { sameStack: "todo-checklist", lockedOne: "todo-checklist",
    otherColumn: "todo-checklist", otherWidth: "todo-checklist" };
  const floors = minRowSpansForStack(P, candidate, others, (id) => slugs[id]);
  const ids = Object.keys(floors).sort();
  assert(ids.join(",") === "sameStack", `only the same-column, same-width, unlocked sibling (got ${ids.join(",")})`);
  assert(floors.sameStack >= 2, "and it gets a real floor");
}
console.log("All minRowSpansForStack checks passed.");

// --- packedTopEdge ---------------------------------------------------------
{
  const cand = { columnStart: 0, columnSpan: 6 };
  const others = [
    { id: "above", columnStart: 0, rowStart: 0, columnSpan: 6, rowSpan: 5 },
    { id: "below", columnStart: 0, rowStart: 20, columnSpan: 6, rowSpan: 5 },
    { id: "otherCol", columnStart: 6, rowStart: 0, columnSpan: 18, rowSpan: 30 },
  ];
  assert(packedTopEdge(others, cand, 12) === 5, "packs to the bottom edge of what is above it");
  assert(packedTopEdge(others, cand, 3) === 0, "nothing above means the top of the zone");
  assert(
    packedTopEdge(others, cand, 12, new Map([["above", { rowStart: 0, rowSpan: 9 }]])) === 9,
    "a sibling that just moved is measured where it moved to, not where it was"
  );
}
console.log("All packedTopEdge checks passed.");

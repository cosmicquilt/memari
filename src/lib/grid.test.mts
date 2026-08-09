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

import {
  gridCellToPixels,
  pixelsToGridCell,
  clampGridPlacement,
  rectsOverlap,
  findNearestFreeCell,
  resolveModulePlacement,
  moduleInstancesToRects,
  packStackFromTop,
  type PageGrid,
  type GridRect,
} from "./grid";

let failures = 0;
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
  gridGapPx: 12,
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All grid.ts checks passed.");
}

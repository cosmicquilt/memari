// Converts a grid-placed ModuleInstance's column/row position into the
// actual pixel geometry needed to render it (on the Polotno canvas) or
// print it (in the PDF export pipeline). The grid itself is never printed
// or rendered as a visible artifact — it's a placement convenience only.

export type PageGrid = {
  widthPx: number;
  heightPx: number;
  gridColumns: number;
  gridRows: number;
  // Visual separation between adjacent module boxes, applied as an inset on
  // the DRAWN box — deliberately NOT part of the pitch.
  //
  // This used to be gridGapPx, and it sat inside the pitch: a module's
  // origin stepped by (cellHeight + gridGapPx) while anything drawn on a
  // regular interval — the dot lattice, the hour rules — steps by the cell.
  // The two drift apart by one gap per row, which is unfixable rather than
  // merely wrong: no choice of gap makes a pitch of (cell + gap) agree with
  // a pitch of cell. It printed as hour rules missing the dots, and showed
  // up in the editor as the stack resize handle sitting one gap below the
  // module it belonged to.
  //
  // Now the allocation grid tiles the usable area exactly — cell to cell,
  // no gaps — and the visible separation comes from insetting the box
  // inside its allocation. The boxes look the same; the coordinate system
  // underneath them is regular. gridCellToAllocation is the lattice,
  // gridCellToPixels is the ink.
  boxInsetPx: number;
  marginPx: number; // inset of the whole grid from the page edge
};

export type GridPlacement = {
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
};

function usableArea(page: PageGrid) {
  return {
    cellWidth: (page.widthPx - page.marginPx * 2) / page.gridColumns,
    cellHeight: (page.heightPx - page.marginPx * 2) / page.gridRows,
  };
}

/**
 * The cells a placement OWNS — the lattice. Allocations tile the usable
 * area exactly: the bottom of row N is the top of row N+1, to the pixel.
 *
 * This is what anything drawn on a regular interval must measure from —
 * hour rules, the dot field, a box's internal ruling — so that interval
 * stays in phase with the grid all the way down the page. It is also the
 * right frame for "which cell is the pointer over".
 */
export function gridCellToAllocation(
  page: PageGrid,
  placement: GridPlacement
): { x: number; y: number; width: number; height: number } {
  const { cellWidth, cellHeight } = usableArea(page);
  return {
    x: page.marginPx + placement.columnStart * cellWidth,
    y: page.marginPx + placement.rowStart * cellHeight,
    width: placement.columnSpan * cellWidth,
    height: placement.rowSpan * cellHeight,
  };
}

/**
 * The box a placement is DRAWN as — its allocation inset on all four
 * sides, which is what separates it from its neighbours.
 *
 * Every existing caller wants this one: it means exactly what it always
 * meant, an inked module box. Only the arithmetic behind it changed.
 */
export function gridCellToPixels(
  page: PageGrid,
  placement: GridPlacement
): { x: number; y: number; width: number; height: number } {
  const allocation = gridCellToAllocation(page, placement);
  const inset = page.boxInsetPx;
  return {
    x: allocation.x + inset,
    y: allocation.y + inset,
    width: allocation.width - inset * 2,
    height: allocation.height - inset * 2,
  };
}

// Inverse: given a pixel position (e.g. where a user dropped something),
// find the nearest grid cell. This is what the editor's snapping logic
// calls on drag/drop.
//
// Ties break DOWNWARD — toward the cell the point is inside — via
// ceil(t - 0.5) rather than Math.round, which breaks them upward.
//
// A cell's own centre is exactly half a cell from both of its gridlines,
// so it is exactly such a tie, and it must resolve to the cell it is the
// centre OF rather than the neighbour. That case was already covered by a
// test, and it used to pass by accident: with the gap inside the pitch a
// centre landed at 0.4989 of a cell, not 0.5, so Math.round happened to
// give the right answer. Taking the gap out made the lattice regular and
// turned that near-miss into a real tie, which is how a latent ambiguity
// became 24 failures in one run.
function roundHalfDown(value: number): number {
  return Math.ceil(value - 0.5);
}

export function pixelsToGridCell(
  page: PageGrid,
  pixel: { x: number; y: number }
): { columnStart: number; rowStart: number } {
  const { cellWidth, cellHeight } = usableArea(page);

  const columnStart = Math.min(
    page.gridColumns - 1,
    Math.max(0, roundHalfDown((pixel.x - page.marginPx) / cellWidth))
  );
  const rowStart = Math.min(
    page.gridRows - 1,
    Math.max(0, roundHalfDown((pixel.y - page.marginPx) / cellHeight))
  );

  return { columnStart, rowStart };
}

// Which cell CONTAINS a point — as opposed to pixelsToGridCell above,
// which returns the NEAREST cell.
//
// The two answer genuinely different questions and both are needed.
// Nearest (round) is right for snapping: a dragged box's corner should
// settle onto whichever gridline it's closest to. Containment (floor) is
// right for hit testing: "is the pointer over the sidebar" should become
// true the moment the pointer crosses into the sidebar column.
//
// Using nearest for hit testing puts the effective boundary at the
// column's MIDPOINT, so only the right half of a one-column-wide sidebar
// registers as the sidebar. Reported directly: "it only went back when
// my cursor reached the center of the side column." Half a column is
// invisible to the user and it makes a narrow zone feel unreachable.
export function pixelsToContainingCell(
  page: PageGrid,
  pixel: { x: number; y: number }
): { columnStart: number; rowStart: number } {
  const { cellWidth, cellHeight } = usableArea(page);
  const columnStart = Math.min(
    page.gridColumns - 1,
    Math.max(0, Math.floor((pixel.x - page.marginPx) / cellWidth))
  );
  const rowStart = Math.min(
    page.gridRows - 1,
    Math.max(0, Math.floor((pixel.y - page.marginPx) / cellHeight))
  );
  return { columnStart, rowStart };
}

// Inverse of gridCellToPixels for a fixed-width, row-only conversion:
// given a required content height (px, single column), the number of
// grid rows needed to contain it. Extracted from actions.ts's
// getMinRowSpanForSlug, which used to inline this exact computation —
// that function still owns clamping the result to its own per-slug
// minimum floor, this just does the raw px-to-rows math so a second
// caller (updateHourlySettings, computing hourly-grid-core's own
// required rowSpan from its real content height) doesn't have to
// duplicate it. rowPitchPx is measured as the difference between a 1-row
// and a 2-row box rather than read off cellHeight, so it keeps telling the
// truth whatever gridCellToPixels does internally — it survived the gap
// coming out of the pitch without an edit, which is the point.
export function pixelHeightToRowSpan(page: PageGrid, heightPx: number): number {
  const oneRow = gridCellToPixels(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 });
  const twoRows = gridCellToPixels(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2 });
  const rowPitchPx = twoRows.height - oneRow.height;
  if (heightPx <= oneRow.height) return 1;
  // A tiny epsilon nudge before ceil-ing: cellHeight/rowPitchPx both come
  // from a division (usableHeight/gridRows) that rarely terminates
  // exactly, so a height that's genuinely meant to land on a row
  // boundary (e.g. computed via this same gridCellToPixels formula
  // elsewhere, as a real round-trip does) can come out a few ULPs past
  // it — without this, that over-counts by a whole extra row. Caught by
  // grid.test.mts's own round-trip check before it could reach a real
  // caller.
  return Math.ceil((heightPx - oneRow.height) / rowPitchPx - 1e-9) + 1;
}

/**
 * How wide the sidebar zone is: everything to the left of the hourly grid.
 *
 * This was the literal 1 in at least three places, which was correct only
 * because a page used to be 4 columns and the sidebar was one of them. On
 * the 24-column dot lattice it is 6, and each of those literals became a
 * separate bug - a palette drop committed a module one dot wide, the
 * editor offered a one-dot add zone down a full sidebar, and zone
 * resolution disagreed with both. One definition now, asked by the editor
 * and by the server action that commits the drop.
 *
 * Falls back to a quarter of the page's columns when there is no hourly
 * grid to measure against, which is the same "one sidebar plus seven days"
 * proportion the whole layout is built on.
 */
/**
 * The width of one day unit, in columns. A spread is one sidebar plus
 * seven weekdays, so each page divides into four equal units - that is the
 * proportion the whole layout is built on, and it is what "one column"
 * used to mean back when a page was four columns wide.
 */
export function dayUnitColumns(page: PageGrid): number {
  return Math.max(1, Math.round(page.gridColumns / 4));
}

/**
 * How many day columns a module of this width draws.
 *
 * This was columnSpan itself in four separate places, which was the same
 * number while a day was one column. On the 24-column lattice a day is
 * six, so a to-do checklist spanning the 18-column bottom zone drew
 * EIGHTEEN day segments instead of three - reported as the live resize
 * being "full of smaller squares".
 */
export function columnSpanToDayCount(page: PageGrid, columnSpan: number): number {
  return Math.max(1, Math.round(columnSpan / dayUnitColumns(page)));
}

export function sidebarColumnSpan(
  page: PageGrid,
  hourlyColumnStart: number | null | undefined
): number {
  if (hourlyColumnStart != null && hourlyColumnStart > 0) return hourlyColumnStart;
  return dayUnitColumns(page);
}

/**
 * Takes `needed` rows out of a stack, one at a time from each member in
 * turn, until the need is met or every member is at its floor.
 *
 * Round-robin rather than draining the bottom module first, which is what
 * the resize cascade does. The two are different situations: a resize is
 * the user dragging one specific edge, so the module nearest that edge
 * should give way. Making room for a taller hourly grid is not aimed at
 * anyone in particular, and taking it all from the bottom module would
 * flatten one box to its minimum while the one above it kept full height.
 * Asked for directly - "distribute it cell from each below until all of
 * minimum size."
 *
 * Returns the new spans and whatever could NOT be found, so the caller can
 * tell "it fits after shrinking" from "it does not fit at all" and say so.
 */
export function takeRowsFairly(
  spans: number[],
  floors: number[],
  needed: number
): { spans: number[]; unmet: number } {
  const next = [...spans];
  let remaining = Math.max(0, needed);
  let progressed = true;
  while (remaining > 0 && progressed) {
    progressed = false;
    for (let i = 0; i < next.length && remaining > 0; i++) {
      if (next[i] <= floors[i]) continue;
      next[i] -= 1;
      remaining -= 1;
      progressed = true;
    }
  }
  return { spans: next, unmet: remaining };
}

/**
 * Where a stack of "followers" ends up when the block above them grows.
 *
 * They shift down by the growth, and once there is no free space left
 * below to shift into, they give up height instead - cascading from the
 * BOTTOM one upward, each to its own floor.
 *
 * This existed twice: once in resizeHourlyGridCore (actions.ts, on commit)
 * and once in displayPlacements (NativePlannerEditor, in the live
 * preview). They disagreed - the preview only ever shifted - so a to-do
 * slid off the bottom of the page while dragging and snapped back into
 * place on release. That is the third bug in one evening from a rule
 * written on the server and approximated in the preview, which is why
 * this is the first thing pulled into one place.
 *
 * Pure, so both callers get the same answer by construction rather than
 * by two people remembering the same rule.
 */
export function followerRowsAfterGrowth(
  members: Array<{ rowSpan: number; minRowSpan: number }>,
  deltaRows: number,
  freeBelowRows: number,
  firstRowStart: number
): Array<{ rowStart: number; rowSpan: number }> {
  const spans = members.map((m) => m.rowSpan);
  let needed = Math.max(0, deltaRows - Math.max(0, freeBelowRows));
  for (let i = spans.length - 1; i >= 0 && needed > 0; i--) {
    const give = Math.min(spans[i] - members[i].minRowSpan, needed);
    if (give > 0) {
      spans[i] -= give;
      needed -= give;
    }
  }
  let cursor = firstRowStart + deltaRows;
  return spans.map((rowSpan) => {
    const row = { rowStart: cursor, rowSpan };
    cursor += rowSpan;
    return row;
  });
}

// Keeps a placement fully on the grid — used after both drag-to-reposition
// snapping and palette drop-to-add, since either can land a module's
// nearest cell close enough to an edge that columnStart/rowStart + its
// span would run off the page.
export function clampGridPlacement(
  page: PageGrid,
  placement: { columnStart: number; rowStart: number; columnSpan: number; rowSpan: number }
): { columnStart: number; rowStart: number } {
  return {
    columnStart: Math.max(
      0,
      Math.min(placement.columnStart, page.gridColumns - placement.columnSpan)
    ),
    rowStart: Math.max(
      0,
      Math.min(placement.rowStart, page.gridRows - placement.rowSpan)
    ),
  };
}

export type GridRect = GridPlacement;

export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return (
    a.columnStart < b.columnStart + b.columnSpan &&
    a.columnStart + a.columnSpan > b.columnStart &&
    a.rowStart < b.rowStart + b.rowSpan &&
    a.rowStart + a.rowSpan > b.rowStart
  );
}

// Maps DB rows shaped like a grid-placed ModuleInstance (id + nullable
// columnStart/rowStart + span) down to plain GridRects for collision
// checks — the same shape addPaletteModuleAt and updateModuleSize in
// actions.ts both need when building their "what's already occupied"
// list. Rows without a grid position (freeform elements, or an id to
// exclude — e.g. the instance being resized, which shouldn't collide
// with itself) are dropped.
export function moduleInstancesToRects<
  T extends { id: string; columnStart: number | null; rowStart: number | null; columnSpan: number; rowSpan: number }
>(instances: T[], excludeId?: string): GridRect[] {
  return instances
    .filter((mi) => mi.id !== excludeId && mi.columnStart !== null && mi.rowStart !== null)
    .map((mi) => ({
      columnStart: mi.columnStart as number,
      rowStart: mi.rowStart as number,
      columnSpan: mi.columnSpan,
      rowSpan: mi.rowSpan,
    }));
}

// Relocates a placement that collides with something to the nearest
// non-overlapping cell — used when the collision isn't a simple
// same-column stack reorder (see resolveModulePlacement below), e.g. a
// palette drop landing on a locked block or a differently-sized module.
// Searches the candidate's own column first (expanding up/down from the
// candidate row), then falls back to scanning the whole grid.
export function findNearestFreeCell(
  page: PageGrid,
  candidate: GridRect,
  occupied: GridRect[]
): { columnStart: number; rowStart: number } {
  const fits = (columnStart: number, rowStart: number) => {
    if (columnStart < 0 || rowStart < 0) return false;
    if (columnStart + candidate.columnSpan > page.gridColumns) return false;
    if (rowStart + candidate.rowSpan > page.gridRows) return false;
    const rect: GridRect = { columnStart, rowStart, columnSpan: candidate.columnSpan, rowSpan: candidate.rowSpan };
    return !occupied.some((o) => rectsOverlap(rect, o));
  };

  const clamped = clampGridPlacement(page, candidate);

  for (let offset = 0; offset <= page.gridRows; offset++) {
    const rows = offset === 0 ? [clamped.rowStart] : [clamped.rowStart + offset, clamped.rowStart - offset];
    for (const rowStart of rows) {
      if (fits(clamped.columnStart, rowStart)) return { columnStart: clamped.columnStart, rowStart };
    }
  }

  for (let columnStart = 0; columnStart <= page.gridColumns - candidate.columnSpan; columnStart++) {
    for (let rowStart = 0; rowStart <= page.gridRows - candidate.rowSpan; rowStart++) {
      if (fits(columnStart, rowStart)) return { columnStart, rowStart };
    }
  }

  // Grid is genuinely full for this span — nothing better to do than
  // return the clamped (still possibly overlapping) candidate.
  return clamped;
}

// Resolves where a dragged/dropped module should actually land given
// what else is already on the page. Plain relocation (findNearestFreeCell)
// is the right answer when the collision involves a locked core block or
// a differently-shaped module — there's nothing sensible to displace. But
// when every colliding module is an unlocked sibling stacked in the same
// column with the same width, the collision is really a reorder: this
// treats the column as a list, figures out where the dragged module was
// dropped relative to its siblings, and returns a fresh gap-free stacking
// for all of them — the siblings move to make room instead of the
// dragged module bouncing off somewhere else.
export function resolveModulePlacement(
  page: PageGrid,
  rawCandidate: GridRect,
  others: Array<GridRect & { id: string; locked: boolean }>,
  // The dragged module's OWN rowStart before this drag started (not its
  // current dropped position — that's rawCandidate). Only used to break
  // an exact rowStart tie against a stack sibling by drag direction —
  // see the comment at that tie-break below for why a fixed rule can't
  // get both directions right. Omit it (a brand-new palette drop has no
  // "before" to compare against) to fall back to the neutral default.
  draggedOriginalRowStart?: number,
  // Per-sibling minimum rowSpan floor, keyed by id — opts into a second
  // fallback tier (below the normal "fits at current sizes" reorder,
  // above the final findNearestFreeCell relocation) that shrinks
  // existing siblings toward their own floors to make room for the
  // candidate, instead of giving up on the reorder immediately. Omitted
  // (every existing caller) preserves the exact previous behavior byte
  // for byte — a sibling missing from the map is treated as unshrinkable
  // (its own current rowSpan is its floor), not an error. The dragged
  // candidate itself is never shrunk here — it's expected to already be
  // at its own minimum by the time it reaches this function (see
  // NativePlannerEditor.tsx's resolveDrag, the only caller that passes
  // this).
  minRowSpanById?: Record<string, number>
): {
  placement: { columnStart: number; rowStart: number };
  reflow: Array<{ id: string; rowStart: number; rowSpan?: number }>;
} {
  // Clamp to the page here rather than trusting every caller to have
  // done it already — a candidate that runs off the page on its own
  // (nothing to collide with, so the overlap check below never even
  // triggers) still needs to land somewhere valid.
  const candidate: GridRect = { ...rawCandidate, ...clampGridPlacement(page, rawCandidate) };

  const overlapping = others.filter((o) => rectsOverlap(candidate, o));
  if (overlapping.length === 0) {
    return { placement: { columnStart: candidate.columnStart, rowStart: candidate.rowStart }, reflow: [] };
  }

  // stackSiblings/siblingsTop/siblingsBottom are computed up front (not
  // just inside the reorder branch below) because the isSameColumnStack
  // gate itself now needs siblingsTop/siblingsBottom to correctly
  // classify a locked item in the overlap set — see that gate's own
  // comment.
  const stackSiblings = others.filter(
    (o) => !o.locked && o.columnStart === candidate.columnStart && o.columnSpan === candidate.columnSpan
  );
  const siblingsTop = stackSiblings.length > 0 ? Math.min(...stackSiblings.map((s) => s.rowStart)) : candidate.rowStart;
  const siblingsBottom =
    stackSiblings.length > 0 ? Math.max(...stackSiblings.map((s) => s.rowStart + s.rowSpan)) : candidate.rowStart + candidate.rowSpan;
  const columnsOverlap = (o: GridRect) =>
    o.columnStart < candidate.columnStart + candidate.columnSpan &&
    o.columnStart + o.columnSpan > candidate.columnStart;

  // A locked item overlapping the drop point doesn't automatically
  // disqualify a reorder — dragging a module to the very top or bottom
  // of its stack naturally overlaps whatever locked block bounds that
  // end (week-title, a month's own title block, ...), and that's the
  // ordinary case this needs to handle, not an exception to it.
  // Requiring zero locked overlap here used to reject the reorder branch
  // entirely for any drag that reached far enough to touch its own
  // boundary, falling back to findNearestFreeCell — which doesn't
  // reflow siblings at all, so the drag looked like it silently did
  // nothing.
  //
  // But tolerating *any* locked overlap is too permissive — dropping a
  // sidebar box onto an unrelated, differently-shaped locked block (the
  // full-width hourly grid, say) is a real "relocate, don't reorder"
  // case, not a stack boundary. The distinction: a locked item only
  // counts as a stack *boundary* (tolerated) if it sits entirely above
  // or entirely below where this stack's siblings actually are right
  // now — the same "entirely above/below, not interspersed" test
  // topBound/bottomBound below already apply, just checked here too so
  // it gates entry into the reorder branch in the first place.
  const isBoundingLocked = (o: GridRect & { locked: boolean }) =>
    o.locked && columnsOverlap(o) && (o.rowStart + o.rowSpan <= siblingsTop || o.rowStart >= siblingsBottom);
  const isSameColumnStack = overlapping.every(
    (o) => (!o.locked && o.columnStart === candidate.columnStart && o.columnSpan === candidate.columnSpan) || isBoundingLocked(o)
  );
  if (isSameColumnStack) {
    const rawStackTop = Math.min(candidate.rowStart, ...stackSiblings.map((s) => s.rowStart));
    const totalHeight = stackSiblings.reduce((sum, s) => sum + s.rowSpan, candidate.rowSpan);

    // The reflowed stack can't run into a locked block above or below it
    // (e.g. week-title sitting above the sidebar boxes), or off the page
    // — find the tightest such bounds in this column, using column-range
    // overlap rather than an exact span match so a locked block wider
    // than the stack (like a full-width hourly-grid-core) still counts.
    //
    // Classified against the *siblings'* own top/bottom
    // (siblingsTop/siblingsBottom, computed above), not a candidate-
    // inclusive top/bottom — folding in the dragged candidate's own
    // (possibly overshooting) drop position would be wrong here, since a
    // drag aimed at "the very top" routinely drops past the bounding
    // locked block's own edge on purpose (that's how a user says "put it
    // above everything else"). Using that raw, candidate-inclusive top
    // to decide whether the same locked block still counts as bounding
    // the stack from above made it stop counting exactly when a drag
    // reached far enough to need it counted — the stack would then
    // compute a start row that overlapped the locked block instead of
    // clamping against it. The siblings' own positions don't have that
    // problem; they're stable regardless of where the drag landed.
    const boundingLocked = others.filter((o) => o.locked && columnsOverlap(o));
    const topBound = Math.max(
      0,
      ...boundingLocked
        .filter((o) => o.rowStart + o.rowSpan <= siblingsTop)
        .map((o) => o.rowStart + o.rowSpan)
    );
    const bottomBound = Math.min(
      page.gridRows,
      ...boundingLocked.filter((o) => o.rowStart >= siblingsBottom).map((o) => o.rowStart)
    );

    const DRAGGED = "__dragged__";
    // On an exact rowStart tie between the dragged item and a
    // sibling, which one sorts first has to depend on which direction
    // the drag actually moved, not a fixed rule either way — verified
    // by hand for both directions before writing this:
    //
    // Dragging item B UP onto item A's exact rowStart (A was already
    // directly above B): B needs to sort *before* A, or packing B
    // right after A lands B back at exactly its own pre-drag row (A's
    // span exactly bridges the gap, since they were adjacent) and the
    // whole reflow computes to a no-op.
    //
    // Dragging item B DOWN onto item C's exact rowStart (C was already
    // directly below B): B needs to sort *after* C this time, for the
    // exact same reason in the other direction — sorting B first would
    // pack it right after whatever was before B's own old slot,
    // landing it back at its own pre-drag row again.
    //
    // So: dragged-first when candidate.rowStart is at or below where
    // this item started (moved up or unchanged), dragged-last when it
    // moved down. draggedOriginalRowStart is undefined for a
    // brand-new palette drop (nothing to compare against) — falls
    // back to dragged-last, the long-standing default for "insert new
    // content," which doesn't have this adjacent-pair failure mode
    // since a new item was never "originally" anywhere in the stack.
    const draggedFirstOnTie =
      draggedOriginalRowStart !== undefined && candidate.rowStart <= draggedOriginalRowStart;

    // Sorted by where the dragged item's own CENTER lands, not its
    // raw candidate.rowStart — using the raw edge means a swap only
    // ever triggers once candidate.rowStart reaches all the way to
    // the target sibling's own rowStart, i.e. the drag has to cover
    // the dragged item's *entire own span* before anything happens.
    // For two adjacent items of comparable size that's most of the
    // drag distance doing nothing: dropping anywhere short of the
    // target's exact start silently snapped back to the dragged
    // item's own pre-drag row (same underlying shape as the exact-tie
    // bug above, just for every row short of the tie instead of only
    // the tie itself) — caught live dragging the second-to-last box
    // in a 4-item stack onto the last one, where "most of the drag"
    // turned out to still be short of that exact row.
    //
    // An earlier version compared the
    // dragged item's center against whether it had entered a sibling's
    // row RANGE, and snapped the sort key to that sibling's rowStart —
    // but entering a sibling's range means crossing its near EDGE, which
    // is a 0% crossing of that sibling, not the 50% one this was meant
    // to be. The error is exactly half the sibling's height, and its
    // perceived direction flips with the relative sizes, which is what
    // it felt like in the hand: dragging DOWN, the swap fires when the
    // center reaches the lower sibling's top edge, so a short item
    // passing a tall one swaps well before its bottom reaches that
    // sibling's midpoint; dragging UP, it fires at the upper sibling's
    // bottom edge, so a tall item passing a short one swaps well after.
    // Reported as "jumps too soon going down, takes too long going up",
    // which is one bug, not two. The left side column is spans 6, 9 and
    // 13, so the mismatch is up to 3.5 rows.
    //
    // The rule instead: the dragged item's LEADING edge against the
    // sibling's CENTER. Going down the leading edge is the bottom, so
    // the swap fires as the bottom passes the lower sibling's midpoint;
    // going up it's the top, so it fires as the top passes the upper
    // sibling's midpoint. That is the same threshold Sortable.js uses,
    // and it is the one that matches what the gesture looks like from
    // either direction — you push a neighbour out of the way when you
    // have covered half of it, whichever way you are travelling and
    // whatever the two heights are.
    //
    // Note the travel required is deliberately NOT equal in the two
    // directions: dragging A down past B takes half of B's height,
    // dragging B up past A takes half of A's. That asymmetry is
    // correct — each is "move until your leading edge reaches the
    // other's midpoint". The bug was an asymmetry in the RULE, not in
    // the distances the rule produces.
    //
    // Only the sort key changes — placement math and the topBound/
    // bottomBound clamping still use the real candidate.
    const movingDown = !draggedFirstOnTie;
    let draggedSortKey = movingDown
      ? candidate.rowStart + candidate.rowSpan
      : candidate.rowStart;

    // The center-crossing rule above breaks down for a dragged item
    // large enough that clampGridPlacement caps its candidate before
    // its center can ever reach a sibling positioned at the far end of
    // the stack — confirmed live dragging a 17-row "Notes" box toward
    // a 7-row "Reminders" box past it: even fully bottomed-out,
    // Notes' own size puts its center at row 21.5, short of
    // Reminders' own midpoint at 26.5, so `straddled` never matches
    // and sortRowStart (falling back to candidate.rowStart, itself
    // capped well short of Reminders for the same size reason) always
    // sorts before Reminders — the reorder below repacks everything
    // right back to Notes' original slot no matter how far down it's
    // dragged, reading as "the drag doesn't work." No position derived
    // from the dragged item's own clamped geometry (center, top edge,
    // or raw rowStart) can fix this in general — a large enough item's
    // own span mathematically prevents it from ever numerically
    // sorting past a sibling nearer the boundary. But being clamped
    // at the stack's own top/bottom bound is itself an unambiguous
    // "put it all the way at that end" signal, independent of size —
    // sort it past (or before) every sibling outright instead of
    // relying on where it itself is able to reach.
    if (candidate.rowStart + candidate.rowSpan >= bottomBound) draggedSortKey = Infinity;
    else if (candidate.rowStart <= topBound) draggedSortKey = -Infinity;

    // Computed once here (not inside either fit-check branch below) —
    // both the "fits at current sizes" tier and the "shrink to fit"
    // tier need the exact same merged sort order; the shrink tier's own
    // bottom-up cascade specifically depends on this being the *final*
    // post-insertion order, not the original pre-insertion sibling
    // order (see that tier's own comment).
    // rowStart stays each sibling's REAL row — the packing loops below
    // read it to tell whether an item actually moved, and would emit
    // no-op reflow entries for everyone if it carried a sort key
    // instead. The dragged entry's own rowStart is never read.
    const ordered = [
      ...stackSiblings.map((s) => ({
        id: s.id,
        rowStart: s.rowStart,
        rowSpan: s.rowSpan,
        sortKey: s.rowStart + s.rowSpan / 2,
      })),
      {
        id: DRAGGED,
        rowStart: candidate.rowStart,
        rowSpan: candidate.rowSpan,
        sortKey: draggedSortKey,
      },
    ].sort(
      (a, b) =>
        a.sortKey - b.sortKey ||
        (a.id === DRAGGED ? (draggedFirstOnTie ? -1 : 1) : b.id === DRAGGED ? (draggedFirstOnTie ? 1 : -1) : 0)
    );

    if (totalHeight <= bottomBound - topBound) {
      const stackTop = Math.max(topBound, Math.min(rawStackTop, bottomBound - totalHeight));
      let cursor = stackTop;
      let placement = { columnStart: candidate.columnStart, rowStart: candidate.rowStart };
      const reflow: Array<{ id: string; rowStart: number; rowSpan?: number }> = [];
      for (const item of ordered) {
        if (item.id === DRAGGED) {
          placement = { columnStart: candidate.columnStart, rowStart: cursor };
        } else if (item.rowStart !== cursor) {
          reflow.push({ id: item.id, rowStart: cursor });
        }
        cursor += item.rowSpan;
      }
      return { placement, reflow };
    }

    // Doesn't fit at everyone's current size. Before giving up on the
    // reorder (falling through to findNearestFreeCell, relocating the
    // dragged module somewhere else entirely), try shrinking existing
    // siblings toward their own floors to free up enough room — only if
    // the caller opted in by passing minRowSpanById. Bottom-up through
    // the *same merged* `ordered` list computed above (siblings + the
    // dragged candidate spliced into its resolved position), not the
    // original pre-insertion sibling order: the candidate may have
    // landed mid-stack, so "the last member" has to mean last in the
    // new order, or this could shrink a sibling that isn't even
    // adjacent to where the room is actually needed. Mirrors
    // cascadeStackSpans' own shrink direction (NativePlannerEditor.tsx)
    // but is necessarily its own implementation here — that one is
    // client-only and walks a fixed physical array, not a freshly
    // computed merge order. The dragged candidate itself is never
    // shrunk (see minRowSpanById's own comment on why).
    if (minRowSpanById) {
      const availableHeight = bottomBound - topBound;
      const spans = ordered.map((item) => item.rowSpan);
      let deficit = totalHeight - availableHeight;
      for (let i = ordered.length - 1; i >= 0 && deficit > 0; i--) {
        if (ordered[i].id === DRAGGED) continue;
        const floor = minRowSpanById[ordered[i].id] ?? ordered[i].rowSpan;
        const shrinkable = spans[i] - floor;
        const take = Math.min(shrinkable, deficit);
        spans[i] -= take;
        deficit -= take;
      }
      if (deficit <= 0) {
        // Fits once shrunk — repack starting at topBound, the same way
        // a resize-triggered shrink already consumes its own freed
        // space rather than leaving slack (unlike the fits-at-current-
        // sizes branch above, which can leave the stack wherever
        // rawStackTop already had it — there's no equivalent "already
        // in a good spot" case here, since sizes are changing).
        let cursor = topBound;
        let placement = { columnStart: candidate.columnStart, rowStart: candidate.rowStart };
        const reflow: Array<{ id: string; rowStart: number; rowSpan?: number }> = [];
        ordered.forEach((item, i) => {
          if (item.id === DRAGGED) {
            placement = { columnStart: candidate.columnStart, rowStart: cursor };
          } else if (item.rowStart !== cursor || spans[i] !== item.rowSpan) {
            reflow.push({
              id: item.id,
              rowStart: cursor,
              ...(spans[i] !== item.rowSpan ? { rowSpan: spans[i] } : {}),
            });
          }
          cursor += spans[i];
        });
        return { placement, reflow };
      }
      // else: doesn't fit even with every sibling at its own floor —
      // fall through below, same as the no-minRowSpanById case.
    }
    // Doesn't fit even with a full reorder (or a shrink, if
    // minRowSpanById was given and it still wasn't enough) — e.g.
    // enough boxes have piled into this column that reordering/
    // shrinking them can't avoid running past a bound. Leave the
    // siblings alone and just relocate the dragged module instead of
    // producing a stack that overflows anyway.
  }

  // Pass the full `others` list, not just what overlapped the original
  // candidate — the search below tries other cells too, and needs to
  // check each of those against everything, not just what happened to
  // conflict with where the drag first landed.
  return { placement: findNearestFreeCell(page, candidate, others), reflow: [] };
}

// Repacks a same-column stack after one of its own members conceptually
// leaves it — shared by a cross-zone drag (the module's own SOURCE zone,
// the one it's leaving, needs to close the gap the same way) and mirrors
// deleteModuleWithGravity's own algorithm (actions.ts, server-only,
// tied to an actual DB delete) closely enough that it's worth a single
// shared implementation here rather than a third hand-copy: walk up and
// down from the departing member's own position to collect the full
// contiguous unlocked same-column stack it belonged to, then repack
// everyone else from the stack's own top anchor. Members above the
// departure point land back exactly where they already were; members
// below shift up to close the gap it leaves.
//
// The stack's own BOTTOM-MOST remaining member also grows by exactly
// the departing member's own rowSpan, so the stack's total footprint
// stays exactly what it was before — matching how every other stack in
// this app already only ever grows from the bottom (StackResizeHandle/
// cascadeStackSpans' own identical convention). A first version of this
// only shifted, never grew, leaving a permanent gap at the zone's own
// bottom edge equal to the departing member's own height — reported
// directly: "side module still dont increase in size to fill gap...
// there shouldn't be a gap at the bottom." Verified by hand for a top,
// middle, and bottom departure against the real sidebar fixture
// (week-title + Gratitude(6)/Reminders(9)/Notes(13), the same one this
// file's own tests already use) before writing this — all three land
// on the exact same total footprint (28 rows) the stack already had.
//
// Only the bottom-most member's rowSpan ever changes — the departing
// member's own rowSpan is only needed to know how much to grow it by.
// Return shape matches resolveModulePlacement's own reflow shape so a
// caller merging the two arrays (see resolveDrag) gets one
// consistently-typed list rather than a union TypeScript can't cleanly
// narrow.
// Which module types can move between the side zone and a bottom zone at
// all. ONE definition, deliberately: this used to be two hand-written
// predicates (canFillBottomZone / canSideZone) duplicated across
// NativePlannerEditor.tsx and actions.ts — four copies — and they
// disagreed about labeled-box. It was listed as bottom-capable but NOT
// side-capable, so a labeled-box could be dragged from the sidebar into
// the bottom zone and then could never come back: resolveZoneForColumn
// returned null for the side zone, crossingZones never went true, and the
// drag silently did nothing. Reported directly: "dragged textbox from
// side to bottom left then tried to drag back to side and it wouldn't go
// back even when dragged."
//
// labeled-box belongs in both. Its own palette entry is section "side"
// with defaultColumnSpan 1 — the sidebar is its home shape — and the
// feature's own design called for it to "shrink back to columnSpan: 1
// when dragged back to the side zone." The asymmetry was a bug, not a
// policy.
//
// Lives here rather than in either caller because grid.ts is already the
// shared module both the client editor and the "use server" actions
// import from — the same reason the placement algorithms sit here
// instead of being hand-synced copies.
export function canCrossZones(slug: string): boolean {
  return slug === "todo-checklist" || slug === "habit-tracker" || slug === "labeled-box";
}

export function gravityRepackAfterDeparture(
  departing: { id: string; columnStart: number; rowStart: number; columnSpan: number; rowSpan: number },
  siblings: Array<{ id: string; locked: boolean; columnStart: number; columnSpan: number; rowStart: number; rowSpan: number }>
): Array<{ id: string; rowStart: number; rowSpan?: number }> {
  const sameColumn = siblings.filter(
    (s) => !s.locked && s.columnStart === departing.columnStart && s.columnSpan === departing.columnSpan
  );
  type Member = { id: string; rowStart: number; rowSpan: number };
  const stack: Member[] = [{ id: departing.id, rowStart: departing.rowStart, rowSpan: departing.rowSpan }];
  let topCursor = departing.rowStart;
  for (;;) {
    const above = sameColumn.find((s) => s.rowStart + s.rowSpan === topCursor);
    if (!above) break;
    stack.unshift({ id: above.id, rowStart: above.rowStart, rowSpan: above.rowSpan });
    topCursor = above.rowStart;
  }
  let bottomCursor = departing.rowStart + departing.rowSpan;
  for (;;) {
    const below = sameColumn.find((s) => s.rowStart === bottomCursor);
    if (!below) break;
    stack.push({ id: below.id, rowStart: below.rowStart, rowSpan: below.rowSpan });
    bottomCursor = below.rowStart + below.rowSpan;
  }

  const remaining = stack.filter((m) => m.id !== departing.id);
  if (remaining.length === 0) return [];

  // Departing member's own rowSpan is split as evenly as possible across
  // EVERY remaining sibling, not dumped entirely on the bottom-most one —
  // requested directly: "distribute gap size between however remaining
  // siblings there are as evenly split as possible." A first version only
  // grew the last member (see this function's own history above); with 2+
  // remaining siblings that read as one box ballooning while its
  // neighbors stayed exactly their old size, not a shared gravity-fill.
  // Remainder (when departing.rowSpan doesn't divide evenly) goes to the
  // LATER members — same "stacks grow from the bottom" convention this
  // function's own siblings/cascadeStackSpans already follow elsewhere,
  // just applied per-extra-row instead of all-at-once. With exactly one
  // remaining sibling this reduces to the original behavior (it alone
  // absorbs the full departing.rowSpan) — verified by hand it can't do
  // otherwise: base = floor(n/1) = n, remainder = n % 1 = 0.
  const share = Math.floor(departing.rowSpan / remaining.length);
  const remainder = departing.rowSpan % remaining.length;
  const growthById = new Map<string, number>(
    remaining.map((m, i) => [m.id, share + (i >= remaining.length - remainder ? 1 : 0)])
  );

  let cursor = stack[0].rowStart;
  const plan: Array<{ id: string; rowStart: number; rowSpan?: number }> = [];
  for (const m of stack) {
    // Skip the departing member entirely — including its own rowSpan's
    // contribution to cursor. Advancing cursor for it too (an earlier,
    // wrong version of this did) reserves its old slot for nobody,
    // which just reproduces everyone else's already-gapless starting
    // positions and computes zero moves — the gap it leaves never
    // actually closes.
    if (m.id === departing.id) continue;
    const growth = growthById.get(m.id) ?? 0;
    const newRowSpan = growth > 0 ? m.rowSpan + growth : undefined;
    if (m.rowStart !== cursor || newRowSpan !== undefined) {
      plan.push({ id: m.id, rowStart: cursor, ...(newRowSpan !== undefined ? { rowSpan: newRowSpan } : {}) });
    }
    cursor += newRowSpan ?? m.rowSpan;
  }
  return plan;
}

// Repacks a column-stack of sibling modules contiguously from `top`,
// preserving their current relative order (by rowStart), closing any gap
// between them — "gravity" toward the top of whatever zone they're in.
// Unlike resolveModulePlacement above (which only reflows a stack when a
// drag provokes a fresh overlap with the dragged candidate), this
// unconditionally removes every existing gap regardless of what caused
// it — needed because a delete (or anything else that isn't itself a
// drag) can leave a hole in the middle of a stack with nothing to
// trigger the drag-reflow path above.
export function packStackFromTop(
  top: number,
  members: Array<{ id: string; rowStart: number; rowSpan: number }>
): Array<{ id: string; rowStart: number }> {
  const sorted = [...members].sort((a, b) => a.rowStart - b.rowStart);
  const moves: Array<{ id: string; rowStart: number }> = [];
  let cursor = top;
  for (const m of sorted) {
    if (m.rowStart !== cursor) moves.push({ id: m.id, rowStart: cursor });
    cursor += m.rowSpan;
  }
  return moves;
}

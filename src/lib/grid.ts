// Converts a grid-placed ModuleInstance's column/row position into the
// actual pixel geometry needed to render it (on the Polotno canvas) or
// print it (in the PDF export pipeline). The grid itself is never printed
// or rendered as a visible artifact — it's a placement convenience only.

export type PageGrid = {
  widthPx: number;
  heightPx: number;
  gridColumns: number;
  gridRows: number;
  gridGapPx: number;
  marginPx: number; // inset of the whole grid from the page edge
};

export type GridPlacement = {
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
};

function usableArea(page: PageGrid) {
  const usableWidth = page.widthPx - page.marginPx * 2;
  const usableHeight = page.heightPx - page.marginPx * 2;
  return {
    cellWidth:
      (usableWidth - page.gridGapPx * (page.gridColumns - 1)) /
      page.gridColumns,
    cellHeight:
      (usableHeight - page.gridGapPx * (page.gridRows - 1)) / page.gridRows,
  };
}

export function gridCellToPixels(
  page: PageGrid,
  placement: GridPlacement
): { x: number; y: number; width: number; height: number } {
  const { cellWidth, cellHeight } = usableArea(page);

  return {
    x: page.marginPx + placement.columnStart * (cellWidth + page.gridGapPx),
    y: page.marginPx + placement.rowStart * (cellHeight + page.gridGapPx),
    width:
      placement.columnSpan * cellWidth +
      (placement.columnSpan - 1) * page.gridGapPx,
    height:
      placement.rowSpan * cellHeight +
      (placement.rowSpan - 1) * page.gridGapPx,
  };
}

// Inverse: given a pixel position (e.g. where a user dropped something),
// find the nearest grid cell. This is what the editor's snapping logic
// will call on drag/drop once that UI is built.
export function pixelsToGridCell(
  page: PageGrid,
  pixel: { x: number; y: number }
): { columnStart: number; rowStart: number } {
  const { cellWidth, cellHeight } = usableArea(page);

  const columnStart = Math.min(
    page.gridColumns - 1,
    Math.max(
      0,
      Math.round((pixel.x - page.marginPx) / (cellWidth + page.gridGapPx))
    )
  );
  const rowStart = Math.min(
    page.gridRows - 1,
    Math.max(
      0,
      Math.round((pixel.y - page.marginPx) / (cellHeight + page.gridGapPx))
    )
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
// duplicate it. rowPitchPx (not cellHeight directly) accounts for the
// per-row gap baked into gridCellToPixels' own height formula — the
// difference between a 1-row and 2-row cell's rendered height isolates
// exactly "one more row, one more gap."
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
    // Using the center instead is the same 50%-crossing threshold
    // every mainstream drag-reorder library (Sortable.js, dnd-kit,
    // ...) uses: once the dragged item's midpoint has crossed into a
    // sibling's own row range, that's treated as an intentional swap
    // with that sibling — verified this doesn't fire on a trivial
    // one-row nudge that doesn't reach a neighbor's midpoint either.
    // Only affects sort order, not placement math or the topBound/
    // bottomBound clamping above, which still use the real candidate.
    const candidateCenter = candidate.rowStart + candidate.rowSpan / 2;
    const straddled = stackSiblings.find(
      (s) => candidateCenter >= s.rowStart && candidateCenter < s.rowStart + s.rowSpan
    );
    let sortRowStart = straddled ? straddled.rowStart : candidate.rowStart;

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
    if (candidate.rowStart + candidate.rowSpan >= bottomBound) sortRowStart = Infinity;
    else if (candidate.rowStart <= topBound) sortRowStart = -Infinity;

    // Computed once here (not inside either fit-check branch below) —
    // both the "fits at current sizes" tier and the "shrink to fit"
    // tier need the exact same merged sort order; the shrink tier's own
    // bottom-up cascade specifically depends on this being the *final*
    // post-insertion order, not the original pre-insertion sibling
    // order (see that tier's own comment).
    const ordered = [
      ...stackSiblings.map((s) => ({ id: s.id, rowStart: s.rowStart, rowSpan: s.rowSpan })),
      { id: DRAGGED, rowStart: sortRowStart, rowSpan: candidate.rowSpan },
    ].sort(
      (a, b) =>
        a.rowStart - b.rowStart ||
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
// below shift up to close the gap it leaves. Requested directly: "side
// modules dont live update or move to fill empty space accordingly."
// Only rowStart ever changes — the departing member's own rowSpan is
// only needed to know how tall a gap it leaves, not applied to anyone
// else. Return shape (rowSpan optional, never actually populated) just
// matches resolveModulePlacement's own reflow shape so a caller merging
// the two arrays (see resolveDrag) gets one consistently-typed list
// rather than a union TypeScript can't cleanly narrow.
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
  let cursor = stack[0].rowStart;
  const plan: Array<{ id: string; rowStart: number }> = [];
  for (const m of stack) {
    // Skip the departing member entirely — including its own rowSpan's
    // contribution to cursor. Advancing cursor for it too (an earlier,
    // wrong version of this did) reserves its old slot for nobody,
    // which just reproduces everyone else's already-gapless starting
    // positions and computes zero moves — the gap it leaves never
    // actually closes.
    if (m.id === departing.id) continue;
    if (m.rowStart !== cursor) plan.push({ id: m.id, rowStart: cursor });
    cursor += m.rowSpan;
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

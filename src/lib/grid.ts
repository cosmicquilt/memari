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
  others: Array<GridRect & { id: string; locked: boolean }>
): {
  placement: { columnStart: number; rowStart: number };
  reflow: Array<{ id: string; rowStart: number }>;
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

  const isSameColumnStack = overlapping.every(
    (o) => !o.locked && o.columnStart === candidate.columnStart && o.columnSpan === candidate.columnSpan
  );
  if (isSameColumnStack) {
    const stackSiblings = others.filter(
      (o) => !o.locked && o.columnStart === candidate.columnStart && o.columnSpan === candidate.columnSpan
    );
    const rawStackTop = Math.min(candidate.rowStart, ...stackSiblings.map((s) => s.rowStart));
    const totalHeight = stackSiblings.reduce((sum, s) => sum + s.rowSpan, candidate.rowSpan);

    // The reflowed stack can't run into a locked block above or below it
    // (e.g. week-title sitting above the sidebar boxes), or off the page
    // — find the tightest such bounds in this column, using column-range
    // overlap rather than an exact span match so a locked block wider
    // than the stack (like a full-width hourly-grid-core) still counts.
    const columnsOverlap = (o: GridRect) =>
      o.columnStart < candidate.columnStart + candidate.columnSpan &&
      o.columnStart + o.columnSpan > candidate.columnStart;
    const boundingLocked = others.filter((o) => o.locked && columnsOverlap(o));
    const topBound = Math.max(
      0,
      ...boundingLocked
        .filter((o) => o.rowStart + o.rowSpan <= rawStackTop)
        .map((o) => o.rowStart + o.rowSpan)
    );
    const bottomBound = Math.min(
      page.gridRows,
      ...boundingLocked.filter((o) => o.rowStart >= rawStackTop).map((o) => o.rowStart)
    );

    if (totalHeight <= bottomBound - topBound) {
      const stackTop = Math.max(topBound, Math.min(rawStackTop, bottomBound - totalHeight));
      const DRAGGED = "__dragged__";
      const ordered = [
        ...stackSiblings.map((s) => ({ id: s.id, rowStart: s.rowStart, rowSpan: s.rowSpan })),
        { id: DRAGGED, rowStart: candidate.rowStart, rowSpan: candidate.rowSpan },
      ].sort((a, b) => a.rowStart - b.rowStart || (a.id === DRAGGED ? 1 : -1));

      let cursor = stackTop;
      let placement = { columnStart: candidate.columnStart, rowStart: candidate.rowStart };
      const reflow: Array<{ id: string; rowStart: number }> = [];
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
    // Doesn't fit even with a full reorder — e.g. enough boxes have piled
    // into this column that reordering them can't avoid running past a
    // bound. Leave the siblings alone and just relocate the dragged
    // module instead of producing a stack that overflows anyway.
  }

  // Pass the full `others` list, not just what overlapped the original
  // candidate — the search below tries other cells too, and needs to
  // check each of those against everything, not just what happened to
  // conflict with where the drag first landed.
  return { placement: findNearestFreeCell(page, candidate, others), reflow: [] };
}

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

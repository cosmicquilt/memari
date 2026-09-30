// WRITING SPACE ON THE LATTICE: lined, dotted, graph or blank, drawn once.
//
// The note box had the only body fill in the planner. The module-edits list
// (2026-09-30) offers the same choice in five more places - the table's rows,
// a prompt's answer lines, each box of a matrix, each day of the month
// calendar, and graph paper in the note box itself. Five copies of "where do
// the rules go" would drift the way the rule weights once did (0.35 here,
// 0.5 there, 0.3 in the hours), so there is one.
//
// THE PAGE'S OWN LATTICE, never an invented spacing. A rule sits on a dot
// row, a dot sits on a dot, a graph line on a lattice column: two filled
// boxes side by side agree with each other and with every other mark on the
// page. moduleHouseStyle.test.mts checks all three.

import { ptToPx } from "@/lib/print-spec";
import { NEAR_BLACK, RULE_WIDTH_PT, rowHeightPx, type FrameElement, type FrameGeometry, type FrameLattice } from "./moduleFrame";

export type FillStyle = "none" | "lined" | "dotted" | "graph";

export const FILL_STYLES: readonly FillStyle[] = ["none", "lined", "dotted", "graph"];

/** A stored value as a fill, or `fallback` for anything else. */
export function fillStyleOf(value: unknown, fallback: FillStyle = "none"): FillStyle {
  return (FILL_STYLES as readonly unknown[]).includes(value) ? (value as FillStyle) : fallback;
}

/**
 * One dot of a dotted fill, centred on a lattice point: three times the rule
 * weight so it reads as a dot rather than a speck - a 0.3pt square at 300dpi
 * is barely over one printed pixel.
 */
export function latticeDot(id: string, x: number, y: number): FrameElement {
  const size = ptToPx(RULE_WIDTH_PT) * 3;
  return { id, type: "figure", subType: "rect", x: x - size / 2, y: y - size / 2, width: size, height: size, fill: NEAR_BLACK, stroke: "none" };
}

/**
 * The lattice rows and columns inside a region: the first row strictly below
 * its top (a region's top is usually a rule already - a header, a strip - and
 * a line of dots along it is the thing asked to be left off on 2026-09-29),
 * down to the last row with at least a quarter of a cell under it.
 */
export function latticeRowsIn(
  geometry: FrameGeometry,
  lattice: FrameLattice | undefined,
  top: number,
  bottom: number
): Array<{ y: number; index: number }> {
  const pitch = rowHeightPx(lattice);
  const origin = lattice ? geometry.y - lattice.insetPx : geometry.y;
  let first = origin + Math.ceil((top - origin) / pitch - 1e-6) * pitch;
  if (Math.abs(first - top) < 0.5) first += pitch;
  const rows: Array<{ y: number; index: number }> = [];
  for (let y = first; y <= bottom - pitch / 4; y += pitch) rows.push({ y, index: Math.round((y - origin) / pitch) });
  return rows;
}

export function latticeColumnsIn(
  geometry: FrameGeometry,
  lattice: FrameLattice | undefined,
  left: number,
  right: number
): Array<{ x: number; index: number }> {
  const pitch = rowHeightPx(lattice);
  const origin = lattice ? geometry.x - lattice.insetPx : geometry.x;
  const columns: Array<{ x: number; index: number }> = [];
  for (let column = Math.ceil((left - origin) / pitch - 1e-6); ; column++) {
    const x = origin + column * pitch;
    if (x > right + 1e-6) break;
    if (x >= left - 1e-6) columns.push({ x, index: column });
  }
  return columns;
}

/**
 * Fill a region with writing space.
 *
 * `region` is the space to fill; lined rules and dots stay `inset` inside its
 * sides so they never touch a border. Graph paper runs edge to edge, its
 * vertical lines on the lattice columns strictly inside the region, and is
 * drawn lighter so writing still reads over it. `skipX` names x positions a
 * dot must not land on - a table's column dividers.
 *
 * Ids name the lattice row and column, so a mark keeps its id when the
 * region above it changes: `${tag}rule${row}`, `${tag}dot${row}-${column}`,
 * `${tag}grid-h${row}`, `${tag}grid-v${column}`.
 */
export function latticeFill(options: {
  style: FillStyle;
  region: { left: number; top: number; right: number; bottom: number };
  geometry: FrameGeometry;
  lattice?: FrameLattice;
  id: (name: string) => string;
  tag?: string;
  inset?: number;
  /** Ink of a lined rule. The note box's lines are full ink; rows inside a
   *  structure (a table, a matrix) are lighter, as the to-do's are. */
  lineOpacity?: number;
  skipX?: number[];
}): FrameElement[] {
  const { style, region, geometry, lattice, id } = options;
  if (style === "none") return [];
  const tag = options.tag ?? "";
  const inset = options.inset ?? 8;
  const weight = ptToPx(RULE_WIDTH_PT);
  const rows = latticeRowsIn(geometry, lattice, region.top, region.bottom);
  const elements: FrameElement[] = [];
  const rule = (name: string, x: number, y: number, width: number, height: number, opacity?: number): FrameElement => ({
    id: id(name),
    type: "figure",
    subType: "rect",
    x,
    y,
    width,
    height,
    fill: NEAR_BLACK,
    stroke: "none",
    ...(opacity !== undefined && opacity !== 1 ? { opacity } : {}),
  });

  if (style === "lined") {
    for (const row of rows) {
      elements.push(rule(`${tag}rule${row.index}`, region.left + inset, row.y - weight / 2, region.right - region.left - inset * 2, weight, options.lineOpacity));
    }
    return elements;
  }
  if (style === "dotted") {
    const columns = latticeColumnsIn(geometry, lattice, region.left + inset, region.right - inset);
    const skip = options.skipX ?? [];
    for (const row of rows) {
      for (const column of columns) {
        if (skip.some((x) => Math.abs(x - column.x) < inset)) continue;
        elements.push(latticeDot(id(`${tag}dot${row.index}-${column.index}`), column.x, row.y));
      }
    }
    return elements;
  }
  // Graph: every lattice line inside the region, both ways, lighter.
  const GRAPH_OPACITY = 0.45;
  for (const row of rows) {
    elements.push(rule(`${tag}grid-h${row.index}`, region.left, row.y - weight / 2, region.right - region.left, weight, GRAPH_OPACITY));
  }
  for (const column of latticeColumnsIn(geometry, lattice, region.left + 1, region.right - 1)) {
    elements.push(rule(`${tag}grid-v${column.index}`, column.x - weight / 2, region.top, weight, region.bottom - region.top, GRAPH_OPACITY));
  }
  return elements;
}

/**
 * What a row, a line or a prompt starts with: a number, a bullet or a box to
 * tick. One drawing for the note box's lines, the to-do's rows, the table's
 * row numbers and the prompts, so a numbered list looks the same wherever it
 * is. Sized to sit in a one-cell row: 7pt numerals at 0.55 ink, a 1.1pt
 * bullet, a 6pt box at rule weight.
 */
export type RowMarker = "none" | "numbers" | "bullets" | "boxes";

export function rowMarkerOf(value: unknown): RowMarker {
  return value === "numbers" || value === "bullets" || value === "boxes" ? value : "none";
}

export const MARKER_NUMBER_PT = 7;

export function rowMarkerElement(options: {
  marker: RowMarker;
  /** 1-based. */
  number: number;
  id: string;
  /** Left edge of the marker. */
  x: number;
  /** The row's own band - the marker sits on its line, a little above it. */
  bandTop: number;
  bandHeight: number;
  fontFamily: string;
  textY: (bandTop: number, bandHeight: number, fontSizePx: number, fontFamily: string) => number;
  /** For numbers: the width to set them in, and how. */
  width?: number;
  align?: "left" | "center";
}): FrameElement | null {
  const { marker, x, bandTop, bandHeight } = options;
  const middle = bandTop + bandHeight * 0.58;
  if (marker === "numbers") {
    const size = ptToPx(MARKER_NUMBER_PT);
    return {
      id: options.id,
      type: "text",
      x,
      y: options.textY(bandTop, bandHeight, size, options.fontFamily),
      width: options.width ?? size * 2,
      height: size * 1.2,
      text: String(options.number),
      fontSize: size,
      fontFamily: options.fontFamily,
      fill: NEAR_BLACK,
      align: options.align ?? "left",
      opacity: 0.55,
    };
  }
  if (marker === "bullets") {
    const r = ptToPx(1.1);
    return { id: options.id, type: "figure", subType: "rect", x: x + r, y: middle - r, width: r * 2, height: r * 2, cornerRadius: r, fill: NEAR_BLACK, stroke: "none", opacity: 0.8 };
  }
  if (marker === "boxes") {
    const side = ptToPx(6);
    return {
      id: options.id,
      type: "figure",
      subType: "rect",
      x,
      y: middle - side / 2,
      width: side,
      height: side,
      fill: "transparent",
      stroke: NEAR_BLACK,
      strokeWidth: ptToPx(RULE_WIDTH_PT),
      opacity: 0.8,
    };
  }
  return null;
}

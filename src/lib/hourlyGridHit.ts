// Turning a click on an hourly grid back into a day and a time.
//
// The inverse of what renderHourlyGridCore does, and deliberately built ON
// the same geometry rather than beside it: hourlyGridGeometry is the one
// description of where the columns and rows are, and this only reads it. A
// second copy of "the first row starts at header + gap" is the defect this
// project keeps meeting - it would show up as an event saved at 10:30 and
// drawn at 10:00, with each half looking right on its own.
//
// Pure, so it can be tested without a browser, and so the numbers can be
// checked against the ones the renderer actually placed.

import type { HourlyGridGeometry } from "./modules/hourlyGridCore";
import type { RenderedPolotnoElement } from "./renderModuleInstance";

/** A point in the drawing's own space: print px, module-absolute, the same
 *  coordinates every element's x/y is in. */
export type PrintPoint = { x: number; y: number };

export type SlotHit = {
  /** Column index, 0-based, within this block's dayCount. */
  day: number;
  /** Which interval row, counted from the first. */
  slot: number;
  /** Minutes since midnight, snapped to the grid's own interval. */
  startMinutes: number;
  /** One interval later - the shortest event the grid can draw honestly. */
  endMinutes: number;
};

/**
 * Which column and row a point is in, or null for one outside the ruled
 * area - the day tab, the all-day band, the gutter between two columns, or
 * past the last row.
 *
 * THE GUTTER IS A MISS, not a rounding to the nearer column. A click that
 * lands between two days is ambiguous, and guessing puts an event on a day
 * nobody chose; a miss just does nothing, and the next click is 2px away.
 */
export function slotAt(grid: HourlyGridGeometry, p: PrintPoint): SlotHit | null {
  const day = grid.columnX.findIndex((x) => p.x >= x && p.x < x + grid.dayColumnWidth);
  if (day < 0) return null;

  const rowsHigh = p.y - grid.gridTop;
  if (rowsHigh < 0) return null;
  const slot = Math.floor(rowsHigh / grid.rowHeight);
  if (slot >= grid.rowCount) return null;

  const startMinutes = grid.startMinutes + slot * grid.intervalMinutes;
  return { day, slot, startMinutes, endMinutes: startMinutes + grid.intervalMinutes };
}

/** The slot a drag ENDED on, as an end time: the pointer is inside the last
 *  row it covers, so the event runs to the bottom of that row. Never shorter
 *  than one interval, whichever way the drag went. */
export function endMinutesForDrag(grid: HourlyGridGeometry, from: SlotHit, toSlot: number): number {
  const last = Math.max(from.slot, Math.min(toSlot, grid.rowCount - 1));
  return grid.startMinutes + (last + 1) * grid.intervalMinutes;
}

/** "HH:MM" from minutes since midnight - the form HourlyGridEvent uses. */
export function hhmmOf(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export type DrawnEventBox = {
  /** The stored event's id, for a timed block. Null for the all-day band,
   *  which draws ONE box for a day however many things are in it. */
  eventId: string | null;
  /** Which occurrence, for a block from a repeating event - see eventKey. */
  occurrence: string | null;
  day: number;
  allDay: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * WHERE THE EVENT BLOCKS ACTUALLY LANDED, read off the marks themselves.
 *
 * Not recomputed. The renderer's own placement of an event block is involved
 * - a left inset off the time labels, a share of the track when something
 * else runs at the same time, a vertical margin capped at a third of the
 * block - and a second implementation of all that, for the sake of hit
 * testing, would be three more chances to disagree with the picture. The
 * marks are already in hand on the page that drew them, so the hit areas
 * come from the marks.
 *
 * Ids are the renderer's own: `<instance>-d<day>-ev<eventId>-box` for a
 * timed block and `<instance>-d<day>-allday-box` for the band.
 */
export function drawnEventBoxes(
  elements: ReadonlyArray<RenderedPolotnoElement>
): DrawnEventBox[] {
  const out: DrawnEventBox[] = [];
  const walk = (list: ReadonlyArray<RenderedPolotnoElement>) => {
    for (const el of list) {
      // A non-locked instance comes back wrapped in a synthetic group. The
      // hourly grid is locked and never is, but reading through a group
      // costs one line and stops this silently returning nothing if that
      // ever changes.
      if (el.children) walk(el.children);
      if (el.subType !== "rect") continue;
      const timed = /-d(\d+)-ev(.+)-box$/.exec(el.id);
      const band = /-d(\d+)-allday-box$/.exec(el.id);
      const match = timed ?? band;
      if (!match) continue;
      const [eventId, occurrence] = timed ? timed[2].split("@") : [null, null];
      out.push({
        eventId: eventId ?? null,
        occurrence: occurrence ?? null,
        day: Number(match[1]),
        allDay: !timed,
        x: el.x ?? 0,
        y: el.y ?? 0,
        width: el.width ?? 0,
        height: el.height ?? 0,
      });
    }
  };
  walk(elements);
  return out;
}

/** The box under a point, latest first - the renderer paints later blocks
 *  over earlier ones, so the one on top is the one a click means. */
export function boxAt(boxes: ReadonlyArray<DrawnEventBox>, p: PrintPoint): DrawnEventBox | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height) return b;
  }
  return null;
}

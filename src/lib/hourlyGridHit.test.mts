// A click on an hourly grid, turned back into a day and a time.
//
// THE POINT OF THIS TEST is that the inverse agrees with the drawing. So it
// does not assert against numbers typed here: it RENDERS a real block, reads
// the y of each hour rule off the marks, and asks slotAt what a point just
// inside that rule is. If the two ever part company an event will be saved at
// one time and drawn at another, which is the failure this file exists for.
//
//   npx tsx src/lib/hourlyGridHit.test.mts

import {
  renderHourlyGridCore,
  hourlyGridGeometry,
  type HourlyGridCoreConfig,
  type HourlyGridEvent,
} from "./modules/hourlyGridCore.js";
import { slotAt, endMinutesForDrag, hhmmOf, drawnEventBoxes, boxAt } from "./hourlyGridHit.js";
import type { RenderedPolotnoElement } from "./renderModuleInstance.js";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
};

const BOX = { x: 300, y: 450, width: 1350, height: 480 };
const LATTICE = { pitchPx: 75, originX: 150, originY: 150, insetPx: 6 };

const config = (events: HourlyGridEvent[] = []): HourlyGridCoreConfig =>
  ({
    dayCount: 3,
    dayLabels: [
      { name: "SUNDAY", date: 20 },
      { name: "MONDAY", date: 21 },
      { name: "TUESDAY", date: 22 },
    ],
    startTime: "08:00",
    endTime: "12:00",
    intervalMinutes: 30,
    intervalMode: "on",
    hourLineStyle: "low-transparency",
    events,
  }) as never;

const render = (events: HourlyGridEvent[] = []) =>
  renderHourlyGridCore(BOX, config(events), "hg", "Newsreader", LATTICE) as RenderedPolotnoElement[];

const grid = hourlyGridGeometry(BOX, config(), LATTICE);

// --- THE INVERSE AGREES WITH THE DRAWING ----------------------------------
//
// Each slot is closed by a ruled line, drawn centred on the slot's own bottom
// edge. So the marks themselves say where the rows divide: just above rule i
// is slot i, and just below it is slot i+1. Nothing here is a number typed by
// hand - move the geometry and the marks move with it, and this still holds.
{
  const rules = render()
    .filter((e) => e.subType === "rect" && /-d1-r(\d+)-rule$/.test(e.id))
    .map((e) => ({ slot: Number(/-r(\d+)-rule$/.exec(e.id)![1]), y: e.y ?? 0, height: e.height ?? 0 }))
    .sort((a, b) => a.slot - b.slot);
  check(rules.length === grid.rowCount, `the drawing should rule ${grid.rowCount} rows, found ${rules.length}`);

  const midColumn = grid.columnX[1] + grid.dayColumnWidth / 2;
  for (const rule of rules) {
    const above = slotAt(grid, { x: midColumn, y: rule.y - 2 });
    check(above?.slot === rule.slot, `just above rule ${rule.slot} should be slot ${rule.slot}, got ${above?.slot ?? "a miss"}`);
    check(above?.day === 1, `a point in the middle of column 1 should be day 1, got ${above?.day}`);
    const below = slotAt(grid, { x: midColumn, y: rule.y + rule.height + 2 });
    const isLast = rule.slot === grid.rowCount - 1;
    check(
      isLast ? below === null : below?.slot === rule.slot + 1,
      `just below rule ${rule.slot} should be ${isLast ? "past the grid" : `slot ${rule.slot + 1}`}, got ${below?.slot ?? "a miss"}`
    );
  }

  // WHERE THE GRID STARTS, pinned against the drawing rather than asserted:
  // one row above the first rule is the top of slot 0, so a point just inside
  // that is slot 0 and a point just outside it is the all-day band.
  const firstTop = rules[0].y + rules[0].height / 2 - grid.rowHeight;
  check(
    Math.abs(firstTop - grid.gridTop) < 0.01,
    `the first slot is drawn from ${firstTop.toFixed(3)} but the geometry says ${grid.gridTop.toFixed(3)}`
  );
  check(slotAt(grid, { x: midColumn, y: firstTop + 1 })?.slot === 0, "the top of the first slot was not slot 0");
  check(slotAt(grid, { x: midColumn, y: firstTop - 1 }) === null, "a point above the first slot was read as a slot");

  // And the times follow from the slot, at the grid's own interval.
  const first = slotAt(grid, { x: midColumn, y: firstTop + 1 })!;
  check(first.startMinutes === 8 * 60, `slot 0 should start at 08:00, got ${hhmmOf(first.startMinutes)}`);
  check(first.endMinutes === 8 * 60 + 30, `slot 0 should end at 08:30, got ${hhmmOf(first.endMinutes)}`);
  const last = slotAt(grid, { x: midColumn, y: rules[rules.length - 1].y - 2 })!;
  check(last.endMinutes === 12 * 60, `the last row should end at 12:00, got ${hhmmOf(last.endMinutes)}`);
}

// --- OUTSIDE THE RULED AREA IS A MISS -------------------------------------
{
  const midColumn = grid.columnX[0] + grid.dayColumnWidth / 2;
  check(slotAt(grid, { x: midColumn, y: BOX.y + 2 }) === null, "a click on the day tab was read as a slot");
  check(
    slotAt(grid, { x: midColumn, y: grid.gridTop - 2 }) === null,
    "a click in the all-day band was read as a slot"
  );
  check(
    slotAt(grid, { x: midColumn, y: grid.gridTop + grid.rowCount * grid.rowHeight + 2 }) === null,
    "a click below the last row was read as a slot"
  );
  // THE GUTTER IS A MISS. The boundary between two columns is a shared
  // lattice line with the gutter centred on it, so a point there belongs to
  // neither day and guessing would file an event under a day nobody chose.
  const gutter = grid.columnX[1] - grid.columnGutter / 2;
  check(slotAt(grid, { x: gutter, y: grid.gridTop + 5 }) === null, "a click in the gutter picked a day anyway");
  check(slotAt(grid, { x: BOX.x - 40, y: grid.gridTop + 5 }) === null, "a click left of the block picked a day");
}

// --- A DRAG SETS THE END, AND NEVER GOES BACKWARDS ------------------------
{
  const from = slotAt(grid, { x: grid.columnX[0] + 20, y: grid.gridTop + 5 })!;
  check(endMinutesForDrag(grid, from, 0) === from.endMinutes, "a drag inside one row should be one interval");
  check(
    endMinutesForDrag(grid, from, 3) === grid.startMinutes + 4 * grid.intervalMinutes,
    "a drag down to slot 3 should run to the bottom of slot 3"
  );
  check(
    endMinutesForDrag(grid, from, -5) === from.endMinutes,
    "a drag upwards off the top should still leave one interval"
  );
  check(
    endMinutesForDrag(grid, from, 999) === grid.startMinutes + grid.rowCount * grid.intervalMinutes,
    "a drag past the last row should stop at the last row"
  );
}

// --- THE HIT AREAS ARE THE DRAWN BLOCKS -----------------------------------
//
// Read off the marks rather than recomputed, so a point in the middle of a
// drawn block must find that block's own event id.
{
  const events: HourlyGridEvent[] = [
    { id: "evt-one", day: 1, startTime: "09:00", endTime: "10:00", label: "One", source: "manual" },
    { id: "evt-two", day: 1, startTime: "09:30", endTime: "11:00", label: "Two", source: "manual" },
    { id: "evt-hol", day: 2, startTime: "00:00", endTime: "23:59", label: "Holiday", source: "manual", allDay: true },
  ];
  const boxes = drawnEventBoxes(render(events));
  const timed = boxes.filter((b) => !b.allDay);
  check(timed.length === 2, `two timed blocks should be found, got ${timed.length}`);
  check(
    boxes.some((b) => b.allDay && b.day === 2),
    "the all-day band was not found as a hit area"
  );

  for (const id of ["evt-one", "evt-two"]) {
    const box = timed.find((b) => b.eventId === id);
    check(Boolean(box), `no drawn block carried the id ${id}`);
    if (!box) continue;
    const hit = boxAt(boxes, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    check(hit?.eventId === id, `the middle of ${id}'s own block found ${hit?.eventId ?? "nothing"}`);
  }

  // TWO CONCURRENT EVENTS ARE TWO HIT AREAS. They share the 09:30-10:00 half
  // hour and the renderer gives each half the track, so a point in one must
  // not find the other - which is what would happen if the hit area were the
  // whole column width, as a recomputed box would most easily be.
  const one = timed.find((b) => b.eventId === "evt-one")!;
  const two = timed.find((b) => b.eventId === "evt-two")!;
  check(one.x !== two.x, "concurrent events were drawn at the same x, so they cannot be told apart");
  check(
    boxAt(boxes, { x: one.x + 2, y: two.y + 2 })?.eventId === "evt-one",
    "a point in the left block of a concurrent pair found the wrong event"
  );
  check(
    boxAt(boxes, { x: two.x + 2, y: two.y + 2 })?.eventId === "evt-two",
    "a point in the right block of a concurrent pair found the wrong event"
  );

  // A point in the empty part of the column is not on any block.
  check(
    boxAt(boxes, { x: grid.columnX[0] + grid.dayColumnWidth / 2, y: grid.gridTop + 5 }) === null,
    "an empty slot reported a block under it"
  );
}

// --- hhmmOf ---------------------------------------------------------------
check(hhmmOf(0) === "00:00", `midnight should be 00:00, got ${hhmmOf(0)}`);
check(hhmmOf(8 * 60 + 30) === "08:30", `510 minutes should be 08:30, got ${hhmmOf(8 * 60 + 30)}`);
check(hhmmOf(23 * 60 + 59) === "23:59", `1439 minutes should be 23:59, got ${hhmmOf(23 * 60 + 59)}`);
check(hhmmOf(1440) === "00:00", `a day past midnight should wrap, got ${hhmmOf(1440)}`);

if (failures > 0) {
  console.error(`\nHourly grid hit testing: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  "All hourly grid hit checks passed (every ruled row inverts to its own slot, the tab/band/gutter are misses, " +
    "a drag never runs backwards, and the hit areas are the drawn blocks - including one of a concurrent pair)."
);

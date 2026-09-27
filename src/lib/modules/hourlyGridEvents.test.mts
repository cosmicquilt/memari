// Calendar events on the hour grid: the all-day band, and what it must not
// disturb.
//
// Andrew, 2026-09-26: all-day events and holidays go "between day of week at
// top and hourly section". They fit inside the 22.3pt gap that was already
// between the day tab and the first ruled row, which is the whole reason
// nothing else on the page moves - the block stays 20 dots, its rowSpan stays
// 21, and the to-do below keeps all fifteen of its rows. Growing the block by
// a dot instead would have cost that row on every weekly spread to buy space
// that was sitting empty.
//
// The first assertion is the one that makes this safe to ship: a week with no
// all-day events must be mark-for-mark what it was before the band existed.
// That is what lets every stored instance keep its geometry with no config
// flag and no default to get wrong.
//
//   npx tsx src/lib/modules/hourlyGridEvents.test.mts

import { renderHourlyGridCore, type HourlyGridEvent } from "./hourlyGridCore";
import { capCentreNudgeEm, TEXT_LINE_HEIGHT } from "./textFit";
import { ptToPx } from "@/lib/print-spec";
import { FONT_SERIF } from "@/lib/theme";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
};

const GEOMETRY = { x: 193.5, y: 193.5, width: 1788, height: 1500 };
const BASE = {
  dayCount: 3,
  dayLabels: [
    { name: "SUNDAY", date: 1 },
    { name: "MONDAY", date: 2 },
    { name: "TUESDAY", date: 3 },
  ],
  startTime: "06:00",
  endTime: "24:00",
  intervalMinutes: 30,
};

type El = Record<string, number | string | undefined> & { id: string; children?: El[] };
const flat = (els: El[]): El[] => els.flatMap((e) => (e.children ? [e, ...flat(e.children)] : [e]));
const render = (events: HourlyGridEvent[]) =>
  flat(renderHourlyGridCore(GEOMETRY, { ...BASE, events } as never, "t", FONT_SERIF) as unknown as El[]);

const allDay = (day: number, label: string, colour?: string): HourlyGridEvent => ({
  day,
  startTime: "00:00",
  endTime: "23:59",
  label,
  source: "manual",
  allDay: true,
  ...(colour ? { colour } : {}),
});

// --- A week with no all-day events is untouched ----------------------------
{
  const before = render([]);
  const timedOnly = render([
    { day: 1, startTime: "09:00", endTime: "10:30", label: "Office Hours", source: "manual" },
  ]);
  check(
    before.every((e) => !String(e.id).includes("allday")),
    "an empty week drew all-day band marks"
  );
  check(
    timedOnly.filter((e) => String(e.id).includes("allday")).length === 0,
    "a week with only TIMED events drew an all-day band"
  );
  // The timed event is 2 marks (box + label) and nothing else moved.
  check(
    timedOnly.length === before.length + 2,
    `a timed event should add exactly 2 marks, went from ${before.length} to ${timedOnly.length}`
  );
}

// --- The band sits between the tab and the grid, touching neither ----------
{
  const marks = render([allDay(0, "Thanksgiving")]);
  const header = marks.find((e) => e.id === "t-d0-header-box");
  const band = marks.find((e) => e.id === "t-d0-allday-box");
  if (!header || !band) {
    check(false, "no header box or no band box was drawn");
  } else {
    const headerBottom = Number(header.y) + Number(header.height);
    const bandTop = Number(band.y);
    const bandBottom = bandTop + Number(band.height);
    // gridTop, as renderHourlyGridCore computes it with no lattice.
    const gridTop = GEOMETRY.y + ptToPx(13.7) + ptToPx(22.3);

    check(bandTop > headerBottom, `the band starts at ${bandTop.toFixed(1)}, on or above the day tab's ${headerBottom.toFixed(1)}`);
    check(bandBottom < gridTop, `the band ends at ${bandBottom.toFixed(1)}, on or below the grid's ${gridTop.toFixed(1)}`);
    check(
      Math.abs(Number(band.height) - ptToPx(14)) < 0.01,
      `the band is ${Number(band.height).toFixed(2)}px, expected 14pt = ${ptToPx(14).toFixed(2)}`
    );
    // CENTRED in the gap: equal air above and below, so it sits on neither
    // neighbour. This is what would break first if the band were placed
    // against the nominal constants instead of the real gap.
    const above = bandTop - headerBottom;
    const below = gridTop - bandBottom;
    check(
      Math.abs(above - below) < 0.01,
      `the band is not centred in the gap: ${above.toFixed(2)}px above, ${below.toFixed(2)}px below`
    );
    check(Number(band.cornerRadius) > 0, "the band has square corners; events are drawn rounded");
  }
}

// --- More than one gets counted, not stacked -------------------------------
{
  const one = render([allDay(0, "Thanksgiving")]);
  const three = render([allDay(0, "Thanksgiving"), allDay(0, "Birthday"), allDay(0, "Bin day")]);
  const label = (marks: El[]) => marks.find((e) => e.id === "t-d0-allday-label");

  check(String(label(one)?.text) === "Thanksgiving", `one item should read its own title, got "${label(one)?.text}"`);
  check(
    String(label(three)?.text) === "Thanksgiving +2",
    `three items should read "Thanksgiving +2", got "${label(three)?.text}"`
  );
  // A 14pt band cannot hold three legible lines - stacking them would set
  // each at under 5pt, below this app's own floor. Counting is the honest
  // answer, so there must be exactly one box and one label however many
  // items there are.
  check(
    three.filter((e) => String(e.id).includes("allday")).length === 2,
    `three items should still draw one box and one label, drew ${three.filter((e) => String(e.id).includes("allday")).length} marks`
  );
}

// --- An all-day event is not also drawn against a time ---------------------
{
  const marks = render([allDay(0, "Thanksgiving")]);
  const timedBoxes = marks.filter((e) => /d0-ev/.test(String(e.id)));
  check(
    timedBoxes.length === 0,
    `an all-day event was also drawn in the hour grid as ${timedBoxes.length} timed mark(s)`
  );
}

// --- The label's capitals centre in the band -------------------------------
//
// Not a restatement of capCentredTextY: this works out where the ink lands
// from the font's own metrics and checks it against the band's middle, the
// same way textFit.test.mts does for every other centred label.
{
  const marks = render([allDay(0, "Thanksgiving")]);
  const band = marks.find((e) => e.id === "t-d0-allday-box")!;
  const label = marks.find((e) => e.id === "t-d0-allday-label")!;
  const size = Number(label.fontSize);
  const lineBox = size * TEXT_LINE_HEIGHT;
  // Newsreader, as measured in textFit.
  const baseline = Number(label.y) + (lineBox - (0.74 + 0.27) * size) / 2 + 0.74 * size;
  const capCentre = baseline - (0.71 * size) / 2;
  const bandCentre = Number(band.y) + Number(band.height) / 2;
  check(
    Math.abs(capCentre - bandCentre) < 0.01,
    `the label's capitals centre at ${capCentre.toFixed(2)}, the band's middle is ${bandCentre.toFixed(2)}`
  );
  check(capCentreNudgeEm(FONT_SERIF) > 0, "the serif nudge is zero; textFit's metrics are not loaded");
}

// --- A calendar's colour reaches the mark ----------------------------------
{
  const marks = render([allDay(0, "Thanksgiving", "#ffd8d8")]);
  const band = marks.find((e) => e.id === "t-d0-allday-box");
  check(String(band?.fill) === "#ffd8d8", `the calendar's colour should reach the fill, got ${band?.fill}`);
  const fallback = render([allDay(0, "Thanksgiving")]).find((e) => e.id === "t-d0-allday-box");
  check(String(fallback?.fill) === "#ffe9b3", `without a colour a manual event takes the manual fill, got ${fallback?.fill}`);
}

if (failures > 0) {
  console.error(`\nHourly grid events: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  "All hourly grid event checks passed (an empty week is untouched; the band is 14pt, centred in the " +
    "22.3pt gap, rounded, and counts what it cannot fit)."
);

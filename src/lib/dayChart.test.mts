// The day chart (2026-09-30): the days along the bottom are the week's or
// the month's, the levels up the side are the ones written, each look draws
// what it says, and the plot sits on the lattice where it can.
//
// Expected values are STATED here, not imported from dayChart.ts - a test
// that asks the code for its answer only checks the code equals itself.
//
// Run with: npx tsx src/lib/dayChart.test.mts

import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { PROOF_PAGE as PAGE, flatten } from "./proofSvg";
import { getMinRowSpanForSlug } from "./moduleMinRowSpan";
import { withDates, withoutDates, withWeekStart } from "./moduleRegistry";

let failures = 0;
function check(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`FAIL ${message}`);
  }
}
process.on("exit", () => {
  if (failures > 0) {
    console.error(`\n${failures} day chart check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All day chart checks passed (days, levels, four looks, the lattice, the minimum height, dating).");
  }
});

const CELL = 75;
function draw(props: Record<string, unknown>, columnSpan = 12, rowSpan = 7): RenderedPolotnoElement[] {
  return flatten(
    renderModuleInstance(
      { id: "c", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues: props, moduleType: { slug: "day-chart" } },
      PAGE
    )
  );
}
const ids = (elements: RenderedPolotnoElement[], pattern: RegExp) => elements.filter((e) => pattern.test(String(e.id)));
const texts = (elements: RenderedPolotnoElement[], pattern: RegExp) => ids(elements, pattern).map((e) => String(e.text));
const onLattice = (v: number) => Math.abs((v - PAGE.marginPx) / CELL - Math.round((v - PAGE.marginPx) / CELL)) < 1e-6;
const mood = { heading: "Mood", levels: ["Great", "Good", "Okay", "Low", "Awful"] };

// --- the days ---------------------------------------------------------------
{
  check(texts(draw({ ...mood, span: "week" }), /-d\d-label$/).join(",") === "SUN,MON,TUE,WED,THU,FRI,SAT", "a week, Sunday first by default");
  check(
    texts(draw({ ...mood, span: "week", weekStartDay: 1 }), /-d\d-label$/).join(",") === "MON,TUE,WED,THU,FRI,SAT,SUN",
    "a Monday journal's week starts on Monday"
  );
  const month = texts(draw({ ...mood, span: "month" }, 24), /-d\d+-label$/);
  check(month.length === 31 && month[0] === "1" && month[30] === "31", `an undated month is 31 days, every one named at full width (got ${month.length})`);
  const february = texts(draw({ ...mood, span: "month", monthDays: 28 }, 24), /-d\d+-label$/);
  check(february.length === 28 && february[27] === "28", `a dated February is 28 days (got ${february.length})`);
  const narrow = texts(draw({ ...mood, span: "month" }, 6), /-d\d+-label$/);
  check(narrow.join(",") === "1,5,10,15,20,25,30", `a month in a sidebar names every fifth day (got ${narrow.join(",")})`);
  const initials = texts(draw({ ...mood, span: "week" }, 6), /-d\d-label$/);
  check(initials.length === 7 && initials.every((t) => t.length <= 3), `a week in a sidebar still names all seven (got ${initials.join(",")})`);
}

// --- the levels ---------------------------------------------------------------
{
  const chart = draw({ ...mood, span: "week" });
  const labels = ids(chart, /-l\d-label$/);
  check(labels.map((e) => e.text).join(",") === "Great,Good,Okay,Low,Awful", "the levels top down, as written");
  check(labels.every((e, i) => i === 0 || (e.y ?? 0) > (labels[i - 1].y ?? 0)), "each level below the one before");
  const blank = draw({ heading: "Sleep", span: "week", levels: ["", "", "", "", "", ""], look: "dots" }, 12, 8);
  check(ids(blank, /-l\d-label$/).length === 0, "blank levels print no labels, to be written in");
  check(ids(blank, /-d\d-l\d$/).length === 7 * 6, "and still a mark for every day at every level");
  const defaults = draw({});
  // A mood chart from nothing has faces up the side (2026-10-01), not words.
  check(
    ids(defaults, /-l\d-face-head$/).length === 5 && ids(defaults, /-l\d-label$/).length === 0 && ids(defaults, /-d\d-label$/).length === 7,
    "drawn from nothing: five faces up the side and a week"
  );
}

// --- one day wide: the plot keeps three quarters (2026-10-01) -------------------
// It was half a cell a day with the labels given two and a half of the six
// cells - "doesn't have enough space for graphing, too much whitespace to the
// left of labels". Now the labels get what they need and no more than a
// quarter, and the days share the rest, off the lattice if they must be.
{
  for (const [what, levels] of [["words", mood.levels], ["faces", ["😃", "🙂", "😐", "😞", "😢"]]] as const) {
    const chart = draw({ heading: "Mood", levels: [...levels], span: "week", look: "bars" }, 6);
    const axis = ids(chart, /-axis-y$/)[0];
    const axisCells = ((axis?.x ?? 0) + (axis?.width ?? 0) / 2 - PAGE.marginPx) / CELL;
    check(!!axis && axisCells <= 1.5 + 1e-6, `one day wide with ${what}, the axis is at most a quarter of the box in (got ${axisCells.toFixed(2)} cells)`);
    const centres = ids(chart, /-d\d-label$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
    const perDay = (centres[1] - centres[0]) / CELL;
    check(perDay * 7 >= 4.2, `and the week takes the rest (${(perDay * 7).toFixed(2)} of 6 cells)`);
  }
}

// --- faces (2026-10-01) ------------------------------------------------------------
// A level that is exactly 😃 🙂 😐 😞 or 😢 is drawn as the doodle people's
// face: a head, two eyes, a mouth - and a tear on the last.
{
  const faces = ["😃", "🙂", "😐", "😞", "😢"];
  const chart = draw({ heading: "Mood", levels: faces, span: "week", look: "dots" });
  check(ids(chart, /-l\d-face-head$/).length === 5, "five faces, one a level");
  check(ids(chart, /-l\d-label$/).length === 0, "and no words for them");
  check(ids(chart, /-l\d-face-eye-[lr]$/).length === 10 && ids(chart, /-l\d-face-mouth$/).length === 5, "each with two eyes and a mouth");
  const tears = ids(chart, /-face-tear$/);
  check(tears.length === 1 && /-l4-face-tear$/.test(String(tears[0].id)), "a tear on the saddest only");
  // Each is a path the PDF can draw - M, L, C, Z - and sits in its own band,
  // left of the axis.
  const axis = ids(chart, /-axis-y$/)[0];
  const heads = ids(chart, /-l\d-face-head$/);
  const pathOk = ids(chart, /-l\d-face-/).every((e) => typeof e.pathD === "string" && /^[MLCZ0-9.\s-]+$/.test(e.pathD as string));
  check(pathOk, "every face mark is a path of M, L, C and Z");
  check(
    heads.every((h, i) => i === 0 || (h.y ?? 0) >= (heads[i - 1].y ?? 0) + (heads[i - 1].height ?? 0) - 1e-6),
    "the faces stack down the side, one under the next"
  );
  check(heads.every((h) => (h.x ?? 0) + (h.width ?? 0) <= (axis?.x ?? 0) + 1e-6), "every face is left of the axis");
  const eyes = ids(chart, /-l\d-face-eye-l$/);
  check(eyes.every((e) => e.fill !== "transparent" && e.stroke === "none"), "the eyes are solid");
  // Words and faces mix: a face where it is one, words where they are not.
  const mixed = draw({ heading: "Mood", levels: ["😃", "Fine", "😢"], span: "week" });
  check(ids(mixed, /-l\d-face-head$/).length === 2 && texts(mixed, /-l\d-label$/).join() === "Fine", "faces and words mix, level by level");
}

// --- the four looks -----------------------------------------------------------
{
  const n = 5;
  const days = 7;
  const dots = draw({ ...mood, span: "week", look: "dots" });
  check(ids(dots, /-d\d-l\d$/).length === days * n && ids(dots, /-d\d-l\d$/).every((e) => !e.pathD && Number(e.cornerRadius ?? 0) > 0), "dots: a round dot at every day and level");
  const circles = draw({ ...mood, span: "week", look: "circles" });
  check(ids(circles, /-d\d-l\d$/).length === days * n && ids(circles, /-d\d-l\d$/).every((e) => e.fill === "transparent"), "circles: an open circle at every day and level");
  const ruled = draw({ ...mood, span: "week", look: "ruled" });
  check(ids(ruled, /-l\d-rule$/).length === n - 1 && ids(ruled, /-d\d-tick$/).length === days, "ruled: a rule between each two levels and a tick at each day");
  check(ids(ruled, /-d\d-l\d$/).length === 0, "ruled: no dots");
  const bars = draw({ ...mood, span: "week", look: "bars" });
  check(ids(bars, /-d\d-bar$/).length === days && ids(bars, /-d\d-rule\d$/).length === days * (n - 1), "bars: a column a day, divided at each level");
  check(draw({ ...mood, look: "nonsense" }).filter((e) => /-d\d-l\d$/.test(String(e.id))).length === days * n, "an unknown look draws dots");
}

// --- the lattice ---------------------------------------------------------------
{
  // A week across the page is three cells a day, across three-quarters of it
  // two, across half of it a cell and a half (with its labels a size down) -
  // every day boundary on a lattice line or exactly between two.
  const onHalf = (v: number) => onLattice(v) || onLattice(v + CELL / 2);
  for (const [columns, perDay] of [[24, 3], [18, 2], [12, 1.5]] as const) {
    const chart = draw({ ...mood, span: "week", look: "bars" }, columns);
    const centres = ids(chart, /-d\d-label$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
    const pitch = centres[1] - centres[0];
    check(Math.abs(pitch - perDay * CELL) < 1e-6, `a week across ${columns} cells is ${perDay} cell(s) a day (got ${(pitch / CELL).toFixed(3)})`);
    check(centres.every((x) => onHalf(x - (perDay * CELL) / 2)), `and every day starts on the lattice at ${columns}`);
  }
  const half = texts(draw({ ...mood, span: "week" }, 12), /-l\d-label$/);
  check(half.join(",") === "Great,Good,Okay,Low,Awful", `a half-page week keeps its level labels whole (got ${half.join(",")})`);
  const chart = draw({ ...mood, span: "month", look: "ruled" }, 24);
  const axis = ids(chart, /-axis-y$/)[0];
  check(!!axis && onLattice((axis.x ?? 0) + (axis.width ?? 0) / 2), "the level axis is on a lattice column");
  const rules = ids(chart, /-l\d-rule$/).map((e) => (e.y ?? 0) + (e.height ?? 0) / 2);
  check(rules.length === 4 && rules.every(onLattice), "the rules between levels are on lattice rows");
  const box = ids(chart, /-border$/)[0];
  const lastDay = ids(chart, /-d30-label$/)[0];
  check(!!lastDay && (lastDay.x ?? 0) + (lastDay.width ?? 0) <= (box.x ?? 0) + (box.width ?? 0) + 1e-6, "a month's last day stays inside the border");
}

// --- the minimum height -------------------------------------------------------
{
  // The header, a cell per level and a cell of day names.
  check(getMinRowSpanForSlug("day-chart", PAGE, 12, mood) === 7, `five levels need seven rows (got ${getMinRowSpanForSlug("day-chart", PAGE, 12, mood)})`);
  const ten = { heading: "Stress", levels: ["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"] };
  check(getMinRowSpanForSlug("day-chart", PAGE, 12, ten) === 12, `ten levels need twelve (got ${getMinRowSpanForSlug("day-chart", PAGE, 12, ten)})`);
  const short = draw(mood, 12, 5);
  check(ids(short, /-l\d-label$/).length === 3, `a box two rows short shows the top three levels (got ${ids(short, /-l\d-label$/).length})`);
}

// --- dating -----------------------------------------------------------------
{
  const at = (iso: string) => ({ key: null, label: "", start: new Date(iso), level: "MONTHLY", index: 0, total: 1 }) as never;
  const dated = (iso: string) => (withDates("day-chart", { span: "month" }, at(iso)) as { monthDays?: number }).monthDays;
  check(dated("2027-02-01T00:00:00Z") === 28 && dated("2028-02-01T00:00:00Z") === 29 && dated("2026-09-01T00:00:00Z") === 30, "a dated page gives its month's own length");
  check((withoutDates("day-chart", { monthDays: 30 }) as { monthDays?: unknown }).monthDays === null, "an undated page has no month length");
  check((withWeekStart("day-chart", {}, 1) as { weekStartDay?: number }).weekStartDay === 1, "the journal's week start reaches it");
}

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

// --- one day wide, faces: no slack before them, Sunday and Saturday even ------------
// "take slight extra space before smileys and add it so S first day Sunday is
// same distance from border on its left and S Saturday last day is from the
// border on its right" (2026-10-02).
{
  const chart = draw({ heading: "Mood", levels: ["😃", "🙂", "😐", "😞", "😢"], span: "week", look: "dots" }, 6);
  const head = ids(chart, /-l0-face-head$/)[0];
  const axis = ids(chart, /-axis-y$/)[0];
  const boxLeft = PAGE.marginPx + PAGE.boxInsetPx;
  const boxRight = PAGE.marginPx + 6 * CELL - PAGE.boxInsetPx;
  const before = (head?.x ?? 0) - boxLeft;
  const after = (axis?.x ?? 0) - ((head?.x ?? 0) + (head?.width ?? 0));
  check(Math.abs(before - after) < 1.5, `the faces sit as far from the border as from the axis (${before.toFixed(1)} and ${after.toFixed(1)})`);
  const days = ids(chart, /-d\d-label$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
  const axisX = (axis?.x ?? 0) + (axis?.width ?? 0) / 2;
  check(
    Math.abs(days[0] - axisX - (boxRight - days[6])) < 0.5,
    `Sunday is as far from the axis as Saturday from the border (${(days[0] - axisX).toFixed(1)} and ${(boxRight - days[6]).toFixed(1)})`
  );
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

// --- the label column and the days (2026-10-02) --------------------------------
// The labels take exactly what they need and the days share the rest to the
// border, each end half a day from its edge: no slack before the labels, at
// any width, whatever the scale.
{
  const scales: Array<[string, string[]]> = [
    ["words", ["Great", "Good", "Okay", "Low", "Awful"]],
    ["faces", ["😃", "🙂", "😐", "😞", "😢"]],
    ["bolts", ["⚡⚡⚡", "⚡⚡", "⚡", "⚡½", "⚡○"]],
    ["bedtimes", ["🌕 9PM", "🌖 10PM", "🌗 11PM", "🌘 12AM", "🌒 1AM", "🌑 2AM"]],
  ];
  const pad = (4 * 300) / 72;
  for (const columns of [24, 18, 12, 6]) {
    for (const [what, levels] of scales) {
      const chart = draw({ heading: "Chart", levels, span: "week", look: "dots" }, columns, levels.length + 3);
      const boxLeft = PAGE.marginPx + PAGE.boxInsetPx;
      const boxRight = PAGE.marginPx + columns * CELL - PAGE.boxInsetPx;
      const axis = ids(chart, /-axis-y$/)[0];
      const axisX = (axis?.x ?? 0) + (axis?.width ?? 0) / 2;
      const days = ids(chart, /-d\d-label$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
      check(
        days.length === 7 && Math.abs(days[0] - axisX - (boxRight - days[6])) < 0.5,
        `${what} at ${columns}: Sunday as far from the axis as Saturday from the border (${(days[0] - axisX).toFixed(1)}, ${(boxRight - days[6]).toFixed(1)})`
      );
      if (what !== "words") {
        // The symbols' left edge: one padding in from the border, no more.
        const lefts = ids(chart, /-l\d-(face-head|sym-[a-z]+0?)$/).map((e) => e.x ?? 0);
        const before = Math.min(...lefts) - boxLeft;
        check(Math.abs(before - pad) < 1.5, `${what} at ${columns}: nothing but the padding before the symbols (${before.toFixed(1)}px, padding ${pad.toFixed(1)})`);
      }
    }
  }
  const half = texts(draw({ ...mood, span: "week" }, 12), /-l\d-label$/);
  check(half.join(",") === "Great,Good,Okay,Low,Awful", `a half-page week keeps its level labels whole (got ${half.join(",")})`);
  // A month's 31 days as well.
  const chart = draw({ ...mood, span: "month", look: "ruled" }, 24);
  const axis = ids(chart, /-axis-y$/)[0];
  const monthDays = ids(chart, /-d\d+-label$/).map((e) => (e.x ?? 0) + (e.width ?? 0) / 2);
  const axisX = (axis?.x ?? 0) + (axis?.width ?? 0) / 2;
  const border = PAGE.marginPx + 24 * CELL - PAGE.boxInsetPx;
  check(
    Math.abs(monthDays[0] - axisX - (border - monthDays[monthDays.length - 1])) < 0.5,
    `a month's first day is as far from the axis as its last from the border (${(monthDays[0] - axisX).toFixed(1)} and ${(border - monthDays[monthDays.length - 1]).toFixed(1)})`
  );
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

// --- what runs along the bottom, dated (2026-10-02) ---------------------------
{
  type Dated = { weekDates?: number[] | null; weeksInMonth?: number | null };
  const on = (level: string, iso: string, weekStartDay = 0) =>
    withDates("day-chart", { weekStartDay }, { key: null, label: "", start: new Date(iso), level, index: 0, total: 1 } as never) as Dated;
  // 4 October 2026 is a Sunday.
  check(on("WEEKLY", "2026-10-04T00:00:00Z").weekDates?.join(",") === "4,5,6,7,8,9,10", `a week page's dates are its own (got ${on("WEEKLY", "2026-10-04T00:00:00Z").weekDates})`);
  check(on("WEEKLY", "2026-10-05T00:00:00Z", 1).weekDates?.join(",") === "5,6,7,8,9,10,11", `a Monday journal's week runs Monday to Sunday`);
  check(on("DAILY", "2026-10-07T00:00:00Z").weekDates?.join(",") === "4,5,6,7,8,9,10", `a day page charts the week around the day (got ${on("DAILY", "2026-10-07T00:00:00Z").weekDates})`);
  check(on("DAILY", "2026-10-31T00:00:00Z").weekDates?.join(",") === "25,26,27,28,29,30,31", "a week ending on the month's last day");
  check(on("DAILY", "2026-11-01T00:00:00Z", 1).weekDates?.join(",") === "26,27,28,29,30,31,1", "a week running over into the next month");
  check(on("MONTHLY", "2026-10-01T00:00:00Z").weekDates === null, "a month page has no one week's dates");
  // October 2026 starts on a Thursday; February 2026 on a Sunday; August on a Saturday.
  check(on("MONTHLY", "2026-10-01T00:00:00Z").weeksInMonth === 5, "October 2026 runs across five weeks");
  check(on("MONTHLY", "2026-02-01T00:00:00Z").weeksInMonth === 4, "February 2026, Sunday first, fits four");
  check(on("MONTHLY", "2026-02-01T00:00:00Z", 1).weeksInMonth === 5, "and five when the week starts on Monday");
  check(on("MONTHLY", "2026-08-01T00:00:00Z").weeksInMonth === 6, "August 2026 runs across six");
  const undated = withoutDates("day-chart", { weekDates: [1, 2, 3, 4, 5, 6, 7], weeksInMonth: 6 }) as Dated;
  check(undated.weekDates === null && undated.weeksInMonth === null, "an undated page has neither");
  // And the drawing reads them.
  const dates = texts(draw({ ...mood, along: "dates", weekDates: [28, 29, 30, 31, 1, 2, 3] }), /-d\d-label$/);
  check(dates.join(",") === "28,29,30,31,1,2,3", `the week's dates along the bottom (got ${dates.join(",")})`);
  check(texts(draw({ ...mood, along: "dates" }), /-d\d-label$/).length === 0, "a template's dates are left to be written in");
  const weeks = texts(draw({ ...mood, along: "weeks", weeksInMonth: 6 }, 24), /-d\d-label$/);
  check(weeks.length === 6 && weeks[5] === "WEEK 6", `six weeks where the month runs across six (got ${weeks.join(",")})`);
  check(texts(draw({ ...mood, along: "weeks" }, 24), /-d\d-label$/).length === 5, "five on a template");
}

// --- the fill (2026-10-02) ------------------------------------------------------
// "scale but at a cetain point jump and add a row of dots inbetween each
// symbol row and scale again from there". A chart taller than its floor
// leaves nothing empty under its days; its levels spread evenly; with a cell
// for a row between each pair, a row of dots goes in, every row a cell again.
{
  const boxBottom = (rowSpan: number) => PAGE.marginPx + rowSpan * CELL - PAGE.boxInsetPx;
  const centreY = (e: RenderedPolotnoElement) => (e.y ?? 0) + (e.height ?? 0) / 2;
  let lastSpacing = 0;
  for (let rowSpan = 7; rowSpan <= 22; rowSpan++) {
    const chart = draw({ ...mood, span: "week", look: "dots" }, 12, rowSpan);
    // The axis under the plot is a cell above the box's foot: the day names
    // fill that cell and nothing is left under them.
    const axisX = ids(chart, /-axis-x$/)[0];
    check(
      !!axisX && Math.abs(centreY(axisX) - (boxBottom(rowSpan) + PAGE.boxInsetPx - CELL)) < 0.5,
      `${rowSpan} rows: the plot runs down to the day names' cell (axis at ${axisX ? centreY(axisX).toFixed(1) : "none"})`
    );
    // The levels evenly apart, and further apart the taller the chart.
    const levels = ids(chart, /-d0-l\d$/).map(centreY);
    const gaps = levels.slice(1).map((y, i) => y - levels[i]);
    check(gaps.length === 4 && gaps.every((g) => Math.abs(g - gaps[0]) < 0.01), `${rowSpan} rows: the levels are evenly spaced (${gaps.map((g) => g.toFixed(1)).join(", ")})`);
    check(gaps[0] >= lastSpacing - 0.01, `${rowSpan} rows: the levels are no closer than one row shorter (${gaps[0].toFixed(1)} after ${lastSpacing.toFixed(1)})`);
    lastSpacing = gaps[0];
    // Rows between the levels: none until there is a cell for each, then one
    // (from 11 rows: nine cells of plot for five levels and four between),
    // then two (from 15), then three (from 19).
    const between = ids(chart, /-d0-l\dh\d$/).length;
    const expected = rowSpan >= 19 ? 12 : rowSpan >= 15 ? 8 : rowSpan >= 11 ? 4 : 0;
    check(between === expected, `${rowSpan} rows: ${expected} rows of dots between the levels (got ${between})`);
  }
  // At a jump every row is a cell again, so a ruled chart's rules are back on
  // the lattice; between jumps they share the height evenly.
  for (const rowSpan of [7, 11, 15]) {
    const ruled = draw({ ...mood, span: "week", look: "ruled" }, 12, rowSpan);
    const off = ids(ruled, /-rule$/).filter((e) => !onLattice(centreY(e)));
    check(off.length === 0, `${rowSpan} rows (a jump): every rule on the lattice (off: ${off.map((e) => e.id).join(", ")})`);
  }
  const stretched = ids(draw({ ...mood, span: "week", look: "ruled" }, 12, 9), /-l\d-rule$/).map(centreY);
  const pitches = stretched.slice(1).map((y, i) => y - stretched[i]);
  check(pitches.length === 3 && pitches.every((p) => Math.abs(p - (7 * CELL) / 5) < 0.01), `9 rows: the ruled bands share seven cells five ways (${pitches.map((p) => p.toFixed(1)).join(", ")})`);
  // A box too short for its levels still draws the top ones a cell apart.
  const short = ids(draw(mood, 12, 5), /-d0-l\d$/).map(centreY);
  check(short.length === 3 && Math.abs(short[1] - short[0] - CELL) < 0.01, "a box too short keeps a cell a level");
}

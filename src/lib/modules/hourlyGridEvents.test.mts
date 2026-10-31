// Calendar events on the hour grid: the all-day band, and what it must not
// disturb; and with increments off, the list that takes their place.
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

import { renderHourlyGridCore, EVENT_PRINT_GREY, type HourlyGridEvent } from "./hourlyGridCore";
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
  // The shipped planner's own setting (HOUR_DEFAULTS in pageLayouts). Without
  // it the time-label boxes are not drawn at all, and the overlap assertion
  // below has nothing to measure against - which is how it first reported
  // "no time labels were drawn, so this proves nothing" rather than passing
  // vacuously.
  hourLineStyle: "full",
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

// --- a timed event clears the time-of-day labels --------------------------
//
// Reported 2026-09-27: "indent the ones over the hours to make it so their
// text doesn't over lap with the time of day text". The block was drawn from
// the column's left edge, and the time labels live in a box
// TIME_LABEL_BOX_WIDTH_PT wide at exactly that edge - so the event, and its
// own 6pt label four pixels further in, sat on top of "8:30".
//
// Stated against the LABEL BOX the grid actually draws rather than against
// the inset constant, so it stays true if either moves.
{
  const marks = render([
    { day: 1, startTime: "09:00", endTime: "10:30", label: "Office Hours", source: "manual" },
  ]);
  const labelBoxes = marks.filter((e) => /d1-r\d+-label-box$/.test(String(e.id)));
  const timeTexts = marks.filter((e) => /d1-r\d+-time$/.test(String(e.id)));
  const box = marks.find((e) => String(e.id).includes("d1-ev") && String(e.id).endsWith("-box"));
  const label = marks.find((e) => String(e.id).includes("d1-ev") && String(e.id).endsWith("-label"));

  check(labelBoxes.length > 0 && timeTexts.length > 0, "no time labels were drawn, so this proves nothing");
  if (box && labelBoxes.length > 0) {
    const labelRight = Math.max(...labelBoxes.map((e) => Number(e.x) + Number(e.width)));
    check(
      Number(box.x) >= labelRight,
      `the event block starts at ${Number(box.x).toFixed(1)}, inside the time-label column that ends at ${labelRight.toFixed(1)}`
    );
    const textRight = Math.max(...timeTexts.map((e) => Number(e.x) + Number(e.width)));
    check(
      Number(label?.x) >= textRight,
      `the event's own label starts at ${Number(label?.x).toFixed(1)}, over time text ending at ${textRight.toFixed(1)}`
    );
    // And it still has somewhere to say its name.
    check(Number(box.width) > 200, `the indent left only ${Number(box.width).toFixed(0)}px for the event`);
  }
}

// --- every event block is rounded, and never a lozenge ---------------------
{
  const long = render([{ day: 0, startTime: "09:00", endTime: "12:00", label: "Studio", source: "manual" }]);
  const short = render([{ day: 0, startTime: "09:00", endTime: "09:15", label: "Standup", source: "manual" }]);
  const boxOf = (marks: El[]) => marks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));
  const longBox = boxOf(long);
  const shortBox = boxOf(short);

  check(Number(longBox?.cornerRadius) > 0, "a timed event has square corners");
  check(
    Number(shortBox?.cornerRadius) <= Number(shortBox?.height) / 2 + 0.001,
    `a ${Number(shortBox?.height).toFixed(1)}px event took a ${Number(shortBox?.cornerRadius).toFixed(1)}px radius - ` +
      `more than half its height, which is a lozenge rather than a rounded rectangle`
  );
  // The band and the hours are one visual family: same radius rule, same
  // opacity. Reading as two treatments would be the defect.
  const band = render([allDay(0, "Thanksgiving")]).find((e) => e.id === "t-d0-allday-box");
  check(
    Number(band?.opacity) === Number(longBox?.opacity),
    `the band is ${band?.opacity} and a timed event ${longBox?.opacity}; they should match`
  );
}

// --- the print grey survives a press -------------------------------------
//
// EVENT_PRINT_GREY and the opacity an event is drawn at are set in different
// places and neither means anything alone: what a press has to hold is the
// COMPOSITE. #e6e6e6 at full strength is a 10% tint and unremarkable; at the
// 0.55 the blocks are drawn at it is 5.4%, which is near the bottom of what
// offset reliably reproduces.
//
// So this reads the opacity off a real element rather than importing a
// constant, and checks the tint that lands on paper. Drop the opacity to
// make the blocks subtler on screen and this says what it cost in print.
{
  const marks = render([{ day: 0, startTime: "09:00", endTime: "10:00", label: "Call home", source: "manual" }]);
  const box = marks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));
  const opacity = Number(box?.opacity);
  const grey = parseInt(EVENT_PRINT_GREY.slice(1, 3), 16);
  const onWhite = 255 - opacity * (255 - grey);
  const tint = (100 * (255 - onWhite)) / 255;

  check(opacity > 0 && opacity <= 1, `an event block's opacity is ${opacity}`);
  check(
    tint >= 4,
    `the print grey lands as a ${tint.toFixed(1)}% tint, under the ~4% an offset press holds - it can drop out ` +
      `entirely. Raise EVENT_OPACITY or darken EVENT_PRINT_GREY.`
  );
  check(
    tint <= 12,
    `the print grey lands as a ${tint.toFixed(1)}% tint, heavy enough to read as a slab under handwriting`
  );
}

// --- an event's writing can be read on its own block ----------------------
//
// "make it a darker version of the background color" - so the ink is the
// fill taken toward black, which keeps the hue but is only legible if it
// goes far enough. eventInk darkens UNTIL it meets a ratio rather than
// applying a fixed factor, because a fixed one that suits the two pastels
// shipped today would fail on whatever colour somebody's calendar turns out
// to be. This checks the ratio it promises, against the backdrop the block
// actually composites to - the fill at its own opacity over paper, not the
// fill itself.
{
  const PAPER = [253, 252, 249];
  const lum = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

  for (const fill of ["#cfe3ff", "#ffe9b3", "#e6e6e6", "#ffd8d8", "#d4f7d4"]) {
    const marks = render([
      { day: 0, startTime: "09:00", endTime: "10:00", label: "Call home", source: "manual", colour: fill },
    ]);
    const box = marks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));
    const label = marks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-label"));
    const opacity = Number(box?.opacity);
    const backdrop = rgb(fill).map((v, i) => opacity * v + (1 - opacity) * PAPER[i]);
    const got = ratio(rgb(String(label?.fill)), backdrop);
    // WCAG AA for normal text, asserted as the FLOOR rather than as whatever
    // the module currently targets - so lowering that target to make the ink
    // closer to the fill fails here rather than passing quietly.
    check(
      got >= 4.5,
      `${fill}: its ink ${label?.fill} reads at ${got.toFixed(1)}:1 on its own block, under WCAG AA's 4.5:1 ` +
        `for 5pt type on paper`
    );
    check(
      String(box?.stroke) !== "none" && String(box?.stroke) !== String(label?.fill),
      `${fill}: the border should be its own weight, not "none" and not the same as the ink`
    );
  }
}

// --- the ink and the border are the SAME COLOUR, darker ------------------
//
// THIS IS THE ASSERTION THE SUITE WAS MISSING. Andrew: "text and border dont
// look like event color but darker". They did not - the first version
// darkened by multiplying the channels toward black, which preserves their
// RATIOS and throws saturation away. #cfe3ff is a fully saturated blue that
// happens to be very light (H 215, S 100%, L 90.6%); scaled to 35% it lands
// at S 10.6%, a grey.
//
// And every test passed. The contrast check was satisfied - a grey meets 7:1
// perfectly well - so the whole suite was green on a defect a glance caught.
// Restoring the scaling sabotage now fails here and nowhere else.
{
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const toHsl = (hex: string) => {
    const [r, g, b] = rgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
    return { h: h * 360, s, l };
  };
  /** Hue is circular: 359 and 1 are two degrees apart, not 358. */
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

  for (const fill of ["#cfe3ff", "#ffe9b3", "#ffd8d8", "#d4f7d4"]) {
    const marks = render([
      { day: 0, startTime: "09:00", endTime: "10:00", label: "Call home", source: "manual", colour: fill },
    ]);
    const box = marks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));
    const label = marks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-label"));
    const source = toHsl(fill);
    for (const [what, hex] of [["ink", String(label?.fill)], ["border", String(box?.stroke)]] as const) {
      const derived = toHsl(hex);
      check(
        hueGap(derived.h, source.h) < 2,
        `${fill}: its ${what} ${hex} is hue ${derived.h.toFixed(0)}, not the fill's ${source.h.toFixed(0)} - ` +
          `it is a different colour rather than a darker one`
      );
      check(
        derived.s >= source.s * 0.9,
        `${fill}: its ${what} ${hex} is ${(derived.s * 100).toFixed(0)}% saturated against the fill's ` +
          `${(source.s * 100).toFixed(0)}% - darkening has washed the colour out to grey`
      );
      check(
        derived.l < source.l,
        `${fill}: its ${what} ${hex} is lighter than the fill, not darker`
      );
    }
  }

  // A NEUTRAL fill stays neutral. An early saturation floor put a red cast on
  // the print grey: hue 0 is what a grey reports by convention, not a choice,
  // and 5% of hue 0 is pink.
  const greyMarks = render([
    { day: 0, startTime: "09:00", endTime: "10:00", label: "Call home", source: "manual", colour: "#e6e6e6" },
  ]);
  const greyInk = String(greyMarks.find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-label"))?.fill);
  check(toHsl(greyInk).s < 0.02, `a neutral fill's ink ${greyInk} is ${(toHsl(greyInk).s * 100).toFixed(0)}% saturated`);
}

// --- concurrent events stack horizontally ---------------------------------
//
// Andrew, 2026-09-27: "concurrent events should stack horizontally". Drawn
// at full width in arrival order the later of two clashing events lies over
// the earlier one and hides where it ends, which is what the proof showed.
//
// The two clauses that are easy to get wrong are the last two: touching is
// not overlapping, and a cluster is not a day.
{
  const timed = (start: string, end: string, label: string) => ({
    day: 0,
    startTime: start,
    endTime: end,
    label,
    source: "manual" as const,
  });
  const boxes = (events: HourlyGridEvent[]) =>
    render(events)
      .filter((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"))
      .map((e) => ({ x: Number(e.x), w: Number(e.width) }))
      .sort((a, b) => a.x - b.x);

  const full = boxes([timed("09:00", "10:00", "Alone")])[0];

  // Two that share half an hour: side by side, each about half the track.
  const pair = boxes([timed("09:30", "11:00", "Studio"), timed("10:30", "12:00", "Advisor")]);
  check(pair.length === 2, `expected 2 blocks, got ${pair.length}`);
  check(
    pair[0].w < full.w * 0.55 && pair[1].w < full.w * 0.55,
    `clashing blocks should each take about half the track; got ${pair[0].w.toFixed(0)} and ` +
      `${pair[1].w.toFixed(0)} against a full ${full.w.toFixed(0)}`
  );
  check(
    pair[0].x + pair[0].w <= pair[1].x + 0.01,
    `the two blocks overlap horizontally: ${pair[0].x.toFixed(0)}+${pair[0].w.toFixed(0)} runs into ${pair[1].x.toFixed(0)}`
  );
  check(pair[1].x > pair[0].x, "the second block should sit to the right of the first");

  // Three at once: three columns, not two.
  const triple = boxes([timed("09:00", "12:00", "A"), timed("09:30", "10:30", "B"), timed("10:00", "11:00", "C")]);
  check(triple.length === 3 && triple[2].w < full.w * 0.4, `three clashing events should give three columns`);

  // TOUCHING IS NOT OVERLAPPING. One ending at 10:00 and one starting at
  // 10:00 share no minute, and halving both for that would punish a day of
  // back-to-back meetings - the commonest shape there is.
  //
  // TWO GUARDS SIT BEHIND THIS, IN SERIES, and it matters for anyone
  // sabotaging it later: the cluster split (`span.from >= clusterEnd`)
  // separates consecutive events before the column assignment ever sees
  // them, and the column assignment (`end <= span.from`) would reuse the
  // column anyway. Breaking EITHER one alone leaves this green - verified,
  // both ways. Breaking both together reports "consecutive events were
  // split: widths 254, 258 against a full 517". The assertion is on the
  // outcome, which is the thing worth holding; it just cannot tell you which
  // of the two is carrying it.
  const consecutive = boxes([timed("09:00", "10:00", "A"), timed("10:00", "11:00", "B")]);
  check(
    consecutive.every((b) => Math.abs(b.w - full.w) < 0.01),
    `consecutive events were split: widths ${consecutive.map((b) => b.w.toFixed(0)).join(", ")} against a full ${full.w.toFixed(0)}`
  );

  // A CLUSTER IS NOT A DAY. A morning clash must not narrow an unrelated
  // afternoon event.
  const mixed = boxes([timed("09:00", "10:00", "A"), timed("09:30", "10:30", "B"), timed("12:00", "12:30", "Solo")]);
  const widest = mixed.reduce((a, b) => (b.w > a.w ? b : a));
  check(
    Math.abs(widest.w - full.w) < 0.01,
    `the afternoon event was narrowed by a morning clash: ${widest.w.toFixed(0)} against a full ${full.w.toFixed(0)}`
  );
}

// --- blocks are held off the hour lines, by default ----------------------
//
// Chosen 2026-09-27 by drawing it beside the flush version at true size.
// The margin is half the distance the page already leaves between two
// adjacent modules - every ink box is inset 6px from its allocation, so
// neighbours sit 12px apart and half of that is 6px = 1.44pt at 300dpi.
//
// Asserted as the DEFAULT rather than as an option, because that is the
// decision: a caller has to pass zero to get the old flush blocks.
{
  const one = [{ day: 0, startTime: "09:00", endTime: "10:00", label: "Standup", source: "manual" as const }];
  const withMargin = render(one).find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));
  const flush = flat(
    renderHourlyGridCore(GEOMETRY, { ...BASE, eventVerticalMarginPt: 0, events: one } as never, "t", FONT_SERIF) as unknown as El[]
  ).find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));

  check(
    Number(withMargin?.y) > Number(flush?.y),
    "the default should hold a block off the hour line; it is drawn flush"
  );
  const gap = Number(withMargin?.y) - Number(flush?.y);
  check(
    Math.abs(gap - 6) < 0.01,
    `the margin should be 6px - half the 12px between two adjacent modules - and is ${gap.toFixed(2)}px`
  );
  check(
    Math.abs(gap - (Number(flush?.height) - Number(withMargin?.height)) / 2) < 0.01,
    "the margin should be equal above and below"
  );

  // Never more than a third of the block, or a quarter-hour event would be
  // margin with nothing inside it.
  const tiny = flat(
    renderHourlyGridCore(
      GEOMETRY,
      { ...BASE, eventVerticalMarginPt: 20, events: [{ ...one[0], endTime: "09:15" }] } as never,
      "t",
      FONT_SERIF
    ) as unknown as El[]
  ).find((e) => String(e.id).includes("-ev") && String(e.id).endsWith("-box"));
  check(Number(tiny?.height) > 0, `an absurd margin left a block of ${Number(tiny?.height).toFixed(1)}px`);
}

// --- with increments off, a day LISTS its events --------------------------
//
// Audit 2026-10-29: with increments off there are no hours to draw an event
// against, and the renderer dropped them all, the all-day band too. The ADHD
// day, the rapid log and the mindful, language and Tao weeks are all off, and
// month pages print no events, so in those planners the person's calendar
// never reached the book. Now each day lists its own at the top of its
// column, one line to a dot row, and its dots start under the list.
//
// On a real lattice, because that is the only place the list and the dots
// can collide: allocation 187.5 on a 75px pitch, inset 6, 20 dots tall.
{
  const LATTICE = { pitchPx: 75, originX: 187.5, originY: 187.5, insetPx: 6 };
  const OFF_GEOMETRY = { x: 193.5, y: 193.5, width: 1788, height: 1488 };
  const OFF = { ...BASE, intervalMode: "off", offModeRule: "dotted" };
  const renderOff = (events: HourlyGridEvent[], extra: Record<string, unknown> = {}, geometry = OFF_GEOMETRY) =>
    flat(renderHourlyGridCore(geometry, { ...OFF, ...extra, events } as never, "t", FONT_SERIF, LATTICE) as unknown as El[]);
  const linesOf = (marks: El[], day: number) =>
    marks.filter((e) => e.type === "text" && new RegExp(`^t-d${day}-(allday-line|ev.+-line|events-more)`).test(e.id)).sort((a, b) => Number(a.y) - Number(b.y));
  const dots = (marks: El[]) => marks.filter((e) => e.id.startsWith("t-dot-"));

  const week: HourlyGridEvent[] = [
    { day: 1, startTime: "14:30", endTime: "15:30", label: "Gym", source: "manual", id: "gym1" },
    { day: 1, startTime: "09:00", endTime: "10:00", label: "Dentist", source: "manual", id: "dent1" },
    allDay(1, "Bin day"),
    // Past this column's midnight: it belongs to the next morning's column.
    { day: 1, startTime: "25:30", endTime: "26:00", label: "Late train", source: "manual", id: "late1" },
  ];

  // An empty week is the dot field it always was, and nothing else.
  const empty = renderOff([]);
  check(linesOf(empty, 0).length + linesOf(empty, 1).length + linesOf(empty, 2).length === 0, "an empty week with increments off drew event lines");

  const marks = renderOff(week);
  const lines = linesOf(marks, 1);
  const texts = lines.map((e) => String(e.text));
  check(
    texts.join(" | ") === "Bin day | 9am Dentist | 2:30pm Gym",
    `a day with increments off should list "Bin day | 9am Dentist | 2:30pm Gym", top to bottom, got "${texts.join(" | ")}"`
  );
  check(!texts.some((t) => t.includes("Late train")), "an event past the column's midnight was listed in the evening before as well");
  check(linesOf(marks, 0).length === 0 && linesOf(marks, 2).length === 0, "another day's events were listed in the wrong column");
  check(
    lines.some((e) => e.id === "t-d1-evdent1-line"),
    `a listed event should be drawn under its key (t-d1-evdent1-line) so the editor can find it, got ${lines.map((e) => e.id).join(", ")}`
  );
  // The 24-hour clock writes its own five characters.
  const h24 = linesOf(renderOff(week, { timeFormat: "24" }), 1).map((e) => String(e.text));
  check(h24.includes("09:00 Dentist") && h24.includes("14:30 Gym"), `the 24-hour clock should list "09:00 Dentist", got ${h24.join(", ")}`);

  // Legible, grey, inside the day's own column.
  const header = marks.find((e) => e.id === "t-d1-header-box")!;
  for (const line of lines) {
    check(Number(line.fontSize) >= ptToPx(5) - 0.01, `"${line.text}" is set at ${(Number(line.fontSize) / ptToPx(1)).toFixed(2)}pt, under the 5pt floor`);
    check(String(line.fill) !== "#000000" && line.fill !== undefined, `"${line.text}" should be grey, like a time label, not ${line.fill}`);
    check(
      Number(line.x) >= Number(header.x) && Number(line.x) + Number(line.width) <= Number(header.x) + Number(header.width) + 0.01,
      `"${line.text}" runs outside its day's column`
    );
  }
  // The first line sits under the day tab, in the gap the band takes with
  // increments on, and every line in order one dot row apart.
  const tabBottom = Number(header.y) + Number(header.height);
  check(Number(lines[0]?.y) > tabBottom, `the first line starts at ${Number(lines[0]?.y).toFixed(1)}, on the day tab ending ${tabBottom.toFixed(1)}`);
  const steps = lines.slice(1).map((e, i) => Number(e.y) - Number(lines[i].y));
  check(steps.every((s) => Math.abs(s - LATTICE.pitchPx) < 0.01), `the lines should be one dot row apart, are ${steps.map((s) => s.toFixed(1)).join(", ")}`);

  // NO DOT UNDER A LINE. The dots in that column start below the list; the
  // other columns keep their whole field.
  const field = dots(marks);
  const struck = field.filter((dot) =>
    lines.some(
      (line) =>
        Number(dot.x) + Number(dot.width) > Number(line.x) &&
        Number(dot.x) < Number(line.x) + Number(line.width) &&
        Number(dot.y) + Number(dot.height) > Number(line.y) &&
        Number(dot.y) < Number(line.y) + Number(line.height)
    )
  );
  check(struck.length === 0, `${struck.length} dot(s) drawn through the listed events: ${struck.map((d) => d.id).join(", ")}`);
  const inColumn = (dot: El, day: number) => {
    const tab = marks.find((e) => e.id === `t-d${day}-header-box`)!;
    const cx = Number(dot.x) + Number(dot.width) / 2;
    return cx > Number(tab.x) && cx < Number(tab.x) + Number(tab.width);
  };
  check(
    dots(empty).filter((d) => inColumn(d, 0)).length === field.filter((d) => inColumn(d, 0)).length,
    "a day with nothing listed lost dots to its neighbour's list"
  );
  check(
    field.filter((d) => inColumn(d, 1)).length === dots(empty).filter((d) => inColumn(d, 1)).length - 2 * 7,
    `three lines should take two dot rows (seven dots each) from the day's field: ` +
      `${dots(empty).filter((d) => inColumn(d, 1)).length} became ${field.filter((d) => inColumn(d, 1)).length}`
  );

  // More than fit are counted, inside the block. Four dots tall holds three
  // lines (one in the tab's gap, two below), so five events show two and count three.
  const short = { ...OFF_GEOMETRY, height: 4 * 75 - 12 };
  const many = ["A", "B", "C", "D", "E"].map((label, k) => ({
    day: 0, startTime: `0${k + 1}:00`, endTime: `0${k + 1}:30`, label, source: "manual" as const, id: `m${k}`,
  }));
  const crowded = linesOf(renderOff(many, {}, short), 0);
  check(
    crowded.map((e) => String(e.text)).join(" | ") === "1am A | 2am B | +3 more",
    `five events in three rows should read "1am A | 2am B | +3 more", got "${crowded.map((e) => String(e.text)).join(" | ")}"`
  );
  const last = crowded[crowded.length - 1];
  check(
    Number(last?.y) + Number(last?.height) <= short.y + short.height + LATTICE.insetPx,
    "the last listed line runs past the foot of the block"
  );
  // At its two-dot minimum the block still says something rather than nothing.
  const tiny = linesOf(renderOff(many, {}, { ...OFF_GEOMETRY, height: 2 * 75 - 12 }), 0);
  check(tiny.length === 1 && String(tiny[0].text) === "5 events", `a two-dot block should say "5 events", got "${tiny.map((e) => e.text).join(" | ")}"`);

  // With increments ON nothing is listed: the hours and the band carry them.
  const on = flat(renderHourlyGridCore(OFF_GEOMETRY, { ...BASE, events: week } as never, "t", FONT_SERIF, LATTICE) as unknown as El[]);
  check(linesOf(on, 1).length === 0, "with increments on, events were listed as well as drawn on the hours");
}

if (failures > 0) {
  console.error(`\nHourly grid events: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  "All hourly grid event checks passed (an empty week is untouched; the band is 14pt, centred in the " +
    "22.3pt gap, rounded, and counts what it cannot fit; with increments off each day lists its own events above its dots)."
);

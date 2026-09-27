// Calendar events at true size, beside a week with none.
//
// There is no editor UI yet, so this is where events can be SEEN. It draws
// the real renderer, not a mock-up: the same renderHourlyGridCore the canvas,
// the previews and the PDF all go through.
//
// Four blocks, and the first is the point of the exercise:
//
//   1. no events   - the control. The all-day band draws only when something
//                    is in it, so this must be identical to a week drawn
//                    before any of this existed. If block 1 differs from what
//                    is on paper today, the band is costing every planner
//                    something for nothing.
//   2. colour      - what the editor shows.
//   3. grey, light
//   4. grey, darker
//
// 3 and 4 exist because "colour on screen, grey in print" was settled in a
// sentence and the weight of that grey was not. A tint that reads on a screen
// can vanish on paper or turn into a grey slab; the two are drawn here at the
// size they print so the choice is made by looking, not by naming a hex.
//
// TRUE SIZE MEANS TRUE SIZE - 300px to the inch drawn at 96 CSS px to the
// inch. The second row repeats everything at 3x because a 6pt label and a
// 0.3pt rule are both under a device pixel at true size, and a weight you
// cannot see is a weight you cannot judge (the same reason undatedProof has
// its magnified row).
//
//   npm run check:events   ->   public/events-proof.html
import { writeFileSync } from "node:fs";
import { renderHourlyGridCore, EVENT_PRINT_GREY, type HourlyGridEvent } from "./modules/hourlyGridCore.js";
import { toSvg, escapeXml, PROOF_FONT_LINK, PROOF_FONT_STYLE } from "./proofSvg.js";
import type { RenderedPolotnoElement } from "./renderModuleInstance.js";

const PX_PER_IN = 300;
const CSS_PX_PER_IN = 96;
/** The page's real lattice - a rule snapped to it lands where it will print. */
const LATTICE = { pitchPx: 75, originX: 0, originY: 0, insetPx: 6 };

/** The left page's hours: 18 of 24 columns over a 6in text block = 4.5in for
 *  three days, which is the 1.5in day column the reference measures. */
const DAYS = 3;
const BLOCK_W = 4.5 * PX_PER_IN;
const BLOCK_H = 1.6 * PX_PER_IN;

type Treatment = { key: string; label: string; blurb: string; recolour?: string };

const TREATMENTS: Treatment[] = [
  {
    key: "none",
    label: "No events",
    blurb: "the control - a week with nothing all-day must be identical to one drawn before the band existed",
  },
  { key: "colour", label: "Colour", blurb: "what the editor shows: the calendar's own colour" },
  // The bracket the choice was made from, and the choice, so it can be
  // confirmed in context rather than in isolation. The percentages are the
  // EFFECTIVE tint on white once EVENT_OPACITY is applied - which is what a
  // press actually has to hold, and is not what the hex says.
  { key: "grey-light", label: "Grey, light", blurb: "#ececec - a 4.1% tint. Considered and rejected: reads as nothing.", recolour: "#ececec" },
  { key: "grey-chosen", label: "Grey, CHOSEN", blurb: `${EVENT_PRINT_GREY} - a 5.4% tint. "in between but closer to the light grey".`, recolour: EVENT_PRINT_GREY },
  { key: "grey-dark", label: "Grey, darker", blurb: "#d8d8d8 - an 8.4% tint. Considered and rejected: a slab.", recolour: "#d8d8d8" },
];

/** A realistic week: a holiday, a day with two all-day things, and timed
 *  events of the lengths people actually book. */
function eventsFor(treatment: Treatment): HourlyGridEvent[] {
  if (treatment.key === "none") return [];
  const colour = (own: string) => treatment.recolour ?? own;
  return [
    { day: 0, startTime: "00:00", endTime: "23:59", label: "Thanksgiving", source: "google-calendar", allDay: true, colour: colour("#cfe3ff") },
    { day: 0, startTime: "09:00", endTime: "10:00", label: "Call home", source: "manual", colour: colour("#ffe9b3") },
    // Two all-day items in one day: the band counts what it cannot fit.
    { day: 1, startTime: "00:00", endTime: "23:59", label: "Andrew's birthday", source: "manual", allDay: true, colour: colour("#ffe9b3") },
    { day: 1, startTime: "00:00", endTime: "23:59", label: "Bin day", source: "manual", allDay: true, colour: colour("#ffe9b3") },
    { day: 1, startTime: "08:30", endTime: "10:00", label: "Office Hours", source: "google-calendar", colour: colour("#cfe3ff") },
    { day: 1, startTime: "11:00", endTime: "11:30", label: "Dentist", source: "manual", colour: colour("#ffe9b3") },
    { day: 2, startTime: "09:30", endTime: "12:00", label: "MAE342 studio", source: "google-calendar", colour: colour("#cfe3ff") },
  ];
}

function block(treatment: Treatment): { elements: RenderedPolotnoElement[]; w: number; h: number } {
  const elements = renderHourlyGridCore(
    { x: 0, y: 0, width: BLOCK_W, height: BLOCK_H },
    {
      dayCount: DAYS,
      dayLabels: [
        { name: "SUNDAY", date: 22 },
        { name: "MONDAY", date: 23 },
        { name: "TUESDAY", date: 24 },
      ],
      startTime: "08:00",
      endTime: "12:00",
      intervalMinutes: 30,
      intervalMode: "on",
      hourLineStyle: "low-transparency",
      events: eventsFor(treatment),
    } as never,
    `ev-${treatment.key}`,
    "Newsreader",
    LATTICE
  ) as RenderedPolotnoElement[];
  return { elements, w: BLOCK_W, h: BLOCK_H };
}

function svg(drawing: { elements: RenderedPolotnoElement[]; w: number; h: number }, magnification: number): string {
  const cssW = (drawing.w / PX_PER_IN) * CSS_PX_PER_IN * magnification;
  const cssH = (drawing.h / PX_PER_IN) * CSS_PX_PER_IN * magnification;
  return (
    `<svg class="sheet" width="${cssW.toFixed(1)}" height="${cssH.toFixed(1)}" ` +
    `viewBox="0 0 ${drawing.w} ${drawing.h}">` +
    drawing.elements.map((e) => toSvg(e)).join("") +
    `</svg>`
  );
}

const ZOOMS = [
  { mag: 1, note: "true size - this is what it measures on paper" },
  { mag: 3, note: "3x - a 6pt label is under a device pixel at true size" },
];

const sections = ZOOMS.map(
  (zoom) =>
    `<h2>${zoom.mag === 1 ? "True size" : `${zoom.mag}x`}</h2><p class="note">${escapeXml(zoom.note)}</p>` +
    TREATMENTS.map(
      (t) =>
        `<figure><figcaption><b>${escapeXml(t.label)}</b> — ${escapeXml(t.blurb)}</figcaption>` +
        svg(block(t), zoom.mag) +
        `</figure>`
    ).join("")
).join("");

const counts = TREATMENTS.map((t) => `${t.label}: ${block(t).elements.length} marks`).join(" · ");

const html =
  `<!doctype html><meta charset="utf-8"><title>Calendar events — proof</title>` +
  PROOF_FONT_LINK +
  `<style>${PROOF_FONT_STYLE}
   body { background: #f6f5f2; color: #1a1a1a; font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; margin: 0; padding: 32px 40px 80px; }
   h1 { font-size: 20px; margin: 0 0 4px; }
   h2 { font-size: 15px; margin: 40px 0 2px; }
   .note, figcaption { color: #666; font-size: 12px; }
   .lede { color: #444; max-width: 62ch; margin: 0 0 8px; }
   /* The 3x row is 1296px wide, past the text column. It scrolls in its
      own box so the PAGE never scrolls sideways. */
   figure { margin: 16px 0 28px; overflow-x: auto; }
   figcaption { margin: 0 0 8px; }
   .sheet { background: #fdfcf9; box-shadow: 0 1px 3px rgba(0,0,0,0.18); display: block; }
   code { background: #e9e8e4; padding: 1px 5px; border-radius: 3px; }
  </style>` +
  `<h1>Calendar events</h1>` +
  `<p class="lede">The real renderer, at the size it prints. The band for all-day events and holidays sits in the ` +
  `22.3pt gap that was already between the day tab and the first ruled row, so nothing else on the page moves — ` +
  `compare <b>No events</b> with a week on paper today and they should be the same drawing.</p>` +
  `<p class="note">${escapeXml(counts)}</p>` +
  sections;

writeFileSync("public/events-proof.html", html);
console.log("public/events-proof.html");
console.log(counts);
console.log("Look at it: http://localhost:3000/events-proof.html");

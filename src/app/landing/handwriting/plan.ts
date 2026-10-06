// What gets written on a spread, and where.
//
// "We print the boring structure, you draw around it" is the product, so the
// landing page's journal is written in the way a person fills in a week: a
// word lettered across the top, the days' plans in their hours, a few time
// blocks, lists in the sidebar, to-dos ticked off, habits checked, then the
// highlighter and the doodles last. Each spread is a different person - a
// different hand, pen and ink colour. Who, and everything they write - the
// things in their hours at their own times, their lists, tables and
// banner - is their record in ../archetypes.ts (2026-10-06).
//
// WORDS are real handwriting fonts laid out a letter at a time (glyphs.ts);
// the joined script is the one exception, drawn along its pen path
// (strokes.ts) - single-line PRINT faces were tried and read as a plotter.
// LINES, TICKS AND DOODLES are pen strokes.
//
// Placement reads the page's own regions (see spreads.ts): events sit in half
// hour slots, list items on ruled lines, ticks in checkbox columns. Nothing is
// written over a printed word.

import type { Box, LandingSpread, Region } from "../spreads";
import { HAND_FONTS, type HandFontKey } from "../handFonts";
import { rng as makeRng } from "./rng";
import { layoutGlyphs, type GlyphRun } from "./glyphs";
import { doodle, type DoodleName } from "./doodles";
import { artById, artIndex, findArt, subjectOf, type ArtRef } from "./art";
import choices from "../doodleChoices.json";
import { checkMark, circleAround, measure, textStrokes, timeBlock, underline, wobble, type Path } from "./strokes";
import { PEOPLE_BY_KEY, type Face, type Hand, type Pen, type Person } from "../archetypes";

export type { Pen };

export type InkItem =
  | { kind: "strokes"; page: 0 | 1; paths: Path[]; pen: Pen; pause?: number }
  | { kind: "glyphs"; page: 0 | 1; run: GlyphRun; pause?: number }
  /** A drawn doodle (art.ts) in a box, print px. */
  | { kind: "art"; page: 0 | 1; art: ArtRef; box: [number, number, number, number]; angle?: number; pen: Pen; pause?: number };

const ink = (color: string, width: number): Pen => ({ color, width, kind: "ink" });
const marker = (color: string, width: number): Pen => ({ color, width, kind: "marker" });
const highlighter = (color: string): Pen => ({ color, width: 46, kind: "highlighter" });

/** The hand and the doodles for a spread that is not one of the people
 *  (none today): the reference photo's felt-tip capitals. */
const DEFAULT_HAND: Hand = {
  words: { font: "marker", caps: true, scale: 0.92 },
  banner: { font: "marker", caps: true, scale: 1 },
  pen: marker("#1d1c21", 5.2),
  accent: ink("#24439c", 3.6),
  highlight: highlighter("#ffe45c"),
};
const DEFAULT_DOODLES: Person["doodles"] = { style: "minimal", big: ["mountains", "houseplant", "paperplane", "camera", "books"], small: ["star", "sun", "sparkle", "heart"] };

/** The code-drawn doodle to fall back on when the library has not loaded
 *  (or has no drawing of a subject in a style). */
const FALLBACK: Record<string, DoodleName> = {
  star: "star", sparkle: "sparkle", heart: "heart", sun: "sun", moon: "moon", lightning: "lightning", cloud: "cloud",
  mountains: "mountains", houseplant: "plant", sunflower: "flower", daisy: "flower", tea: "cup", coffee: "cup", cafe: "cup",
  bulb: "bulb", books: "books", reading: "books", envelope: "envelope", camera: "camera", photo: "camera",
  paperplane: "plane", music: "music", guitar: "music", singing: "music", rainbow: "rainbow", movie: "popcorn", dnd: "d20",
  hiking: "mountains", meditating: "moon",
};

/** A doodle in an s x s box at (x, y): the person's drawing of it, fitted
 *  to the box and sat on its base line - or the code-drawn one. */
function doodleAt(page: 0 | 1, style: string, subject: string, x: number, y: number, size: number, seed: number, pen: Pen): InkItem[] {
  const art: ArtRef | null = artIndex() ? findArt(style, subject, (seed % 997) / 997) : null;
  if (art) {
    const k = size / Math.max(art.w, art.h);
    const w = art.w * k;
    const h = art.h * k;
    return [{ kind: "art", page, art, box: [x + (size - w) / 2, y + (size - h), w, h], pen }];
  }
  const name = FALLBACK[subject];
  return name ? doodleItems(page, name, x, y, size, seed, pen) : [];
}

/** A doodle as ink: the outline in the pen, then its detail - hatching,
 *  veins, steam - in a lighter line of the same pen, the way one is drawn. */
function doodleItems(page: 0 | 1, name: DoodleName, x: number, y: number, size: number, seed: number, pen: Pen): InkItem[] {
  const strokes = doodle(name, x, y, size, seed);
  const main = strokes.filter((st) => st.weight >= 1).map((st) => st.path);
  const detail = strokes.filter((st) => st.weight < 1).map((st) => st.path);
  const items: InkItem[] = [{ kind: "strokes", page, paths: main, pen }];
  if (detail.length) items.push({ kind: "strokes", page, paths: detail, pen: { ...pen, width: pen.width * 0.6 } });
  return items;
}

/** The handwriting fonts a spread is written in, to load before writing. */
export function familiesFor(spreadKey: string): string[] {
  const hand = PEOPLE_BY_KEY[spreadKey]?.hand ?? DEFAULT_HAND;
  return [hand.words, hand.banner].filter((f) => f.font !== "allure").map((f) => HAND_FONTS[f.font as HandFontKey]);
}

/**
 * The fun drawn in around the week: an event this matches gets a small
 * doodle beside it - popcorn by film night, a die by D&D. (Andrew,
 * 2026-09-23, of calendars imported later: "have doodles around them ...
 * them drawing in the fun stuff around the mundane".)
 */
const EVENT_DOODLES: Array<[RegExp, string]> = [
  [/film|movie/i, "movie"],
  [/guitar/i, "guitar"],
  [/open mic|concert|karaoke/i, "singing"],
  [/photo/i, "photo"],
  [/hike/i, "hiking"],
  [/coffee|tea w|brunch/i, "cafe"],
  [/book club|bath \+ book/i, "reading"],
  [/date night/i, "dancing"],
  [/d&d|game night/i, "dnd"],
  [/ship it/i, "paperplane"],
  [/emails|invoice/i, "envelope"],
  [/farmers/i, "picnic"],
  [/long walk/i, "sun"],
  [/meditate/i, "meditating"],
  [/bed by/i, "moon"],
  [/payday/i, "sparkle"],
  [/yoga|pilates/i, "yoga"],
  [/swim/i, "swimming"],
  [/5k|long run|intervals|run w\//i, "running"],
  [/spin|sell bike/i, "cycling"],
  [/legs|upper body|core/i, "weights"],
  [/paint|sketch|life drawing/i, "painting"],
  [/knit/i, "knitting"],
  [/study/i, "studying"],
  [/deep work|write draft|write 500w/i, "laptop"],
  [/meal prep|cook/i, "cooking"],
  [/pack!/i, "suitcase"],
  [/vet /i, "dog"],
];

/**
 * What a box is written with - by the module it is, then by what its heading
 * says. "Make sure every part makes sense" (Andrew, 2026-09-23): a stretch
 * list lists stretches, a watchlist films, a bills box bills - never the
 * general errands, which is what anything unmatched used to get.
 */
const BY_SLUG: Record<string, string[]> = {
  "daily-affirmation": ["calm + capable", "enough, as I am", "ready for it", "brave today"],
  "writing-prompt": ["the smell of rain", "grandma's kitchen", "- windows open", "- radio on low", "- summer, 2009"],
  "someday-maybe": ["learn italian", "pottery class", "visit japan", "run a half", "build a bookshelf", "learn to surf"],
  "stretch-routine": ["hamstrings", "hip flexors", "cat-cow", "calf stretch", "pigeon", "child's pose", "quads"],
  "grocery-list": ["eggs", "spinach", "oat milk", "lemons", "pasta", "coffee beans", "tofu", "apples", "rice"],
  watchlist: ["Dune pt 2", "Past Lives", "The Bear", "Severance", "Arrival", "Paddington 2"],
};
const LISTS: Array<[RegExp, string[]]> = [
  [/grateful|gratitude/i, ["slow morning", "good coffee", "call w/ gran", "sunny walk", "clean sheets", "new book"]],
  [/bill/i, ["rent - 1st", "phone - 12th", "car ins - 20th", "internet - 22nd", "gym - 28th"]],
  [/remind/i, ["renew passport", "water plants", "mom's bday fri", "return books", "car insurance", "dentist tues"]],
  [/priorit|big|focus/i, ["finish proposal", "gym 3x", "call the bank", "plan trip"]],
  [/grocer/i, BY_SLUG["grocery-list"]],
  [/meal/i, ["oats + berries", "chicken bowl", "pasta night", "tacos!", "leftovers", "stir fry", "soup + bread"]],
  [/watch/i, BY_SLUG.watchlist],
  [/book|read/i, ["Piranesi", "Circe", "Klara + the Sun", "Normal People"]],
  [/win/i, ["shipped v2!", "ran 10k", "said no once"]],
];

/** A table, a row at a time, in its own columns' terms. Days, not dates, so
 *  no row can contradict the week it is in. */
const TABLE_ROWS: Record<string, string[][]> = {
  "workout-log": [["squat", "3", "8", "135"], ["bench", "3", "10", "95"], ["deadlift", "3", "5", "185"], ["rows", "3", "12", "70"], ["lunges", "3", "10", "30"]],
  "run-log": [["mon", "5k", "27:40", "5:32", "easy"], ["wed", "8k", "46:10", "5:46", "legs!"], ["thu", "4k", "20:05", "5:01", "fast"], ["sun", "12k", "1:12", "6:00", "long"]],
  "sleep-log": [["mon", "11:30", "7:00", "7.5", "ok"], ["tue", "12:15", "6:45", "6.5", "meh"], ["wed", "10:45", "7:10", "8.4", "great"], ["thu", "11:00", "6:30", "7.5", "good"]],
  "spending-log": [["sun", "coffee", "food", "4.50"], ["mon", "bus pass", "travel", "40"], ["mon", "groceries", "food", "62.10"], ["tue", "book", "fun", "18"], ["tue", "phone", "bills", "35"]],
  budget: [["rent", "1200", "1200", "0"], ["food", "400", "362", "+38"], ["fun", "150", "171", "-21"], ["transport", "90", "84", "+6"], ["savings", "300", "300", "0"]],
};

/** Tasks for an Eisenhower matrix whose person gave none, by quadrant in
 *  reading order: schedule, do, delete, delegate (the catalogue's). */
const EISENHOWER: string[][] = [
  ["dentist", "plan Q4"],
  ["taxes!", "reply to Ana"],
  ["doomscroll", "re-sort inbox"],
  ["book venue", "order snacks"],
];

/** Modules whose marks are dots, circles or icons, or a set passage - never
 *  a list. */
const NOT_WRITTEN = new Set([
  "day-chart",
  "mood-chart-week",
  "mood-chart-month",
  "energy-chart",
  "sleep-chart",
  "rating-strip",
  "mood-tracker",
  "energy-pain-scale",
  "icon-strip",
  "water-week",
  "water-plants",
  "focus-blocks",
  "quote-block",
  "text-block",
  "year-in-pixels",
]);
const GENERIC_LIST = ["call Sam", "book flights", "fix bike", "buy stamps", "vet appt", "read ch. 4", "email landlord", "print photos", "return parcel"];
const TODOS = ["laundry", "email landlord", "book flights", "buy stamps", "fix bike", "gym x3", "read ch. 4", "vet appt", "call bank", "pack bag", "pay parking", "renew license", "clean fridge", "order gift", "back up phone", "change sheets", "send invoice"];
const HABITS = ["water", "read", "walk", "stretch", "vitamins", "no phone", "floss", "8h sleep"];
/** Names for a tracker's empty rows, by what it tracks - a plant tracker
 *  gets plants, not habits. Trackers not listed get ticks only. */
const TRACKER_NAMES: Array<[RegExp, string[]]> = [
  [/habit/i, HABITS],
  [/plant/i, ["pothos", "basil", "snake plant", "cactus", "orchid"]],
];

type Written = { page: 0 | 1; box: Box };

/** Nothing printed in this band. */
function clearOf(printed: Box[], x0: number, x1: number, y0: number, y1: number): boolean {
  return !printed.some(([px, py, pw, ph]) => px < x1 && px + pw > x0 && py < y1 && py + ph > y0);
}

function circleBullet(cx: number, cy: number, radius: number): Path {
  const out: Path = [];
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2.1;
    out.push(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
  }
  return out;
}

export function planSpread(spread: LandingSpread, seed: number): InkItem[] {
  const r = makeRng(seed);
  const person: Person | undefined = PEOPLE_BY_KEY[spread.key];
  const hand = person?.hand ?? DEFAULT_HAND;
  const theme = person?.doodles ?? DEFAULT_DOODLES;
  const items: InkItem[] = [];
  const writtenEvents: Written[] = [];
  const writtenAll: Written[] = [];
  let seedN = seed * 97;
  const nextSeed = () => ++seedN;

  /**
   * Write words with a face. `size` is the height the words should look,
   * in print px - roughly a capital's - and each face scales to it.
   */
  const words = (page: 0 | 1, face: Face, text: string, x: number, y: number, size: number, maxWidth: number, pen: Pen): Written | null => {
    // A plan that slipped: written, then crossed out.
    const struck = text.startsWith("~");
    if (struck) text = text.slice(1);
    const shown = face.caps ? text.toUpperCase() : text;
    const em = size * face.scale * 1.35;
    if (maxWidth < em * 1.2) return null;
    let width: number;
    if (face.font === "allure") {
      const drawn = textStrokes(shown, { font: "script", x, y, size: em, slant: 0.1, angle: r.range(-0.02, 0.02), seed: nextSeed(), maxWidth });
      items.push({ kind: "strokes", page, paths: drawn.paths, pen });
      width = drawn.width;
    } else {
      const run = layoutGlyphs(shown, { family: HAND_FONTS[face.font], weight: face.weight, size: em, x, y, seed: nextSeed(), color: pen.color, maxWidth, pen: pen.kind === "marker" ? "marker" : "ink" });
      items.push({ kind: "glyphs", page, run });
      width = run.width;
    }
    const w: Written = { page, box: [x, y - size, width, size * 1.2] };
    if (struck) items.push({ kind: "strokes", page, paths: [wobble([x - 6, y - size * 0.45, x + width + 8, y - size * 0.5], 1.5, nextSeed(), 20)], pen });
    writtenAll.push(w);
    return w;
  };

  /** How wide `text` comes out written with `face` at `size`, unsqueezed. */
  const measureWords = (face: Face, text: string, size: number): number => {
    const shown = face.caps ? text.toUpperCase() : text;
    const em = size * face.scale * 1.35;
    return face.font === "allure"
      ? measure(shown, "script", em)
      : layoutGlyphs(shown, { family: HAND_FONTS[face.font], weight: face.weight, size: em, x: 0, y: 0, seed: 1, color: "#000000" }).width;
  };

  /**
   * Two lines for an entry too long for one, where there is room below
   * (Andrew, 2026-10-06: "write in two lines as well if space permitted try
   * to make these things look natural") - broken at the space that leaves
   * the lines most even, the way a hand runs on. Null when it fits as it is,
   * or has no break that leaves a word or more on each line. Shrinking is
   * what is left for an entry with no room below, or still too long.
   */
  const twoLines = (face: Face, text: string, size: number, maxWidth: number): [string, string] | null => {
    const struck = text.startsWith("~");
    const body = struck ? text.slice(1) : text;
    if (measureWords(face, body, size) <= maxWidth * 0.98) return null;
    let best: [string, string] | null = null;
    let bestWidth = Infinity;
    for (const match of body.matchAll(/ /g)) {
      const a = body.slice(0, match.index);
      const b = body.slice(match.index + 1);
      // A line of its own for a dash or "w/" reads as a slip of the pen.
      if (a.replace(/^- /, "").length < 3 || b.length < 3) continue;
      const width = Math.max(measureWords(face, a, size), measureWords(face, b, size));
      if (width < bestWidth) {
        bestWidth = width;
        best = [a, b];
      }
    }
    if (!best) return null;
    return struck ? [`~${best[0]}`, `~${best[1]}`] : best;
  };

  /**
   * An entry, on one line or two: `below` is where a second line may go -
   * how far down, and how far in - or null for no room. The lines' boxes,
   * first first; null if nothing could be written.
   */
  const entry = (
    page: 0 | 1,
    face: Face,
    text: string,
    x: number,
    y: number,
    size: number,
    maxWidth: number,
    pen: Pen,
    below: { gap: number; indent: number } | null
  ): Written[] | null => {
    const split = below ? twoLines(face, text, size, maxWidth) : null;
    if (!split) {
      const one = words(page, face, text, x, y, size, maxWidth, pen);
      return one ? [one] : null;
    }
    const first = words(page, face, split[0], x, y, size, maxWidth, pen);
    if (!first) return null;
    const second = words(page, face, split[1], x + below!.indent, y + below!.gap, size, maxWidth - below!.indent, pen);
    return second ? [first, second] : [first];
  };
  /** The box round all of an entry's lines. */
  const around = (lines: Written[]): Written => {
    const x0 = Math.min(...lines.map((l) => l.box[0]));
    const y0 = Math.min(...lines.map((l) => l.box[1]));
    const x1 = Math.max(...lines.map((l) => l.box[0] + l.box[2]));
    const y1 = Math.max(...lines.map((l) => l.box[1] + l.box[3]));
    return { page: lines[0].page, box: [x0, y0, x1 - x0, y1 - y0] };
  };

  // --- a word across the top of some days of the right page, like the
  // reference photo: one day, the weekend, or any run of days - the
  // person's own, over the days their week puts it.
  const rightHours = spread.pages[1].regions.find((reg): reg is Extract<Region, { kind: "hours" }> => reg.kind === "hours");
  /** Days of the right page under the banner, whose events start below it. */
  const bannerDays = new Set<number>();
  const bannerSlots = 4;
  if (rightHours && person?.banner) {
    const all = rightHours.days;
    const from = Math.max(0, Math.min(all.length - 1, person.banner.from));
    const to = Math.max(from, Math.min(all.length - 1, person.banner.to));
    for (let i = from; i <= to; i++) bannerDays.add(i);
    const days = all.slice(from, to + 1);
    const left = days[0].area[0];
    const right = days[days.length - 1].header[0] + days[days.length - 1].header[2];
    const slotH = days[0].slots[1] - days[0].slots[0];
    const text = person.banner.text;
    const size = slotH * (days.length === 1 ? 1.7 : 2.1);
    const face = hand.banner;
    const shown = face.caps ? text.toUpperCase() : text;
    const em = size * face.scale * 1.35;
    const width =
      face.font === "allure" ? measure(shown, "script", em) : layoutGlyphs(shown, { family: HAND_FONTS[face.font], size: em, x: 0, y: 0, seed: 1, color: "#000000" }).width;
    const shownWidth = Math.min(width, right - left - 40);
    const x = (left + right) / 2 - shownWidth / 2 + r.range(-1, 1) * Math.max(0, (right - left - shownWidth) / 2 - 90);
    const baseline = days[0].slots[0] + slotH * 3;
    words(1, face, text, x, baseline, size, right - left - 40, hand.pen);
    const mid = baseline - size * 0.4;
    const rule = marker(hand.pen.color, Math.max(3.4, hand.pen.width));
    // The rules either side, where there is room for them.
    if (x - 40 - (left + 20) > 50) items.push({ kind: "strokes", page: 1, paths: [wobble([left + 20, mid, x - 40, mid + r.range(-4, 4)], 2, nextSeed(), 18)], pen: rule });
    if (right - 20 - (x + shownWidth + 40) > 50) items.push({ kind: "strokes", page: 1, paths: [wobble([x + shownWidth + 40, mid, right - 20, mid + r.range(-4, 4)], 2, nextSeed(), 18)], pen: rule });
  }

  // --- the days: each thing at its own time, on its own day. Days run in
  // the spread's order, the left page's three and then the right's four.
  const dayColumns = ([0, 1] as const).flatMap((page) => {
    const hours = spread.pages[page].regions.find((reg): reg is Extract<Region, { kind: "hours" }> => reg.kind === "hours");
    return hours ? hours.days.map((day, index) => ({ page, day, index })) : [];
  });
  /** Things given a mark of their own (a circle, an underline, the
   *  highlighter) - drawn last, the way a week gets marked up. */
  const marked: Array<{ lines: Written[]; mark: "circle" | "underline" | "highlight" }> = [];
  const events = person?.events ?? [];
  for (const event of events) {
    const column = dayColumns[event.day];
    if (!column) continue;
    const { page, day, index } = column;
    const slotH = day.slots[1] - day.slots[0];
    const first = page === 1 && bannerDays.has(index) ? bannerSlots : 0;
    const startSlot = day.hours.findIndex((h) => h >= event.at - 0.01);
    if (startSlot < 0) continue;
    // Under the banner where one is lettered across the top of the day.
    const slot = Math.min(Math.max(startSlot, first), day.slots.length - 2);
    const [ax, , aw] = day.area;
    const top = day.slots[slot];
    let x = ax + 14;
    if (event.until !== undefined) {
      const endSlot = day.hours.findIndex((h) => h >= event.until! - 0.01);
      const length = Math.max(1, (endSlot < 0 ? day.slots.length - 1 : endSlot) - slot);
      items.push({ kind: "strokes", page, paths: timeBlock(ax + 14, top + slotH * 0.35, top + slotH * Math.min(length, day.slots.length - slot - 1), nextSeed()), pen: hand.pen });
      x += 26;
    } else if (r.chance(0.25)) {
      items.push({ kind: "strokes", page, paths: [wobble(circleBullet(x + 8, top + slotH * 0.55, 8), 1, nextSeed())], pen: hand.pen });
      x += 26;
    }
    // Room for a second line: the next thing that day starts three slots or
    // more below (two for something inside a time block, whose line runs
    // down beside it), and the day does not end first.
    // Their calendar's blocks count as something below too.
    const nextAt = Math.min(
      ...events.filter((e) => e.day === event.day && e.at > event.at).map((e) => e.at),
      ...(person?.calendar ?? []).filter((c) => c.day === event.day && c.start > event.at).map((c) => c.start),
      Infinity
    );
    const nextSlot = nextAt === Infinity ? day.slots.length : day.hours.findIndex((h) => h >= nextAt - 0.01);
    const room = (nextSlot < 0 ? day.slots.length : nextSlot) - slot >= (event.until !== undefined ? 2 : 3) && slot + 1 < day.slots.length - 1;
    const lines = entry(page, hand.words, event.text, x, top + slotH * 0.86, slotH * 0.78, ax + aw - x - 12, hand.pen, room ? { gap: slotH, indent: 0 } : null);
    if (!lines) continue;
    const w = around(lines);
    writtenEvents.push(w);
    if (event.mark) marked.push({ lines, mark: event.mark });
    // Its doodle, to the right of the words: about two slots tall.
    const kind = event.doodle ?? EVENT_DOODLES.find(([re]) => re.test(event.text))?.[1];
    if (kind && (event.doodle || r.chance(0.8))) {
      const dx = w.box[0] + w.box[2] + slotH * 0.5;
      const size = Math.min(slotH * 3, ax + aw - 14 - dx);
      if (size >= slotH * 1.5) items.push(...doodleAt(page, theme.style, kind, dx, top + slotH * 0.9 - size * 0.62, size, nextSeed(), hand.accent));
    }
  }

  // --- the boxes: lists, to-dos, trackers, sketches. Every item is written
  // once per spread: each list is dealt from its own shuffled pool, shared
  // by every box that draws from it.
  const pools = new Map<string[], { items: string[]; at: number }>();
  const deal = (source: string[]) => {
    let p = pools.get(source);
    // A person's own list in their order; the shared ones shuffled.
    const theirs = person?.lists && Object.values(person.lists).includes(source);
    if (!p) pools.set(source, (p = { items: theirs ? [...source] : r.shuffle(source), at: 0 }));
    return p.at < p.items.length ? p.items[p.at++] : null;
  };
  for (const page of [0, 1] as const) {
    for (const region of spread.pages[page].regions) {
      if (region.kind === "box") writeBox(page, region);
    }
  }

  // --- filling in: icon strips, rating strips, day charts (2026-10-06: "I
  // want to fill chart icon strips and bubbles etc"). The week as it looks
  // on Friday evening: the days so far are filled, the rest are not.
  // Function declarations, not consts: writeBox runs (from the loop above)
  // before this point in the code, and a const is not there yet.

  /** Boxes in rows (by their tops), each row left to right. */
  function rowsOf(boxes: Box[]): Box[][] {
    const rows: Box[][] = [];
    for (const b of boxes) {
      const row = rows.find((r) => Math.abs(r[0][1] - b[1]) < Math.min(r[0][3], b[3]) * 0.5);
      if (row) row.push(b);
      else rows.push([b]);
    }
    return rows.map((r) => r.sort((a, b) => a[0] - b[0]));
  }
  /** A row split where the gap between neighbours is wider than usual: an
   *  icon strip's days. */
  function groupsOf(row: Box[]): Box[][] {
    if (row.length < 3) return [row];
    const gaps = row.slice(1).map((b, i) => b[0] - (row[i][0] + row[i][2]));
    const usual = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
    const groups: Box[][] = [[row[0]]];
    // A day's break is about 16 px more than the gap inside a day (34 by 18
    // between flames, 22 by 6 between circles) - measured, 2026-10-06.
    gaps.forEach((g, i) => (g > usual + Math.max(8, usual * 0.4) ? groups.push([row[i + 1]]) : groups[groups.length - 1].push(row[i + 1])));
    return groups;
  }
  /** Colouring in, the way a marker does it: strokes back and forth across
   *  the shape's middle, held inside an ellipse a little smaller than it -
   *  lower for a droplet or a flame, whose point is at the top. */
  function colourIn([x, y, w, h]: Box, passes: number, tipped: boolean): Path {
    const cx = x + w / 2;
    const cy = y + h * (tipped ? 0.6 : 0.5);
    const rx = w * 0.36;
    const ry = h * (tipped ? 0.3 : 0.34);
    const out: Path = [];
    for (let i = 0; i <= passes; i++) {
      const t = -1 + (2 * i) / passes;
      const half = rx * Math.sqrt(Math.max(0.05, 1 - t * t));
      out.push(i % 2 ? cx + half : cx - half, cy + t * ry);
    }
    return wobble(out, 0.6, nextSeed());
  }
  /** Days so far of a run of days on this page: the left page's are all
   *  past by Friday evening; the right page's first is. */
  function livedOf(page: 0 | 1, count: number) {
    return page === 0 ? count : Math.min(count, 1);
  }

  function colourIcons(page: 0 | 1, region: Extract<Region, { kind: "box" }>, counts: number[] | undefined) {
    const what = `${region.slug} ${region.heading}`;
    const colour = /water|droplet/i.test(what) ? "#4a8fd8" : /focus|flame/i.test(what) ? "#ee8a2a" : /plant|leaf/i.test(what) ? "#4ba35a" : hand.accent.color;
    const tipped = /water|droplet|focus|flame/i.test(what);
    const groups = rowsOf(region.targets).flatMap(groupsOf);
    groups.forEach((group, g) => {
      const count = counts?.[g] ?? (g < livedOf(page, groups.length) ? r.int(Math.ceil(group.length * 0.35), group.length) : 0);
      for (const icon of group.slice(0, count)) {
        items.push({ kind: "strokes", page, paths: [colourIn(icon, 5, tipped)], pen: { color: colour, width: Math.max(4, icon[2] * 0.2), kind: "marker" } });
      }
    });
  }

  function fillBubbles(page: 0 | 1, region: Extract<Region, { kind: "box" }>, values: number[] | undefined) {
    const rows = rowsOf(region.targets);
    // A row a day (a week's mood): the days so far. A row a measure: all.
    const lived = values?.length ?? (rows.length === 7 ? 4 : rows.length);
    rows.slice(0, lived).forEach((row, i) => {
      const value = values?.[i] ?? r.int(Math.max(1, Math.round(row.length * 0.4)), row.length);
      const bubble = row[Math.max(0, Math.min(row.length - 1, value - 1))];
      items.push({ kind: "strokes", page, paths: [colourIn(bubble, 7, false)], pen: { ...hand.pen, width: Math.max(3, bubble[2] * 0.12) } });
    });
  }

  function plotChart(page: 0 | 1, region: Extract<Region, { kind: "box" }>, levels: number[] | undefined) {
    // The grid's days and levels, from its dots' centres.
    const centres = (values: number[]) => values.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 4);
    const xs = centres(region.targets.map(([x, , w]) => x + w / 2));
    const ys = centres(region.targets.map(([, y, , h]) => y + h / 2));
    if (xs.length < 2 || ys.length < 2) return;
    const days = Math.min(xs.length, levels?.length ?? 4);
    let level = r.int(1, ys.length - 2);
    const points: Array<[number, number]> = [];
    for (let d = 0; d < days; d++) {
      level = levels?.[d] ?? Math.max(0, Math.min(ys.length - 1, level + r.int(-1, 1)));
      points.push([xs[d], ys[Math.max(0, Math.min(ys.length - 1, level))]]);
    }
    // The line first, joining the days, then a mark on each.
    if (points.length > 1) items.push({ kind: "strokes", page, paths: [wobble(points.flat(), 1, nextSeed(), 24)], pen: { ...hand.pen, width: hand.pen.width * 0.8 } });
    for (const [px, py] of points) {
      items.push({ kind: "strokes", page, paths: [wobble(circleBullet(px, py, 11), 0.5, nextSeed()), wobble(circleBullet(px, py, 6), 0.4, nextSeed()), wobble(circleBullet(px, py, 2.5), 0.3, nextSeed())], pen: hand.pen });
    }
  }

  function writeBox(page: 0 | 1, region: Extract<Region, { kind: "box" }>) {
    /** What the person gave for this box: by its heading, else its module. */
    const own = <T,>(map?: Record<string, T>): T | undefined => map?.[region.heading.toLowerCase()] ?? map?.[region.slug];
    // Filled in, not written in: icons coloured, a bubble a row, a chart
    // plotted - whatever the box's height (a one-row icon strip is too
    // short to write in, not to colour).
    if (region.targets.length > 0) {
      if (region.primitive === "icon-strip") return colourIcons(page, region, own(person?.strips));
      if (region.primitive === "rating-strip") return fillBubbles(page, region, own(person?.ratings));
      if (region.primitive === "day-chart") return plotChart(page, region, own(person?.charts));
    }
    const [cx, cy, cw, ch] = region.content;
    if (ch < 110) return;
    const narrowColumns = region.columns.filter((x, i, all) => i > 0 && x - all[i - 1] < 130).length;
    // A sketch box: draw in it. (Only a box made for drawing - a doodle
    // across an empty Notes box read as drawing over a blank module.)
    if (region.slug === "sketch-box") {
      // Scattered the way a page gets drawn on (Andrew, 2026-09-25: "vary
      // the orientation, position, and size a bit more so it's more
      // realistic", they were "right next to each other"): one large and
      // the rest smaller, each at its own slant, somewhere in the box with
      // room around it.
      //
      // WHICH drawings: the ones switched on for the sketch box in the
      // control panel (/dev/doodles, saved to doodleChoices.json - asked for
      // 2026-09-27, "switch which drawing show up ... in the hero large
      // within the sketch modules"). A spread favours its own person's
      // things when any of those are on - the first drawing always, the
      // rest more often than not - and anything switched on can appear.
      // Its defaults are what this drew before: each person's subjects, in
      // their style and in pencil.
      const n = r.chance(0.15) ? 1 : r.chance(0.5) ? 2 : 3;
      const keys = r.shuffle(theme.big);
      const allowed = artIndex() ? choices.sketchBox.map(artById).filter((a): a is ArtRef => a !== null) : [];
      const own = allowed.filter((a) => theme.big.includes(subjectOf(a)));
      const used = new Set<ArtRef>();
      const choose = (first: boolean): ArtRef | null => {
        const mine = own.filter((a) => !used.has(a));
        const any = allowed.filter((a) => !used.has(a));
        const from = mine.length && (first || r.chance(0.6)) ? mine : any;
        if (!from.length) return null;
        const art = r.pick(from);
        used.add(art);
        return art;
      };
      const placed: Box[] = [];
      const gap = Math.min(cw, ch) * 0.06;
      // The first sets the scale; the others are a half to two thirds of it.
      const lead = Math.min(ch * r.range(0.5, 0.74), 520);
      for (let i = 0; i < n; i++) {
        const subject = keys[i % keys.length];
        const seed = nextSeed();
        // Nothing switched on (or the library not loaded): the code-drawn
        // doodle of the person's own subject, as before the library.
        const art = choose(i === 0);
        const angle = r.range(-0.26, 0.26);
        const aspect = art ? art.w / art.h : 1;
        let h = i === 0 ? lead : lead * r.range(0.45, 0.7);
        let w = h * aspect;
        if (w > cw * 0.55) {
          w = cw * 0.55;
          h = w / aspect;
        }
        const [c, sn] = [Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))];
        const bw = w * c + h * sn;
        const bh = w * sn + h * c;
        for (let tries = 0; tries < 60; tries++) {
          const x = cx + r.range(0, Math.max(0, cw - bw));
          const y = cy + r.range(0, Math.max(0, ch - bh));
          if (placed.some(([px, py, pw, ph]) => x < px + pw + gap && px < x + bw + gap && y < py + ph + gap && py < y + bh + gap)) continue;
          if (!clearOf(region.printed, x, x + bw, y, y + bh)) continue;
          placed.push([x, y, bw, bh]);
          const pen = i === 0 ? hand.pen : hand.accent;
          if (art) items.push({ kind: "art", page, art, box: [x + (bw - w) / 2, y + (bh - h) / 2, w, h], angle, pen });
          else items.push(...doodleAt(page, theme.style, subject, x, y, Math.min(bw, bh), seed, pen));
          break;
        }
      }
      return;
    }
    const rows = region.lines.length
      ? region.lines
      : Array.from({ length: Math.floor((ch - 20) / 75) }, (_, i) => [cy + 70 + i * 75, cx, cx + cw] as [number, number, number]);
    const pitch = rows.length > 1 ? Math.max(40, rows[1][0] - rows[0][0]) : 75;
    const size = Math.min(pitch * 0.62, 46);

    // A meter the person has a count for: that many cells, shaded.
    const fill = own(person?.fills);
    if (fill !== undefined && region.cells.length > 0) {
      for (const [bx, by, bw, bh] of region.cells.slice(0, fill)) {
        items.push({ kind: "strokes", page, paths: [wobble([bx + bw * 0.2, by + bh * 0.8, bx + bw * 0.8, by + bh * 0.2], 0.6, nextSeed())], pen: hand.pen });
      }
      return;
    }

    // Cells to fill in order: a savings or payoff meter shaded up to where
    // the money is; a no-spend calendar's days, crossed off.
    if (region.cells.length >= 10 && /savings|debt|payoff|step|no-spend/.test(region.slug)) {
      const upTo = /no-spend/.test(region.slug) ? r.int(4, 12) : r.int(Math.round(region.cells.length * 0.12), Math.round(region.cells.length * 0.45));
      for (const [bx, by, bw, bh] of region.cells.slice(0, upTo)) {
        const paths = /no-spend/.test(region.slug)
          ? r.chance(0.8)
            ? [wobble([bx + bw * 0.18, by + bh * 0.18, bx + bw * 0.82, by + bh * 0.82], 0.8, nextSeed()), wobble([bx + bw * 0.82, by + bh * 0.18, bx + bw * 0.18, by + bh * 0.82], 0.8, nextSeed())]
            : []
          : [wobble([bx + bw * 0.2, by + bh * 0.8, bx + bw * 0.8, by + bh * 0.2], 0.6, nextSeed())];
        if (paths.length) items.push({ kind: "strokes", page, paths, pen: hand.pen });
      }
      return;
    }

    // The Eisenhower matrix: a task or two in each quadrant, under the axis.
    if (region.slug === "eisenhower-matrix" && region.columns.length && region.lines.length) {
      const vx = region.columns[0];
      const hy = region.lines[0][0];
      const quads: Box[] = [
        [cx, cy, vx - cx, hy - cy],
        [vx, cy, cx + cw - vx, hy - cy],
        [cx, hy, vx - cx, cy + ch - hy],
        [vx, hy, cx + cw - vx, cy + ch - hy],
      ];
      quads.forEach(([qx, qy, qw, qh], q) => {
        const tasks = (person?.eisenhower ?? EISENHOWER)[q].slice(0, r.int(1, 2));
        tasks.forEach((task, i) => {
          const x = qx + 44;
          const y = qy + (q < 2 ? 130 : 90) + i * 70;
          if (y > qy + qh - 20 || !clearOf(region.printed, x, qx + qw - 20, y - 50, y)) return;
          words(page, hand.words, `- ${task}`, x, y, 38, qw - 80, hand.pen);
        });
      });
      return;
    }

    // A tracker: many narrow columns. Tick cells, and name the habit if the
    // first column is wide and empty.
    if (narrowColumns >= 4) {
      const cols = region.columns;
      const usable = rows.filter((row) => row[0] > cy + 30).slice(0, 8);
      const names = own(person?.trackers) ?? TRACKER_NAMES.find(([re]) => re.test(region.heading))?.[1] ?? null;
      // Franklin marked his faults, not his successes: a dot, now and then.
      const dots = person?.trackerMark === "dot";
      for (const row of usable) {
        if (!r.chance(0.7)) continue;
        const rowTop = row[0] - pitch;
        const labelRight = cols[0];
        const printedName = !clearOf(region.printed, cx, labelRight, rowTop, row[0]);
        // A row with no name printed gets one written - of the tracker's own
        // kind - or, if it has no kind, stays unticked: a tick with no name
        // tracks nothing.
        if (!printedName) {
          const name = names && labelRight - cx > 150 ? deal(names) : null;
          if (!name) continue;
          words(page, hand.words, name, cx + 14, row[0] - pitch * 0.2, size * 0.9, labelRight - cx - 24, hand.pen);
        }
        for (let c = 0; c < cols.length - 1; c++) {
          const x0 = cols[c];
          const x1 = cols[c + 1];
          if (x1 - x0 > 130 || !r.chance(dots ? 0.16 : 0.55) || !clearOf(region.printed, x0, x1, rowTop, row[0])) continue;
          const s = Math.min(x1 - x0, pitch) * 0.62;
          const mark = r.next();
          const mx = (x0 + x1) / 2 - s / 2;
          const my = row[0] - pitch / 2 - s / 2;
          const paths = dots
            ? [wobble(circleBullet(mx + s / 2, my + s / 2, s * 0.1), 0.4, nextSeed()), wobble(circleBullet(mx + s / 2, my + s / 2, s * 0.05), 0.3, nextSeed())]
            : mark < 0.6
              ? checkMark(mx, my, s, nextSeed())
              : mark < 0.85
                ? [wobble(circleBullet(mx + s / 2, my + s / 2, s * 0.22), 0.8, nextSeed())]
                : [wobble([mx, my, mx + s, my + s], 1, nextSeed()), wobble([mx + s, my, mx, my + s], 1, nextSeed())];
          items.push({ kind: "strokes", page, paths, pen: r.chance(0.3) ? hand.accent : hand.pen });
        }
      }
      return;
    }

    // A table: a row at a time, a cell at a time - the person's rows, all of
    // them in their order; otherwise a few of the module's own.
    const ownRows = own(person?.tables);
    const table = ownRows ?? TABLE_ROWS[region.slug];
    if (table) {
      const [, , tw] = region.content;
      const edges = [cx, ...region.columns.filter((x) => x > cx + 20 && x < cx + tw - 20), cx + tw];
      const ys = [...new Set(rows.map(([y]) => Math.round(y)))].sort((a, b) => a - b);
      const body = ys.filter((y) => y > cy + 20 && clearOf(region.printed, cx, cx + tw, y - pitch + 4, y - 4));
      // A few of the rows, kept in the week's order.
      const keep = new Set(ownRows ? table.map((_, i) => i) : r.shuffle(table.map((_, i) => i)).slice(0, r.int(2, Math.min(5, table.length))));
      const data = table.filter((_, i) => keep.has(i));
      data.forEach((row, i) => {
        const y = body[i];
        if (y === undefined) return;
        for (let c = 0; c < Math.min(row.length, edges.length - 1); c++) {
          const x0 = edges[c] + 12;
          const x1 = edges[c + 1] - 8;
          if (x1 - x0 < 30) continue;
          words(page, hand.words, row[c], x0, y - Math.max(9, pitch * 0.18), size * 0.78, x1 - x0, hand.pen);
        }
      });
      return;
    }
    // Columns this knows nothing about: leave the table alone rather than
    // write a list across it.
    if (region.columns.length > 0 && region.checkX === null) return;
    // Marked, not written in: a chart's dots, a scale's circles, an icon
    // strip's icons, a quotation. Without a list of their own they stay as
    // printed rather than take a to-do ("back up phone" in a mood chart,
    // 2026-10-06).
    if (!own(person?.lists) && NOT_WRITTEN.has(region.slug)) return;

    // Lists and to-dos: items on the lines, TOP DOWN, the way a list is
    // written - each column of a to-do (one per day) from its first row.
    const ownItems = own(person?.lists);
    const source = ownItems ?? BY_SLUG[region.slug] ?? LISTS.find(([re]) => re.test(region.heading))?.[1] ?? (region.checkX !== null ? TODOS : GENERIC_LIST);
    const segments = rows.filter((row) => row[0] > cy + 40);
    const byColumn = new Map<number, typeof segments>();
    for (const seg of segments) {
      const key = Math.round(seg[1] / 40);
      byColumn.set(key, [...(byColumn.get(key) ?? []), seg]);
    }
    const columnsInOrder = [...byColumn.values()].sort((a, b) => a[0][1] - b[0][1]);
    columns: for (const [c, column] of columnsInOrder.entries()) {
      const sorted = column.sort((a, b) => a[0] - b[0]);
      // The first column always has something: a one-column checklist (a
      // watchlist, stretches) left bare reads as a blank module.
      // The person's own list is written out, shared across a to-do's days;
      // anything else, a few items.
      const count = ownItems
        ? Math.ceil(ownItems.length / columnsInOrder.length)
        : c === 0
          ? r.int(2, region.checkX !== null ? 4 : 5)
          : region.checkX !== null
            ? r.int(0, 4)
            : r.int(0, 2);
      const skip = !ownItems && region.checkX === null && r.chance(0.25) ? 1 : 0;
      // Down the column a line at a time; an item too long for its line runs
      // on to the next, a little in, when that line is there and free.
      let at = skip;
      for (let written = 0; written < count && at < sorted.length; ) {
        const [ly, lx0, lx1] = sorted[at];
        const used = writeLine(ly, lx0, lx1, sorted[at + 1] ?? null);
        if (used === null) break columns;
        at += Math.max(1, used);
        if (used > 0) written++;
      }
    }

    /** Write the next item on the line at `ly`, running on to `next` if it
     *  needs to: how many lines it took (0 if this line was not free), or
     *  null when the list has run out. */
    function writeLine(ly: number, lx0: number, lx1: number, next: [number, number, number] | null): number | null {
      const hasCheck = region.checkX !== null && region.columns.some((x) => x > lx0 && x < lx0 + 90);
      const checkRight = hasCheck ? region.columns.find((x) => x > lx0 && x < lx0 + 90)! : lx0;
      // A numbered list prints its number at the start of the line: write
      // after it, not give the line up (every numbered list - Priorities,
      // Big Three - came out empty until 2026-10-06).
      const number = region.printed.find(([px, py, pw, ph]) => px < checkRight + 90 && px + pw > checkRight && py < ly && py + ph > ly - pitch);
      const x = (number ? number[0] + number[2] : checkRight) + 16;
      const segEnd = Math.min(lx1, region.columns.find((c) => c > x + 60) ?? lx1);
      if (!clearOf(region.printed, x, segEnd, ly - pitch, ly)) return 0;
      const item = deal(source);
      if (!item) return null;
      const text = `${region.checkX === null && r.chance(0.4) ? "- " : ""}${item}`;
      // The next line, if it is the very next one down and nothing is
      // printed along it. Not on a numbered list: the run-on would sit
      // beside the next number.
      const indent = size * 0.6;
      const runOn = !number && next && next[0] - ly < pitch * 1.6 && clearOf(region.printed, x + indent, segEnd, next[0] - pitch, next[0]) ? { gap: next[0] - ly, indent } : null;
      const lines = entry(page, hand.words, text, x, ly - Math.max(9, pitch * 0.18), size, segEnd - x - 16, hand.pen, runOn);
      if (lines && hasCheck && r.chance(0.55)) {
        const s = Math.min(checkRight - lx0, pitch) * 0.7;
        items.push({ kind: "strokes", page, paths: checkMark(lx0 + (checkRight - lx0 - s) / 2, ly - pitch / 2 - s / 2, s, nextSeed()), pen: hand.accent });
      }
      return lines ? lines.length : 1;
    }
  }

  // --- last: the highlighter, a circle, an underline, a doodle by the date.
  // The person's own marks where they gave some; otherwise one of each, on
  // things picked at random.
  // A highlight runs along each line; a circle goes round them all; an
  // underline is under the last.
  for (const { lines, mark } of marked) {
    const page = lines[0].page;
    if (mark === "highlight") {
      for (const { box: [x, y, w, hgt] } of lines) items.push({ kind: "strokes", page, paths: [wobble([x - 10, y + hgt * 0.55, x + w + 12, y + hgt * 0.52], 2, nextSeed(), 30)], pen: hand.highlight, pause: 0.4 });
    } else if (mark === "circle") {
      items.push({ kind: "strokes", page, paths: circleAround(...around(lines).box, nextSeed()), pen: hand.accent });
    } else {
      const [x, y, w, hgt] = lines[lines.length - 1].box;
      items.push({ kind: "strokes", page, paths: underline(x, x + w, y + hgt + 6, nextSeed(), false), pen: hand.accent });
    }
  }
  if (marked.length === 0 && writtenEvents.length > 0) {
    const h = r.pick(writtenEvents);
    const [x, y, w, hgt] = h.box;
    items.push({ kind: "strokes", page: h.page, paths: [wobble([x - 10, y + hgt * 0.55, x + w + 12, y + hgt * 0.52], 2, nextSeed(), 30)], pen: hand.highlight, pause: 0.4 });
    const others = writtenEvents.filter((e) => e !== h);
    if (others.length && r.chance(0.6)) {
      const c = r.pick(others);
      items.push({ kind: "strokes", page: c.page, paths: circleAround(...c.box, nextSeed()), pen: hand.accent });
    }
    if (r.chance(0.5)) {
      const u = r.pick(writtenAll);
      items.push({ kind: "strokes", page: u.page, paths: underline(u.box[0], u.box[0] + u.box[2], u.box[1] + u.box[3] + 6, nextSeed(), r.chance(0.3)), pen: hand.accent });
    }
  }
  const title = spread.pages[0].regions.find((reg): reg is Extract<Region, { kind: "title" }> => reg.kind === "title");
  if (title && r.chance(0.7)) {
    const [x, y, w] = title.box;
    items.push(...doodleAt(0, theme.style, r.pick(theme.small), x + w - 120, y + 4, 100, nextSeed(), hand.accent));
  }
  return items;
}

// What gets written on a spread, and where.
//
// "We print the boring structure, you draw around it" is the product, so the
// landing page's journal is written in the way a person fills in a week: a
// word lettered across the top, the days' plans in their hours, a few time
// blocks, lists in the sidebar, to-dos ticked off, habits checked, then the
// highlighter and the doodles last. Each spread is a different person - a
// different hand, pen and ink colour.
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
import { artIndex, findArt, type ArtRef } from "./art";
import { checkMark, circleAround, measure, textStrokes, timeBlock, underline, wobble, type Path } from "./strokes";

export type Pen = {
  color: string;
  /** Line width in print px (300 per inch): 3 is a fine pen, 7 a marker. */
  width: number;
  kind: "ink" | "marker" | "highlighter" | "pencil";
};

export type InkItem =
  | { kind: "strokes"; page: 0 | 1; paths: Path[]; pen: Pen; pause?: number }
  | { kind: "glyphs"; page: 0 | 1; run: GlyphRun; pause?: number }
  /** A drawn doodle (art.ts) in a box, print px. */
  | { kind: "art"; page: 0 | 1; art: ArtRef; box: [number, number, number, number]; angle?: number; pen: Pen; pause?: number };

/** A way of writing words: a handwriting font, or the stroke-drawn script. */
type Face = { font: HandFontKey | "allure"; caps: boolean; weight?: number; scale: number };

type Hand = { words: Face; banner: Face; pen: Pen; accent: Pen; highlight: Pen };

const ink = (color: string, width: number): Pen => ({ color, width, kind: "ink" });
const marker = (color: string, width: number): Pen => ({ color, width, kind: "marker" });
const highlighter = (color: string): Pen => ({ color, width: 46, kind: "highlighter" });

/**
 * One person per spread. `scale` evens out the faces' very different
 * x-heights, so an event fills its slot whichever hand wrote it.
 */
const HANDS: Record<string, Hand> = {
  // The reference photo: felt-tip capitals throughout.
  classic: {
    words: { font: "marker", caps: true, scale: 0.92 },
    banner: { font: "marker", caps: true, scale: 1 },
    pen: marker("#1d1c21", 5.2),
    accent: ink("#24439c", 3.6),
    highlight: highlighter("#ffe45c"),
  },
  wellness: {
    words: { font: "caveat", caps: false, weight: 500, scale: 1.42 },
    banner: { font: "homemade", caps: false, scale: 0.8 },
    pen: ink("#1f6f6c", 4),
    accent: ink("#d4553f", 3.8),
    highlight: highlighter("#ffb3cf"),
  },
  focus: {
    words: { font: "nanum", caps: false, scale: 1.55 },
    banner: { font: "marker", caps: true, scale: 1 },
    pen: ink("#232228", 3.4),
    accent: ink("#c2352b", 3.6),
    highlight: highlighter("#fff06a"),
  },
  training: {
    words: { font: "grace", caps: false, scale: 1.2 },
    banner: { font: "marker", caps: true, scale: 1 },
    pen: ink("#2848a6", 3.6),
    accent: marker("#e27725", 5),
    highlight: highlighter("#b8f08a"),
  },
  money: {
    words: { font: "shadows", caps: false, scale: 1.3 },
    banner: { font: "grace", caps: false, scale: 1.25 },
    pen: ink("#2c6a40", 3.8),
    accent: ink("#1d1c21", 3.4),
    highlight: highlighter("#ffe45c"),
  },
  // A ballpoint in joined script, drawn stroke by stroke.
  creative: {
    words: { font: "allure", caps: false, scale: 1.25 },
    banner: { font: "homemade", caps: false, scale: 0.8 },
    pen: ink("#4a2f8f", 3.2),
    accent: marker("#d23f79", 4.6),
    highlight: highlighter("#9fdcff"),
  },
};

/**
 * What each person doodles: their week's own things, big enough for a sketch
 * box, then small ones for beside the date.
 */
/**
 * How each person doodles (Andrew, 2026-09-24: the generated drawings over
 * the code-drawn ones) - a drawing style of their own - and what: their
 * week's things, big enough for a sketch box, then small ones for beside
 * the date. Subjects are the doodle library's (handoff/flow/labels.json).
 */
const DOODLE_THEMES: Record<string, { style: string; big: string[]; small: string[] }> = {
  classic: { style: "minimal", big: ["mountains", "houseplant", "paperplane", "camera", "books"], small: ["star", "sun", "sparkle", "heart"] },
  wellness: { style: "retro", big: ["houseplant", "sunflower", "tea", "meditating"], small: ["heart", "sun", "sparkle", "daisy"] },
  focus: { style: "sketchnote", big: ["bulb", "books", "laptop", "coffee"], small: ["star", "lightning", "sparkle"] },
  training: { style: "crayon", big: ["mountains", "sun", "running", "cycling"], small: ["lightning", "star", "sun"] },
  money: { style: "pencil", big: ["houseplant", "bulb", "envelope", "coffee"], small: ["star", "sparkle", "heart"] },
  creative: { style: "riso", big: ["painting", "guitar", "camera", "rainbow", "music", "movie"], small: ["moon", "sparkle", "heart", "star"] },
};

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
  const hand = HANDS[spreadKey] ?? HANDS.classic;
  return [hand.words, hand.banner].filter((f) => f.font !== "allure").map((f) => HAND_FONTS[f.font as HandFontKey]);
}

// A spread never repeats an event: once its pool is spent, a day gets fewer.
const EVENTS: Record<string, string[]> = {
  classic: ["work", "emails", "lunch w/ nat", "run w/ charlie", "call mom", "meal prep", "clean house", "dentist", "coffee w/ jess", "pack!", "groceries", "laundry", "date night", "pick up kids", "haircut", "book club", "vet 3pm", "brunch"],
  wellness: ["yoga", "therapy", "long walk", "stretch", "journal", "meditate", "farmers mkt", "bath + book", "bed by 10", "smoothie", "pilates", "sauna", "tea w/ mo", "no screens", "massage"],
  focus: ["deep work", "standup", "1:1 w/ Ana", "write draft", "review", "planning", "lunch", "inbox zero", "ship it!", "demo", "no mtgs", "retro", "study", "office hrs"],
  training: ["5k easy", "legs", "upper body", "rest day", "long run", "intervals", "mobility", "swim", "hike", "core", "physio", "spin class", "foam roll"],
  money: ["pay rent", "budget", "payday!", "bank", "sell bike", "bills", "invoice", "no spend", "taxes", "meal prep", "thrift run", "cancel subs"],
  creative: ["sketch", "pottery", "museum", "write 500w", "film night", "guitar", "photo walk", "zine", "paint", "open mic", "life drawing", "knit", "D&D night"],
};

/**
 * When an event happens, if it has a time of its own: the earliest and latest
 * slot it may start in, 24-hour. Anything else goes anywhere. ("Make sure
 * every part makes sense": "bed by 10" was being written at 2pm.)
 */
const EVENT_TIMES: Array<[RegExp, number, number]> = [
  [/bed by 10/i, 21.5, 22],
  [/3pm/i, 15, 15],
  [/brunch/i, 10, 11.5],
  [/^lunch/i, 11.5, 13],
  [/night|open mic/i, 18, 21],
  [/sauna|bath/i, 18, 21],
  [/standup/i, 9, 10],
  [/smoothie/i, 7, 9],
  [/farmers|hike|long run|photo walk/i, 7, 11],
  [/coffee|tea w/i, 8, 16],
  [/work|emails|review|retro|demo|planning|office hrs|1:1|write draft|inbox/i, 8.5, 17],
  [/pick up kids/i, 14.5, 16],
  [/meal prep/i, 15, 19],
  [/museum|dentist|bank|haircut|vet|physio|therapy|massage/i, 9, 17],
];

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
 * The word lettered across the top of some days of the right page, with a
 * rule either side - sized to the days it spans (Andrew, 2026-09-23: not
 * always all four; "sometimes only being a weekend or a day, or any amount
 * of days"). Short words for one day, weekend words for a weekend.
 */
const BANNERS: Record<string, { day: string[]; weekend: string[]; days: string[] }> = {
  classic: { day: ["bday!", "day off", "movers"], weekend: ["weekend!", "cabin trip", "wedding"], days: ["Lisbon", "birthday week", "moving week", "visitors"] },
  wellness: { day: ["rest", "spa day"], weekend: ["retreat", "unplug"], days: ["reset week", "slow down"] },
  focus: { day: ["exam", "launch"], weekend: ["off!", "recharge"], days: ["launch week", "finals"] },
  training: { day: ["race day", "10k!"], weekend: ["trail trip", "race wknd"], days: ["race week", "taper"] },
  money: { day: ["payday", "rent"], weekend: ["no spend", "yard sale"], days: ["no-spend week", "tax time"] },
  creative: { day: ["gallery", "show!"], weekend: ["art fair", "workshop"], days: ["summer", "residency"] },
};

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

/** Tasks for the Eisenhower matrix, by quadrant in reading order: schedule,
 *  do, delete, delegate (the catalogue's). */
const EISENHOWER: string[][] = [
  ["dentist", "plan Q4"],
  ["taxes!", "reply to Ana"],
  ["doomscroll", "re-sort inbox"],
  ["book venue", "order snacks"],
];

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
  const hand = HANDS[spread.key] ?? HANDS.classic;
  const theme = DOODLE_THEMES[spread.key] ?? DOODLE_THEMES.classic;
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
    writtenAll.push(w);
    return w;
  };

  // --- a word across the top of some days of the right page, like the
  // reference photo: one day, the weekend, or any run of days.
  const rightHours = spread.pages[1].regions.find((reg): reg is Extract<Region, { kind: "hours" }> => reg.kind === "hours");
  /** Days of the right page under the banner, whose events start below it. */
  const bannerDays = new Set<number>();
  const bannerSlots = 4;
  if (rightHours && r.chance(0.8)) {
    const all = rightHours.days;
    const choices = BANNERS[spread.key] ?? BANNERS.classic;
    const weekend = all.map((d, i) => (/^(SATURDAY|SUNDAY)$/.test(d.label) ? i : -1)).filter((i) => i >= 0);
    const roll = r.next();
    let from: number;
    let to: number;
    let pool: string[];
    if (roll < 0.3) {
      from = to = r.int(0, all.length - 1);
      pool = choices.day;
    } else if (roll < 0.55 && weekend.length > 0) {
      [from, to] = [weekend[0], weekend[weekend.length - 1]];
      pool = weekend.length > 1 ? choices.weekend : choices.day;
    } else {
      const length = r.int(2, all.length);
      from = r.int(0, all.length - length);
      to = from + length - 1;
      pool = choices.days;
    }
    for (let i = from; i <= to; i++) bannerDays.add(i);
    const days = all.slice(from, to + 1);
    const left = days[0].area[0];
    const right = days[days.length - 1].header[0] + days[days.length - 1].header[2];
    const slotH = days[0].slots[1] - days[0].slots[0];
    const text = r.pick(pool);
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

  // --- the days
  const pool = r.shuffle(EVENTS[spread.key] ?? EVENTS.classic);
  let poolAt = 0;
  for (const page of [0, 1] as const) {
    const hours = spread.pages[page].regions.find((reg): reg is Extract<Region, { kind: "hours" }> => reg.kind === "hours");
    if (!hours) continue;
    for (const [dayIndex, day] of hours.days.entries()) {
      const slotH = day.slots[1] - day.slots[0];
      const first = page === 1 && bannerDays.has(dayIndex) ? bannerSlots : 0;
      const count = r.int(1, 4);
      const taken: number[] = [];
      for (let n = 0; n < count; n++) {
        if (poolAt >= pool.length) break;
        const text = pool[poolAt];
        const when = EVENT_TIMES.find(([re]) => re.test(text));
        const open = Array.from({ length: day.slots.length - 3 - first }, (_, i) => first + 1 + i).filter(
          (s) => !when || (day.hours[s] >= when[1] && day.hours[s] <= when[2])
        );
        let slot = -1;
        for (let tries = 0; tries < 12 && open.length; tries++) {
          const s = r.pick(open);
          if (taken.every((t) => Math.abs(t - s) >= 4)) {
            slot = s;
            break;
          }
        }
        // No room at its time today: it waits for another day.
        if (slot < 0) {
          pool.push(pool.splice(poolAt, 1)[0]);
          continue;
        }
        poolAt++;
        taken.push(slot);
        const [ax, , aw] = day.area;
        const block = r.chance(0.3);
        const blockLen = r.int(3, 8);
        const top = day.slots[slot];
        let x = ax + 14;
        if (block) {
          items.push({ kind: "strokes", page, paths: timeBlock(ax + 14, top + slotH * 0.35, top + slotH * Math.min(blockLen, day.slots.length - slot - 1), nextSeed()), pen: hand.pen });
          for (let k = 1; k < blockLen; k++) taken.push(slot + k);
          x += 26;
        } else if (r.chance(0.25)) {
          items.push({ kind: "strokes", page, paths: [wobble(circleBullet(x + 8, top + slotH * 0.55, 8), 1, nextSeed())], pen: hand.pen });
          x += 26;
        }
        const w = words(page, hand.words, text, x, top + slotH * 0.86, slotH * 0.78, ax + aw - x - 12, hand.pen);
        if (w) writtenEvents.push(w);
        // Its doodle, to the right of the words: about two slots tall, which
        // the four slots between events leave room for.
        const kind = EVENT_DOODLES.find(([re]) => re.test(text))?.[1];
        if (w && kind && r.chance(0.8)) {
          const dx = w.box[0] + w.box[2] + slotH * 0.5;
          const size = Math.min(slotH * 3, ax + aw - 14 - dx);
          if (size >= slotH * 1.5) items.push(...doodleAt(page, theme.style, kind, dx, top + slotH * 0.9 - size * 0.62, size, nextSeed(), hand.accent));
        }
      }
    }
  }

  // --- the boxes: lists, to-dos, trackers, sketches. Every item is written
  // once per spread: each list is dealt from its own shuffled pool, shared
  // by every box that draws from it.
  const pools = new Map<string[], { items: string[]; at: number }>();
  const deal = (source: string[]) => {
    let p = pools.get(source);
    if (!p) pools.set(source, (p = { items: r.shuffle(source), at: 0 }));
    return p.at < p.items.length ? p.items[p.at++] : null;
  };
  for (const page of [0, 1] as const) {
    for (const region of spread.pages[page].regions) {
      if (region.kind === "box") writeBox(page, region);
    }
  }

  function writeBox(page: 0 | 1, region: Extract<Region, { kind: "box" }>) {
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
      // room around it - and about half in pencil, as sketches among the
      // pen drawings.
      const n = r.chance(0.15) ? 1 : r.chance(0.5) ? 2 : 3;
      const keys = r.shuffle(theme.big);
      const placed: Box[] = [];
      const gap = Math.min(cw, ch) * 0.06;
      // The first sets the scale; the others are a half to two thirds of it.
      const lead = Math.min(ch * r.range(0.5, 0.74), 520);
      for (let i = 0; i < n; i++) {
        const subject = keys[i % keys.length];
        const seed = nextSeed();
        const pick = (seed % 997) / 997;
        const sketch = r.chance(0.5);
        const art = artIndex() ? ((sketch ? findArt("pencil", subject, pick) : null) ?? findArt(theme.style, subject, pick)) : null;
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
        const tasks = EISENHOWER[q].slice(0, r.int(1, 2));
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
      const names = TRACKER_NAMES.find(([re]) => re.test(region.heading))?.[1] ?? null;
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
          if (x1 - x0 > 130 || !r.chance(0.55) || !clearOf(region.printed, x0, x1, rowTop, row[0])) continue;
          const s = Math.min(x1 - x0, pitch) * 0.62;
          const mark = r.next();
          const mx = (x0 + x1) / 2 - s / 2;
          const my = row[0] - pitch / 2 - s / 2;
          const paths =
            mark < 0.6
              ? checkMark(mx, my, s, nextSeed())
              : mark < 0.85
                ? [wobble(circleBullet(mx + s / 2, my + s / 2, s * 0.22), 0.8, nextSeed())]
                : [wobble([mx, my, mx + s, my + s], 1, nextSeed()), wobble([mx + s, my, mx, my + s], 1, nextSeed())];
          items.push({ kind: "strokes", page, paths, pen: r.chance(0.3) ? hand.accent : hand.pen });
        }
      }
      return;
    }

    // A table: a row at a time, a cell at a time.
    const table = TABLE_ROWS[region.slug];
    if (table) {
      const [, , tw] = region.content;
      const edges = [cx, ...region.columns.filter((x) => x > cx + 20 && x < cx + tw - 20), cx + tw];
      const ys = [...new Set(rows.map(([y]) => Math.round(y)))].sort((a, b) => a - b);
      const body = ys.filter((y) => y > cy + 20 && clearOf(region.printed, cx, cx + tw, y - pitch + 4, y - 4));
      // A few of the rows, kept in the week's order.
      const keep = new Set(r.shuffle(table.map((_, i) => i)).slice(0, r.int(2, Math.min(5, table.length))));
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

    // Lists and to-dos: items on the lines, TOP DOWN, the way a list is
    // written - each column of a to-do (one per day) from its first row.
    const source = BY_SLUG[region.slug] ?? LISTS.find(([re]) => re.test(region.heading))?.[1] ?? (region.checkX !== null ? TODOS : GENERIC_LIST);
    const segments = rows.filter((row) => row[0] > cy + 40);
    const byColumn = new Map<number, typeof segments>();
    for (const seg of segments) {
      const key = Math.round(seg[1] / 40);
      byColumn.set(key, [...(byColumn.get(key) ?? []), seg]);
    }
    const picked: typeof segments = [];
    const columnsInOrder = [...byColumn.values()].sort((a, b) => a[0][1] - b[0][1]);
    for (const [c, column] of columnsInOrder.entries()) {
      const sorted = column.sort((a, b) => a[0] - b[0]);
      // The first column always has something: a one-column checklist (a
      // watchlist, stretches) left bare reads as a blank module.
      const count = c === 0 ? r.int(2, region.checkX !== null ? 4 : 5) : region.checkX !== null ? r.int(0, 4) : r.int(0, 2);
      const skip = region.checkX === null && r.chance(0.25) ? 1 : 0;
      picked.push(...sorted.slice(skip, skip + count));
    }
    for (const [ly, lx0, lx1] of picked) {
      const hasCheck = region.checkX !== null && region.columns.some((x) => x > lx0 && x < lx0 + 90);
      const checkRight = hasCheck ? region.columns.find((x) => x > lx0 && x < lx0 + 90)! : lx0;
      const x = checkRight + 16;
      const segEnd = Math.min(lx1, region.columns.find((c) => c > x + 60) ?? lx1);
      if (!clearOf(region.printed, x, segEnd, ly - pitch, ly)) continue;
      const item = deal(source);
      if (!item) break;
      const text = `${region.checkX === null && r.chance(0.4) ? "- " : ""}${item}`;
      const written = words(page, hand.words, text, x, ly - Math.max(9, pitch * 0.18), size, segEnd - x - 16, hand.pen);
      if (written && hasCheck && r.chance(0.55)) {
        const s = Math.min(checkRight - lx0, pitch) * 0.7;
        items.push({ kind: "strokes", page, paths: checkMark(lx0 + (checkRight - lx0 - s) / 2, ly - pitch / 2 - s / 2, s, nextSeed()), pen: hand.accent });
      }
    }
  }

  // --- last: the highlighter, a circle, an underline, a doodle by the date
  if (writtenEvents.length > 0) {
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

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
import { DOODLES, checkMark, circleAround, measure, textStrokes, timeBlock, underline, wobble, type Path } from "./strokes";

export type Pen = {
  color: string;
  /** Line width in print px (300 per inch): 3 is a fine pen, 7 a marker. */
  width: number;
  kind: "ink" | "marker" | "highlighter" | "pencil";
};

export type InkItem =
  | { kind: "strokes"; page: 0 | 1; paths: Path[]; pen: Pen; pause?: number }
  | { kind: "glyphs"; page: 0 | 1; run: GlyphRun; pause?: number };

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

/** The handwriting fonts a spread is written in, to load before writing. */
export function familiesFor(spreadKey: string): string[] {
  const hand = HANDS[spreadKey] ?? HANDS.classic;
  return [hand.words, hand.banner].filter((f) => f.font !== "allure").map((f) => HAND_FONTS[f.font as HandFontKey]);
}

const EVENTS: Record<string, string[]> = {
  classic: ["work", "emails", "lunch w/ nat", "run w/ charlie", "call mom", "meal prep", "clean house", "dentist", "coffee w/ jess", "pack!", "groceries", "laundry", "date night", "pick up", "road trip"],
  wellness: ["yoga", "therapy", "long walk", "stretch", "journal", "meditate", "farmers mkt", "bath + book", "bed by 10", "smoothie", "pilates", "sauna"],
  focus: ["deep work", "standup", "1:1 w/ Ana", "write draft", "review", "planning", "lunch", "inbox zero", "ship it!", "demo", "no mtgs"],
  training: ["5k easy", "legs", "upper body", "rest day", "long run", "intervals", "mobility", "swim", "hike", "core"],
  money: ["pay rent", "budget", "payday!", "bank", "sell bike", "bills", "invoice", "no spend", "taxes"],
  creative: ["sketch", "pottery", "museum", "write 500w", "film night", "guitar", "photo walk", "zine", "paint", "open mic"],
};

const BANNERS: Record<string, string[]> = {
  classic: ["Arizona", "Lisbon", "birthday week", "moving day"],
  wellness: ["reset week", "slow down"],
  focus: ["launch week", "finals"],
  training: ["race week", "10k!"],
  money: ["no-spend week", "payday"],
  creative: ["art fair", "summer"],
};

const LISTS: Array<[RegExp, string[]]> = [
  [/grateful|gratitude/i, ["slow morning", "good coffee", "call w/ gran", "sunny walk", "clean sheets", "new book"]],
  [/remind|bills/i, ["renew passport", "water plants", "mom's bday fri", "return books", "rent 1st", "car insurance"]],
  [/priorit|big|focus/i, ["finish proposal", "gym 3x", "call the bank", "plan trip"]],
  [/meal|grocer|food|cook/i, ["eggs", "spinach", "oat milk", "lemons", "pasta", "coffee beans", "tofu"]],
  [/watch|book|read/i, ["Dune pt 2", "Past Lives", "The Bear", "Severance", "Piranesi"]],
  [/win/i, ["shipped v2!", "ran 10k", "said no once"]],
];
const GENERIC_LIST = ["call Sam", "book flights", "fix bike", "buy stamps", "vet appt", "read ch. 4", "email landlord"];
const TODOS = ["laundry", "email landlord", "book flights", "buy stamps", "fix bike", "gym x3", "read ch. 4", "vet appt", "call bank", "pack bag", "pay parking"];
const HABITS = ["water", "read", "walk", "stretch", "vitamins", "no phone"];

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

  // --- a word across the top of the right page, like the reference photo
  const rightHours = spread.pages[1].regions.find((reg): reg is Extract<Region, { kind: "hours" }> => reg.kind === "hours");
  let bannerSlots = 0;
  if (rightHours && r.chance(0.8)) {
    const days = rightHours.days;
    const left = days[0].area[0];
    const right = days[days.length - 1].header[0] + days[days.length - 1].header[2];
    const slotH = days[0].slots[1] - days[0].slots[0];
    const text = r.pick(BANNERS[spread.key] ?? BANNERS.classic);
    const size = slotH * 2.1;
    const face = hand.banner;
    const shown = face.caps ? text.toUpperCase() : text;
    const em = size * face.scale * 1.35;
    const width =
      face.font === "allure" ? measure(shown, "script", em) : layoutGlyphs(shown, { family: HAND_FONTS[face.font], size: em, x: 0, y: 0, seed: 1, color: "#000000" }).width;
    const x = (left + right) / 2 - width / 2 + r.range(-60, 60);
    const baseline = days[0].slots[0] + slotH * 3;
    words(1, face, text, x, baseline, size, right - left, hand.pen);
    const mid = baseline - size * 0.4;
    const rule = marker(hand.pen.color, Math.max(3.4, hand.pen.width));
    items.push({ kind: "strokes", page: 1, paths: [wobble([left + 20, mid, x - 40, mid + r.range(-4, 4)], 2, nextSeed(), 18)], pen: rule });
    items.push({ kind: "strokes", page: 1, paths: [wobble([x + width + 40, mid, right - 20, mid + r.range(-4, 4)], 2, nextSeed(), 18)], pen: rule });
    bannerSlots = 4;
  }

  // --- the days
  const pool = r.shuffle(EVENTS[spread.key] ?? EVENTS.classic);
  let poolAt = 0;
  for (const page of [0, 1] as const) {
    const hours = spread.pages[page].regions.find((reg): reg is Extract<Region, { kind: "hours" }> => reg.kind === "hours");
    if (!hours) continue;
    for (const day of hours.days) {
      const slotH = day.slots[1] - day.slots[0];
      const first = page === 1 ? bannerSlots : 0;
      const count = r.int(1, 4);
      const taken: number[] = [];
      for (let n = 0; n < count; n++) {
        let slot = -1;
        for (let tries = 0; tries < 12; tries++) {
          const s = r.int(first + 1, day.slots.length - 3);
          if (taken.every((t) => Math.abs(t - s) >= 4)) {
            slot = s;
            break;
          }
        }
        if (slot < 0) continue;
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
        const w = words(page, hand.words, pool[poolAt++ % pool.length], x, top + slotH * 0.86, slotH * 0.78, ax + aw - x - 12, hand.pen);
        if (w) writtenEvents.push(w);
      }
    }
  }

  // --- the boxes: lists, to-dos, trackers, sketches
  for (const page of [0, 1] as const) {
    for (const region of spread.pages[page].regions) {
      if (region.kind === "box") writeBox(page, region);
    }
  }

  function writeBox(page: 0 | 1, region: Extract<Region, { kind: "box" }>) {
    const [cx, cy, cw, ch] = region.content;
    if (ch < 110) return;
    const narrowColumns = region.columns.filter((x, i, all) => i > 0 && x - all[i - 1] < 130).length;
    // A sketch box, or a big empty notes box: draw in it.
    if (region.slug === "sketch-box" || (/notes/i.test(region.heading) && region.lines.length === 0 && ch > 500 && r.chance(0.7))) {
      const n = r.int(1, 3);
      const size = Math.min(ch * 0.55, cw / (n + 0.5), 420);
      const keys = r.shuffle(["mountains", "plant", "cup", "flower", "sun", "cloud", "moon", "leaf"]);
      for (let i = 0; i < n; i++) {
        const x = cx + (cw / n) * i + (cw / n - size) / 2 + r.range(-20, 20);
        const y = cy + (ch - size) / 2 + r.range(-30, 30);
        if (!clearOf(region.printed, x, x + size, y, y + size)) continue;
        items.push({ kind: "strokes", page, paths: DOODLES[keys[i]](x, y, size, nextSeed()), pen: i === 0 ? hand.pen : hand.accent });
      }
      return;
    }
    const rows = region.lines.length
      ? region.lines
      : Array.from({ length: Math.floor((ch - 20) / 75) }, (_, i) => [cy + 70 + i * 75, cx, cx + cw] as [number, number, number]);
    const pitch = rows.length > 1 ? Math.max(40, rows[1][0] - rows[0][0]) : 75;
    const size = Math.min(pitch * 0.62, 46);

    // A tracker: many narrow columns. Tick cells, and name the habit if the
    // first column is wide and empty.
    if (narrowColumns >= 4) {
      const cols = region.columns;
      const usable = rows.filter((row) => row[0] > cy + 30).slice(0, 8);
      for (const row of usable) {
        if (!r.chance(0.7)) continue;
        const rowTop = row[0] - pitch;
        const labelRight = cols[0];
        if (labelRight - cx > 150 && clearOf(region.printed, cx, labelRight, rowTop, row[0])) {
          words(page, hand.words, r.pick(HABITS), cx + 14, row[0] - pitch * 0.2, size * 0.9, labelRight - cx - 24, hand.pen);
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

    // Lists and to-dos: items on the lines, TOP DOWN, the way a list is
    // written - each column of a to-do (one per day) from its first row.
    const list = region.checkX !== null ? r.shuffle(TODOS) : r.shuffle(LISTS.find(([re]) => re.test(region.heading))?.[1] ?? GENERIC_LIST);
    let w = 0;
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
      const count = region.checkX !== null ? r.int(0, 4) : c === 0 ? r.int(2, 5) : r.int(0, 2);
      const skip = region.checkX === null && r.chance(0.25) ? 1 : 0;
      picked.push(...sorted.slice(skip, skip + count));
    }
    for (const [ly, lx0, lx1] of picked) {
      const hasCheck = region.checkX !== null && region.columns.some((x) => x > lx0 && x < lx0 + 90);
      const checkRight = hasCheck ? region.columns.find((x) => x > lx0 && x < lx0 + 90)! : lx0;
      const x = checkRight + 16;
      const segEnd = Math.min(lx1, region.columns.find((c) => c > x + 60) ?? lx1);
      if (!clearOf(region.printed, x, segEnd, ly - pitch, ly)) continue;
      const text = `${region.checkX === null && r.chance(0.4) ? "- " : ""}${list[w++ % list.length]}`;
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
    const key = r.pick(["star", "sparkle", "heart", "sun", "moon"]);
    items.push({ kind: "strokes", page: 0, paths: DOODLES[key](x + w - 110, y + 10, 90, nextSeed()), pen: hand.accent });
  }
  return items;
}

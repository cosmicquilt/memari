// SYMBOLS FOR A SCALE: the day chart's levels drawn as pictures, in the
// pencil line the landing page's doodles are drawn in - faces for mood
// (faces.ts), lightning bolts for energy, the moon for sleep. Asked for
// 2026-10-02 ("make the same spacing fix for the energy and sleep charts
// (adding relevant symbols)"), Energy "Lightning bolts".
//
// A level is a symbol when it is exactly one of the tokens below - the
// emoji a person would type for it - so a scale is still a list of
// strings, editable as words, and a level that is not a token is words. A
// token followed by a space and words ("🌙 10h") is that symbol, small,
// with the words after it.
//
// Paths of M, L, C and Z, built at their final size like glyphs.ts's - the
// PDF writer reads those, and a transform would thicken a stroke on one
// axis.
import { ptToPx } from "@/lib/print-spec";
import { BORDER_WIDTH_PT, NEAR_BLACK, type FrameElement } from "@/lib/modules/moduleFrame";
import { MOOD_FACES, faceElements, isMoodFace } from "@/lib/modules/faces";

/** Energy, highest first: three bolts, two, one, half of one, an outline. */
export const ENERGY_BOLTS = ["⚡⚡⚡", "⚡⚡", "⚡", "⚡½", "⚡○"] as const;
/** Sleep, most first: a full moon waning to a thin crescent. */
export const SLEEP_MOONS = ["🌕", "🌖", "🌗", "🌘", "🌒", "🌑"] as const;
/** BEDTIME, latest first - later is up (2026-10-02, "reverse direction of
 *  hours bedtime (up is later)") - and the moons turned with the hours
 *  ("for bedtime can you reverse direction of symbols too"): full at the
 *  top, by 2AM, waning down to a thin crescent at 9PM, so the moon fills as
 *  the night goes on. The times are fine print at each moon's lower right. */
export const BEDTIME_LEVELS = ["🌕 2AM", "🌖 1AM", "🌗 12AM", "🌘 11PM", "🌒 10PM", "🌑 9PM"];
// Spaced so each step reads at a fifth of an inch: closer than this, the
// middle three looked alike.
const MOON_LIT: Record<(typeof SLEEP_MOONS)[number], number> = {
  "🌕": 1,
  "🌖": 0.78,
  "🌗": 0.56,
  "🌘": 0.36,
  "🌒": 0.2,
  "🌑": 0.08,
};

export type ScaleSymbol =
  | { kind: "face"; token: (typeof MOOD_FACES)[number] }
  | { kind: "bolts"; count: number; fill: "full" | "half" | "none" }
  | { kind: "moon"; lit: number };

/** The symbol a token names, or null for words. */
export function scaleSymbolOf(token: string): ScaleSymbol | null {
  const t = token.trim();
  if (isMoodFace(t)) return { kind: "face", token: t as (typeof MOOD_FACES)[number] };
  if (t === "⚡⚡⚡") return { kind: "bolts", count: 3, fill: "full" };
  if (t === "⚡⚡") return { kind: "bolts", count: 2, fill: "full" };
  if (t === "⚡") return { kind: "bolts", count: 1, fill: "full" };
  if (t === "⚡½") return { kind: "bolts", count: 1, fill: "half" };
  if (t === "⚡○") return { kind: "bolts", count: 1, fill: "none" };
  if (t in MOON_LIT) return { kind: "moon", lit: MOON_LIT[t as keyof typeof MOON_LIT] };
  return null;
}

/** A level split into its symbol and any words after it - "🌙 10h" is a
 *  moon and "10h". A plain symbol has no words; plain words have no symbol. */
export function splitLevel(level: string): { symbol: ScaleSymbol | null; words: string } {
  const whole = scaleSymbolOf(level);
  if (whole) return { symbol: whole, words: "" };
  const space = level.indexOf(" ");
  if (space > 0) {
    const head = scaleSymbolOf(level.slice(0, space)) ?? (level.slice(0, space) === "🌙" ? { kind: "moon" as const, lit: 0.22 } : null);
    if (head) return { symbol: head, words: level.slice(space + 1).trim() };
  }
  return { symbol: null, words: level };
}

/** How wide a symbol is, as a multiple of its height. */
export function scaleSymbolAspect(symbol: ScaleSymbol): number {
  if (symbol.kind === "bolts") return symbol.count === 1 ? BOLT_ASPECT : BOLT_ASPECT + (symbol.count - 1) * BOLT_STEP;
  return 1;
}

const K = 0.5523;
/**
 * One bolt's outline, in its own unit box (x across its width, y down its
 * height): pointed at the top, slanting down to the left, the full-width
 * step across the middle, and the long tip down to the left - the same
 * turned half way round about its centre. Andrew, 2026-10-02: "i dont like
 * the current energy bolt icon if you could replace it with a better one
 * thats also wider proportionally" (the first was 0.62 as wide as tall, a
 * narrow zigzag that read as a squiggle at a fifth of an inch), then "make
 * the energy bolt pointy at top" (the second had a flat top).
 */
const BOLT: Array<[number, number]> = [
  [0.64, 0],
  [0.56, 0.42],
  [1, 0.42],
  [0.36, 1],
  [0.44, 0.58],
  [0, 0.58],
];
/** A bolt is 0.8 as wide as it is tall. Side by side they stand clear of
 *  each other by about a tenth of their height where they come closest, at
 *  the middle step - the full-width step means they cannot nest. */
const BOLT_ASPECT = 0.8;
const BOLT_STEP = 0.78;

/** The part of a polygon at or below `yCut` (unit y grows downward). */
function belowLine(points: Array<[number, number]>, yCut: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const aIn = a[1] >= yCut;
    const bIn = b[1] >= yCut;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = (yCut - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, yCut]);
    }
  }
  return out;
}

/**
 * One symbol's marks, `heightPx` tall with its top-left at x, y. Ids are the
 * caller's prefix plus a part name, so a resize moves each mark.
 */
export function scaleSymbolElements(
  symbol: ScaleSymbol,
  x: number,
  y: number,
  heightPx: number,
  id: (part: string) => string,
  opacity = 0.8
): FrameElement[] {
  if (symbol.kind === "face") return faceElements(symbol.token, x, y, heightPx, id, opacity);
  const s = heightPx;
  const line = ptToPx(BORDER_WIDTH_PT);
  const mark = (part: string, pathD: string, filled: boolean, width = s): FrameElement => ({
    id: id(part),
    type: "figure",
    subType: "rect",
    x,
    y,
    width,
    height: s,
    fill: filled ? NEAR_BLACK : "transparent",
    stroke: filled ? "none" : NEAR_BLACK,
    ...(filled ? {} : { strokeWidth: line }),
    opacity,
    pathD,
  });

  if (symbol.kind === "bolts") {
    const boltWidth = s * BOLT_ASPECT;
    const marks: FrameElement[] = [];
    for (let b = 0; b < symbol.count; b++) {
      const left = x + b * s * BOLT_STEP;
      const p = ([u, v]: [number, number]) => `${(left + u * boltWidth).toFixed(2)} ${(y + v * s).toFixed(2)}`;
      const outline = `M ${BOLT.map(p).join(" L ")} Z`;
      if (symbol.fill === "full") marks.push(mark(`bolt${b}`, outline, true, boltWidth));
      else {
        marks.push(mark(`bolt${b}`, outline, false, boltWidth));
        if (symbol.fill === "half") {
          const lower = belowLine(BOLT, 0.5);
          marks.push(mark(`bolt${b}-fill`, `M ${lower.map(p).join(" L ")} Z`, true, boltWidth));
        }
      }
    }
    return marks;
  }

  // The moon: its edge, and the lit part in ink - more ink, more sleep. Lit
  // from the left, waning, as the night sky shows it: the left half-disc,
  // and the terminator a half-ellipse back up, bulging right past the middle
  // when more than half is lit and cutting into the left half when less.
  const r = s / 2 - line / 2;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const q = (px: number, py: number) => `${px.toFixed(2)} ${py.toFixed(2)}`;
  const edge =
    `M ${q(cx, cy - r)} C ${q(cx + K * r, cy - r)} ${q(cx + r, cy - K * r)} ${q(cx + r, cy)} ` +
    `C ${q(cx + r, cy + K * r)} ${q(cx + K * r, cy + r)} ${q(cx, cy + r)} ` +
    `C ${q(cx - K * r, cy + r)} ${q(cx - r, cy + K * r)} ${q(cx - r, cy)} ` +
    `C ${q(cx - r, cy - K * r)} ${q(cx - K * r, cy - r)} ${q(cx, cy - r)} Z`;
  const a = r * (2 * symbol.lit - 1); // + bulges right, - cuts in from the left
  const lit =
    `M ${q(cx, cy - r)} ` +
    `C ${q(cx - K * r, cy - r)} ${q(cx - r, cy - K * r)} ${q(cx - r, cy)} ` +
    `C ${q(cx - r, cy + K * r)} ${q(cx - K * r, cy + r)} ${q(cx, cy + r)} ` +
    `C ${q(cx + K * a, cy + r)} ${q(cx + a, cy + K * r)} ${q(cx + a, cy)} ` +
    `C ${q(cx + a, cy - K * r)} ${q(cx + K * a, cy - r)} ${q(cx, cy - r)} Z`;
  return [mark("moon", edge, false), mark("moon-lit", lit, true)];
}

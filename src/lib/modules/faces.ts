// FACES, for a mood scale: 😃 🙂 😐 😞 😢, drawn as the landing page's
// doodle people draw theirs (2026-10-01: "smileys based on bald chubby
// characters smiles in doodle", the cooking and café ones - "the left two").
//
// That face, measured off the pencil sheets: a round bald head in one even
// line, two small solid upright ovals for eyes set wide and a little below
// the middle, no nose, and a short shallow smile under them. The scale keeps
// all of it and changes only the mouth - open, smiling, level, turned down -
// and, at the bottom, a tear.
//
// Paths, built at their final size like glyphs.ts's shapes, never scaled by a
// transform: a scaled stroke comes out heavier on one axis. M, L, C and Z
// only, which is what the PDF writer reads (parsePathD); a circle is four
// cubics.
import { ptToPx } from "@/lib/print-spec";
import { glyphPathD } from "@/lib/modules/glyphs";
import { BORDER_WIDTH_PT, NEAR_BLACK, type FrameElement } from "@/lib/modules/moduleFrame";

/** The scale, best first - what a mood chart's levels default to, and what a
 *  level has to be, exactly, to be drawn as a face rather than as words. */
export const MOOD_FACES = ["😃", "🙂", "😐", "😞", "😢"] as const;
export type MoodFace = (typeof MOOD_FACES)[number];

export function isMoodFace(text: unknown): text is MoodFace {
  return typeof text === "string" && (MOOD_FACES as readonly string[]).includes(text.trim());
}

/** A circle's control-point distance, as a fraction of its radius. */
const K = 0.5523;

/** The mouths, in the face's own unit box (0..1 across, 0..1 down). */
// A touch larger than the pencil faces' own, which are drawn three times
// this size: at a fifth of an inch the doodles' proportions left the eyes as
// specks and the mouths bunched in the middle.
const MOUTHS: Record<MoodFace, Array<[string, ...number[]]>> = {
  // Open: a flat top and a round bottom - the D of a grin.
  "😃": [["M", 0.34, 0.62], ["L", 0.66, 0.62], ["C", 0.66, 0.83, 0.34, 0.83, 0.34, 0.62], ["Z"]],
  // The doodles' own: short and shallow.
  "🙂": [["M", 0.35, 0.645], ["C", 0.43, 0.745, 0.57, 0.745, 0.65, 0.645]],
  "😐": [["M", 0.37, 0.69], ["L", 0.63, 0.69]],
  "😞": [["M", 0.36, 0.74], ["C", 0.43, 0.65, 0.57, 0.65, 0.64, 0.74]],
  "😢": [["M", 0.36, 0.755], ["C", 0.43, 0.655, 0.57, 0.655, 0.64, 0.755]],
};

/**
 * One face's marks, its box `sizePx` square with its top-left at x, y. Ids
 * are the caller's prefix plus -head, -eye-l, -eye-r, -mouth and, on 😢,
 * -tear - so a resize moves each mark rather than replacing it.
 */
export function faceElements(
  face: MoodFace,
  x: number,
  y: number,
  sizePx: number,
  id: (part: string) => string,
  opacity = 0.8
): FrameElement[] {
  const s = sizePx;
  const p = (a: number, b: number) => `${(x + a * s).toFixed(2)} ${(y + b * s).toFixed(2)}`;
  const line = ptToPx(BORDER_WIDTH_PT);
  const oval = (cx: number, cy: number, rx: number, ry: number) =>
    `M ${p(cx, cy - ry)} ` +
    `C ${p(cx + K * rx, cy - ry)} ${p(cx + rx, cy - K * ry)} ${p(cx + rx, cy)} ` +
    `C ${p(cx + rx, cy + K * ry)} ${p(cx + K * rx, cy + ry)} ${p(cx, cy + ry)} ` +
    `C ${p(cx - K * rx, cy + ry)} ${p(cx - rx, cy + K * ry)} ${p(cx - rx, cy)} ` +
    `C ${p(cx - rx, cy - K * ry)} ${p(cx - K * rx, cy - ry)} ${p(cx, cy - ry)} Z`;
  const mark = (part: string, pathD: string, filled: boolean): FrameElement => ({
    id: id(part),
    type: "figure",
    // Additive pathD on a rect, as every glyph is - see glyphs.ts.
    subType: "rect",
    x,
    y,
    width: s,
    height: s,
    fill: filled ? NEAR_BLACK : "transparent",
    stroke: filled ? "none" : NEAR_BLACK,
    ...(filled ? {} : { strokeWidth: line }),
    opacity,
    pathD,
  });
  // The head: inset by half its line so the line stays inside the box.
  const r = 0.5 - line / s / 2;
  const mouth = MOUTHS[face]
    .map(([op, ...v]) => (op === "Z" ? "Z" : `${op} ${Array.from({ length: v.length / 2 }, (_, i) => p(v[i * 2], v[i * 2 + 1])).join(" ")}`))
    .join(" ");
  const marks = [
    mark("head", oval(0.5, 0.5, r, r), false),
    mark("eye-l", oval(0.355, 0.5, 0.048, 0.072), true),
    mark("eye-r", oval(0.645, 0.5, 0.048, 0.072), true),
    mark("mouth", mouth, false),
  ];
  if (face === "😢") {
    // Solid, like the eyes, under the left one's outer corner - an outline
    // this small read as a stray "6". A little drop, not a blot: 0.13 of the
    // face was "can make teardrop smaller" (2026-10-02).
    const tear = glyphPathD("droplet", x + 0.255 * s, y + 0.595 * s, 0.09 * s);
    if (tear) marks.push(mark("tear", tear, true));
  }
  return marks;
}

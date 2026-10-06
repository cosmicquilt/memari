// The repeatable marks a module can print: a ring, a box, a soft box - and
// the icons, Flow's drawings of the things a planner tracks.
//
// What this does NOT contain is spacing. A rating strip lays its glyphs
// out against a numbered scale with its own padding shares; an icon strip
// spreads them evenly inside a group. Those are different geometries and
// forcing one on both is the "two descriptions of one thing" defect this
// project keeps paying for. Callers position; this draws.

import { ptToPx } from "@/lib/print-spec";
import { NEAR_BLACK, RULE_WIDTH_PT } from "@/lib/modules/moduleFrame";
import { FLOW_ICONS, FLOW_ICON_NAMES, type FlowDrawing, type FlowIconName } from "@/lib/modules/flowIcons";

/**
 * The marks that can be drawn.
 *
 * Three are GEOMETRY - a ring, a box, a soft box - drawn as a rect with a
 * corner radius at the house hairline: the to-do's ticks and the plainest
 * trackers. The rest are FLOW'S ICONS (2026-10-06): forty-eight drawings in
 * the doodle walls' style, made to be printed small and coloured in, each
 * with a plain drawing and one with a little face - see flowIcons.ts. They
 * replaced the hand-built droplet, heart, star, moon, flame, leaf, plant,
 * spoon, jar, lotus, pill and bin under the SAME names, so every module that
 * stored "droplet" draws Flow's droplet with nothing migrated.
 *
 * An icon is built at its FINAL SIZE rather than scaled by a transform, as
 * the hand-built ones were: every consumer (the editor's SVG, the previews'
 * Canvas, the PDF) draws `pathD` as given, and none of them would have to
 * learn transforms.
 *
 * A path glyph still carries x/y/width/height and says subType "rect".
 * That is deliberate: `pathD` is ADDITIVE, so every consumer that has never
 * heard of it - the legacy Polotno route, the animation system's rect
 * partition, the geometry tests - keeps working and draws the box.
 */
export type GlyphShape = "circle" | "square" | "rounded" | FlowIconName;

/** Every shape, for checking a stored value is one - and the pickers' order:
 *  the geometry, then the icons as the brief listed them, sheet by sheet. */
export const GLYPH_SHAPES: readonly GlyphShape[] = ["circle", "square", "rounded", ...FLOW_ICON_NAMES];

/**
 * Each shape's name, one and many: the many for a module's picker ("Droplets"
 * - a strip of them), the one for a day icon ("Bin"). Kept here, once, so a
 * new icon is named in one place.
 */
export const GLYPH_LABELS: Record<GlyphShape, { one: string; many: string }> = {
  circle: { one: "Circle", many: "Circles" },
  square: { one: "Square", many: "Squares" },
  rounded: { one: "Rounded square", many: "Rounded squares" },
  droplet: { one: "Droplet", many: "Droplets" },
  plant: { one: "Potted plant", many: "Potted plants" },
  flame: { one: "Flame", many: "Flames" },
  leaf: { one: "Leaf", many: "Leaves" },
  heart: { one: "Heart", many: "Hearts" },
  star: { one: "Star", many: "Stars" },
  moon: { one: "Moon", many: "Moons" },
  sun: { one: "Sun", many: "Suns" },
  cloud: { one: "Cloud", many: "Clouds" },
  spoon: { one: "Spoon", many: "Spoons" },
  jar: { one: "Jar", many: "Jars" },
  lotus: { one: "Lotus", many: "Lotuses" },
  pill: { one: "Pill", many: "Pills" },
  medicine: { one: "Medicine bottle", many: "Medicine bottles" },
  toothbrush: { one: "Toothbrush", many: "Toothbrushes" },
  bed: { one: "Bed", many: "Beds" },
  mug: { one: "Mug", many: "Mugs" },
  glass: { one: "Glass of water", many: "Glasses of water" },
  trash: { one: "Bin", many: "Bins" },
  recycling: { one: "Recycling bin", many: "Recycling bins" },
  laundry: { one: "Laundry basket", many: "Laundry baskets" },
  broom: { one: "Broom", many: "Brooms" },
  "watering-can": { one: "Watering can", many: "Watering cans" },
  washer: { one: "Washing machine", many: "Washing machines" },
  bag: { one: "Shopping bag", many: "Shopping bags" },
  cart: { one: "Shopping cart", many: "Shopping carts" },
  envelope: { one: "Envelope", many: "Envelopes" },
  coins: { one: "Coins", many: "Coin stacks" },
  calendar: { one: "Calendar page", many: "Calendar pages" },
  house: { one: "House", many: "Houses" },
  dumbbell: { one: "Dumbbell", many: "Dumbbells" },
  shoe: { one: "Running shoe", many: "Running shoes" },
  bicycle: { one: "Bicycle", many: "Bicycles" },
  apple: { one: "Apple", many: "Apples" },
  tooth: { one: "Tooth", many: "Teeth" },
  paw: { one: "Paw print", many: "Paw prints" },
  cat: { one: "Cat", many: "Cats" },
  car: { one: "Car", many: "Cars" },
  bus: { one: "School bus", many: "School buses" },
  "baby-bottle": { one: "Baby bottle", many: "Baby bottles" },
  book: { one: "Book", many: "Books" },
  scissors: { one: "Scissors", many: "Pairs of scissors" },
  cake: { one: "Birthday cake", many: "Birthday cakes" },
  gift: { one: "Gift", many: "Gifts" },
  music: { one: "Music note", many: "Music notes" },
  plane: { one: "Airplane", many: "Airplanes" },
  palette: { one: "Paint palette", many: "Paint palettes" },
  key: { one: "Key", many: "Keys" },
};

/** Is this one of Flow's icons, rather than geometry? */
export function isIconShape(shape: GlyphShape): shape is FlowIconName {
  return Object.prototype.hasOwnProperty.call(FLOW_ICONS, shape);
}

/**
 * The thinnest an icon's line prints. Flow drew its lines about a fortieth
 * of the icon's width - asked for a fifteenth - which at 3mm is 0.2pt, under
 * the planner's own 0.3pt hairline. Below this an icon is stroked in its own
 * ink, which thickens every line by exactly the difference and leaves the
 * insides open. 0.45pt: between the hairline and 0.6pt, where the detailed
 * icons clog at 3mm (the proof's comparison page, 2026-10-06). The Lulu
 * test print settles it.
 */
export const ICON_LINE_FLOOR_PT = 0.45;

/** A compact path (see flowIcons.ts) read once into absolute unit-grid
 *  numbers: op (0 move, 1 curve, 2 close) followed by its points. */
const parsed = new WeakMap<FlowDrawing, number[]>();
function commands(drawing: FlowDrawing): number[] {
  const cached = parsed.get(drawing);
  if (cached) return cached;
  const out: number[] = [];
  const tokens = drawing.d.match(/[Mcz]|-?\d+/g) ?? [];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < tokens.length; ) {
    const t = tokens[i];
    if (t === "M") {
      cx = Number(tokens[i + 1]);
      cy = Number(tokens[i + 2]);
      out.push(0, cx, cy);
      i += 3;
    } else if (t === "c") {
      const v = [1, 2, 3, 4, 5, 6].map((j) => Number(tokens[i + j]));
      out.push(1, cx + v[0], cy + v[1], cx + v[2], cy + v[3], cx + v[4], cy + v[5]);
      cx += v[4];
      cy += v[5];
      i += 7;
    } else {
      out.push(2);
      i += 1;
    }
  }
  parsed.set(drawing, out);
  return out;
}

/** Which of an icon's two drawings to draw. */
function drawingOf(shape: FlowIconName, faces: boolean | undefined): FlowDrawing {
  return FLOW_ICONS[shape][faces ? "face" : "plain"];
}

/**
 * An icon's path at its final size: its unit box mapped onto x, y, sizePx.
 * Undefined for geometry, which is the rect itself.
 */
export function glyphPathD(shape: GlyphShape, x: number, y: number, sizePx: number, faces = false): string | undefined {
  if (!isIconShape(shape)) return undefined;
  const c = commands(drawingOf(shape, faces));
  const k = sizePx / 1000;
  const p = (u: number, v: number) => `${(x + u * k).toFixed(2)} ${(y + v * k).toFixed(2)}`;
  const parts: string[] = [];
  for (let i = 0; i < c.length; ) {
    if (c[i] === 0) {
      parts.push(`M ${p(c[i + 1], c[i + 2])}`);
      i += 3;
    } else if (c[i] === 1) {
      parts.push(`C ${p(c[i + 1], c[i + 2])} ${p(c[i + 3], c[i + 4])} ${p(c[i + 5], c[i + 6])}`);
      i += 7;
    } else {
      parts.push("Z");
      i += 1;
    }
  }
  return parts.join(" ");
}

/** The stroke the geometry is drawn with: the interior rule weight. */
export const GLYPH_STROKE_PT = RULE_WIDTH_PT;

export type GlyphElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  [key: string]: unknown;
};

/** A square with its corner radius at half its side IS a circle. */
export function glyphCornerRadiusPx(shape: GlyphShape, sizePx: number): number {
  if (shape === "circle") return sizePx / 2;
  if (shape === "rounded") return sizePx * 0.22;
  return 0;
}

/** One glyph, at a position the caller has already decided. */
export function glyphElement(options: {
  id: string;
  /** Top-left, not centre - callers work in both and this is the one the
   *  renderer wants. */
  x: number;
  y: number;
  sizePx: number;
  shape: GlyphShape;
  opacity?: number;
  /** An icon's drawing with a face rather than the plain one - the Faces
   *  switch. Geometry has no face and ignores it. */
  faces?: boolean;
}): GlyphElement {
  const { id, x, y, sizePx, shape } = options;
  const box = { id, type: "figure", subType: "rect", x, y, width: sizePx, height: sizePx };
  if (!isIconShape(shape)) {
    return {
      ...box,
      fill: "transparent",
      stroke: NEAR_BLACK,
      strokeWidth: ptToPx(GLYPH_STROKE_PT),
      cornerRadius: glyphCornerRadiusPx(shape, sizePx),
      opacity: options.opacity ?? 0.8,
    };
  }
  // THE INK, FILLED: the outline of every line Flow drew, insides open. A
  // line drawn thinner than the floor is stroked in the same ink by the
  // difference - a stroke straddles the outline, so each line thickens by
  // exactly its width.
  const drawing = drawingOf(shape, options.faces);
  const extra = Math.max(0, ptToPx(ICON_LINE_FLOOR_PT) - drawing.weight * sizePx);
  return {
    ...box,
    fill: NEAR_BLACK,
    stroke: extra > 0 ? NEAR_BLACK : "none",
    ...(extra > 0 ? { strokeWidth: extra } : {}),
    cornerRadius: 0,
    // Whole ink, not the geometry's 0.8: the fill and the thickening stroke
    // overlap along every line, and two translucent layers there would print
    // a darker rim in the PDF, which composites them separately.
    opacity: options.opacity ?? 1,
    // Additive: a consumer that knows about pathD draws the shape, one
    // that does not draws the box it is inscribed in. See GlyphShape.
    pathD: glyphPathD(shape, x, y, sizePx, options.faces),
  };
}

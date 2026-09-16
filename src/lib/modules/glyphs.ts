// The repeatable marks a module can print: a ring, a box, a soft box.
//
// This exists because the renderer's whole vocabulary is the axis-aligned
// rectangle and the upright text node - see the element-vocabulary note.
// There is no circle, no path and no polygon, so a "circle" here is a
// rectangle whose corner radius is half its side. ratingStrip worked that
// out first and carried the comment; iconStrip needed the same trick, and
// one idiom spelled two ways in two files is how a house style stops being
// one.
//
// What this does NOT contain is spacing. A rating strip lays its glyphs
// out against a numbered scale with its own padding shares; an icon strip
// spreads them evenly inside a group. Those are different geometries and
// forcing one on both is the "two descriptions of one thing" defect this
// project keeps paying for. Callers position; this draws.

import { ptToPx } from "@/lib/print-spec";
import { NEAR_BLACK, RULE_WIDTH_PT } from "@/lib/modules/moduleFrame";
import { plantPathD } from "@/lib/modules/plantGlyph";

/**
 * The marks that can be drawn.
 *
 * The first version of this file said a droplet was impossible, because
 * the renderer's vocabulary was the axis-aligned rect and the upright text
 * node. That was true of the ELEMENTS and not of the renderer: the native
 * one is already an SVG, so a <path> costs one branch in it. "I do want to
 * make the icons relevant shapes" is a fair thing to want from a water
 * tracker, and drawing rings for droplets was settling.
 *
 * The shapes below are built at their FINAL SIZE rather than defined in a
 * unit box and scaled by a transform. A transform would scale the stroke
 * with the shape, so a 0.3pt hairline in a non-square box comes out
 * elliptical and heavier on one axis - and these are printed at 300dpi
 * where that shows.
 *
 * A path glyph still carries x/y/width/height and a cornerRadius, and
 * still says subType "rect". That is deliberate: `pathD` is ADDITIVE, so
 * every consumer that has never heard of it - the legacy Polotno route,
 * the animation system's rect partition, the geometry tests - keeps
 * working and draws the box. Introducing a subType "path" instead would
 * have made the glyph vanish from all of them at once.
 */
export type GlyphShape =
  | "circle"
  | "square"
  | "rounded"
  | "droplet"
  | "heart"
  | "star"
  | "moon"
  | "flame"
  | "leaf"
  | "plant";

/** Shapes drawn as a path; everything else is the rect itself. */
const PATH_SHAPES: Record<string, (x: number, y: number, size: number) => string> = {
  // Each builder maps unit coordinates (0..1 across the glyph's own box)
  // to absolute ones, so the curve is described once and emitted at size.
  droplet: (x, y, s) => {
    const u = (a: number, b: number) => `${(x + a * s).toFixed(2)} ${(y + b * s).toFixed(2)}`;
    return (
      `M ${u(0.5, 0)} C ${u(0.5, 0.18)} ${u(0.92, 0.42)} ${u(0.92, 0.64)} ` +
      `C ${u(0.92, 0.85)} ${u(0.73, 1)} ${u(0.5, 1)} ` +
      `C ${u(0.27, 1)} ${u(0.08, 0.85)} ${u(0.08, 0.64)} ` +
      `C ${u(0.08, 0.42)} ${u(0.5, 0.18)} ${u(0.5, 0)} Z`
    );
  },
  heart: (x, y, s) => {
    const u = (a: number, b: number) => `${(x + a * s).toFixed(2)} ${(y + b * s).toFixed(2)}`;
    // The lower edges leave the point almost vertically and only then
    // flare out, so the silhouette is faintly CONCAVE for the first
    // quarter of its run rather than bulging straight off the tip. That is
    // the difference between a heart and a spade-ish balloon: asked for as
    // "the lower portion subtly transfer into concave into point instead
    // of convex".
    //
    // The control that does it is the first one on each lower edge, sat
    // nearly above the point (0.47 and 0.53 against the point's 0.5) where
    // it used to sit on the point itself - a degenerate control, which
    // makes the tangent aim straight at the far control and bulge outward
    // immediately.
    return (
      `M ${u(0.5, 0.99)} ` +
      `C ${u(0.47, 0.8)} ${u(0.1, 0.6)} ${u(0.045, 0.35)} ` +
      `C ${u(0.045, 0.14)} ${u(0.19, 0.035)} ${u(0.32, 0.035)} ` +
      `C ${u(0.42, 0.035)} ${u(0.49, 0.1)} ${u(0.5, 0.19)} ` +
      `C ${u(0.51, 0.1)} ${u(0.58, 0.035)} ${u(0.68, 0.035)} ` +
      `C ${u(0.81, 0.035)} ${u(0.955, 0.14)} ${u(0.955, 0.35)} ` +
      `C ${u(0.9, 0.6)} ${u(0.53, 0.8)} ${u(0.5, 0.99)} Z`
    );
  },
  star: (x, y, s) => {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const outer = s * 0.5;
    const inner = s * 0.208;
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push(`${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`);
    }
    return `M ${points[0]} L ${points.slice(1).join(" L ")} Z`;
  },
  moon: (x, y, s) => {
    // A crescent, built from where two circles actually cross: a disc of
    // radius OUTER with a BITE of radius BITE_R taken out of it, its
    // centre BITE_OFFSET to the right. Two arcs rather than a subtracted
    // shape, because the renderer has no masks.
    //
    // The first version guessed the two endpoints and gave the inner arc a
    // radius SMALLER than half its own chord, which is geometrically
    // impossible - SVG quietly scales such a radius up until it fits, so
    // the shape was whatever that rounding produced: a thin, accidental
    // sliver. Solving for the crossing points makes the thickness a number
    // that can be chosen. It is (BITE_OFFSET - BITE_R) - (-OUTER) of the
    // glyph's width, which at these values is 0.30 - a crescent with some
    // body, asked for as "bigger and thicker still crescent but more
    // full".
    const OUTER = 0.48;
    const BITE_OFFSET = 0.26;
    const BITE_R = 0.44;
    // Distance from the outer centre to the chord where the circles meet.
    const along = (BITE_OFFSET * BITE_OFFSET - BITE_R * BITE_R + OUTER * OUTER) / (2 * BITE_OFFSET);
    const half = Math.sqrt(Math.max(0, OUTER * OUTER - along * along));
    const crossX = 0.5 + along;
    const u = (a: number, b: number) => `${(x + a * s).toFixed(2)} ${(y + b * s).toFixed(2)}`;
    const r = (v: number) => (v * s).toFixed(2);
    return (
      // The long way round the outer disc, then back across the bite.
      `M ${u(crossX, 0.5 - half)} ` +
      `A ${r(OUTER)} ${r(OUTER)} 0 1 0 ${u(crossX, 0.5 + half)} ` +
      `A ${r(BITE_R)} ${r(BITE_R)} 0 0 1 ${u(crossX, 0.5 - half)} Z`
    );
  },
  flame: (x, y, s) => {
    const u = (a: number, b: number) => `${(x + a * s).toFixed(2)} ${(y + b * s).toFixed(2)}`;
    return (
      `M ${u(0.5, 0)} C ${u(0.7, 0.22)} ${u(0.84, 0.38)} ${u(0.84, 0.61)} ` +
      `C ${u(0.84, 0.83)} ${u(0.69, 1)} ${u(0.5, 1)} ` +
      `C ${u(0.31, 1)} ${u(0.16, 0.83)} ${u(0.16, 0.61)} ` +
      `C ${u(0.16, 0.46)} ${u(0.26, 0.35)} ${u(0.34, 0.24)} ` +
      `C ${u(0.36, 0.38)} ${u(0.43, 0.44)} ${u(0.49, 0.46)} ` +
      `C ${u(0.52, 0.31)} ${u(0.5, 0.15)} ${u(0.5, 0)} Z`
    );
  },
  leaf: (x, y, s) => {
    const u = (a: number, b: number) => `${(x + a * s).toFixed(2)} ${(y + b * s).toFixed(2)}`;
    //
    // TILTED and asymmetric - a tip at one end, a rounded base at the
    // other. Symmetric and upright, pointed at both ends, it came out as a
    // lens with a line down it, which reads as an eye rather than a leaf
    // and is also very close to the droplet turned over. The diagonal is
    // what makes it unmistakable at 25px, and it is how a leaf is drawn
    // anyway.
    //
    // Two cubics a side rather than one, so the silhouette is widest about
    // 40% up from the base and tapers the rest of the way to the tip -
    // which is the difference between a leaf and an almond.
    //
    // The venation is three more SUBPATHS in the same `d`: a midrib that
    // stops well short of both ends and carries a slight S, and two
    // offshoots leaving it at different heights, one to each edge, bowed
    // towards the tip the way a real vein runs. They sit well apart along
    // the rib - close together and near-mirrored they crossed it and read
    // as an X rather than as venation. All open subpaths, so the
    // transparent fill leaves them as strokes. They cost no extra element:
    // a vein as its own element would double the mark count of every leaf
    // strip and hand the resize machinery a mark no other shape has.
    //
    // The rib stops short of the tips deliberately - run it to the point
    // and three strokes converge into what reads as a blot at 0.3pt.
    return (
      `M ${u(0.93, 0.07)} C ${u(0.7, 0.1)} ${u(0.38, 0.25)} ${u(0.27, 0.45)} ` +
      `C ${u(0.17, 0.63)} ${u(0.1, 0.78)} ${u(0.09, 0.93)} ` +
      `C ${u(0.23, 0.87)} ${u(0.47, 0.8)} ${u(0.6, 0.7)} ` +
      `C ${u(0.77, 0.56)} ${u(0.91, 0.33)} ${u(0.93, 0.07)} Z ` +
      `M ${u(0.24, 0.78)} C ${u(0.35, 0.6)} ${u(0.58, 0.52)} ${u(0.74, 0.28)} ` +
      `M ${u(0.31, 0.69)} C ${u(0.28, 0.64)} ${u(0.24, 0.6)} ${u(0.2, 0.57)} ` +
      `M ${u(0.59, 0.45)} C ${u(0.64, 0.47)} ${u(0.68, 0.5)} ${u(0.72, 0.53)}`
    );
  },
};

// The potted plant lives in its own file: unlike everything above it is
// six overlapping pieces whose visible outline depends on which is in
// front, which needs curve intersection and splitting to work out. See
// plantGlyph.ts.
PATH_SHAPES.plant = plantPathD;

/** Is this shape drawn as a path? */
export function glyphPathD(shape: GlyphShape, x: number, y: number, sizePx: number): string | undefined {
  const build = PATH_SHAPES[shape];
  return build ? build(x, y, sizePx) : undefined;
}

/** The stroke every glyph is drawn with: the interior rule weight. */
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
}): GlyphElement {
  const pathD = glyphPathD(options.shape, options.x, options.y, options.sizePx);
  return {
    id: options.id,
    type: "figure",
    subType: "rect",
    x: options.x,
    y: options.y,
    width: options.sizePx,
    height: options.sizePx,
    fill: "transparent",
    stroke: NEAR_BLACK,
    strokeWidth: ptToPx(GLYPH_STROKE_PT),
    cornerRadius: glyphCornerRadiusPx(options.shape, options.sizePx),
    opacity: options.opacity ?? 0.8,
    // Additive: a consumer that knows about pathD draws the shape, one
    // that does not draws the box it is inscribed in. See GlyphShape.
    ...(pathD ? { pathD } : {}),
  };
}

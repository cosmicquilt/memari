// Generic interpreter mapping renderModuleInstance's plain Polotno
// element JSON (RenderedPolotnoElement — type:"text" / type:"figure",
// subType:"rect" / the synthetic type:"group" wrapper) to positioned
// DOM, for the native editor. Deliberately generic rather than a
// per-module hand-written CSS component: every module renderer already
// only ever emits those two element shapes (confirmed across all 7
// renderer files, see the migration plan), so one small interpreter
// here means the editor migration touches zero module renderer files,
// and on-screen fidelity to the PDF export is guaranteed by construction
// — both read the exact same data, not two hand-maintained
// implementations kept in sync by hand.
//
// Elements carry ABSOLUTE page-pixel x/y (0..PRINT_WIDTH_PX/HEIGHT_PX,
// from gridCellToPixels) — this component takes the enclosing module's
// own origin (its own geometry.x/y) and subtracts it from every element,
// so the caller can position ITS OWN wrapping container via CSS Grid
// (grid-column/grid-row) and just let this render each element relative
// to that container's own top-left corner, the same relationship
// Polotno's group/children model already has.

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { widenHairline, HAIRLINE_ASPECT_RATIO } from "@/lib/hairline";
import { useDevicePixelRatio } from "./useMediaQuery";

// NOTE: this file used to carry a large Firefox-specific workaround here
// — two on-screen thickness floors (strokes and fill hairlines), a
// zoom-clamp on them, a hairline aspect-ratio heuristic, and an
// `isFirefox` flag threaded down from NativePlannerEditor to drive it
// all. Every bit of it existed because rects were absolutely-positioned
// <div>s, whose device-pixel rects Firefox rounds per element. Drawing
// them in one shared <svg> instead (see RectLayer) removed the cause
// rather than compensating for it, so the whole apparatus is gone. See
// RectLayer's own comment for the full reasoning.

// The legibility floor for a rule too thin for the screen now lives in
// src/lib/hairline.ts, because the timeline previews need the IDENTICAL
// rule and a preview whose hairlines fade at a different zoom from the
// canvas's is a preview that disagrees with the page. The reasoning that
// used to sit here - why the floor goes on the ink as well as the width,
// and what each of the two half-fixes broke - moved there with it.
//
// This layer addresses CSS pixels, so it passes a CSS-px scale and gets a
// one-CSS-px floor. A canvas owns its backing store and passes a device-px
// scale for a finer one.

// A resizing module's content (elements/origin) is frozen at whatever it
// was last rendered for — see NativePlannerEditor's resizeFrozenSize
// comment for the full story. Its own outer-border rect (any module that
// draws one — labeledBox.ts's first element is the clearest example, but
// nothing here assumes a specific module) is unambiguously identifiable:
// a stroked rect positioned exactly at the module's own origin, sized to
// exactly the module's own frozen full width/height — there's no other
// reason for a rect to span a module's *entire* bounding box like that.
// That specific rect can't be repositioned into looking right during a
// live resize (its own recorded size is stale, not just its position),
// so it's hidden outright rather than drawn in the wrong place — the
// module's own CSS outline (NativeModule's isResizing styling) is a
// live-accurate stand-in for exactly this one element while it's hidden.
// A small pixel epsilon, not exact equality, since these all round-trip
// through gridCellToPixels' own floating-point division/multiplication.
const OUTER_BORDER_MATCH_EPSILON_PX = 0.5;

// One curve for every part of a module that moves during a cross-zone
// resize: the container's own box (NativePlannerEditor's
// CROSSING_RESIZE_TRANSITION) and, below, the rects and text inside it.
// Exported rather than duplicated because they must match exactly - the
// whole point is that the contents travel in lockstep with the box, and
// two curves that merely look similar would put them subtly out of step
// for the length of every crossing.
export const RESIZE_EASE_CURVE = "cubic-bezier(0.4, 0, 0.2, 1)";

// How long a mark takes to fade in when it appears. Applies to both rects
// and text - anything that mounts rather than sweeping or moving. See
// memari-mark-in in globals.css.
const MARK_FADE_IN_MS = 230;

// Text alone gets a position transition while a module's box eases.
// Rects deliberately do not: the box clips them, so a rect is revealed
// or cut off rather than moved, and transitioning them breaks any module
// whose element count depends on its width - a todo-checklist gains and
// loses day columns, and a column with no counterpart at the old size
// has nothing to animate from. Text has no such problem. It is the same
// handful of labels before and after, and a window that reveals a title
// already sitting at its final position reads as the title having
// jumped, which is exactly how it was reported.
function textPositionTransition(easeMs: number): string | undefined {
  if (easeMs <= 0) return undefined;
  return ["left", "top", "width", "height"].map((prop) => `${prop} ${easeMs}ms ${RESIZE_EASE_CURVE}`).join(", ");
}

// The same thing for rects, which are SVG and so animate x/y/width/
// height rather than left/top/width/height. These are SVG2 geometry
// PROPERTIES, not just attributes, which is what makes them
// transitionable at all; setting them as attributes still works because
// a presentation attribute feeds the same computed value the transition
// reads. A browser without that support simply snaps to the final
// geometry, which is what every rect did before this.
//
// Only ever applied when the two renders describe the same set of
// elements - see animateRects.
// FLIP needs to read layout and set the compensating transform in the same
// frame the new geometry lands, or the mark paints once at its destination
// first. useEffect is too late for that; useLayoutEffect is not, but warns
// if this ever renders on the server.
const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export type MarkGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** How much of its own ink a rule keeps after being widened to stay
   *  visible - see MIN_ONSCREEN_RECT_PX. 1 for everything not widened, and
   *  absent on geometry built for animation pairing, which does not care. */
  ink?: number;
};

// Maps a mark's NEW geometry back onto its OLD one, so the animation can
// start where the mark was and end where it belongs.
//
// Only the transform moves. Geometry is set to its final value
// immediately, which is the whole point: a mark's x/y/width/height used to
// be transitioned directly, and the legibility floor below is recomputed
// from those values on every render, so the browser walked a hairline's
// thickness through a range of values the floor never intended it to take.
// Rules visibly thickened and thinned mid-flight, and that artefact is
// what sank the previous attempt at animating these.
//
// A hairline is scaled along its LONG axis only. Its thin dimension is not
// geometry at all — it is the line's weight — so scaling it is exactly the
// thing to avoid. Anything genuinely two-dimensional (a date box, a dot)
// has two real dimensions and is scaled on both.
export function flipTransform(from: MarkGeometry, to: MarkGeometry): string | null {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const horizontalHairline = to.height > 0 && to.height < to.width * HAIRLINE_ASPECT_RATIO;
  const verticalHairline = to.width > 0 && to.width < to.height * HAIRLINE_ASPECT_RATIO;
  const scaleX = verticalHairline || to.width < 0.01 ? 1 : from.width / to.width;
  const scaleY = horizontalHairline || to.height < 0.01 ? 1 : from.height / to.height;
  const unmoved =
    Math.abs(dx) < 0.05 &&
    Math.abs(dy) < 0.05 &&
    Math.abs(scaleX - 1) < 0.0005 &&
    Math.abs(scaleY - 1) < 0.0005;
  if (unmoved) return null;
  return `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
}


// Non-rect elements only (in practice: text). Rects are drawn by
// RectLayer below instead — see its own comment for why they had to
// leave the DOM entirely. That is also why this no longer takes `scale`
// or `isFirefox`: both existed solely to size the Firefox hairline
// floors, which the SVG layer made unnecessary.
function ElementNode({
  leaving,
  element,
  originX,
  originY,
  textEaseMs,
}: {
  /** Rendered only so it can fade out; it is already gone from the
   *  render this layer was handed. */
  leaving?: boolean;
  element: RenderedPolotnoElement;
  originX: number;
  originY: number;
  textEaseMs: number;
}) {
  if (element.type === "group") {
    // Synthetic wrapper renderModuleInstance adds around a non-locked
    // instance's children (see that file's own comment on why —
    // Polotno-specific plumbing for drag/select) — transparent here,
    // just render the children directly at the same origin.
    return (
      <>
        {(element.children ?? []).map((child) => (
          <ElementNode
            key={child.id}
            element={child}
            originX={originX}
            originY={originY}
            textEaseMs={textEaseMs}
          />
        ))}
      </>
    );
  }

  const left = (element.x ?? 0) - originX;
  const top = (element.y ?? 0) - originY;
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const opacity = element.opacity ?? 1;

  if (element.type === "text") {
    return (
      <div
        style={{
          position: "absolute",
          left,
          top,
          width,
          height,
          fontSize: element.fontSize,
          fontFamily: element.fontFamily,
          color: element.fill ?? "#000000",
          textAlign: (element.align as React.CSSProperties["textAlign"]) ?? "left",
          opacity,
          letterSpacing: element.letterSpacing,
          lineHeight: 1.2,
          whiteSpace: "pre",
          pointerEvents: "none",
          transition: textPositionTransition(textEaseMs),
          // Text pops the same way rects do and gets the same fade. Text
          // nodes are keyed by their own content, so a label that changes
          // - a time, a day name, a heading at a new size - remounts and
          // fades in rather than swapping in place.
          animation: leaving
            ? `memari-mark-out ${MARK_FADE_IN_MS}ms ease-out forwards`
            : `memari-mark-in ${MARK_FADE_IN_MS}ms ease-out`,
        }}
      >
        {element.text}
      </div>
    );
  }

  // Any other element type (none exist in this app's own renderers
  // today) is silently skipped rather than thrown on — an unrecognized
  // shape from a future module renderer shouldn't take the whole page
  // down, just render as a gap the same way a missing renderer already
  // does (see renderModuleInstance.ts's default case for quote-block).
  return null;
}

// Every `figure/rect` in a module — its rules, dividers, boxes and
// outer borders — drawn as ONE shared <svg> per module rather than as
// one absolutely-positioned <div> apiece.
//
// This is what finally made Firefox match Chrome, after a long run of
// constants that could not. The DOM approach had each line as its own
// box inside a `transform: scale()`, so at raster time every element's
// device-pixel rect got rounded INDEPENDENTLY: a 0.4px-tall rule landed
// on 0, 1 or 2 device pixels purely by where its edges fell on the pixel
// grid. Reported exactly that way — "the lines change thickness slightly
// as I zoom in and out erratically... certain horizontal lines will look
// slightly thicker than others at certain Zoom levels, and then certain
// ones will disappear at the further out Zoom levels." No floor can fix
// that, because the error is per-element and scale-dependent, not a
// single global under-thickness.
//
// Inside one <svg> there is no per-element box to round. The whole scene
// shares a vector coordinate system and rasterizes through one
// antialiasing path — the same one in both engines — so a sub-device-
// pixel rule fades smoothly and identically instead of snapping. It also
// makes the preview share its geometric model with the printed PDF,
// which is itself vector, so what is on screen is finally the same kind
// of thing as the actual output.
//
// Deliberately NOT sized with a viewBox: with none set, one SVG user
// unit equals one CSS pixel, which is exactly the space every element's
// x/y/width/height is already expressed in. overflow:visible so an outer
// border rect sitting flush against the module bounds cannot clip its
// own stroke.
// Where a mark actually lands on screen: its own geometry, the stroke
// inset, and the legibility floor. Returns null for a mark that is not
// drawn at all.
//
// Lifted out of RectLayer's render pass so that every mark's geometry is
// known BEFORE the FLIP effect runs, rather than being accumulated while
// the tree is built. The effect needs the complete map, and accumulating
// it during render would also describe the same geometry twice — once for
// the animation and once for the attributes.
function markGeometry(
  element: RenderedPolotnoElement,
  originX: number,
  originY: number,
  /** DEVICE pixels per print pixel - the on-screen zoom times the display's
   *  pixel ratio. Device, not CSS: the hairline floor below is "the thinnest
   *  mark this screen can draw", and one CSS pixel is three of those on a 3x
   *  display. */
  deviceScale: number,
  suppressOuterBorderSize: { width: number; height: number } | null
): MarkGeometry | null {
  const left = (element.x ?? 0) - originX;
  const top = (element.y ?? 0) - originY;
  const width = element.width ?? 0;
  const height = element.height ?? 0;
  const hasStroke = !!element.stroke && element.stroke !== "none" && (element.strokeWidth ?? 0) > 0;
  const hasFill = !!element.fill && element.fill !== "transparent";

  // See suppressOuterBorderSize's own comment above.
  if (
    suppressOuterBorderSize &&
    hasStroke &&
    Math.abs(left) < OUTER_BORDER_MATCH_EPSILON_PX &&
    Math.abs(top) < OUTER_BORDER_MATCH_EPSILON_PX &&
    Math.abs(width - suppressOuterBorderSize.width) < OUTER_BORDER_MATCH_EPSILON_PX &&
    Math.abs(height - suppressOuterBorderSize.height) < OUTER_BORDER_MATCH_EPSILON_PX
  ) {
    return null;
  }

  // SVG centres a stroke on the path, so the rect is inset by half the
  // stroke width to put the stroke's OUTER edge flush with the element's
  // own bounds — matching where the previous inset box-shadow (and the
  // outline before it) drew its ring, so no module's geometry shifts as a
  // result of this change.
  const strokeWidth = hasStroke ? element.strokeWidth ?? 0 : 0;
  const inset = strokeWidth / 2;

  // Legibility floor for fill-only rules - see src/lib/hairline.ts. A
  // stroked box is already a stroke and is left alone.
  const rule =
    hasFill && !hasStroke
      ? widenHairline({ x: left, y: top, width, height }, deviceScale)
      : { x: left, y: top, width, height, ink: 1 };

  return {
    x: rule.x + inset,
    y: rule.y + inset,
    width: Math.max(0, rule.width - strokeWidth),
    height: Math.max(0, rule.height - strokeWidth),
    ink: rule.ink,
  };
}

function RectLayer({
  rects,
  originX,
  originY,
  scale,
  suppressOuterBorderSize,
  easeMs,
  leaving = false,
}: {
  rects: RenderedPolotnoElement[];
  originX: number;
  originY: number;
  // Current on-screen zoom, in CSS pixels per print pixel. Multiplied by
  // the display's pixel ratio before it reaches the hairline floor - see
  // markGeometry's own parameter.
  scale: number;
  suppressOuterBorderSize: { width: number; height: number } | null;
  // Non-zero only when these rects are being animated to their final
  // geometry rather than clipped at their largest - see animateRects.
  easeMs: number;
  // A layer of marks that have already gone, held for one fade so they can
  // leave rather than blink out. They animate out, not in, and they never
  // FLIP: there is nothing for them to travel to.
  leaving?: boolean;
}) {
  // THE FLOOR IS ONE DEVICE PIXEL, NOT ONE CSS PIXEL, and that distinction
  // is the whole of a reported fault: "some lines when at further zooms look
  // blurry because they are wider versions that are grey while other lines
  // show at skinny detailed lines". Measured at 28% zoom on a 3x display,
  // every ruled line was 1 CSS px - THREE device pixels - of 35% grey,
  // landing on a different subpixel phase each time, beside stroked outlines
  // the browser drew crisp at full ink. A legibility floor that overshoots
  // the display by 3x is not a floor, it is the thing you notice.
  const dpr = useDevicePixelRatio();
  const nodes = useRef(new Map<string, SVGRectElement>());
  const previous = useRef(new Map<string, MarkGeometry>());
  const running = useRef(new Map<string, Animation>());
  // Complete before the effect below reads it, and a fresh map each
  // render, so the effect always sees exactly what this render drew rather
  // than whatever a later one has since overwritten.
  const drawn = new Map<string, MarkGeometry>();
  for (const element of rects) {
    const geometry = markGeometry(element, originX, originY, scale * dpr, suppressOuterBorderSize);
    if (geometry) drawn.set(element.id, geometry);
  }

  useBeforePaint(() => {
    if (easeMs > 0 && !leaving) {
      for (const [id, to] of drawn) {
        const node = nodes.current.get(id);
        const from = previous.current.get(id);
        if (!node || !from) continue;
        const transform = flipTransform(from, to);
        if (!transform) continue;
        // A mark still travelling from a previous step is not restarted
        // from where it began; cancelling first lets the new animation
        // pick up from the geometry now in force.
        running.current.get(id)?.cancel();
        const animation = node.animate(
          [{ transform }, { transform: "none" }],
          { duration: easeMs, easing: RESIZE_EASE_CURVE }
        );
        running.current.set(id, animation);
        // Rejects when cancelled, which is routine here, not an error.
        animation.finished
          .then(() => {
            if (running.current.get(id) === animation) running.current.delete(id);
          })
          .catch(() => {});
      }
    }
    // A mark that appears BEYOND the previous render's extent is being
    // REVEALED, not arriving, so it must not play the arrival fade.
    //
    // Growing a to-do adds one row line per snap step. Each is a new id,
    // so each mounts and runs memari-mark-in - 230ms from transparent.
    // Drag through four steps in a second and four lines sit at four
    // different opacities at once, which reads as the lines being
    // different weights. Reported as "when expanding todo the new rows
    // horizontal lines range in thickness it seems or something like its
    // animating it".
    //
    // Measured before changing anything: at every adjacent pair of sizes
    // the to-do emits rects of identical height (1.458px), none of them
    // move, and exactly one is added. The geometry was never the problem.
    //
    // The clip window already reveals these - that is the whole point of
    // drawing content at the larger size and letting the box open over it
    // - so fading them as well animates one event twice. A mark landing
    // INSIDE the old extent is a different thing: a mode switch putting
    // down a drawing that was not there before, and it still fades.
    //
    // Cancelled HERE rather than by withholding the animation in the JSX,
    // for two reasons. The style prop has to stay one stable string - a
    // re-render writing a different value cancels whatever is running, and
    // a drag re-renders every frame, so computing it per render would cut
    // every genuine fade short after one frame. And this hook runs before
    // paint, so a fade cancelled here never shows a frame.
    if (previous.current.size > 0) {
      let right = -Infinity;
      let bottom = -Infinity;
      for (const mark of previous.current.values()) {
        right = Math.max(right, mark.x + mark.width);
        bottom = Math.max(bottom, mark.y + mark.height);
      }
      for (const [id, mark] of drawn) {
        if (previous.current.has(id)) continue;
        if (mark.y < bottom - 0.5 && mark.x < right - 0.5) continue;
        const node = nodes.current.get(id);
        if (node) node.style.animation = "none";
      }
    }
    previous.current = drawn;
  });

  useEffect(() => {
    const inFlight = running.current;
    return () => {
      for (const animation of inFlight.values()) animation.cancel();
      inFlight.clear();
    };
  }, []);

  return (
    <svg
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {rects.map((element) => {
        const geometry = drawn.get(element.id);
        if (!geometry) return null;
        const hasStroke = !!element.stroke && element.stroke !== "none" && (element.strokeWidth ?? 0) > 0;
        const hasFill = !!element.fill && element.fill !== "transparent";
        const strokeWidth = hasStroke ? element.strokeWidth ?? 0 : 0;

        // A glyph with a real shape - a droplet, a heart - carries its
        // path alongside the box it is inscribed in. Drawn as a <path>
        // here and as a plain rect by anything that has not heard of
        // pathD, which is why it is an extra field rather than a new
        // subType: see glyphs.ts.
        //
        // It keeps the same ref, key and arrival animation as every other
        // mark, so it is a first-class member of the rect layer and the
        // resize machinery does not have to know it is curved. What it
        // does NOT get is geometry interpolation - `d` is baked at the
        // size it was built for, so a path mark is redrawn rather than
        // slid. Glyphs are small and a strip rescales as a whole, which is
        // a cross-fade case anyway; see check:behaviour.
        const pathD = typeof element.pathD === "string" ? element.pathD : undefined;
        if (pathD) {
          return (
            <path
              key={element.id}
              d={pathD}
              fill={hasFill ? element.fill : "none"}
              stroke={hasStroke ? element.stroke : undefined}
              strokeWidth={hasStroke ? strokeWidth : undefined}
              strokeLinejoin="round"
              opacity={element.opacity ?? 1}
              style={{
                animation: leaving
                  ? `memari-mark-out ${MARK_FADE_IN_MS}ms ease-out forwards`
                  : `memari-mark-in ${MARK_FADE_IN_MS}ms ease-out`,
              }}
            />
          );
        }

        return (
          <rect
            key={element.id}
            ref={(node) => {
              if (node) nodes.current.set(element.id, node);
              else nodes.current.delete(element.id);
            }}
            x={geometry.x}
            y={geometry.y}
            width={geometry.width}
            height={geometry.height}
            rx={typeof element.cornerRadius === "number" ? element.cornerRadius : undefined}
            fill={hasFill ? element.fill : "none"}
            stroke={hasStroke ? element.stroke : undefined}
            strokeWidth={hasStroke ? strokeWidth : undefined}
            // Its own opacity, times whatever it gave up to be widened
            // enough to see - see MIN_ONSCREEN_RECT_PX.
            opacity={(element.opacity ?? 1) * (geometry.ink ?? 1)}
            style={{
              // Transforms are relative to the mark's own box, so a scale
              // grows it from its own top-left corner rather than from the
              // SVG origin somewhere off to the left.
              transformBox: "fill-box",
              transformOrigin: "0 0",
              // See memari-mark-in in globals.css. Runs on mount, which is
              // when a mark appears - a structural change remounts every
              // rect in the layer, and so does the handover from the eased
              // render to the final one. A leaving layer runs the same
              // fade backwards, and holds at zero so it cannot flash back
              // on the frame before it unmounts.
              animation: leaving
                ? `memari-mark-out ${MARK_FADE_IN_MS}ms ease-out forwards`
                : `memari-mark-in ${MARK_FADE_IN_MS}ms ease-out`,
            }}
          />
        );
      })}
    </svg>
  );
}

/**
 * Do these two renders describe the same marks?
 *
 * This is the condition under which a node survives the change and
 * therefore has a previous geometry to animate FROM. Where it holds, the
 * final render is shown for the length of the ease and its marks travel;
 * where it does not, the content render is shown and the clip window
 * sweeps over it.
 *
 * It used to be asked by comparing element COUNTS, which is a proxy: two
 * renders can hold the same number of different marks. Ids are semantic
 * now, so the question can simply be answered. Measured across the ten real
 * crossings in resizeEndpoints.report.mts, the proxy happened to agree with
 * this on every one of them - so this changes no behaviour today. It is
 * here because the proxy is the kind of thing that is right until the
 * geometry moves under it, which is exactly what it did once before.
 *
 * Deliberately has no notion of direction. Direction-aware variants were
 * tried twice in one session - "animate on a grow, sweep on a shrink", then
 * "draw the final render when the two are different drawings" - and each
 * fixed the case it was aimed at while making the others worse. Reverted at
 * Andrew's read: "change animations back, they looked way better at the
 * beginning of the session." If this is revisited, measure first with
 * npm run check:animation rather than reasoning about frames.
 */
export function sameMarkSet(
  a: RenderedPolotnoElement[],
  b: RenderedPolotnoElement[]
): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((element) => element.id));
  for (const element of b) if (!ids.has(element.id)) return false;
  return true;
}

// Groups are transparent pass-throughs at the same origin (see
// ElementNode's own group branch), so flattening them here lets the
// renderer split a module's elements by type without caring how deeply
// nested they were.
function flattenElements(elements: RenderedPolotnoElement[]): RenderedPolotnoElement[] {
  const out: RenderedPolotnoElement[] = [];
  for (const element of elements) {
    if (element.type === "group") out.push(...flattenElements(element.children ?? []));
    else out.push(element);
  }
  return out;
}

/**
 * MEMOISED, and it is the palette that makes it matter.
 *
 * The editor holds ~127 palette cards, each drawing its module through this
 * component, and NativePlannerEditor calls setActiveDelta on every
 * pointermove of a drag. Nothing between that state and these cards was
 * memoised, so a drag re-rendered every one of them. Counted on a real book
 * with a real gesture: **293 invocations of this component per pointermove**,
 * of which eight were modules on the canvas and the rest were palette
 * previews that had not changed and could not change.
 *
 * A palette card already memoises the elements it hands down, and its other
 * props here are numbers and a literal null, so the whole subtree is skipped
 * once identity is checked. The canvas's own modules still re-render, because
 * their `suppressOuterBorderSize` is a fresh object every frame and they
 * genuinely are changing - eight of those is the work a drag should cost.
 *
 * This does not change what anything draws. Skipping a render whose props are
 * identical produces the same tree, and the arrival animations compare a
 * previous mark set to the current one - with no render there is no change to
 * animate.
 */
function PolotnoJsonRendererImpl({
  elements,
  originX,
  originY,
  scale,
  suppressOuterBorderSize,
  textElements,
  textSizePx = null,
  textEaseMs = 0,
}: {
  elements: RenderedPolotnoElement[];
  originX: number;
  originY: number;
  // Current on-screen zoom — see MIN_ONSCREEN_RECT_PX.
  scale: number;
  // Non-null only while this module is part of an active live resize —
  // see the comment above ElementNode's own use of it.
  suppressOuterBorderSize: { width: number; height: number } | null;
  // Non-null only while this module's box is easing between zone
  // shapes, when rects and text need DIFFERENT geometry and cannot come
  // from one render.
  //
  // Rects are drawn at the larger of the two sizes so the easing box
  // always has something to clip - that is what makes it a window.
  // Text has to be at its FINAL position instead, because text is
  // animated rather than clipped, and it can only animate if its
  // position actually changes at the start of the ease. Sharing one
  // geometry breaks one of the two: at the larger size the text sits
  // still for the whole ease and then jumps when the ease ends, which
  // is what shrinking a todo-checklist looked like.
  textElements?: RenderedPolotnoElement[] | null;
  // Pixel size textElements was rendered at - the module's FINAL
  // geometry. Only read when the rects come from that render too (see
  // animateRects), where it replaces suppressOuterBorderSize: the
  // border being recognised is whichever render actually drew it.
  textSizePx?: { width: number; height: number } | null;
  // Non-zero only while this module's box is easing between zone
  // shapes. Applies to text, and to rects when they are animated rather
  // than clipped - see textPositionTransition and animateRects.
  textEaseMs?: number;
}) {
  // Rects go into one shared <svg> (see RectLayer); everything else —
  // in practice text — stays as absolutely-positioned DOM, which has no
  // hairline problem to solve and whose typography is left untouched by
  // this split. The one behavioural consequence is z-order: every rect
  // now paints beneath every text element, rather than interleaved in
  // array order. That matches how this app's module renderers actually
  // build a module (backgrounds and rules first, labels on top), but it
  // is the thing to check if some module ever draws a filled rect
  // deliberately over its own text.
  const flat = flattenElements(elements);

  // Ids from the module renderers are semantic - `d2-row7`, `header-rule`,
  // `dot-14-9` - so one id names one mark for the life of the module and
  // is usable directly as a React key.
  //
  // They used to be positional counters, `${idPrefix}-${idCounter++}`,
  // which are stable across renders without naming a stable thing:
  // re-render a todo-checklist at a different dayCount and the counter
  // handed the same id to a different logical element, so React reused the
  // node and animated it from what the OLD element occupied to where the
  // NEW one sits. Reported as the todo animating to and from an
  // intermediate point on the bottom right while being dragged.
  //
  // That was patched here by folding the element COUNT into the key, which
  // did stop the wrong animation but at the price of remounting every node
  // in a module whenever its element count changed. A remounted node has
  // no previous geometry and replays the arrival fade, so a resize
  // flickered - everything vanishing and returning - at each snap step
  // that added or removed a row. Reported exactly that way. Semantic ids
  // remove the need for the scope, so the flicker goes with it.
  //
  // moduleIds.test.mts checks that no module emits the same id twice, at
  // every size any of them are drawn at: positional ids were unique for
  // free, and semantic ones are only unique if each name carries the
  // indices that distinguish it.
  const textKey = (element: RenderedPolotnoElement): string => element.id;

  const isRect = (element: RenderedPolotnoElement) => element.type === "figure" && element.subType === "rect";

  // Rects slide to their final geometry instead of being revealed by
  // the clip, WHEN the two renders describe the same set of elements.
  //
  // The window-over-fixed-content design exists because rects could not
  // animate, and the reason they could not is real but narrow: a module
  // whose element count depends on its width gains and loses columns,
  // and a column with no counterpart at the old size has nothing to
  // animate from, so it pops in and out mid-sweep. That is
  // todo-checklist, whose day columns come and go with dayCount.
  //
  // It is not habit-tracker, which has seven days at every width - 19
  // elements at three columns wide and 19 at four, differing only in x.
  // Its day separators were therefore not animating for a reason that
  // did not apply to them: they sat at the wide render's positions from
  // the first frame while the box was still narrow, so the rightmost
  // ones were clipped away and swept back in. Reported as the vertical
  // lines between the days disappearing during the resize, with a
  // request that they slide as a group instead.
  //
  // Equal element counts is a proxy for "every mark has a counterpart",
  // which is what a node needs in order to have a previous geometry to
  // animate FROM. It is only a proxy - `npm run check:behaviour` measures
  // the real thing per module and per axis - but it is the test in force
  // today, and the modules that genuinely cannot animate keep the window
  // they need.
  //
  // Content then tracks the box rather than being cut by it: both
  // interpolate the same easing over the same duration, and a rule at a
  // fixed fraction of the content width stays at that fraction
  // throughout. Nothing overflows, so the clip becomes a no-op for
  // these modules rather than something to fight.
  //
  // ...and only when the box is GROWING. Direction matters, and the two
  // reports that fixed it were opposite directions of the same crossing:
  //
  //   grow  (1 column -> 3): animating is right. Drawn at the final,
  //     larger geometry and merely clipped, the day separators sat at
  //     their end positions from the first frame and were revealed as the
  //     box opened - reported as the lines disappearing, with a request
  //     that they slide as a group instead.
  //
  //   shrink (4 units -> 3): animating is wrong. The rects arrive at the
  //     final, NARROWER geometry immediately while the border is still
  //     wide, so the content pulls away from the box and leaves white
  //     space against the closing edge - reported as the right grid
  //     section jumping to its final place ahead of the border.
  //
  // A shrink wants the clip window to wipe content away; a grow wants the
  // content to travel. suppressOuterBorderSize is the size the content
  // render was drawn at (the larger of the two) and textSizePx is the
  // final size, so the direction is already known here.
  const textFlat = textElements ? flattenElements(textElements) : null;
  // Animating is only meaningful when the two renders describe the same
  // marks; a final render with a changed structure is drawn, not eased.
  const animateRects = !!textFlat && textEaseMs > 0 && sameMarkSet(textFlat, flat);

  // A third case, and the one the sweep cannot serve at all: the two
  // renders are different DRAWINGS, not two sizes of one. A habit-tracker
  // crossing into the sidebar goes from its wide layout to its compact
  // one - 33 elements to 116 - and the larger geometry is then the wide
  // layout, so the whole animation shows a drawing that is about to be
  // replaced, snapping to the compact one at the end. Reported as the
  // horizontal lines not aligning with the position they jump to.
  //
  // There is no larger version of the same thing to wipe away here, so
  // draw the FINAL rects and let the box close over them. Content sits
  // smaller than its box for the length of the shrink, which reads as a
  // wipe; nothing moves when the ease ends, which is the part that was
  // being noticed. Growing needs none of this - the target IS the larger
  // geometry, so flat is already the final drawing.

  const rects = (animateRects ? textFlat : flat).filter(isRect);
  // Text comes from its own render when one is supplied - see
  // textElements. Same origin either way: the two renders differ only
  // in span, never in columnStart/rowStart, so they share a top-left.
  // Text comes from its own render whenever one is supplied, even when
  // the two renders disagree structurally. They can: a todo-checklist
  // crossing a width boundary has four day-columns in the render being
  // swept away and three in the one it is becoming. Mixing is safe here
  // because text is keyed by CONTENT (see textKey) - a label present in
  // both keeps its node and slides to its new position, one that only
  // existed at the old width unmounts, and one that is new appears.
  // Identity is per-label, so a changing count costs nothing.
  //
  // An earlier version rejected the text render when the counts
  // differed, which fell back to the swept render's text and made a
  // todo's title snap at the end of the sweep rather than move with it.
  const rest = (textElements ? flattenElements(textElements) : flat).filter(
    (element) => !isRect(element)
  );
  // Marks that were in the previous render and are not in this one, kept
  // for one fade so they can leave rather than blink out. This is the
  // habit tracker's mode switch: its wide layout and its compact one are
  // structurally different drawings, 20 rects against 57, sharing 2 marks
  // out of 58. Neither mechanism the renderer already had can serve that
  // - the clip window needs a larger version of the same drawing to cut
  // down, and a morph needs counterparts to travel to. So the outgoing
  // marks simply stopped existing, measured as 56 of them wrong on the
  // first frame of a sidebar-to-bottom crossing.
  //
  // EVERY departing mark, and the clip window still decides what is
  // actually seen. The first version of this held only the marks that end
  // up inside the final box, on the theory that the clip sweeps the rest -
  // but that is only true while the drawn render is the union of the two,
  // which is exactly what a mode switch is not. Its incoming drawing does
  // not contain the outgoing marks either, so a mark filtered out here was
  // drawn by nothing at all and vanished rather than being swept.
  //
  // This layer sits inside the same clipping box as every other, so
  // holding everything costs nothing: marks beyond the edge are hidden by
  // the box exactly as before, and the sweep survives. Only the ones that
  // would otherwise be stranded in plain view spend the fade.
  //
  // Held at the origin they were DRAWN at, not the current one: during a
  // zone crossing the module's origin moves, and re-anchoring the
  // outgoing drawing to the incoming origin would slide it sideways as it
  // faded.
  const rectIdsNow = rects.map((element) => element.id).join("|");
  const [prevRects, setPrevRects] = useState<{
    ids: string;
    elements: RenderedPolotnoElement[];
    originX: number;
    originY: number;
  }>({ ids: rectIdsNow, elements: rects, originX, originY });
  const [leavingRects, setLeavingRects] = useState<{
    elements: RenderedPolotnoElement[];
    originX: number;
    originY: number;
  }>({ elements: [], originX, originY });
  if (prevRects.ids !== rectIdsNow) {
    const present = new Set(rects.map((element) => element.id));
    // Only while an ease is actually running. The other time this list
    // changes wholesale is the HANDOVER at the end of one, when the eased
    // render is replaced by the committed one - and the eased render is
    // drawn at the union of the two geometries, a shape neither state
    // has: as wide as the destination and as tall as the origin. Holding
    // that for a fade made it linger visibly after the box had already
    // landed, in both directions. Reported as a wide version at the
    // sidebar's height flashing at the end.
    //
    // A handover is a swap between two drawings of the same committed
    // state, not something leaving the page, so there is nothing there to
    // see out.
    const gone =
      textEaseMs > 0
        ? prevRects.elements.filter((element) => !present.has(element.id))
        : [];
    setPrevRects({ ids: rectIdsNow, elements: rects, originX, originY });
    setLeavingRects({ elements: gone, originX: prevRects.originX, originY: prevRects.originY });
  }
  useEffect(() => {
    if (leavingRects.elements.length === 0) return;
    const timer = setTimeout(
      () => setLeavingRects((prev) => ({ ...prev, elements: [] })),
      MARK_FADE_IN_MS
    );
    return () => clearTimeout(timer);
  }, [leavingRects]);

  // Text that was in the previous render and is not in this one, kept for
  // one fade. Snapshotted during render and compared against the previous
  // snapshot - the same "adjust state during rendering" pattern
  // NativePlannerEditor uses - rather than a useEffect, which this
  // project's lint rules discourage for derived state.
  const textKeysNow = rest.map((element) => textKey(element)).join("|");
  const [prevText, setPrevText] = useState<{ keys: string; elements: RenderedPolotnoElement[] }>({
    keys: textKeysNow,
    elements: rest,
  });
  const [leavingText, setLeavingText] = useState<RenderedPolotnoElement[]>([]);
  if (prevText.keys !== textKeysNow) {
    const present = new Set(rest.map((element) => textKey(element)));
    const gone = prevText.elements.filter((element) => !present.has(textKey(element)));
    setPrevText({ keys: textKeysNow, elements: rest });
    setLeavingText(gone);
  }
  useEffect(() => {
    if (leavingText.length === 0) return;
    const timer = setTimeout(() => setLeavingText([]), MARK_FADE_IN_MS);
    return () => clearTimeout(timer);
  }, [leavingText]);

  return (
    <>
      <RectLayer
        rects={rects}
        originX={originX}
        originY={originY}
        scale={scale}
        suppressOuterBorderSize={animateRects ? textSizePx ?? null : suppressOuterBorderSize}
        easeMs={animateRects ? textEaseMs : 0}
      />
      {/* The outgoing drawing, for exactly one fade. Underneath the
          incoming one in paint order so the new marks read as arriving
          over the old rather than behind them. */}
      {leavingRects.elements.length > 0 && (
        <RectLayer
          rects={leavingRects.elements}
          originX={leavingRects.originX}
          originY={leavingRects.originY}
          scale={scale}
          suppressOuterBorderSize={null}
          easeMs={0}
          leaving
        />
      )}
      {rest.map((element) => (
        <ElementNode
          key={textKey(element)}
          element={element}
          originX={originX}
          originY={originY}
          textEaseMs={textEaseMs}
        />
      ))}
      {/* Text that has just gone, kept mounted for exactly one fade so it
          can leave rather than vanish. React unmounts a node the instant it
          leaves the list, so an exit animation needs the node to outlive
          its own removal - there is no CSS-only way to animate something
          that is no longer in the tree. */}
      {leavingText.map((element) => (
        <ElementNode
          key={`leaving:${textKey(element)}`}
          element={element}
          originX={originX}
          originY={originY}
          textEaseMs={0}
          leaving
        />
      ))}
    </>
  );
}

export const PolotnoJsonRenderer = memo(PolotnoJsonRendererImpl);

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

import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";

// NOTE: this file used to carry a large Firefox-specific workaround here
// — two on-screen thickness floors (strokes and fill hairlines), a
// zoom-clamp on them, a hairline aspect-ratio heuristic, and an
// `isFirefox` flag threaded down from NativePlannerEditor to drive it
// all. Every bit of it existed because rects were absolutely-positioned
// <div>s, whose device-pixel rects Firefox rounds per element. Drawing
// them in one shared <svg> instead (see RectLayer) removed the cause
// rather than compensating for it, so the whole apparatus is gone. See
// RectLayer's own comment for the full reasoning.

// Minimum on-screen thickness, in DEVICE pixels, for a rect thin enough
// to be a rule/divider rather than a shape. NOT a browser workaround —
// the SVG layer made both engines agree — but a legibility floor for the
// on-screen preview only.
//
// Vector antialiasing is faithful: a hairline under one device pixel
// renders at proportional opacity, which is correct and is what the
// printed PDF will do at 300 DPI. On screen at 37% zoom, though, a
// design hairline computes to well under a device pixel and fades to
// nearly invisible — reported directly, "horizontal lines start
// disapearing sooner at around <37%," which sits inside the default
// fit-width view (~0.28-0.43 for a two-page spread).
//
// The divisor is clamped so the floor stops growing once zoomed out past
// MIN_RECT_FLOOR_SCALE. Without that clamp a fixed device-pixel floor
// inflates without bound as you zoom out (at 15% a 2px rule would be
// forced to 4x its design weight), which read as heavy lines — the
// earlier "some lines are too thick" report. Clamped, lines hold their
// weight through the working range and fade gracefully below it.
const MIN_ONSCREEN_RECT_PX = 1.0;
const MIN_RECT_FLOOR_SCALE = 0.3;
// A rect this much thinner than it is long (either axis) is treated as a
// rule, not a small filled shape — comfortably below any checkbox or
// date-box aspect ratio in this app's modules (all closer to square).
const HAIRLINE_ASPECT_RATIO = 0.15;

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


// Non-rect elements only (in practice: text). Rects are drawn by
// RectLayer below instead — see its own comment for why they had to
// leave the DOM entirely. That is also why this no longer takes `scale`
// or `isFirefox`: both existed solely to size the Firefox hairline
// floors, which the SVG layer made unnecessary.
function ElementNode({
  element,
  originX,
  originY,
  textEaseMs,
}: {
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
function RectLayer({
  rects,
  originX,
  originY,
  scale,
  suppressOuterBorderSize,
  structureKey,
}: {
  rects: RenderedPolotnoElement[];
  originX: number;
  originY: number;
  // Current on-screen zoom, needed to convert MIN_ONSCREEN_RECT_PX from
  // device pixels into this layer's own page-pixel coordinate space.
  scale: number;
  suppressOuterBorderSize: { width: number; height: number } | null;
  // See PolotnoJsonRenderer's own comment: element ids are positional,
  // so they only name the same thing within one element structure.
  structureKey: number;
}) {
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

        // SVG centres a stroke on the path, so the rect is inset by half
        // the stroke width to put the stroke's OUTER edge flush with the
        // element's own bounds — matching where the previous inset
        // box-shadow (and the outline before it) drew its ring, so no
        // module's geometry shifts as a result of this change.
        const strokeWidth = hasStroke ? element.strokeWidth ?? 0 : 0;
        const inset = strokeWidth / 2;

        // Legibility floor for fill-only rules — see
        // MIN_ONSCREEN_RECT_PX. Grown outward from the rule's own centre
        // so its position doesn't shift, and only ever applied to the
        // thin axis of something already shaped like a rule.
        let rx = left;
        let ry = top;
        let rw = width;
        let rh = height;
        if (hasFill && !hasStroke) {
          const needed = MIN_ONSCREEN_RECT_PX / Math.max(scale, MIN_RECT_FLOOR_SCALE);
          if (height > 0 && height < width * HAIRLINE_ASPECT_RATIO && needed > height) {
            ry = top - (needed - height) / 2;
            rh = needed;
          } else if (width > 0 && width < height * HAIRLINE_ASPECT_RATIO && needed > width) {
            rx = left - (needed - width) / 2;
            rw = needed;
          }
        }
        return (
          <rect
            key={`${structureKey}:${element.id}`}
            x={rx + inset}
            y={ry + inset}
            width={Math.max(0, rw - strokeWidth)}
            height={Math.max(0, rh - strokeWidth)}
            fill={hasFill ? element.fill : "none"}
            stroke={hasStroke ? element.stroke : undefined}
            strokeWidth={hasStroke ? strokeWidth : undefined}
            opacity={element.opacity ?? 1}
          />
        );
      })}
    </svg>
  );
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

export function PolotnoJsonRenderer({
  elements,
  originX,
  originY,
  scale,
  suppressOuterBorderSize,
  textElements,
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
  // Non-zero only while this module's box is easing between zone
  // shapes. Applies to text only - see textPositionTransition.
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

  // Element ids are positional counters in the module renderers -
  // `${idPrefix}-${idCounter++}` - so an id is stable across renders
  // without naming a stable thing. Re-render a todo-checklist at a
  // different dayCount and the counter hands the same id to a different
  // logical element. React matches the key, reuses the DOM node, and a
  // geometry transition then animates that node from whatever the OLD
  // element occupied to wherever the NEW one sits. Reported as the todo
  // animating to and from an intermediate point on the bottom right
  // while being dragged from the side into the bottom section.
  //
  // Folding the element COUNT into the key fixes that at the source
  // rather than by suppressing the symptom: an id now only names the
  // same thing within one structure, so a structural change produces
  // fresh nodes, and a fresh node has no previous geometry to animate
  // from - it simply appears, which is what it did before any of this.
  // Modules whose element set does not depend on their size, like a
  // labeled-box (heading, rule and border at every width), keep their
  // keys and therefore keep the animation that was asked for.
  //
  // The real fix is semantic ids in the module renderers, so a key
  // names one thing for its whole life. That is a change across all of
  // them plus the server render, and worth doing on its own.
  const structureKey = flat.length;

  // Text is keyed by what it SAYS, not by where it sits in the element
  // list. Rects above are scoped to structureKey precisely because a
  // positional id stops naming the same thing when the element count
  // changes - but that scoping also remounts every node on such a
  // change, and a remounted node has no previous position to animate
  // from. So a todo-checklist's title jumped to its new position
  // instead of sliding to it: its dayCount changed, so the count
  // changed, so its key changed, so it was a new element. Reported
  // exactly that way.
  //
  // Content is the stable identity text actually has. A heading is the
  // same heading at every width, so it keeps its node and slides. A day
  // header that exists at both sizes keeps its node too; one that only
  // exists at the wider size is genuinely new and appears, which is
  // correct. Duplicate strings are disambiguated by order of
  // appearance, which is stable for anything that survives the change.
  const textKeyCounts = new Map<string, number>();
  const textKey = (element: RenderedPolotnoElement): string => {
    if (element.type !== "text") return `${structureKey}:${element.id}`;
    const base = `t:${element.text ?? ""}`;
    const seen = textKeyCounts.get(base) ?? 0;
    textKeyCounts.set(base, seen + 1);
    return `${base}#${seen}`;
  };

  const isRect = (element: RenderedPolotnoElement) => element.type === "figure" && element.subType === "rect";
  const rects = flat.filter(isRect);
  // Text comes from its own render when one is supplied - see
  // textElements. Same origin either way: the two renders differ only
  // in span, never in columnStart/rowStart, so they share a top-left.
  const rest = (textElements ? flattenElements(textElements) : flat).filter((element) => !isRect(element));
  return (
    <>
      <RectLayer
        rects={rects}
        originX={originX}
        originY={originY}
        scale={scale}
        suppressOuterBorderSize={suppressOuterBorderSize}
        structureKey={structureKey}
      />
      {rest.map((element) => (
        <ElementNode
          key={textKey(element)}
          element={element}
          originX={originX}
          originY={originY}
          textEaseMs={textEaseMs}
        />
      ))}
    </>
  );
}

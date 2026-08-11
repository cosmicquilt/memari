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

// Firefox pixel-snaps a CSS `border`'s (and, per the same engine code path,
// `outline`'s) thickness to whole device pixels at composite time, and
// rounds anything under ~1 device px down to 0 instead of antialiasing it
// the way Chrome/WebKit do (confirmed via Bugzilla 1258112/1490361 — a
// long-standing, still-unfixed engine bug, not something specific to this
// code). Plain fills (background-color) aren't hit by that same snapping
// path (Bugzilla 477157 draws exactly this distinction), but a fill only a
// fraction of a device pixel thick still visually fades to near-nothing
// under Firefox's antialiasing. Every hairline/divider/outline this app
// draws is defined in print-space pixels sized for a 300 DPI page (see
// print-spec.ts) and then visually shrunk again by this editor's own zoom
// `scale` on top of that, so at ordinary on-screen zoom levels a "1px" line
// can easily compute to well under 1 real device pixel. Reported symptom
// matched exactly: thin dividers/lines fade or vanish first, then whole
// unfilled module outlines (a labeled-box with no fill, just a stroke,
// reads as "the module disappeared" once its only edge is gone) — and it
// clears the moment the zoom level changes, since which side(s) round to 0
// is scale-dependent, not a permanent DOM state.
//
// Fix, in two parts, both floors rather than rescales — anything already
// thick enough on screen is left exactly as designed:
//
// 1. Strokes render as `outline` (+ a matching negative `outline-offset` to
//    sit it back on the box edge like a border would), not `border` —
//    deliberately: `outline` never reserves layout space or shrinks a
//    border-box element's own content area, so flooring its width for
//    Firefox-safety can't visually swallow a small element's interior the
//    way a floored `border` did on the first pass at this fix (confirmed:
//    the month-grid's small date-number box, ~41x45 page-px with a
//    0.5pt/~2px stroke, turned into a solid-looking blob at lower zoom once
//    its border was floored, reported as "outlines now look thick and
//    weird"). The floored width is additionally capped to a fraction of
//    the element's own size, so even at extreme zoom-out a tiny element's
//    ring can't grow past its own interior — better to fall slightly short
//    of the on-screen floor on a handful of very small, very zoomed-out
//    elements than to turn them into a blob.
// 2. A fill-only rect whose one dimension is much smaller than the other is
//    a ruled/divider line (this app's own consistent pattern for drawing
//    one — see hourlyGridCore.ts/habitTracker.ts/monthGridCore.ts, all
//    render dividers as `fill` rects with a tiny height or width, never a
//    stroke) — its thin dimension gets the same on-screen floor, grown
//    outward from its own center so the line's position doesn't shift.
const MIN_ONSCREEN_STROKE_PX = 1.25;
// A fill rect this much narrower than it is long (or vice versa) is
// treated as a hairline for the floor above, not a small filled shape —
// comfortably below any checkbox/date-box's own aspect ratio in this
// app's modules (all closer to square) so it won't misfire on those.
const HAIRLINE_ASPECT_RATIO = 0.15;

// Both floors above are a workaround for a real Firefox-only engine bug
// (see the comment above) — Chrome/Safari/Edge already render these exact
// same widths correctly via antialiasing and don't need any adjustment.
// Reported directly after the first version of this fix shipped: it grew
// strokes in Chrome too, where nothing was ever missing, and the extra
// width just read as unwanted, unexplained visual weight ("borders still
// look thick and weird" — in Chrome specifically, which never had the
// disappearing-line bug this exists to fix). Gate on Firefox specifically
// rather than trying to detect the bug's actual trigger condition (no
// feature-detectable API for it exists) — computed once at module load,
// not per-render.
const isFirefox = typeof navigator !== "undefined" && /firefox/i.test(navigator.userAgent);

function ElementNode({
  element,
  originX,
  originY,
  scale,
}: {
  element: RenderedPolotnoElement;
  originX: number;
  originY: number;
  scale: number;
}) {
  if (element.type === "group") {
    // Synthetic wrapper renderModuleInstance adds around a non-locked
    // instance's children (see that file's own comment on why —
    // Polotno-specific plumbing for drag/select) — transparent here,
    // just render the children directly at the same origin.
    return (
      <>
        {(element.children ?? []).map((child) => (
          <ElementNode key={child.id} element={child} originX={originX} originY={originY} scale={scale} />
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
        }}
      >
        {element.text}
      </div>
    );
  }

  if (element.type === "figure" && element.subType === "rect") {
    const hasStroke = !!element.stroke && element.stroke !== "none" && (element.strokeWidth ?? 0) > 0;
    const hasFill = !!element.fill && element.fill !== "transparent";

    // Part 1 of the Firefox fix above — see that comment. Floored,
    // then capped to a fraction of the box's own size so the ring can
    // never exceed (and visually swallow) its own interior. Firefox
    // only — see isFirefox's own comment.
    const naturalOutline = hasStroke ? element.strokeWidth ?? 0 : 0;
    let outlineWidth = naturalOutline;
    if (hasStroke && isFirefox) {
      const needed = MIN_ONSCREEN_STROKE_PX / scale;
      const maxSafe = Math.max(naturalOutline, Math.min(width, height) * 0.4);
      outlineWidth = Math.min(Math.max(naturalOutline, needed), maxSafe);
    }

    // Part 2 of the Firefox fix above — a fill-only sliver is a
    // ruled/divider line, not a shape; floor its thin dimension,
    // growing outward from its own center so its position doesn't
    // shift. Firefox only, same reasoning as Part 1.
    let adjLeft = left;
    let adjTop = top;
    let adjWidth = width;
    let adjHeight = height;
    if (isFirefox && hasFill && !hasStroke) {
      const needed = MIN_ONSCREEN_STROKE_PX / scale;
      if (height > 0 && height < width * HAIRLINE_ASPECT_RATIO && needed > height) {
        adjTop = top - (needed - height) / 2;
        adjHeight = needed;
      } else if (width > 0 && width < height * HAIRLINE_ASPECT_RATIO && needed > width) {
        adjLeft = left - (needed - width) / 2;
        adjWidth = needed;
      }
    }

    return (
      <div
        style={{
          position: "absolute",
          left: adjLeft,
          top: adjTop,
          width: adjWidth,
          height: adjHeight,
          background: hasFill ? element.fill : "transparent",
          outline: hasStroke ? `${outlineWidth}px solid ${element.stroke}` : undefined,
          outlineOffset: hasStroke ? `${-outlineWidth}px` : undefined,
          opacity,
          pointerEvents: "none",
        }}
      />
    );
  }

  // Any other element type (none exist in this app's own renderers
  // today) is silently skipped rather than thrown on — an unrecognized
  // shape from a future module renderer shouldn't take the whole page
  // down, just render as a gap the same way a missing renderer already
  // does (see renderModuleInstance.ts's default case for quote-block).
  return null;
}

export function PolotnoJsonRenderer({
  elements,
  originX,
  originY,
  scale,
}: {
  elements: RenderedPolotnoElement[];
  originX: number;
  originY: number;
  // Current on-screen zoom factor of the ancestor transform this renders
  // under — see MIN_ONSCREEN_STROKE_PX's comment for why a stroke's CSS
  // width needs to know it.
  scale: number;
}) {
  return (
    <>
      {elements.map((element) => (
        <ElementNode key={element.id} element={element} originX={originX} originY={originY} scale={scale} />
      ))}
    </>
  );
}

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

// Firefox pixel-snaps a CSS `border`'s thickness to whole device pixels at
// composite time, and rounds anything under ~1 device px down to 0 instead
// of antialiasing it the way Chrome/WebKit do (confirmed via Bugzilla
// 1258112/1490361 — a long-standing, still-unfixed engine bug, not
// something specific to this code). Every hairline this app draws (grid
// dividers, header underlines, module outer borders) is defined in
// print-space pixels sized for a 300 DPI page (see print-spec.ts) and then
// visually shrunk again by this editor's own zoom `scale` on top of that,
// so at ordinary on-screen zoom levels a "1px" line can easily compute to
// well under 1 real device pixel — invisible in Firefox, present in Chrome.
// Reported symptom matched exactly: thin dividers vanish first, then whole
// unfilled module outlines (a labeled-box with no fill, just a border,
// reads as "the module disappeared" once its only border is gone) — and it
// clears the moment the zoom level changes, since which side(s) round to 0
// is scale-dependent, not a permanent DOM state.
//
// Fix: never let a stroke's on-screen (post-transform) width drop below
// MIN_ONSCREEN_BORDER_PX, by growing the pre-transform CSS border-width as
// `scale` shrinks so the two cancel out. This is a floor, not a rescale —
// strokes already thick enough on screen are left exactly as designed.
const MIN_ONSCREEN_BORDER_PX = 1.5;

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
    // See MIN_ONSCREEN_BORDER_PX's comment above — floor the CSS
    // border-width so it never renders thinner than that on screen.
    const borderWidth = hasStroke ? Math.max(element.strokeWidth ?? 0, MIN_ONSCREEN_BORDER_PX / scale) : 0;
    return (
      <div
        style={{
          position: "absolute",
          left,
          top,
          width,
          height,
          boxSizing: "border-box",
          background: hasFill ? element.fill : "transparent",
          border: hasStroke ? `${borderWidth}px solid ${element.stroke}` : undefined,
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
  // under — see MIN_ONSCREEN_BORDER_PX's comment for why a stroke's CSS
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

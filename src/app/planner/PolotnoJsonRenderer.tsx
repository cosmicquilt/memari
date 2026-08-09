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

function ElementNode({ element, originX, originY }: { element: RenderedPolotnoElement; originX: number; originY: number }) {
  if (element.type === "group") {
    // Synthetic wrapper renderModuleInstance adds around a non-locked
    // instance's children (see that file's own comment on why —
    // Polotno-specific plumbing for drag/select) — transparent here,
    // just render the children directly at the same origin.
    return (
      <>
        {(element.children ?? []).map((child) => (
          <ElementNode key={child.id} element={child} originX={originX} originY={originY} />
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
          border: hasStroke ? `${element.strokeWidth}px solid ${element.stroke}` : undefined,
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
}: {
  elements: RenderedPolotnoElement[];
  originX: number;
  originY: number;
}) {
  return (
    <>
      {elements.map((element) => (
        <ElementNode key={element.id} element={element} originX={originX} originY={originY} />
      ))}
    </>
  );
}

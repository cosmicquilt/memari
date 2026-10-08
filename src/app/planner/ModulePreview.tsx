"use client";

// A MODULE AS IT WOULD ACTUALLY BE DRAWN, scaled to the width it is given:
// the palette's cards, the module browser's grid and its detail. Moved out
// of PaletteCard (2026-10-05) when the browser needed the same picture.
//
// It renders the module for real - the same renderModuleInstance the page
// uses - at its narrowest single-column form: ONE DAY UNIT, a quarter of the
// page's columns, because that is the narrowest a module ever really gets,
// so a preview promises the least and every real drop is at least this
// legible. (It once said columnSpan 1, which on the 24-column lattice is one
// 1/4in dot - "the preview looks crazy big, two squares and big text".)
//
// The box's height is always known - cheap, and what keeps a card the same
// height before and after its drawing arrives. The drawing is the expensive
// part, and waits for `draw` (see ModulePalette's drawCards).

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { PolotnoJsonRenderer } from "./PolotnoJsonRenderer";
import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { getMinRowSpanForSlug } from "@/lib/moduleMinRowSpan";
import { dayUnitColumns, gridCellToPixels, type PageGrid } from "@/lib/grid";
import { CREAM } from "@/lib/cream";

export const ModulePreview = memo(function ModulePreview({
  slug,
  previewProps,
  pageGrid,
  fontFamily,
  draw,
  initialWidthPx,
  maxHeightPx,
  instanceKey = "preview",
}: {
  slug: string;
  previewProps: Record<string, unknown>;
  pageGrid: PageGrid;
  fontFamily: string;
  /** False until drawings are wanted; the box is sized either way. */
  draw: boolean;
  /** The width to draw at before the box has been measured. */
  initialWidthPx: number;
  /** Very tall modules (a year in pixels) are cut here, fading out. */
  maxHeightPx?: number;
  /** Distinguishes two previews of one module on screen at once. */
  instanceKey?: string;
}) {
  const preview = useMemo(() => {
    const previewColumns = dayUnitColumns(pageGrid);
    const rowSpan = getMinRowSpanForSlug(slug, pageGrid, previewColumns, previewProps);
    const placement = { columnStart: 0, rowStart: 0, columnSpan: previewColumns, rowSpan };
    return { placement, rect: gridCellToPixels(pageGrid, placement) };
  }, [slug, previewProps, pageGrid]);
  const elements = useMemo(
    () =>
      draw
        ? renderModuleInstance(
            {
              id: `${instanceKey}-${slug}`,
              locked: false,
              ...preview.placement,
              propValues: previewProps,
              moduleType: { slug },
            },
            pageGrid,
            fontFamily
          )
        : null,
    [draw, preview, slug, previewProps, pageGrid, fontFamily, instanceKey]
  );

  // MEASURED, not assumed: the box flexes with whatever holds it (a panel
  // that grows a scrollbar, a drawer dragged wider), and a drawing at the
  // old width would have its right edge clipped. initialWidthPx is right on
  // the first paint in the common case; the observer only corrects it.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [widthPx, setWidthPx] = useState(initialWidthPx);
  useEffect(() => {
    const node = boxRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0;
      if (measured > 0) setWidthPx(measured);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // WHAT IS DRAWN, not only the box: an icon strip sets its label above its
  // cell and its glyphs run a few pixels below (water-week draws from 6px
  // above its box to 3px under it), which on a page falls in the gap between
  // modules and in a preview was cut off. The view grows to take it in.
  const view = useMemo(() => {
    const r = preview.rect;
    if (!elements || elements.length === 0) return r;
    let top = r.y;
    let bottom = r.y + r.height;
    for (const e of elements as Array<{ y?: number; height?: number }>) {
      if (typeof e.y !== "number") continue;
      top = Math.min(top, e.y);
      bottom = Math.max(bottom, e.y + (typeof e.height === "number" ? e.height : 0));
    }
    return { x: r.x, y: top, width: r.width, height: bottom - top };
  }, [elements, preview.rect]);
  const scale = widthPx / view.width;
  const fullHeight = view.height * scale;
  const cut = maxHeightPx !== undefined && fullHeight > maxHeightPx;

  return (
    // Square-cornered on purpose: a module's own outer border sits exactly
    // on these bounds, so a radius here would clip its real corners off.
    <div
      ref={boxRef}
      style={{
        position: "relative",
        width: "100%",
        height: cut ? maxHeightPx : fullHeight,
        overflow: "hidden",
        background: CREAM,
        pointerEvents: "none",
      }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {elements && (
          <PolotnoJsonRenderer elements={elements} originX={view.x} originY={view.y} scale={scale} suppressOuterBorderSize={null} />
        )}
      </div>
      {cut && (
        <div
          aria-hidden="true"
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 56, background: `linear-gradient(transparent, ${CREAM})` }}
        />
      )}
    </div>
  );
});

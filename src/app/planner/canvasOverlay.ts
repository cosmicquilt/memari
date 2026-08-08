"use client";

// Shared plumbing for rendering plain DOM overlays positioned on top of
// Polotno's canvas (empty-zone dropzone buttons, edge-hover resize
// handles) — both need to convert a page-space pixel rectangle (the
// output of gridCellToPixels, in the 0..PRINT_WIDTH_PX/PRINT_HEIGHT_PX
// space) into real on-screen coordinates.
//
// Polotno doesn't expose a documented "give me page X's screen rect" API
// (checked — nothing in its type definitions does this), so this reads
// it directly off the DOM instead: Workspace renders each page as a
// `.polotno-page-container` div (confirmed by reading Polotno's own
// source, not documented), sized to exactly the page's trim+bleed box —
// the same PRINT_WIDTH_PX/PRINT_HEIGHT_PX this app already loads pages
// at, since no separate Polotno-level bleed was ever configured. That
// means a page-space point maps to screen space by simple proportional
// scaling against that container's rendered size, without needing to
// separately track Polotno's own zoom/pan state at all.
//
// There's no page-id attribute on that div, so pages are matched by DOM
// order instead, which should reliably match store.pages order (and
// this app's own `pages` prop order — left page first, right page
// second) since layout="horizontal" renders them left-to-right.

import { useEffect, useState } from "react";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";

const PAGE_CONTAINER_SELECTOR = ".polotno-page-container";

function rectsEqual(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

// Polls each page container's bounding rect every animation frame rather
// than trying to enumerate every event that could move/resize it (zoom
// buttons, window resize, the side panel opening/closing, a pan
// gesture, ...) — cheap (two getBoundingClientRect() calls), and correct
// regardless of *what* caused the change instead of only the specific
// triggers this code happens to know to listen for.
export function usePageScreenRects(pageIds: string[]): Record<string, DOMRect | null> {
  const [rects, setRects] = useState<Record<string, DOMRect | null>>({});
  const pageIdsKey = pageIds.join(",");

  useEffect(() => {
    const ids = pageIdsKey ? pageIdsKey.split(",") : [];
    let frameId: number;

    const measure = () => {
      const containers = document.querySelectorAll<HTMLElement>(PAGE_CONTAINER_SELECTOR);
      const next: Record<string, DOMRect | null> = {};
      ids.forEach((id, i) => {
        const el = containers[i];
        next[id] = el ? el.getBoundingClientRect() : null;
      });
      setRects((prev) => {
        const changed = ids.some((id) => !rectsEqual(prev[id] ?? null, next[id] ?? null));
        return changed ? next : prev;
      });
      frameId = requestAnimationFrame(measure);
    };

    frameId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frameId);
  }, [pageIdsKey]);

  return rects;
}

// Converts a page-space pixel rect (already in 0..PRINT_WIDTH_PX /
// 0..PRINT_HEIGHT_PX units, e.g. from gridCellToPixels) to viewport
// coordinates suitable for a `position: fixed` overlay element.
export function pageSpaceToScreen(
  pageRect: DOMRect,
  pixelRect: { x: number; y: number; width: number; height: number }
): { left: number; top: number; width: number; height: number } {
  const scaleX = pageRect.width / PRINT_WIDTH_PX;
  const scaleY = pageRect.height / PRINT_HEIGHT_PX;
  return {
    left: pageRect.left + pixelRect.x * scaleX,
    top: pageRect.top + pixelRect.y * scaleY,
    width: pixelRect.width * scaleX,
    height: pixelRect.height * scaleY,
  };
}

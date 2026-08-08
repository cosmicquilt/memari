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
// source, not documented). There's no page-id attribute on that div, so
// pages are matched by DOM order instead, which reliably matches
// store.pages order (and this app's own `pages` prop order — left page
// first, right page second) since layout="horizontal" renders them
// left-to-right — verified directly in a live page (two containers,
// left one flagged "active-page", side by side with no overlap).
//
// What that container does NOT do is match the page's own aspect ratio.
// Verified directly in a live 2-page horizontal spread: the container
// was 396x670px, but the actual rendered page only occupied 396x560px
// of it (store.scale applied uniformly — 2175*scale=396.1,
// 3075*scale=560), letterboxed with a real, measurable 55px gap above
// and below (confirmed against the DOM's own
// `transform: translate(0px, 55px) ... scaleX(0.182) scaleY(0.182)` on
// Polotno's interactive elements-container layer — 55 is exactly
// (670-560)/2). Using the container's raw height as if it were the
// page's would make everything computed from it too tall by the same
// ~20% the container overshoots the true page height by, and miss the
// offset entirely — exactly what an overlay drawn from the earlier,
// wrong version of this function looked like. This is why store.scale
// is threaded through here instead of deriving a scale factor from the
// container's own (possibly letterboxed) dimensions.

import { useEffect, useState } from "react";
import type { createStore } from "polotno/model/store";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";

const PAGE_CONTAINER_SELECTOR = ".polotno-page-container";

function rectsEqual(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}

// Polls every animation frame rather than trying to enumerate every
// event that could move/resize/rescale a page (zoom buttons, window
// resize, the side panel opening/closing, a pan gesture, ...) — cheap
// (a couple of getBoundingClientRect() calls plus reading store.scale),
// and correct regardless of *what* caused the change instead of only
// the specific triggers this code happens to know to listen for.
//
// Returns the page's *actual* rendered rect (already corrected for the
// container/page aspect-ratio mismatch above), not the raw container
// rect — callers can treat it as truly 1:1 with
// 0..PRINT_WIDTH_PX/0..PRINT_HEIGHT_PX page space.
export function usePageScreenRects(
  store: ReturnType<typeof createStore>,
  pageIds: string[]
): Record<string, DOMRect | null> {
  const [rects, setRects] = useState<Record<string, DOMRect | null>>({});
  const pageIdsKey = pageIds.join(",");

  useEffect(() => {
    const ids = pageIdsKey ? pageIdsKey.split(",") : [];
    let frameId: number;

    const measure = () => {
      const containers = document.querySelectorAll<HTMLElement>(PAGE_CONTAINER_SELECTOR);
      const scale = store.scale as number;
      const scaledWidth = PRINT_WIDTH_PX * scale;
      const scaledHeight = PRINT_HEIGHT_PX * scale;

      const next: Record<string, DOMRect | null> = {};
      ids.forEach((id, i) => {
        const el = containers[i];
        if (!el || !scale) {
          next[id] = null;
          return;
        }
        const containerRect = el.getBoundingClientRect();
        // The page is centered within the (possibly larger) container on
        // whichever axis isn't the binding "fit" constraint — see the
        // file-level comment. Halving the leftover space on each axis
        // recovers the true top-left corner regardless of which axis (if
        // either) actually has slack.
        const offsetX = (containerRect.width - scaledWidth) / 2;
        const offsetY = (containerRect.height - scaledHeight) / 2;
        next[id] = new DOMRect(containerRect.left + offsetX, containerRect.top + offsetY, scaledWidth, scaledHeight);
      });

      setRects((prev) => {
        const changed = ids.some((id) => !rectsEqual(prev[id] ?? null, next[id] ?? null));
        return changed ? next : prev;
      });
      frameId = requestAnimationFrame(measure);
    };

    frameId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frameId);
  }, [store, pageIdsKey]);

  return rects;
}

// Converts a page-space pixel rect (already in 0..PRINT_WIDTH_PX /
// 0..PRINT_HEIGHT_PX units, e.g. from gridCellToPixels) to viewport
// coordinates suitable for a `position: fixed` overlay element. Takes
// the *corrected* rect from usePageScreenRects above, not a raw
// container rect.
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

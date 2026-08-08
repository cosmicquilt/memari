"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { createStore } from "polotno/model/store";
import { gridCellToPixels, type PageGrid } from "@/lib/grid";
import { gatherLiveTrackedRects, type PolotnoNode } from "./polotnoTree";

const EDGE_THRESHOLD_PX = 20; // screen px - deliberately zoom-independent (bumped from 8: too easy to miss)

// Bypasses Polotno's own resize transformer entirely (resizable:false is
// forced on every module's children — see renderModuleInstance.ts) in
// favor of a custom edge-hover-and-drag interaction that, on release,
// calls into the exact same updateModuleSize/handleResizeModule path
// the Properties panel's stepper buttons already use. That's
// deliberate: Polotno's native resize would visually stretch a module's
// children (scaling width/height/position directly), which doesn't do
// anything sensible for content that's recomputed from fixed-pt
// measurements for a given geometry rather than meant to be stretched —
// the same reasoning that led to the stepper buttons in the first
// place. This just adds a more fluid way to trigger the identical,
// already-correct underlying action.
//
// No live visual preview while dragging (unlike the stepper buttons'
// instant-apply-on-click, which this matches by only calling the server
// once, on release) — an accurate preview would mean re-rendering the
// module's real content continuously during the drag, which needs a
// server round trip this hook deliberately avoids mid-gesture. The
// cursor changing on hover, and the eventual resize on release, are the
// only feedback for now; a ghost-outline preview would be a reasonable
// follow-up.
export function useEdgeResize({
  store,
  pageRectsRef,
  selectedModuleId,
  moduleGridInfo,
  moduleConfig,
  pageGrids,
  onResize,
  onResizeAdjacent,
}: {
  store: ReturnType<typeof createStore>;
  // Shared with EmptyZoneOverlay via PlannerEditorCanvas, rather than
  // each caller running its own usePageScreenRects independently — see
  // the comment where PlannerEditorCanvas calls that hook.
  pageRectsRef: RefObject<Record<string, DOMRect | null>>;
  selectedModuleId: string | null;
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>;
  moduleConfig: Record<string, { slug: string; propValues: Record<string, unknown> }>;
  pageGrids: Record<string, PageGrid>;
  onResize: (instanceId: string, size: { columnSpan: number; rowSpan: number }) => Promise<void>;
  onResizeAdjacent: (topInstanceId: string, bottomInstanceId: string, deltaRows: number) => Promise<void>;
}) {
  // Refs, not state - none of this needs to trigger a re-render; it just
  // needs to survive across pointer event callbacks for one gesture.
  const hoverEdgeRef = useRef<"bottom" | "right" | null>(null);
  const dragRef = useRef<{
    moduleId: string;
    pageId: string;
    edge: "bottom" | "right";
    startClientX: number;
    startClientY: number;
    startColumnSpan: number;
    startRowSpan: number;
  } | null>(null);

  useEffect(() => {
    const findModulePageId = (moduleId: string): string | null => {
      for (const page of store.pages) {
        if (((page.children ?? []) as unknown as PolotnoNode[]).some((c) => c.id === moduleId)) {
          return page.id;
        }
      }
      return null;
    };

    // The module's current on-screen bounding box — derived fresh each
    // time from its live grid cell (gatherLiveTrackedRects) rather than
    // cached, since a resize-hover can happen any time after a drag has
    // moved it.
    const getModuleScreenRect = (moduleId: string) => {
      const pageId = findModulePageId(moduleId);
      const pageGrid = pageId ? pageGrids[pageId] : undefined;
      const pageRect = pageId ? pageRectsRef.current[pageId] : undefined;
      const page = pageId ? store.pages.find((p) => p.id === pageId) : undefined;
      if (!pageId || !pageGrid || !pageRect || !page) return null;
      const [cell] = gatherLiveTrackedRects(page, pageGrid, moduleGridInfo).filter((r) => r.id === moduleId);
      if (!cell) return null;
      const pixelRect = gridCellToPixels(pageGrid, cell);
      const scaleX = pageRect.width / pageGrid.widthPx;
      const scaleY = pageRect.height / pageGrid.heightPx;
      return {
        pageId,
        pageGrid,
        pageRect,
        left: pageRect.left + pixelRect.x * scaleX,
        top: pageRect.top + pixelRect.y * scaleY,
        width: pixelRect.width * scaleX,
        height: pixelRect.height * scaleY,
      };
    };

    // Page-space pixels added per one more column/row span — not simply
    // "one cell's own width," since a multi-span component's own
    // rendered size absorbs its internal gaps too (see grid.ts's
    // gridCellToPixels: span*cellSize + (span-1)*gap). The difference
    // between a 1-span and 2-span box's width/height is exactly that
    // per-additional-cell pitch, reusing the existing public
    // gridCellToPixels rather than reaching into grid.ts's own internal
    // cell-size math.
    const cellPitch = (pageGrid: PageGrid) => {
      const one = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 });
      const twoCols = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan: 2, rowSpan: 1 });
      const twoRows = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2 });
      return { columnPagePx: twoCols.width - one.width, rowPagePx: twoRows.height - one.height };
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (dragRef.current) {
        // Mid-drag: cursor stays fixed to the edge being dragged (no
        // live preview - see the file-level comment on why not), so
        // there's nothing to recompute here. The actual delta is only
        // ever computed once, on release (handlePointerUp).
        document.body.style.cursor = dragRef.current.edge === "right" ? "ew-resize" : "ns-resize";
        return;
      }

      // Not dragging - just checking hover proximity to the selected
      // module's edges, to show the right cursor.
      if (!selectedModuleId) {
        if (hoverEdgeRef.current) {
          hoverEdgeRef.current = null;
          document.body.style.cursor = "";
        }
        return;
      }
      const slug = moduleConfig[selectedModuleId]?.slug;
      const allowColumnResize = slug === "labeled-box";
      const rect = getModuleScreenRect(selectedModuleId);
      if (!rect) return;

      const nearBottom = Math.abs(e.clientY - (rect.top + rect.height)) <= EDGE_THRESHOLD_PX;
      const nearRight = allowColumnResize && Math.abs(e.clientX - (rect.left + rect.width)) <= EDGE_THRESHOLD_PX;
      const withinModuleX = e.clientX >= rect.left - EDGE_THRESHOLD_PX && e.clientX <= rect.left + rect.width + EDGE_THRESHOLD_PX;
      const withinModuleY = e.clientY >= rect.top - EDGE_THRESHOLD_PX && e.clientY <= rect.top + rect.height + EDGE_THRESHOLD_PX;

      let edge: "bottom" | "right" | null = null;
      if (nearBottom && withinModuleX) edge = "bottom";
      else if (nearRight && withinModuleY) edge = "right";

      hoverEdgeRef.current = edge;
      document.body.style.cursor = edge === "bottom" ? "ns-resize" : edge === "right" ? "ew-resize" : "";
    };

    // Capture phase + stopPropagation: only engages when the pointer is
    // actually in a resize-edge zone (which itself requires a module to
    // already be selected from a prior, normal click), so every other
    // interaction — selecting, dragging to reposition, clicking
    // elsewhere — passes through completely untouched. When it does
    // engage, it has to run and stop the event before Polotno's own
    // canvas click/drag handling ever sees it, or this would fight with
    // Polotno's own interpretation of the same gesture.
    const handlePointerDown = (e: PointerEvent) => {
      if (!hoverEdgeRef.current || !selectedModuleId) return;
      const pageId = findModulePageId(selectedModuleId);
      const span = moduleGridInfo[selectedModuleId];
      if (!pageId || !span) return;

      e.preventDefault();
      e.stopPropagation();
      dragRef.current = {
        moduleId: selectedModuleId,
        pageId,
        edge: hoverEdgeRef.current,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startColumnSpan: span.columnSpan,
        startRowSpan: span.rowSpan,
      };
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      document.body.style.cursor = "";
      if (!drag) return;

      const pageGrid = pageGrids[drag.pageId];
      const pageRect = pageRectsRef.current[drag.pageId];
      if (!pageGrid || !pageRect) return;
      const { columnPagePx, rowPagePx } = cellPitch(pageGrid);
      const scaleX = pageRect.width / pageGrid.widthPx;
      const scaleY = pageRect.height / pageGrid.heightPx;

      if (drag.edge === "right") {
        const nextColumnSpan =
          drag.startColumnSpan + Math.round((e.clientX - drag.startClientX) / (columnPagePx * scaleX));
        if (nextColumnSpan === drag.startColumnSpan) return;
        onResize(drag.moduleId, { columnSpan: nextColumnSpan, rowSpan: drag.startRowSpan }).catch((err) => {
          alert(err instanceof Error ? err.message : String(err));
        });
        return;
      }

      // edge === "bottom" — if another tracked module sits directly below
      // this one in the same column (its rowStart picking up exactly
      // where this one's rowSpan ends), couple the resize: the shared
      // boundary slides, growing one and shrinking the other by the same
      // amount, so there's never a gap (or an overlap) left between them.
      // Falls back to the plain single-module resize when there's nothing
      // below to couple with.
      const rawDeltaRows = Math.round((e.clientY - drag.startClientY) / (rowPagePx * scaleY));
      if (rawDeltaRows === 0) return;

      const page = store.pages.find((p) => p.id === drag.pageId);
      const liveRects = page ? gatherLiveTrackedRects(page, pageGrid, moduleGridInfo) : [];
      const dragRect = liveRects.find((r) => r.id === drag.moduleId);
      const below = dragRect
        ? liveRects.find(
            (r) =>
              r.id !== drag.moduleId &&
              r.columnStart === dragRect.columnStart &&
              r.columnSpan === dragRect.columnSpan &&
              r.rowStart === dragRect.rowStart + dragRect.rowSpan
          )
        : undefined;

      if (below) {
        const deltaRows = Math.max(-(drag.startRowSpan - 1), Math.min(below.rowSpan - 1, rawDeltaRows));
        if (deltaRows === 0) return;
        onResizeAdjacent(drag.moduleId, below.id, deltaRows).catch((err) => {
          alert(err instanceof Error ? err.message : String(err));
        });
        return;
      }

      const nextRowSpan = drag.startRowSpan + rawDeltaRows;
      if (nextRowSpan === drag.startRowSpan) return;
      onResize(drag.moduleId, { columnSpan: drag.startColumnSpan, rowSpan: nextRowSpan }).catch((err) => {
        alert(err instanceof Error ? err.message : String(err));
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
    };
    // pageRectsRef's identity is stable across renders (usePageScreenRects
    // returns the same ref object every time, via its own internal
    // useRef) — included below to satisfy exhaustive-deps, but its value
    // is always read fresh via .current inside the handlers, never
    // captured, so this effect doesn't actually need to re-run when it
    // "changes."
  }, [store, selectedModuleId, moduleGridInfo, moduleConfig, pageGrids, pageRectsRef, onResize, onResizeAdjacent]);
}

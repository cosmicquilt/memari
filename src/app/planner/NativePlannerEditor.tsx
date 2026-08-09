"use client";

// Native CSS Grid replacement for PlannerEditorCanvas.tsx (Polotno-
// hosted), per the migration plan. This version adds drag-to-reposition
// via @dnd-kit/core, on top of the static-rendering checkpoint that
// shipped first — layout and interaction verified separately, on
// purpose, so a bug in one couldn't get compounded with a bug in the
// other.
//
// Grid configuration (gridTemplateColumns/Rows: repeat(N, 1fr), gap,
// padding, border-box) is a deliberate, exact translation of grid.ts's
// own usableArea() math — CSS Grid's 1fr-track sizing computes the
// identical cellWidth/cellHeight formula gridCellToPixels already uses
// server-side, so each module's container just needs gridColumn/gridRow
// (the browser's own grid engine places it) while landing pixel-
// identical to what the server computed for each element's own x/y.
//
// One thing worth being deliberate about: a module's placement
// (columnStart/rowStart/columnSpan/rowSpan, tracked in `placements`
// state, mutable via drag) is kept entirely separate from its rendered
// content (elements/originX/originY, read straight from the loaded
// props, never touched by a reposition). Repositioning doesn't change
// what's *inside* a module, only which grid cell its container sits in
// — recomputing originX/originY from the module's *current* placement
// instead of the origin its elements were actually generated against
// would silently misalign every element inside it by exactly the drag
// distance. A future resize implementation is different: resizing
// genuinely changes a module's internal layout, so it'll need to refetch
// fresh elements/origin from the server, the same way the Polotno-hosted
// editor's swapCanvasElement already does for resize today.
//
// Cross-page dragging isn't specially prevented — it doesn't need to be.
// The delta-based target cell is always resolved against the dragged
// module's own page's grid, and clampGridPlacement keeps it within that
// page's own bounds regardless of how far the pointer actually moved, so
// a drag toward the other page just clamps at the edge instead of
// crossing over. Matches this project's existing "skip cross-spine
// dragging" scope decision from earlier this session, for free.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { LoadedPage } from "./loadPlannerPages";
import type { WeekSettings } from "./WeekSettingsPanel";
import { PolotnoJsonRenderer } from "./PolotnoJsonRenderer";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import {
  gridCellToPixels,
  pixelsToGridCell,
  clampGridPlacement,
  resolveModulePlacement,
  type GridRect,
  type PageGrid,
} from "@/lib/grid";
import { updateModulePlacement } from "./actions";

const PAGE_GAP_PX = 0; // matches PlannerEditorCanvas's Workspace pageGap={0}

type Placement = { columnStart: number; rowStart: number; columnSpan: number; rowSpan: number };

function NativeModule({
  instanceId,
  locked,
  placement,
  elements,
  originX,
  originY,
  isDragging,
}: {
  instanceId: string;
  locked: boolean;
  placement: Placement;
  elements: LoadedPage["moduleInstances"][number]["elements"];
  originX: number;
  originY: number;
  isDragging: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: instanceId, disabled: locked });
  return (
    <div
      ref={locked ? undefined : setNodeRef}
      {...(locked ? {} : listeners)}
      {...(locked ? {} : attributes)}
      style={{
        position: "relative",
        gridColumn: `${placement.columnStart + 1} / span ${placement.columnSpan}`,
        gridRow: `${placement.rowStart + 1} / span ${placement.rowSpan}`,
        cursor: locked ? "default" : "grab",
        opacity: isDragging ? 0.35 : 1,
        // Recommended by @dnd-kit for PointerSensor-driven drags — lets
        // the browser's own touch-scroll gesture get preempted cleanly
        // once a drag actually starts, instead of fighting it.
        touchAction: locked ? undefined : "none",
      }}
    >
      <PolotnoJsonRenderer elements={elements} originX={originX} originY={originY} />
    </div>
  );
}

function NativePage({
  page,
  placements,
  activeId,
}: {
  page: LoadedPage;
  placements: Record<string, Placement>;
  activeId: string | null;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: PRINT_WIDTH_PX,
        height: PRINT_HEIGHT_PX,
        background: "white",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: `repeat(${page.pageGrid.gridColumns}, 1fr)`,
        gridTemplateRows: `repeat(${page.pageGrid.gridRows}, 1fr)`,
        gap: page.pageGrid.gridGapPx,
        padding: page.pageGrid.marginPx,
        flexShrink: 0,
      }}
    >
      {page.moduleInstances.map((mi) => {
        const placement = placements[mi.id];
        if (!placement) return null;
        return (
          <NativeModule
            key={mi.id}
            instanceId={mi.id}
            locked={mi.locked}
            placement={placement}
            elements={mi.elements}
            originX={mi.originX}
            originY={mi.originY}
            isDragging={activeId === mi.id}
          />
        );
      })}
    </div>
  );
}

export function NativePlannerEditor({
  pages,
}: {
  pages: LoadedPage[];
  weekSettings: WeekSettings;
}) {
  // Current grid placement per module instance — seeded from the loaded
  // snapshot, mutated by drag-to-reposition below. Deliberately separate
  // from each instance's static elements/origin (see file-level
  // comment) — this is the *only* thing a reposition changes.
  const [placements, setPlacements] = useState<Record<string, Placement>>(() => {
    const map: Record<string, Placement> = {};
    for (const page of pages) {
      for (const mi of page.moduleInstances) {
        map[mi.id] = {
          columnStart: mi.columnStart,
          rowStart: mi.rowStart,
          columnSpan: mi.columnSpan,
          rowSpan: mi.rowSpan,
        };
      }
    }
    return map;
  });

  // Static per-instance info that a reposition never touches — which
  // page it's on, whether it's locked, and its rendered content.
  const moduleLookup = useMemo(() => {
    const map = new Map<
      string,
      { pageId: string; locked: boolean; elements: LoadedPage["moduleInstances"][number]["elements"]; originX: number; originY: number }
    >();
    for (const page of pages) {
      for (const mi of page.moduleInstances) {
        map.set(mi.id, { pageId: page.pageId, locked: mi.locked, elements: mi.elements, originX: mi.originX, originY: mi.originY });
      }
    }
    return map;
  }, [pages]);

  const pageGridByPageId = useMemo(() => {
    const map: Record<string, PageGrid> = {};
    for (const page of pages) map[page.pageId] = page.pageGrid;
    return map;
  }, [pages]);

  const [viewportWidth, setViewportWidth] = useState<number>(1200);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const spreadWidthPx = pages.length * PRINT_WIDTH_PX + Math.max(0, pages.length - 1) * PAGE_GAP_PX;
  const scale = useMemo(() => {
    const available = viewportWidth - 80;
    return Math.min(1, Math.max(0.1, available / spreadWidthPx));
  }, [viewportWidth, spreadWidthPx]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A small activation distance, not an instant-trigger sensor — without
  // it, a plain click (no intended drag at all) can register as a
  // zero-distance "drag" and briefly flicker the dragging/opacity state.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const instanceId = String(event.active.id);
      const info = moduleLookup.get(instanceId);
      const current = placements[instanceId];
      if (!info || !current) return;
      const pageGrid = pageGridByPageId[info.pageId];
      if (!pageGrid) return;

      // dnd-kit's delta is raw screen pixels, unaware of our own scale
      // transform — divide by the current scale to recover page-space
      // pixels (verified exactly correct in Phase 0's dnd-kit spike).
      const dxPagePx = event.delta.x / scale;
      const dyPagePx = event.delta.y / scale;
      if (dxPagePx === 0 && dyPagePx === 0) return;

      const currentPixel = gridCellToPixels(pageGrid, current);
      const draggedPixel = { x: currentPixel.x + dxPagePx, y: currentPixel.y + dyPagePx };
      const nearestCell = clampGridPlacement(pageGrid, {
        ...pixelsToGridCell(pageGrid, draggedPixel),
        columnSpan: current.columnSpan,
        rowSpan: current.rowSpan,
      });
      const candidate: GridRect = { ...nearestCell, columnSpan: current.columnSpan, rowSpan: current.rowSpan };

      const others: Array<GridRect & { id: string; locked: boolean }> = [];
      for (const [id, placement] of Object.entries(placements)) {
        if (id === instanceId) continue;
        const otherInfo = moduleLookup.get(id);
        if (!otherInfo || otherInfo.pageId !== info.pageId) continue;
        others.push({ ...placement, id, locked: otherInfo.locked });
      }

      // The dragged module's own placement *before this drag* is exactly
      // `current` — no separate ref to track it needed here (unlike
      // PlannerEditorCanvas's lastRowStartRef), since position already
      // lives in this component's own React state instead of being read
      // live off a Polotno canvas that's already moved by the time a
      // resolve runs.
      const { placement: resolved, reflow } = resolveModulePlacement(pageGrid, candidate, others, current.rowStart);

      if (resolved.columnStart === current.columnStart && resolved.rowStart === current.rowStart && reflow.length === 0) {
        return;
      }

      setPlacements((prev) => {
        const next = { ...prev };
        next[instanceId] = { ...current, columnStart: resolved.columnStart, rowStart: resolved.rowStart };
        for (const move of reflow) {
          const prevPlacement = prev[move.id];
          if (prevPlacement) next[move.id] = { ...prevPlacement, rowStart: move.rowStart };
        }
        return next;
      });

      const updates = [updateModulePlacement(instanceId, { columnStart: resolved.columnStart, rowStart: resolved.rowStart })];
      for (const move of reflow) {
        const prevPlacement = placements[move.id];
        if (prevPlacement) {
          updates.push(updateModulePlacement(move.id, { columnStart: prevPlacement.columnStart, rowStart: move.rowStart }));
        }
      }
      Promise.all(updates).catch((err) => {
        setSaveError(err instanceof Error ? err.message : String(err));
      });
    },
    [placements, moduleLookup, pageGridByPageId, scale]
  );

  const activeInfo = activeId ? moduleLookup.get(activeId) : null;
  const activePlacement = activeId ? placements[activeId] : null;
  const activePageGrid = activeInfo ? pageGridByPageId[activeInfo.pageId] : null;
  const activePixelSize =
    activePlacement && activePageGrid
      ? gridCellToPixels(activePageGrid, { ...activePlacement })
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#e8e8e8" }}>
      <header
        style={{
          padding: "8px 16px",
          background: "#1a1a1a",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <strong>Memari planner editor (native)</strong>
        <span style={{ color: "#999", fontSize: 12 }}>Drag-to-reposition wired up — resize/palette/save-button still to come</span>
        {saveError && <span style={{ color: "#ff5555", marginLeft: "auto" }}>Save failed: {saveError}</span>}
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", justifyContent: "center", padding: 24 }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div style={{ display: "flex", gap: PAGE_GAP_PX }}>
              {pages.map((page) => (
                <NativePage key={page.pageId} page={page} placements={placements} activeId={activeId} />
              ))}
            </div>
            <DragOverlay>
              {activeId && activeInfo && activePixelSize ? (
                <div style={{ position: "relative", width: activePixelSize.width, height: activePixelSize.height }}>
                  <PolotnoJsonRenderer elements={activeInfo.elements} originX={activeInfo.originX} originY={activeInfo.originY} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

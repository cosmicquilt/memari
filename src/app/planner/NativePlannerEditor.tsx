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
//
// --- Why this doesn't use <DragOverlay> ---
// The first version of this file did, and it was broken: dragging the
// topmost module moved something, but not in step with the pointer;
// dragging any other module didn't visibly move anything at all.
// Researched this rather than guessing at a patch — it's a confirmed,
// documented @dnd-kit limitation (github.com/clauderic/dnd-kit#398 and
// related issues), not a fluke in this code specifically: DragOverlay
// positions itself with `position: fixed`, which is relative to the
// viewport *unless* an ancestor has a CSS `transform` — and a
// `transform` is exactly what the on-screen zoom wrapper below uses.
// That ancestor becomes DragOverlay's containing block instead of the
// viewport, so its screen-pixel positioning math comes out wrong (and
// inconsistently so depending on where in the transformed subtree the
// dragged item happens to sit) — matching exactly what got reported.
//
// The fix isn't a portal-plus-counter-scale workaround (also considered
// — more moving parts, more ways to get the compensation wrong twice
// over). It's simpler: skip DragOverlay, and translate the dragged
// element itself, in place, the same way plain vanilla-JS drag-to-
// reorder implementations do (e.g. tahazsh.com's "Seamless UI" writeup:
// track pointer delta, apply `transform: translate()` directly to the
// dragged item, animate everything else with a CSS transition on
// `transform` too — not by touching layout mid-drag). That element
// already lives inside the same scaled wrapper as everything else on
// the page, so a local `translate()` on it composes correctly with the
// ancestor's scale automatically — it never has its own opinion about
// what its containing block is, unlike `position: fixed`.
//
// One further piece taken from that same research and from this app's
// own established patterns (e.g. iOS springboard-style rearranging):
// other modules now visually slide out of the way *during* the drag —
// a live preview of resolveModulePlacement's result, recomputed on every
// pointer move and rendered as a translateY with a CSS transition — not
// just snapped into place after the fact on drop. Cheap to do (the same
// pure grid.ts function this already called once on drop, just called
// more often), and it's what makes a reorder read as a reorder while
// it's happening instead of only being revealed once you let go.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
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
type ModuleInfo = {
  pageId: string;
  locked: boolean;
  elements: LoadedPage["moduleInstances"][number]["elements"];
  originX: number;
  originY: number;
};

function NativeModule({
  instanceId,
  locked,
  placement,
  elements,
  originX,
  originY,
  visualOffset,
  isDragged,
}: {
  instanceId: string;
  locked: boolean;
  placement: Placement;
  elements: LoadedPage["moduleInstances"][number]["elements"];
  originX: number;
  originY: number;
  // Page-pixel translate applied on top of the committed grid slot — for
  // the dragged item, its live (already scale-divided) follow-the-cursor
  // offset; for a sibling the live preview says should reflow, the
  // pixel distance to its would-be new row. {0,0} the rest of the time.
  visualOffset: { x: number; y: number };
  isDragged: boolean;
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
        transform:
          visualOffset.x !== 0 || visualOffset.y !== 0 ? `translate(${visualOffset.x}px, ${visualOffset.y}px)` : undefined,
        // No transition on the dragged item itself — it needs to track
        // the pointer with zero added lag. Everything reacting to it
        // (a reflow preview) gets a short one, so the shift reads as a
        // deliberate slide instead of a jump.
        transition: isDragged ? undefined : "transform 0.15s ease",
        // Lifted, not dimmed, while actively being dragged — a shadow +
        // being drawn above its neighbors is what makes it read as "this
        // is the thing currently moving," matching the classic
        // iOS-springboard-style pick-up affordance. The previous opacity
        // dim was designed for a separate ghost-overlay approach (see
        // file comment on why that's gone) and didn't do anything useful
        // once the real element is what's moving.
        boxShadow: isDragged ? "0 12px 28px rgba(0,0,0,0.28)" : undefined,
        zIndex: isDragged ? 10 : undefined,
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
  visualOffsets,
}: {
  page: LoadedPage;
  placements: Record<string, Placement>;
  activeId: string | null;
  visualOffsets: Record<string, { x: number; y: number }>;
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
            visualOffset={visualOffsets[mi.id] ?? ZERO_OFFSET}
            isDragged={activeId === mi.id}
          />
        );
      })}
    </div>
  );
}

const ZERO_OFFSET = { x: 0, y: 0 };

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
    const map = new Map<string, ModuleInfo>();
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
  // Raw, unscaled screen-pixel delta from @dnd-kit, updated continuously
  // while a drag is in progress — the one thing that genuinely needs
  // dividing by `scale` (see file comment: it's the only value in this
  // component that originates *outside* the scaled coordinate space).
  const [activeDelta, setActiveDelta] = useState<{ x: number; y: number }>(ZERO_OFFSET);
  const [saveError, setSaveError] = useState<string | null>(null);

  // A small activation distance, not an instant-trigger sensor — without
  // it, a plain click (no intended drag at all) can register as a
  // zero-distance "drag" and briefly flicker the dragging state.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setActiveDelta(ZERO_OFFSET);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setActiveDelta({ x: event.delta.x, y: event.delta.y });
  }, []);

  // Shared by the live preview (below, every pointer move) and the real
  // commit (handleDragEnd) — both need to turn "the dragged item moved
  // by this many raw screen pixels" into a resolved grid placement the
  // exact same way, or the preview and the final drop result could
  // disagree.
  const resolveDrag = useCallback(
    (instanceId: string, rawDeltaX: number, rawDeltaY: number) => {
      const info = moduleLookup.get(instanceId);
      const current = placements[instanceId];
      if (!info || !current) return null;
      const pageGrid = pageGridByPageId[info.pageId];
      if (!pageGrid) return null;

      const dxPagePx = rawDeltaX / scale;
      const dyPagePx = rawDeltaY / scale;

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

      const { placement: resolved, reflow } = resolveModulePlacement(pageGrid, candidate, others, current.rowStart);
      return { pageGrid, current, resolved, reflow };
    },
    [placements, moduleLookup, pageGridByPageId, scale]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setActiveDelta(ZERO_OFFSET);
      const instanceId = String(event.active.id);
      if (event.delta.x === 0 && event.delta.y === 0) return;

      const result = resolveDrag(instanceId, event.delta.x, event.delta.y);
      if (!result) return;
      const { current, resolved, reflow } = result;

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
    [placements, resolveDrag]
  );

  // Live preview: while a drag is in progress, recompute where things
  // would land if released right now, and turn that into per-instance
  // pixel offsets for rendering (see NativeModule's visualOffset).
  const visualOffsets = useMemo(() => {
    if (!activeId) return EMPTY_OFFSETS;
    const preview = resolveDrag(activeId, activeDelta.x, activeDelta.y);
    if (!preview) return EMPTY_OFFSETS;
    const { pageGrid, reflow } = preview;

    const offsets: Record<string, { x: number; y: number }> = {};
    // The dragged item follows the pointer directly and continuously —
    // not snapped to the resolved cell, which would make it feel like
    // it's teleporting between grid lines instead of being carried by
    // the pointer. dxPagePx/dyPagePx (already scale-divided) is exactly
    // that raw follow distance.
    offsets[activeId] = { x: activeDelta.x / scale, y: activeDelta.y / scale };

    for (const move of reflow) {
      const prevPlacement = placements[move.id];
      if (!prevPlacement) continue;
      const fromPixel = gridCellToPixels(pageGrid, prevPlacement);
      const toPixel = gridCellToPixels(pageGrid, { ...prevPlacement, rowStart: move.rowStart });
      offsets[move.id] = { x: 0, y: toPixel.y - fromPixel.y };
    }
    return offsets;
  }, [activeId, activeDelta, placements, resolveDrag, scale]);

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
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
            <div style={{ display: "flex", gap: PAGE_GAP_PX }}>
              {pages.map((page) => (
                <NativePage key={page.pageId} page={page} placements={placements} activeId={activeId} visualOffsets={visualOffsets} />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
    </div>
  );
}

const EMPTY_OFFSETS: Record<string, { x: number; y: number }> = {};

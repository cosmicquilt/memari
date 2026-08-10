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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// Zoom bounds/step match Polotno's own ZoomGroup (node_modules/polotno/
// toolbar/zoom-buttons.js: presets [.1, .25, .5, .75, 1, 1.5, 2, 3, 5],
// step factor 1.2 per click) closely enough to feel like the same tool,
// without needing to replicate its exact preset list.
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.2; // per zoom in/out button click
// Wheel/trackpad-pinch zoom is proportional to gesture magnitude
// instead — see handleWheel's own comment for why a fixed step per
// event (like the buttons use) doesn't work for a wheel/pinch gesture.
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const WHEEL_DELTA_CLAMP = 50;
const VIEWPORT_PADDING_PX = 24; // breathing room around the page(s), each side
const CONTENT_TOP_OFFSET_PX = VIEWPORT_PADDING_PX; // the content wrapper's own constant marginTop — see zoomAnchored's comment on why this has to be threaded through its math too, not just centeringOffsetX
const HEADER_HEIGHT_PX = 41; // header's own rendered height (8px padding * 2 + ~25px line box) — an estimate, not measured; only used to size the "fit whole page" preset, not anything print-critical

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

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

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });
  useEffect(() => {
    const update = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const spreadWidthPx = pages.length * PRINT_WIDTH_PX + Math.max(0, pages.length - 1) * PAGE_GAP_PX;

  // "fit-width"/"fit-page" are pure functions of the viewport size,
  // recomputed on every render — no effect needed to "sync" scale to
  // them, since they're not independent state, they're derived from
  // viewportSize + zoomMode directly (an effect that turns around and
  // calls setState from what it read off other state is the exact
  // pattern React's docs recommend deriving during render instead of).
  // "manual" (the zoom buttons, or ctrl/pinch-scroll) is the one case
  // that's genuinely stateful — an incremental step from wherever it was
  // last, not a function of anything else — so that's the only piece
  // that actually lives in useState.
  const [zoomMode, setZoomMode] = useState<"fit-width" | "fit-page" | "manual">("fit-width");
  const [manualScale, setManualScale] = useState(1);

  const fitWidthScale = clampScale((viewportSize.width - VIEWPORT_PADDING_PX * 2) / spreadWidthPx);
  const fitPageScale = clampScale(
    Math.min(
      (viewportSize.width - VIEWPORT_PADDING_PX * 2) / spreadWidthPx,
      (viewportSize.height - HEADER_HEIGHT_PX - VIEWPORT_PADDING_PX * 2) / PRINT_HEIGHT_PX
    )
  );
  const scale = zoomMode === "fit-width" ? fitWidthScale : zoomMode === "fit-page" ? fitPageScale : manualScale;

  // How far the scaled content is horizontally offset from the
  // scrollable container's own left edge at a given scale — content
  // narrower than the viewport gets centered (half the leftover space);
  // content at least as wide gets 0, never negative — the same
  // "degrades to 0 once it genuinely overflows" fix as the flex-
  // centering bug mentioned below, just computed explicitly here
  // instead of left to a CSS property, because the zoom-anchoring math
  // right below needs to know this value precisely, not just rely on it
  // looking right on screen. No *scale-dependent* vertical equivalent —
  // pages start at the top and scroll down, they're not vertically
  // centered (matches how document/page editors typically behave) —
  // but there is a fixed, scale-independent CONTENT_TOP_OFFSET_PX
  // (the wrapper's own constant marginTop) that the same zoom-anchoring
  // math still has to account for, simpler than this one only because
  // it never varies with scale or viewport size.
  const centeringOffsetX = useCallback(
    (atScale: number) => Math.max(0, (viewportSize.width - VIEWPORT_PADDING_PX * 2 - spreadWidthPx * atScale) / 2),
    [viewportSize.width, spreadWidthPx]
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Set right before a zoom change takes effect, consumed by the
  // layout effect below once React has re-rendered at the new scale —
  // can't set scrollLeft/scrollTop synchronously in the same event
  // handler that changes scale, the DOM hasn't reflowed to the new
  // content size yet at that point.
  const pendingZoomAnchorRef = useRef<{
    contentX: number;
    contentY: number;
    anchorScreenX: number;
    anchorScreenY: number;
    atScale: number;
  } | null>(null);

  // Keeps whatever page-space point was under the anchor (the cursor,
  // for wheel-zoom; the viewport's own center, for the +/- buttons)
  // visually stationary through a scale change — without this, zooming
  // "grows" from the content's top-left corner, and the thing you were
  // actually looking at ends up who-knows-where, needing the scrollbar
  // to go hunt for it. clientX/clientY are real screen coordinates
  // (e.g. straight from a mouse/wheel event); omit them for the
  // viewport-center default a button click uses, since a button press
  // has no cursor position on the canvas to anchor to.
  const zoomAnchored = useCallback(
    (newScale: number, clientX?: number, clientY?: number) => {
      const clamped = clampScale(newScale);
      const container = scrollContainerRef.current;
      if (!container) {
        setZoomMode("manual");
        setManualScale(clamped);
        return;
      }
      const rect = container.getBoundingClientRect();
      const anchorScreenX = clientX !== undefined ? clientX - rect.left : container.clientWidth / 2;
      const anchorScreenY = clientY !== undefined ? clientY - rect.top : container.clientHeight / 2;

      const oldOffsetX = centeringOffsetX(scale);
      const contentX = (container.scrollLeft + anchorScreenX - oldOffsetX) / scale;
      // CONTENT_TOP_OFFSET_PX: the wrapper's own constant marginTop —
      // fixed regardless of scale (unlike centeringOffsetX), but still
      // has to be subtracted here for the same reason: scrollTop/
      // anchorScreenY are measured from the *container's* top edge, not
      // from where page-space y=0 actually renders once that margin
      // pushes it down.
      const contentY = (container.scrollTop + anchorScreenY - CONTENT_TOP_OFFSET_PX) / scale;

      setZoomMode("manual");
      setManualScale(clamped);
      pendingZoomAnchorRef.current = { contentX, contentY, anchorScreenX, anchorScreenY, atScale: clamped };
    },
    [scale, centeringOffsetX]
  );

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const pending = pendingZoomAnchorRef.current;
    if (!container || !pending) return;
    pendingZoomAnchorRef.current = null;
    const newOffsetX = centeringOffsetX(pending.atScale);
    container.scrollLeft = pending.contentX * pending.atScale + newOffsetX - pending.anchorScreenX;
    container.scrollTop = pending.contentY * pending.atScale + CONTENT_TOP_OFFSET_PX - pending.anchorScreenY;
  }, [scale, centeringOffsetX]);

  // Fit-width/Fit-page reset the view from scratch (matching Polotno's
  // own "reset to scale-to-fit" behavior — it shows the page from the
  // top, not wherever you happened to be looking before) rather than
  // trying to anchor a prior focal point through the mode switch. Only
  // fires on an actual mode *change* (tracked via the ref), not on every
  // resize-triggered rescale within an already-active fit mode — a
  // window resize while already fit-to-width shouldn't yank the
  // scroll position back to the top.
  const prevZoomModeRef = useRef(zoomMode);
  useLayoutEffect(() => {
    if (prevZoomModeRef.current === zoomMode) return;
    prevZoomModeRef.current = zoomMode;
    if (zoomMode === "manual") return;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
  }, [zoomMode]);

  // Both step from the currently-*displayed* scale, not from whatever
  // manualScale happens to hold — if the last mode was fit-width/
  // fit-page, manualScale is stale leftover state from some earlier
  // manual session (or still its initial 1), not what's actually on
  // screen right now. Anchored to the viewport's own center — a button
  // click has no cursor position on the canvas to anchor to instead.
  const zoomIn = useCallback(() => zoomAnchored(scale * ZOOM_STEP), [scale, zoomAnchored]);
  const zoomOut = useCallback(() => zoomAnchored(scale / ZOOM_STEP), [scale, zoomAnchored]);

  // Ctrl/Cmd+wheel zooms (the standard canvas-tool convention — Figma,
  // Google Maps, Photoshop); plain wheel/trackpad scroll is left
  // untouched so it keeps doing ordinary panning via the container's own
  // native `overflow: auto` scrolling — no custom pan code needed for
  // that half of "zoom and pan", the browser already does it once
  // there's something bigger than the viewport to scroll around in.
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      // Proportional to the actual gesture magnitude (e.deltaY), not a
      // fixed step per event the way the +/- buttons use — a fixed
      // multiplicative step compounds explosively fast under a
      // trackpad pinch gesture, which fires many small wheel events
      // per second (unlike a mouse wheel's larger, discrete "clicks").
      // Applying e.g. 1.2x on every one of dozens of rapid-fire events
      // compounds to an enormous factor almost instantly — reported as
      // zoom "moving too fast" on a touchpad, and this is exactly the
      // mechanism that would cause it. Clamping deltaY caps how much
      // even a single unusually large event (a fast mouse-wheel flick,
      // or a delta spike) can move the scale by in one step. Anchored
      // to the actual cursor position, not the viewport center — this
      // is the one zoom trigger that has a real cursor position to
      // anchor to, matching Figma/Maps/Photoshop's own wheel-zoom feel.
      const clampedDeltaY = Math.max(-WHEEL_DELTA_CLAMP, Math.min(WHEEL_DELTA_CLAMP, e.deltaY));
      const factor = Math.pow(2, -clampedDeltaY * WHEEL_ZOOM_SENSITIVITY);
      zoomAnchored(scale * factor, e.clientX, e.clientY);
    },
    [scale, zoomAnchored]
  );

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
        <span style={{ color: "#999", fontSize: 12 }}>Drag-to-reposition + zoom/pan wired up — resize/palette/save-button still to come</span>
        {saveError && <span style={{ color: "#ff5555", marginLeft: "auto" }}>Save failed: {saveError}</span>}
      </header>
      <div
        ref={scrollContainerRef}
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}
        onWheel={handleWheel}
      >
        {/* marginLeft: centeringOffsetX(scale), not CSS margin:auto or
            flex+justifyContent:center — both of those have a well-known
            bug where content wider than its container becomes
            unreachable by scroll on one side (the "phantom centering
            space" issue), and neither gives zoomAnchored a precise,
            known value to fold into its focal-point math the way this
            explicit, JS-computed offset does. Degrades to 0 once the
            content genuinely overflows, so it stays scrollable in every
            direction at any zoom level instead of only some of them —
            only matters once zoom-in makes overflow a real possibility,
            which is exactly what's being added here. No vertical
            equivalent — see centeringOffsetX's own comment on why. */}
        <div style={{ width: "fit-content", marginLeft: centeringOffsetX(scale), marginTop: CONTENT_TOP_OFFSET_PX, marginBottom: VIEWPORT_PADDING_PX }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <DndContext
              id="memari-planner-dnd"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
            >
              <div style={{ display: "flex", gap: PAGE_GAP_PX }}>
                {pages.map((page) => (
                  <NativePage key={page.pageId} page={page} placements={placements} activeId={activeId} visualOffsets={visualOffsets} />
                ))}
              </div>
            </DndContext>
          </div>
        </div>
        <ZoomControls
          scale={scale}
          zoomMode={zoomMode}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitWidth={() => setZoomMode("fit-width")}
          onFitPage={() => setZoomMode("fit-page")}
        />
      </div>
    </div>
  );
}

// Floating pill toolbar, bottom-center of the viewport — same placement
// Polotno's own ZoomGroup uses (node_modules/polotno/toolbar/zoom-
// buttons.js: position:absolute, bottom, centered horizontally) so this
// reads as the same kind of control. `position: fixed`, not sticky or
// absolute: it needs to stay put on screen regardless of zoom level or
// scroll position within a container that can get much taller than the
// viewport once zoomed in, and fixed is unambiguous for that (relative
// to the real viewport specifically *because* none of this component's
// own ancestors carry a CSS transform — only the scaled page content,
// a sibling subtree, does; see the file's own note on why a transformed
// ancestor is exactly the thing that broke position:fixed for
// DragOverlay earlier).
function ZoomControls({
  scale,
  zoomMode,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
}: {
  scale: number;
  zoomMode: "fit-width" | "fit-page" | "manual";
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}) {
  const buttonStyle = (active: boolean): React.CSSProperties => ({
    border: "none",
    background: active ? "#4a5cff" : "transparent",
    color: active ? "white" : "#333",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    cursor: "pointer",
    lineHeight: 1,
  });
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        width: "fit-content",
        display: "flex",
        alignItems: "center",
        gap: 2,
        background: "white",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        padding: 4,
        zIndex: 20,
      }}
    >
      <button onClick={onZoomOut} title="Zoom out" style={buttonStyle(false)}>
        −
      </button>
      <span style={{ fontSize: 13, color: "#333", minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
      <button onClick={onZoomIn} title="Zoom in" style={buttonStyle(false)}>
        +
      </button>
      <div style={{ width: 1, alignSelf: "stretch", background: "#ddd", margin: "0 4px" }} />
      <button onClick={onFitWidth} title="Fill screen with page width (default)" style={buttonStyle(zoomMode === "fit-width")}>
        Fit width
      </button>
      <button onClick={onFitPage} title="Zoom out to see the whole page" style={buttonStyle(zoomMode === "fit-page")}>
        Fit page
      </button>
    </div>
  );
}

const EMPTY_OFFSETS: Record<string, { x: number; y: number }> = {};

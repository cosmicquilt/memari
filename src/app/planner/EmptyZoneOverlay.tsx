"use client";

import { useEffect, useRef, useState } from "react";
import type { createStore } from "polotno/model/store";
import { gridCellToPixels, packStackFromTop, type GridRect, type PageGrid } from "@/lib/grid";
import { usePageScreenRects, pageSpaceToScreen } from "./canvasOverlay";
import { gatherLiveTrackedRects, type PolotnoNode } from "./polotnoTree";

type Zones = { sidebar: GridRect | null; belowHourlyGrid: GridRect | null };

// Reserves a strip at the very bottom of the viewport that this overlay
// will never draw into, no matter what a button's own math computes —
// Polotno's own zoom controls float over that same strip (bottom-center
// of the workspace, ~5px + 35px tall — see node_modules/polotno/toolbar/
// zoom-buttons.js), with no z-index of their own to lose a stacking fight
// against, so a "+" button whose zone happens to run to the bottom of the
// page could otherwise render right on top of them. Sized generously
// above that ~40px footprint.
const BOTTOM_RESERVED_PX = 56;

// Runs the same "pack this zone's stack contiguously from the top, then
// see what's left over at the bottom" pass for one zone — used for both
// the sidebar and the below-hourly-grid zone, on every page. Actually
// *writes* the packed positions back onto the live Polotno elements (not
// just a read), then returns the resulting trailing gap, if any: the
// row range from wherever the packed stack ends down to the zone's own
// bottom. That's the only gap this component still cares about — once
// packed, a stack can't have a gap anywhere but there.
function packZoneAndFindGap(
  page: { children?: unknown },
  pageGrid: PageGrid,
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>,
  zone: GridRect
): GridRect | null {
  const liveRects = gatherLiveTrackedRects(page, pageGrid, moduleGridInfo);
  const members = liveRects.filter(
    (r) => r.columnStart === zone.columnStart && r.columnSpan === zone.columnSpan && r.rowStart >= zone.rowStart
  );

  const moves = packStackFromTop(zone.rowStart, members);
  for (const move of moves) {
    const node = ((page.children ?? []) as PolotnoNode[]).find((c) => c.id === move.id);
    const span = moduleGridInfo[move.id];
    const children = node?.children ?? [];
    if (!span || children.length === 0) continue;
    const target = gridCellToPixels(pageGrid, {
      columnStart: zone.columnStart,
      rowStart: move.rowStart,
      columnSpan: zone.columnSpan,
      rowSpan: span.rowSpan,
    });
    const minX = Math.min(...children.map((c) => c.x ?? 0));
    const minY = Math.min(...children.map((c) => c.y ?? 0));
    const dx = target.x - minX;
    const dy = target.y - minY;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    for (const child of children) child.set({ x: (child.x ?? 0) + dx, y: (child.y ?? 0) + dy });
  }

  const packedHeight = members.reduce((sum, m) => sum + m.rowSpan, 0);
  const gapRowStart = zone.rowStart + packedHeight;
  const gapRowSpan = zone.rowStart + zone.rowSpan - gapRowStart;
  if (gapRowSpan <= 0) return null;
  return { columnStart: zone.columnStart, columnSpan: zone.columnSpan, rowStart: gapRowStart, rowSpan: gapRowSpan };
}

// A dashed-border "add a module here" button over the sidebar column
// and the below-hourly-grid zone on each page, shown wherever that zone
// currently has a trailing gap at its bottom. Deliberately a plain DOM
// overlay, not a real Polotno element injected into the canvas: that
// would make it part of store.toJSON(), which means it would need
// filtering out of the save flow everywhere that already assumes
// "everything on a page is either a tracked module or real freeform
// content" (see PlannerEditorCanvas's handleSave). A DOM overlay sits
// outside that entirely, with an ordinary onClick.
//
// Also doubles as the thing keeping each zone's stack gap-free in the
// first place ("gravity" toward the top): packZoneAndFindGap both packs
// and reports the leftover gap in one pass, so the button's position is
// never computed from a stale pre-pack read — see that function's
// comment. Dragging a module already stays packed on its own (see
// PlannerEditorCanvas's resolveModulePlacement-driven reflow); this is
// what closes a gap left by anything else, a delete most notably, which
// has nothing else watching for it.
export function EmptyZoneOverlay({
  store,
  pageGrids,
  interactiveZonesByPage,
  moduleGridInfo,
  onOpenPalette,
}: {
  store: ReturnType<typeof createStore>;
  pageGrids: Record<string, PageGrid>;
  interactiveZonesByPage: Record<string, Zones>;
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>;
  onOpenPalette: () => void;
}) {
  const pageIds = Object.keys(interactiveZonesByPage);
  const pageRectsRef = usePageScreenRects(store, pageIds);

  const [emptyZones, setEmptyZones] = useState<Array<{ key: string; pageId: string; zone: GridRect }>>([]);
  // DOM nodes for the currently-rendered buttons, keyed the same as
  // emptyZones — populated via each button's ref callback, read every
  // animation frame by the position-sync effect below so a button's
  // on-screen rect stays in lockstep with Polotno's own redraw instead
  // of trailing a React re-render behind it (see canvasOverlay.ts's
  // usePageScreenRects for why that ref-driven approach is what actually
  // fixes the lag, not just this component's own state).
  const buttonElsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    const packAndRecompute = () => {
      const next: Array<{ key: string; pageId: string; zone: GridRect }> = [];
      for (const pageId of pageIds) {
        const zones = interactiveZonesByPage[pageId];
        const pageGrid = pageGrids[pageId];
        const page = store.pages.find((p) => p.id === pageId);
        if (!zones || !pageGrid || !page) continue;
        for (const [zoneName, zone] of Object.entries(zones) as Array<[keyof Zones, GridRect | null]>) {
          if (!zone || zone.rowSpan <= 0) continue;
          const gap = packZoneAndFindGap(page, pageGrid, moduleGridInfo, zone);
          if (gap) next.push({ key: `${pageId}-${zoneName}`, pageId, zone: gap });
        }
      }
      setEmptyZones(next);
    };

    // Deferred, not called directly in the listener: other pointerup
    // handlers (the drag-snap effect in particular) need to finish
    // moving things to their final positions first, and DOM listeners
    // fire in registration order, not React-tree order — since this
    // component's own effect could easily end up registered before that
    // one's, calling recompute() synchronously here risks reading
    // positions from *before* the snap resolved. Deferring via
    // setTimeout sidesteps the ordering question entirely by running
    // after every synchronous handler for this event has already run.
    // Same reasoning applies to Delete/Backspace: Polotno handles the
    // actual removal itself in response to the keypress, and this just
    // needs to run after that's settled.
    const deferredRun = () => setTimeout(packAndRecompute, 0);
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") deferredRun();
    };

    packAndRecompute();
    window.addEventListener("pointerup", deferredRun);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("pointerup", deferredRun);
      window.removeEventListener("keyup", handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, pageGrids, interactiveZonesByPage, moduleGridInfo]);

  // Runs every animation frame, independent of (and far more often than)
  // the recompute above — a button needs to move whenever the canvas
  // pans, zooms, or the side panel resizes it, which happens continuously
  // during those gestures, while the set of empty zones itself only
  // changes on the discrete events above. Writes straight to each
  // button's DOM style rather than through React state/props for the
  // same reason usePageScreenRects itself returns a ref: a setState-driven
  // position update is always at least one React render behind Polotno's
  // own (React-free) canvas redraw.
  useEffect(() => {
    let frameId: number;
    const sync = () => {
      for (const { key, pageId, zone } of emptyZones) {
        const el = buttonElsRef.current.get(key);
        if (!el) continue;
        const pageRect = pageRectsRef.current[pageId];
        const pageGrid = pageGrids[pageId];
        if (!pageRect || !pageGrid) {
          el.style.display = "none";
          continue;
        }
        const pixelRect = gridCellToPixels(pageGrid, zone);
        const screen = pageSpaceToScreen(pageRect, pixelRect);
        el.style.display = "flex";
        el.style.left = `${screen.left}px`;
        el.style.top = `${screen.top}px`;
        el.style.width = `${screen.width}px`;
        el.style.height = `${screen.height}px`;
        el.style.fontSize = `${Math.max(18, Math.min(32, screen.width * 0.12))}px`;
      }
      frameId = requestAnimationFrame(sync);
    };
    frameId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(frameId);
  }, [emptyZones, pageRectsRef, pageGrids]);

  return (
    // overflow: hidden + the buttons below being position:absolute (not
    // fixed) rather than the more obvious "just use position:fixed on
    // each button" makes this actually clip anything that would
    // otherwise render into the reserved bottom strip — a fixed-position
    // descendant would ignore this wrapper's box entirely and paint over
    // the zoom controls regardless of the bottom inset below it, since
    // "fixed" is relative to the viewport, not this element. Absolute
    // descendants use their nearest positioned ancestor (this div) as
    // their containing block instead, so shrinking *this* box is enough
    // to guarantee nothing inside it ever reaches into that strip.
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: BOTTOM_RESERVED_PX,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {emptyZones.map(({ key }) => (
        <button
          key={key}
          ref={(el) => {
            if (el) buttonElsRef.current.set(key, el);
            else buttonElsRef.current.delete(key);
          }}
          onClick={onOpenPalette}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 0,
            height: 0,
            display: "none",
            pointerEvents: "auto",
            background: "rgba(120, 130, 255, 0.06)",
            border: "2px dashed rgba(120, 130, 255, 0.5)",
            borderRadius: 8,
            color: "rgba(90, 100, 220, 0.8)",
            cursor: "pointer",
            alignItems: "center",
            justifyContent: "center",
          }}
          title="Add a module here"
        >
          +
        </button>
      ))}
    </div>
  );
}

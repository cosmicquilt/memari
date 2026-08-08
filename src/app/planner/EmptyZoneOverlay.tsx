"use client";

import { useEffect, useState } from "react";
import type { createStore } from "polotno/model/store";
import { rectsOverlap, gridCellToPixels, type GridRect, type PageGrid } from "@/lib/grid";
import { usePageScreenRects, pageSpaceToScreen } from "./canvasOverlay";
import { gatherLiveTrackedRects } from "./polotnoTree";

type Zones = { sidebar: GridRect | null; belowHourlyGrid: GridRect | null };

// A dashed-border "add a module here" button over the sidebar column
// and the below-hourly-grid zone on each page, shown whenever that whole
// zone is completely empty. Deliberately a plain DOM overlay, not a real
// Polotno element injected into the canvas: that would make it part of
// store.toJSON(), which means it would need filtering out of the save
// flow everywhere that already assumes "everything on a page is either a
// tracked module or real freeform content" (see PlannerEditorCanvas's
// handleSave). A DOM overlay sits outside that entirely, with an
// ordinary onClick.
//
// No partial-occupancy granularity — a zone is either entirely empty
// (shows the button) or has anything at all in it (button disappears
// entirely), matching how these zones are actually used today: one
// region that either holds a stack of modules or none.
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
  const pageRects = usePageScreenRects(pageIds);

  const [emptyZones, setEmptyZones] = useState<Array<{ key: string; pageId: string; zone: GridRect }>>([]);

  useEffect(() => {
    const recompute = () => {
      const next: Array<{ key: string; pageId: string; zone: GridRect }> = [];
      for (const pageId of pageIds) {
        const zones = interactiveZonesByPage[pageId];
        const pageGrid = pageGrids[pageId];
        const page = store.pages.find((p) => p.id === pageId);
        if (!zones || !pageGrid || !page) continue;
        const liveRects = gatherLiveTrackedRects(page, pageGrid, moduleGridInfo);
        for (const [zoneName, zone] of Object.entries(zones) as Array<[keyof Zones, GridRect | null]>) {
          if (!zone || zone.rowSpan <= 0) continue;
          const occupied = liveRects.some((r) => rectsOverlap(zone, r));
          if (!occupied) next.push({ key: `${pageId}-${zoneName}`, pageId, zone });
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
    const deferredRecompute = () => setTimeout(recompute, 0);

    recompute();
    window.addEventListener("pointerup", deferredRecompute);
    return () => window.removeEventListener("pointerup", deferredRecompute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, pageGrids, interactiveZonesByPage, moduleGridInfo]);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 5 }}>
      {emptyZones.map(({ key, pageId, zone }) => {
        const pageRect = pageRects[pageId];
        if (!pageRect) return null;
        const pageGrid = pageGrids[pageId];
        const pixelRect = gridCellToPixels(pageGrid, zone);
        const screen = pageSpaceToScreen(pageRect, pixelRect);
        return (
          <button
            key={key}
            onClick={onOpenPalette}
            style={{
              position: "fixed",
              left: screen.left,
              top: screen.top,
              width: screen.width,
              height: screen.height,
              pointerEvents: "auto",
              background: "rgba(120, 130, 255, 0.06)",
              border: "2px dashed rgba(120, 130, 255, 0.5)",
              borderRadius: 8,
              color: "rgba(90, 100, 220, 0.8)",
              fontSize: Math.max(18, Math.min(32, screen.width * 0.12)),
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Add a module here"
          >
            +
          </button>
        );
      })}
    </div>
  );
}

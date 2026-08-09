"use client";

// Native CSS Grid replacement for PlannerEditorCanvas.tsx (Polotno-
// hosted), per the migration plan. This first version is deliberately
// STATIC — correct visual layout only, no drag/resize/palette-add yet —
// a checkpoint meant to be visually compared against the still-live
// Polotno-hosted /planner before any interactivity gets layered on top,
// so a layout bug doesn't get compounded with an interaction bug.
//
// Grid configuration below (gridTemplateColumns/Rows: repeat(N, 1fr),
// gap: gridGapPx, padding: marginPx, boxSizing: border-box) is a
// deliberate, exact translation of grid.ts's own usableArea() math, not
// an approximation — CSS Grid's own 1fr-track-plus-gap sizing algorithm
// computes the identical cellWidth/cellHeight formula
// gridCellToPixels/usableArea already use server-side. That's what lets
// each module's own container just be placed via gridColumn/gridRow (the
// browser's own grid engine does the placement) while still landing at
// pixel-identical positions to what the server already computed via
// gridCellToPixels for each element's own x/y (see loadPlannerPages.ts's
// originX/originY) — no separate translation layer needed, unlike
// canvasOverlay.ts's whole reason for existing on the Polotno side.

import { useEffect, useMemo, useState } from "react";
import type { LoadedPage } from "./loadPlannerPages";
import type { WeekSettings } from "./WeekSettingsPanel";
import { PolotnoJsonRenderer } from "./PolotnoJsonRenderer";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";

const PAGE_GAP_PX = 0; // matches PlannerEditorCanvas's Workspace pageGap={0}

function NativePage({ page }: { page: LoadedPage }) {
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
      {page.moduleInstances.map((mi) => (
        <div
          key={mi.id}
          data-instance-id={mi.id}
          data-locked={mi.locked}
          style={{
            position: "relative",
            gridColumn: `${mi.columnStart + 1} / span ${mi.columnSpan}`,
            gridRow: `${mi.rowStart + 1} / span ${mi.rowSpan}`,
          }}
        >
          <PolotnoJsonRenderer elements={mi.elements} originX={mi.originX} originY={mi.originY} />
        </div>
      ))}
    </div>
  );
}

export function NativePlannerEditor({
  pages,
}: {
  pages: LoadedPage[];
  weekSettings: WeekSettings;
}) {
  // Simple fit-to-viewport scale, recomputed on mount and resize — the
  // same role Polotno's own store.scale played, just app-owned instead
  // of read indirectly off a third-party store (see canvasOverlay.ts's
  // now-retired reasoning for why that indirection existed at all).
  // 1200 is a plain fallback for the server-rendered pass (no `window`
  // there) — corrected immediately on mount, before paint, by the effect
  // below; a brief default-then-corrected scale on first load is normal
  // for a viewport-fit calculation, not a hydration-mismatch risk, since
  // effects run after hydration completes, not during it.
  const [viewportWidth, setViewportWidth] = useState<number>(1200);
  useEffect(() => {
    const update = () => setViewportWidth(window.innerWidth);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const spreadWidthPx = pages.length * PRINT_WIDTH_PX + Math.max(0, pages.length - 1) * PAGE_GAP_PX;
  const scale = useMemo(() => {
    const available = viewportWidth - 80; // small margin
    return Math.min(1, Math.max(0.1, available / spreadWidthPx));
  }, [viewportWidth, spreadWidthPx]);

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
        <strong>Memari planner editor (native, static preview)</strong>
        <span style={{ color: "#999", fontSize: 12 }}>
          Layout-only checkpoint — no drag/resize/save yet, compare against /planner
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", justifyContent: "center", padding: 24 }}>
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            display: "flex",
            gap: PAGE_GAP_PX,
          }}
        >
          {pages.map((page) => (
            <NativePage key={page.pageId} page={page} />
          ))}
        </div>
      </div>
    </div>
  );
}

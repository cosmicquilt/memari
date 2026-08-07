"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createStore } from "polotno/model/store";
import {
  PolotnoContainer,
  SidePanelWrap,
  WorkspaceWrap,
} from "polotno/polotno-app";
import { SidePanel, DEFAULT_SECTIONS } from "polotno/side-panel/side-panel";
import { SectionTab } from "polotno/side-panel/tab-button";
import type { Section } from "polotno/ui-types";
import { Toolbar } from "polotno/toolbar/toolbar";
import { Workspace } from "polotno/canvas/workspace";
import { registerNextDomDrop } from "polotno/canvas/page";
import { ZoomButtons } from "polotno/toolbar/zoom-buttons";
import { DownloadButton } from "polotno/toolbar/download-button";
import "polotno/ui.css";
import "./polotno-overrides.css";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import {
  gridCellToPixels,
  pixelsToGridCell,
  clampGridPlacement,
  resolveModulePlacement,
  type PageGrid,
  type GridRect,
} from "@/lib/grid";
import {
  savePageElements,
  addPaletteModuleAt,
  updateModulePlacement,
  deleteModuleInstance,
} from "./actions";

const apiKey = process.env.NEXT_PUBLIC_POLOTNO_API_KEY;

// Module types a user can drag onto the page from the palette.
// hourly-grid-core and week-title stay auto-placed/locked singletons per
// page (see actions.ts) — they're structural, one-per-page by design.
// todo-checklist and habit-tracker used to be locked singletons too, but
// are now regular user-placed modules like labeled-box: draggable,
// deletable, and addable anywhere, as many as wanted. quote-block is
// seeded but has no renderer yet, left out so it doesn't render as
// nothing.
const PALETTE_MODULES = [
  { slug: "labeled-box", label: "Labeled Box" },
  { slug: "todo-checklist", label: "To-Do Checklist" },
  { slug: "habit-tracker", label: "Habit Tracker" },
];

// A pragmatic local view of a Polotno element — the SDK's own generated
// types are almost entirely `any` (they're live mobx-state-tree
// instances, not plain data), so this just names the handful of members
// this file actually reads/calls.
type PolotnoNode = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: PolotnoNode[];
  parent?: PolotnoNode | null;
  page?: { id: string } | null;
  set: (attrs: Record<string, unknown>) => void;
};

// A simple box-outline icon for the tab — good enough to be recognizable
// without pulling in Polotno's own icon library.
function LabeledBoxIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

type PageProp = {
  pageId: string;
  elements: object[];
  pageGrid: PageGrid;
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>;
  lockedRects: GridRect[];
};

export function PlannerEditorCanvas({ pages }: { pages: PageProp[] }) {
  // One store per mounted editor instance, not module-level like the
  // standalone test — this page can be visited by many different users.
  const store = useMemo(
    () => createStore({ key: apiKey ?? "", showCredit: !apiKey }),
    []
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [addingSlug, setAddingSlug] = useState<string | null>(null);

  // Span info for every draggable module currently known to the editor —
  // seeded from the server-rendered snapshot, grown as modules are added
  // via the palette during this session. Keyed by ModuleInstance id,
  // which doubles as the Polotno group's own id (see
  // renderModuleInstance.ts) — that's what lets a group dragged around on
  // the canvas be traced back to "which DB row is this."
  const [moduleGridInfo, setModuleGridInfo] = useState<
    Record<string, { columnSpan: number; rowSpan: number }>
  >(() => Object.assign({}, ...pages.map((p) => p.moduleGridInfo)));

  // Ids present when the page loaded. At save time, any of these no
  // longer found on the canvas were deleted by the user (Delete key) and
  // should be removed from the DB too — otherwise they'd silently
  // reappear on the next reload.
  const initialTrackedIds = useRef(new Set(Object.keys(moduleGridInfo)));

  // Guards against a palette drop being processed twice concurrently — a
  // duplicate/double-fired drop event otherwise let two addPaletteModuleAt
  // calls both read the page as "not yet occupied" before either had
  // committed, so both computed the same free cell and both landed there
  // (this is exactly how duplicate/overlapping modules ended up in the
  // DB). setAddingSlug (React state) isn't enough on its own — the guard
  // needs to block re-entrancy synchronously, before React has even
  // re-rendered with the disabled button.
  const addInFlight = useRef(false);

  const pageGrids = useMemo(() => {
    const map: Record<string, PageGrid> = {};
    for (const p of pages) map[p.pageId] = p.pageGrid;
    return map;
  }, [pages]);

  // Locked core blocks' cell ranges, per page — static for the session
  // (they never move), used by the collision/reflow resolution below.
  const lockedRectsByPage = useMemo(() => {
    const map: Record<string, GridRect[]> = {};
    for (const p of pages) map[p.pageId] = p.lockedRects;
    return map;
  }, [pages]);

  useEffect(() => {
    // Both pages loaded together — a week spread is two pages viewed as
    // one unit when the book is open flat, so the editor shows both.
    store.loadJSON({
      width: PRINT_WIDTH_PX,
      height: PRINT_HEIGHT_PX,
      pages: pages.map((p) => ({
        id: p.pageId,
        width: PRINT_WIDTH_PX,
        height: PRINT_HEIGHT_PX,
        children: p.elements,
      })),
    });
    // Only ever load the initial snapshot once per mount — reloading on
    // every render would stomp in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- drag-to-reposition snapping, with collision avoidance ---
  // Polotno's own drag mechanics already move a dragged group's children
  // together as a unit (a "group" element's own x/y/width/height are
  // derived, not real transforms — confirmed empirically, not assumed —
  // so the snap logic below works from the children's actual absolute
  // positions rather than trusting the group's). All this needs to do is
  // resolve the result to a non-overlapping grid cell once the pointer is
  // released, which is simpler and less fragile than trying to hook a
  // live drag-bound callback mid-drag.
  //
  // "Non-overlapping" matters: snapping to the literal nearest cell
  // without checking what's already there let two sidebar boxes land on
  // top of each other. resolveModulePlacement checks every other module
  // on the page (locked core blocks from the static server data, plus
  // any other tracked group's current live position) and, when the only
  // thing in the way is same-column siblings, reflows that column's
  // stack instead — the siblings shift to make room rather than the
  // dragged module bouncing off somewhere else.
  useEffect(() => {
    const snapToGrid = () => {
      const handled = new Set<string>();
      const selected = store.selectedElements as unknown as PolotnoNode[];
      for (const el of selected) {
        // Walk up to the nearest tracked-group ancestor — normally the
        // element itself (groupSelectionMode="group" below means
        // clicking any part of a module selects the whole group), but
        // walking up is cheap insurance either way.
        let node: PolotnoNode | null | undefined = el;
        while (node && !(node.type === "group" && moduleGridInfo[node.id])) {
          node = node.parent ?? null;
        }
        if (!node || handled.has(node.id)) continue;
        handled.add(node.id);

        const span = moduleGridInfo[node.id];
        const pageId = node.page?.id;
        const pageGrid = pageId ? pageGrids[pageId] : undefined;
        const children = node.children ?? [];
        if (!span || !pageId || !pageGrid || children.length === 0) continue;

        const minX = Math.min(...children.map((c) => c.x ?? 0));
        const minY = Math.min(...children.map((c) => c.y ?? 0));
        const nearestCell = clampGridPlacement(pageGrid, {
          ...pixelsToGridCell(pageGrid, { x: minX, y: minY }),
          columnSpan: span.columnSpan,
          rowSpan: span.rowSpan,
        });
        const candidate: GridRect = { ...nearestCell, columnSpan: span.columnSpan, rowSpan: span.rowSpan };

        const page = store.pages.find((p) => p.id === pageId);
        const others: Array<GridRect & { id: string; locked: boolean }> = (lockedRectsByPage[pageId] ?? []).map(
          (rect, i) => ({ ...rect, id: `__locked-${i}__`, locked: true })
        );
        for (const sibling of (page?.children ?? []) as unknown as PolotnoNode[]) {
          if (sibling.id === node.id) continue;
          const siblingSpan = moduleGridInfo[sibling.id];
          const siblingChildren = sibling.children ?? [];
          if (!siblingSpan || siblingChildren.length === 0) continue;
          const sx = Math.min(...siblingChildren.map((c) => c.x ?? 0));
          const sy = Math.min(...siblingChildren.map((c) => c.y ?? 0));
          const siblingCell = pixelsToGridCell(pageGrid, { x: sx, y: sy });
          others.push({
            id: sibling.id,
            columnStart: siblingCell.columnStart,
            rowStart: siblingCell.rowStart,
            columnSpan: siblingSpan.columnSpan,
            rowSpan: siblingSpan.rowSpan,
            locked: false,
          });
        }

        const { placement, reflow } = resolveModulePlacement(pageGrid, candidate, others);

        // Displaced siblings move too — same "shift the children by
        // however far they need to go" approach as the dragged module
        // itself gets below, just applied to whoever the reorder bumped.
        for (const move of reflow) {
          const siblingNode = (page?.children ?? []).find(
            (c) => (c as unknown as PolotnoNode).id === move.id
          ) as unknown as PolotnoNode | undefined;
          const siblingSpan = moduleGridInfo[move.id];
          const siblingChildren = siblingNode?.children ?? [];
          if (!siblingSpan || siblingChildren.length === 0) continue;
          const sMinX = Math.min(...siblingChildren.map((c) => c.x ?? 0));
          const sMinY = Math.min(...siblingChildren.map((c) => c.y ?? 0));
          const target = gridCellToPixels(pageGrid, {
            columnStart: candidate.columnStart,
            rowStart: move.rowStart,
            columnSpan: siblingSpan.columnSpan,
            rowSpan: siblingSpan.rowSpan,
          });
          const sdx = target.x - sMinX;
          const sdy = target.y - sMinY;
          if (Math.abs(sdx) < 0.5 && Math.abs(sdy) < 0.5) continue;
          for (const sc of siblingChildren) sc.set({ x: (sc.x ?? 0) + sdx, y: (sc.y ?? 0) + sdy });
        }

        const snapped = gridCellToPixels(pageGrid, {
          columnStart: placement.columnStart,
          rowStart: placement.rowStart,
          columnSpan: span.columnSpan,
          rowSpan: span.rowSpan,
        });
        const deltaX = snapped.x - minX;
        const deltaY = snapped.y - minY;
        if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) continue;
        for (const child of children) {
          child.set({ x: (child.x ?? 0) + deltaX, y: (child.y ?? 0) + deltaY });
        }
      }
    };
    window.addEventListener("pointerup", snapToGrid);
    return () => window.removeEventListener("pointerup", snapToGrid);
  }, [store, moduleGridInfo, pageGrids, lockedRectsByPage]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const json = store.toJSON() as unknown as {
        pages: Array<{
          id: string;
          children?: Array<{
            id: string;
            type: string;
            x: number;
            y: number;
            width: number;
            height: number;
          }>;
        }>;
      };

      const seenTrackedIds = new Set<string>();
      const placementUpdates: Array<Promise<unknown>> = [];

      for (const jsonPage of json.pages) {
        const children = jsonPage.children ?? [];
        const pageGrid = pageGrids[jsonPage.id];
        const freeform: typeof children = [];

        for (const el of children) {
          const span = moduleGridInfo[el.id];
          if (!span || !pageGrid) {
            // Not a tracked module group — genuine freeform content
            // (Polotno's own Text/Photo/Draw tools).
            freeform.push(el);
            continue;
          }
          seenTrackedIds.add(el.id);
          // Already snapped to a grid cell visually (see the effect
          // above) — recompute which cell that is and persist it.
          const nearestCell = pixelsToGridCell(pageGrid, { x: el.x, y: el.y });
          const clamped = clampGridPlacement(pageGrid, {
            ...nearestCell,
            columnSpan: span.columnSpan,
            rowSpan: span.rowSpan,
          });
          placementUpdates.push(updateModulePlacement(el.id, clamped));
        }

        placementUpdates.push(savePageElements(jsonPage.id, freeform));
      }

      // Anything tracked at load time (or added since) that's no longer
      // on any page was deleted from the canvas — remove its DB row too.
      for (const id of initialTrackedIds.current) {
        if (!seenTrackedIds.has(id)) {
          placementUpdates.push(deleteModuleInstance(id));
        }
      }

      await Promise.all(placementUpdates);

      // Deleted ids shouldn't be treated as "missing, needs re-deleting"
      // on the next save — and newly-seen ones (added this session) join
      // the baseline now that they're persisted.
      initialTrackedIds.current = seenTrackedIds;

      setLastSavedAt(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Registers a one-shot drop handler (Polotno's own convention — see
  // its Text/Photo panels) before a native HTML5 drag starts, so
  // whichever page the palette item gets dropped onto tells us its id
  // and the drop position in that page's own pixel space.
  const handlePaletteDragStart = (slug: string) => {
    registerNextDomDrop(async (pos, _el, event) => {
      if (addInFlight.current) return;
      addInFlight.current = true;

      const pageId = event?.page?.id;
      const pageGrid = pageId ? pageGrids[pageId] : undefined;
      if (!pageId || !pageGrid) {
        addInFlight.current = false;
        return;
      }

      const cell = pixelsToGridCell(pageGrid, pos);
      setAddingSlug(slug);
      try {
        const result = await addPaletteModuleAt(pageId, slug, cell.columnStart, cell.rowStart);
        const page = store.pages.find((p) => p.id === pageId);
        page?.addElement(result.element as never);
        setModuleGridInfo((prev) => ({
          ...prev,
          [result.instanceId]: { columnSpan: result.columnSpan, rowSpan: result.rowSpan },
        }));
        initialTrackedIds.current.add(result.instanceId);
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      } finally {
        setAddingSlug(null);
        addInFlight.current = false;
      }
    });
  };

  // Registered as a real Polotno side-panel section (its own tab
  // alongside Text/Photos/Draw/etc.) rather than a separate custom
  // sidebar — that's what was permanently eating screen width before.
  const moduleSection: Section = {
    name: "memari-modules",
    Tab: (props) => (
      <SectionTab name="Modules" {...props}>
        <LabeledBoxIcon />
      </SectionTab>
    ),
    Panel: () => (
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <strong style={{ fontSize: 13, color: "#555" }}>Add module</strong>
        {PALETTE_MODULES.map((m) => (
          <button
            key={m.slug}
            draggable
            onDragStart={() => handlePaletteDragStart(m.slug)}
            onDragEnd={() => registerNextDomDrop(null)}
            disabled={addingSlug === m.slug}
            style={{ textAlign: "left", padding: "6px 8px", cursor: "grab" }}
          >
            {addingSlug === m.slug ? "Adding…" : m.label}
          </button>
        ))}
        <span style={{ fontSize: 11, color: "#999", marginTop: 8 }}>
          Drag onto either page to place it, then drag it around to
          reposition — it snaps to the nearest grid cell when you let go.
        </span>
      </div>
    ),
  };
  const sections = [...DEFAULT_SECTIONS, moduleSection];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
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
        <strong>Memari planner editor</strong>
        <button onClick={handleSave} disabled={saving} style={{ marginLeft: "auto" }}>
          {saving ? "Saving…" : "Save"}
        </button>
        {lastSavedAt && (
          <span style={{ color: "#7CFC00" }}>
            Saved {lastSavedAt.toLocaleTimeString()}
          </span>
        )}
        {saveError && <span style={{ color: "#ff5555" }}>Save failed: {saveError}</span>}
      </header>
      <div style={{ flex: 1, minHeight: 0 }}>
        {/* Recomposed by hand instead of using the all-in-one
            <PolotnoApp> — that component hardcodes a vertical page
            stack and doesn't expose Workspace's layout prop, which is
            the only way to get the side-by-side spread view. */}
        <PolotnoContainer className="polotno-app-container">
          <SidePanelWrap>
            {/* defaultSection="" starts the panel collapsed (just the
                tab strip showing) rather than auto-expanding the Modules
                panel on load — openSidePanel("") is Polotno's own
                convention for closing it, used the same way by its
                mobile close button. */}
            <SidePanel store={store} sections={sections} defaultSection="" />
          </SidePanelWrap>
          <WorkspaceWrap>
            <Toolbar
              store={store}
              components={{
                ActionControls: () => <DownloadButton store={store} />,
              }}
            />
            {/* pageControlsEnabled=false: those per-page nav/duplicate/
                delete/add controls were rendering twice per page (top
                and bottom), each with its own embedded license banner —
                4 total. We don't want free-form page add/delete here
                anyway (pages are managed server-side), so disabling
                this removes the clutter and most of the banners at once.
                groupSelectionMode="group": clicking any part of a module
                always selects the whole group rather than letting a
                double-click "drill in" to an individual child — modules
                are meant to move as a unit, not have their internal
                pieces dragged out of sync with each other. */}
            <Workspace
              store={store}
              layout="horizontal"
              pageGap={0}
              pageControlsEnabled={false}
              groupSelectionMode="group"
            />
            <ZoomButtons store={store} />
          </WorkspaceWrap>
        </PolotnoContainer>
      </div>
    </div>
  );
}

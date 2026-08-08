"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  updateModuleConfig,
  updateModuleSize,
  updateWeekSettings,
} from "./actions";
import { PropertiesPanel } from "./PropertiesPanel";
import { WeekSettingsPanel, type WeekSettings } from "./WeekSettingsPanel";

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

// Builds a small styled element to use as the native drag image for a
// palette item — the browser's default drag ghost is just a translucent
// screenshot of the dragged element with no styling control, so this
// swaps in something intentional (soft shadow, rounded pill) instead.
// Standard DOM API (dataTransfer.setDragImage), not a Polotno/Konva
// concern, so unlike most of this file's canvas-facing code this is
// ordinary, well-specified browser behavior — element must be attached
// to the DOM for the browser to snapshot it, removed on the next tick
// once that snapshot has happened.
function buildDragPreviewElement(label: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = label;
  el.style.cssText = [
    "position:fixed",
    "top:-1000px",
    "left:-1000px",
    "padding:8px 14px",
    "background:rgba(255,255,255,0.92)",
    "color:#1a1a1a",
    "border-radius:8px",
    "box-shadow:0 8px 24px rgba(0,0,0,0.28)",
    "font-size:13px",
    "font-family:system-ui,sans-serif",
    "white-space:nowrap",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

// Walks up from whatever's selected/under-the-pointer to the nearest
// tracked-group ancestor (normally the element itself —
// groupSelectionMode="group" on the Workspace below means clicking any
// part of a module selects the whole group, but walking up is cheap
// insurance either way). Shared by the drag-snap/selection effect and
// the opacity-ghosting effect — both need the same "what module is this
// pointer interaction actually about" resolution.
function resolveTrackedGroup(
  el: PolotnoNode | null | undefined,
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>
): PolotnoNode | null {
  let node = el;
  while (node && !(node.type === "group" && moduleGridInfo[node.id])) {
    node = node.parent ?? null;
  }
  return node ?? null;
}

// Reads every tracked module's *current* grid cell directly off the live
// Polotno tree (position isn't cached in React state anywhere — only
// span is, in moduleGridInfo — so this is the only source of truth for
// "where is everything right now"). Shared by the drag-snap collision
// check and the empty-zone occupancy check, both of which need the same
// "what's actually on this page at this moment" list.
function gatherLiveTrackedRects(
  page: { children?: unknown },
  pageGrid: PageGrid,
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>,
  excludeId?: string
): Array<GridRect & { id: string }> {
  const rects: Array<GridRect & { id: string }> = [];
  for (const el of (page.children ?? []) as PolotnoNode[]) {
    if (el.id === excludeId) continue;
    const span = moduleGridInfo[el.id];
    const children = el.children ?? [];
    if (!span || children.length === 0) continue;
    const x = Math.min(...children.map((c) => c.x ?? 0));
    const y = Math.min(...children.map((c) => c.y ?? 0));
    const cell = pixelsToGridCell(pageGrid, { x, y });
    rects.push({ id: el.id, ...cell, columnSpan: span.columnSpan, rowSpan: span.rowSpan });
  }
  return rects;
}

// Finds whichever page currently has an element with this id and swaps
// it for a freshly-rendered replacement in place (delete the old one,
// add the new one) — the shared "server re-rendered this module's
// content, now show it" step used after both a content edit
// (updateModuleConfig) and a resize (updateModuleSize). Not a
// useCallback/hook — it has no reactive dependencies of its own, just
// the store reference each caller already has.
function swapCanvasElement(store: ReturnType<typeof createStore>, instanceId: string, element: object) {
  for (const page of store.pages) {
    const existing = (page.children as unknown as PolotnoNode[]).find((c) => c.id === instanceId);
    if (existing) {
      store.deleteElements([instanceId]);
      page.addElement(element as never);
      return;
    }
  }
}

// Simple icons for the tabs — good enough to be recognizable without
// pulling in Polotno's own icon library.
function LabeledBoxIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="18" height="18" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <line x1="4" y1="6" x2="20" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="6" r="2" fill="currentColor" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="12" r="2" fill="currentColor" />
      <line x1="4" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11" cy="18" r="2" fill="currentColor" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <line x1="3" y1="9" x2="21" y2="9" stroke="currentColor" strokeWidth="1.5" />
      <line x1="7" y1="2" x2="7" y2="6" stroke="currentColor" strokeWidth="1.5" />
      <line x1="17" y1="2" x2="17" y2="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export type PageProp = {
  pageId: string;
  elements: object[];
  pageGrid: PageGrid;
  moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }>;
  moduleConfig: Record<string, { slug: string; propValues: unknown }>;
  lockedRects: GridRect[];
  lockedInstanceIds: string[];
};

export function PlannerEditorCanvas({
  pages,
  weekSettings,
}: {
  pages: PageProp[];
  weekSettings: WeekSettings;
}) {
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

  // Slug + current propValues per non-locked module, for the Properties
  // panel — separate from moduleGridInfo (placement math) above, see the
  // matching comment in page.tsx.
  const [moduleConfig, setModuleConfig] = useState<
    Record<string, { slug: string; propValues: Record<string, unknown> }>
  >(() =>
    Object.assign(
      {},
      ...pages.map((p) =>
        Object.fromEntries(
          Object.entries(p.moduleConfig).map(([id, v]) => [
            id,
            { slug: v.slug, propValues: (v.propValues as Record<string, unknown>) ?? {} },
          ])
        )
      )
    )
  );

  // Which tracked module (if any) is currently selected on the canvas —
  // drives the Properties panel. Updated alongside the snap-to-grid
  // resolution below, since both need the same "walk up from whatever's
  // selected to its tracked-group ancestor" logic and both only make
  // sense to check at the same moment (right as a pointer interaction —
  // click or drag — finishes).
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

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

  // Locked instances' own ids, per page — used only by the
  // opacity-ghosting effect below to find which live elements to dim.
  const lockedInstanceIdsByPage = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const p of pages) map[p.pageId] = p.lockedInstanceIds;
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
        const node = resolveTrackedGroup(el, moduleGridInfo);
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
        const others: Array<GridRect & { id: string; locked: boolean }> = [
          ...(lockedRectsByPage[pageId] ?? []).map((rect, i) => ({ ...rect, id: `__locked-${i}__`, locked: true })),
          ...(page ? gatherLiveTrackedRects(page, pageGrid, moduleGridInfo, node.id).map((r) => ({ ...r, locked: false })) : []),
        ];

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

      // Drives the Properties panel — exactly one tracked module
      // resolved from the current selection means "editing that one";
      // anything else (nothing selected, multiple selected, a freeform
      // element) shows the panel's empty state instead. Same "walk up
      // to the tracked-group ancestor" resolution as the snapping above,
      // so this only needs to check what `handled` already collected
      // rather than re-walking the selection a second time.
      setSelectedModuleId(handled.size === 1 ? [...handled][0] : null);
    };
    window.addEventListener("pointerup", snapToGrid);
    return () => window.removeEventListener("pointerup", snapToGrid);
  }, [store, moduleGridInfo, pageGrids, lockedRectsByPage]);

  // --- opacity ghosting during an active drag ---
  // Slightly dims locked structural blocks (week-title, the hourly grid)
  // while a module is being dragged, so the module in motion — and
  // anything shifting to make room for it — reads clearly against a
  // quieted backdrop instead of competing with everything else at full
  // opacity.
  //
  // "Currently dragging" isn't something there's a reliable lower-level
  // signal for: Konva draws every shape onto one shared <canvas> element,
  // so a native pointer event's own target can never distinguish which
  // shape was grabbed — store.selectedElements is the only avenue. Rather
  // than snapshot it once at pointerdown (which would depend on knowing
  // exactly which event Polotno updates selection on, unverified), this
  // re-checks on every pointermove while a button is held: a held button
  // (PointerEvent.buttons !== 0) plus exactly one tracked module
  // currently selected is treated as "probably an active drag." Worst
  // case if Polotno's selection takes a beat to settle, dimming starts a
  // few pixels into the gesture instead of at the exact first pixel —
  // unnoticeable — rather than the alternative failure mode (dimming the
  // wrong module, or never triggering) a one-shot pointerdown snapshot
  // would risk.
  useEffect(() => {
    const DIMMED_OPACITY = 0.35;
    let dimmedIds: string[] = [];
    let dimmedPageId: string | null = null;

    const setOpacity = (pageId: string, ids: string[], opacity: number) => {
      const page = store.pages.find((p) => p.id === pageId);
      for (const el of (page?.children ?? []) as unknown as PolotnoNode[]) {
        if (ids.includes(el.id)) el.set({ opacity });
      }
    };

    const restore = () => {
      if (dimmedPageId && dimmedIds.length > 0) setOpacity(dimmedPageId, dimmedIds, 1);
      dimmedIds = [];
      dimmedPageId = null;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (e.buttons === 0) {
        if (dimmedIds.length > 0) restore();
        return;
      }
      const selected = store.selectedElements as unknown as PolotnoNode[];
      const node = selected.length === 1 ? resolveTrackedGroup(selected[0], moduleGridInfo) : null;
      const pageId = node?.page?.id;

      if (!node || !pageId) {
        if (dimmedIds.length > 0) restore();
        return;
      }
      if (dimmedPageId === pageId && dimmedIds.length > 0) return; // already dimmed for this page/drag

      if (dimmedIds.length > 0) restore();
      const prefixes = (lockedInstanceIdsByPage[pageId] ?? []).map((id) => `${id}-`);
      const page = store.pages.find((p) => p.id === pageId);
      const ids = ((page?.children ?? []) as unknown as PolotnoNode[])
        .filter((el) => prefixes.some((prefix) => el.id.startsWith(prefix)))
        .map((el) => el.id);
      if (ids.length === 0) return;
      setOpacity(pageId, ids, DIMMED_OPACITY);
      dimmedIds = ids;
      dimmedPageId = pageId;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", restore);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", restore);
      restore();
    };
  }, [store, moduleGridInfo, lockedInstanceIdsByPage]);

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

  // Saves a module's own content (heading, habits, ...) from the
  // Properties panel and swaps the freshly-rendered result into the live
  // canvas in place — delete the old group by id, add the new one back,
  // same pattern as adding a brand new module from the palette.
  //
  // useCallback (and the useMemo'd Section objects below that depend on
  // it) matters here for more than just avoiding extra work: Polotno's
  // SidePanel renders each section's Panel component directly as a React
  // element type (`<Panel store={...} />`), so a fresh function reference
  // every render makes React treat it as a *different* component and
  // remount it — which would silently wipe out whatever the user had
  // typed into the Properties form but not yet saved, the moment
  // anything else in this component re-rendered (clicking the main Save
  // button, another drag's snap resolving, ...).
  const handleSaveModuleConfig = useCallback(
    async (instanceId: string, propValues: Record<string, unknown>) => {
      const result = await updateModuleConfig(instanceId, propValues);
      swapCanvasElement(store, instanceId, result.element);
      setModuleConfig((prev) => ({
        ...prev,
        [instanceId]: {
          slug: prev[instanceId]?.slug ?? "",
          propValues: result.propValues as Record<string, unknown>,
        },
      }));
    },
    [store]
  );

  // Grows/shrinks a module in place (see the Properties panel's Size
  // stepper controls) — same delete-and-recreate swap as
  // handleSaveModuleConfig above, since the new size needs its content
  // freshly rendered (fixed-pt measurements recomputed for the new
  // geometry), not Polotno visually stretching the old content. Throws
  // (caught by the panel itself) if the server rejected the resize for
  // colliding with something.
  const handleResizeModule = useCallback(
    async (instanceId: string, size: { columnSpan: number; rowSpan: number }) => {
      const result = await updateModuleSize(instanceId, size);
      swapCanvasElement(store, instanceId, result.element);
      setModuleGridInfo((prev) => ({
        ...prev,
        [instanceId]: { columnSpan: result.columnSpan, rowSpan: result.rowSpan },
      }));
    },
    [store]
  );

  // Week settings (week number, date range, day-of-month numbers) live on
  // locked/unselectable blocks (week-title, hourly-grid-core), so unlike
  // the Properties panel above there's no single element to swap in
  // place — a full reload is simpler than enumerating and replacing every
  // flat element those blocks render as, and this is an infrequent,
  // deliberate save (once per week of planning), not an interactive drag.
  const handleSaveWeekSettings = useCallback(async (settings: WeekSettings) => {
    await updateWeekSettings(settings);
    window.location.reload();
  }, []);

  // Registers a one-shot drop handler (Polotno's own convention — see
  // its Text/Photo panels) before a native HTML5 drag starts, so
  // whichever page the palette item gets dropped onto tells us its id
  // and the drop position in that page's own pixel space.
  const handlePaletteDragStart = useCallback(
    (slug: string) => {
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
          setModuleConfig((prev) => ({
            ...prev,
            [result.instanceId]: {
              slug,
              propValues: (result.propValues as Record<string, unknown>) ?? {},
            },
          }));
          initialTrackedIds.current.add(result.instanceId);
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        } finally {
          setAddingSlug(null);
          addInFlight.current = false;
        }
      });
    },
    [store, pageGrids]
  );

  // Registered as real Polotno side-panel sections (their own tabs
  // alongside Text/Photos/Draw/etc.) rather than a separate custom
  // sidebar — that's what was permanently eating screen width before.
  //
  // Each is useMemo'd (and their Panel components built from
  // useCallback'd handlers above) so the Panel function reference stays
  // stable across renders that don't actually affect that section — see
  // the comment on handleSaveModuleConfig for why that's not just an
  // optimization here.
  const moduleSection: Section = useMemo(
    () => ({
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
              onDragStart={(e) => {
                const preview = buildDragPreviewElement(m.label);
                e.dataTransfer.setDragImage(preview, preview.offsetWidth / 2, preview.offsetHeight / 2);
                setTimeout(() => preview.remove(), 0);
                handlePaletteDragStart(m.slug);
              }}
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
    }),
    [addingSlug, handlePaletteDragStart]
  );

  // Content editing for whichever module is currently selected (see the
  // selectedModuleId tracking in the pointerup effect above).
  const propertiesSection: Section = useMemo(
    () => ({
      name: "memari-properties",
      Tab: (props) => (
        <SectionTab name="Properties" {...props}>
          <SlidersIcon />
        </SectionTab>
      ),
      Panel: () => (
        <PropertiesPanel
          selected={
            selectedModuleId && moduleConfig[selectedModuleId] && moduleGridInfo[selectedModuleId]
              ? {
                  id: selectedModuleId,
                  ...moduleConfig[selectedModuleId],
                  ...moduleGridInfo[selectedModuleId],
                }
              : null
          }
          onSave={handleSaveModuleConfig}
          onResize={handleResizeModule}
        />
      ),
    }),
    [selectedModuleId, moduleConfig, moduleGridInfo, handleSaveModuleConfig, handleResizeModule]
  );

  // week-title/hourly-grid-core aren't selectable (they're locked), so
  // they get their own always-available panel instead of going through
  // Properties above.
  const weekSettingsSection: Section = useMemo(
    () => ({
      name: "memari-week-settings",
      Tab: (props) => (
        <SectionTab name="Week" {...props}>
          <CalendarIcon />
        </SectionTab>
      ),
      Panel: () => <WeekSettingsPanel initial={weekSettings} onSave={handleSaveWeekSettings} />,
    }),
    [weekSettings, handleSaveWeekSettings]
  );

  const sections = useMemo(
    () => [...DEFAULT_SECTIONS, moduleSection, propertiesSection, weekSettingsSection],
    [moduleSection, propertiesSection, weekSettingsSection]
  );

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

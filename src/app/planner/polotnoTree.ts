// Helpers for reading things off the *live* Polotno element tree —
// shared between PlannerEditorCanvas.tsx and EmptyZoneOverlay.tsx.
// Pulled into their own file (rather than defined in and exported from
// PlannerEditorCanvas.tsx, which would otherwise be forced into a
// circular import once EmptyZoneOverlay needed them, since
// PlannerEditorCanvas also renders EmptyZoneOverlay itself).

import { pixelsToGridCell, type GridRect, type PageGrid } from "@/lib/grid";

// A pragmatic local view of a Polotno element — the SDK's own generated
// types are almost entirely `any` (they're live mobx-state-tree
// instances, not plain data), so this just names the handful of members
// this file's callers actually read/call.
export type PolotnoNode = {
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

// Walks up from whatever's selected/under-the-pointer to the nearest
// tracked-group ancestor (normally the element itself —
// groupSelectionMode="group" on the Workspace means clicking any part of
// a module selects the whole group, but walking up is cheap insurance
// either way).
export function resolveTrackedGroup(
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
// Polotno tree — position isn't cached in React state anywhere (only
// span is, in moduleGridInfo), so this is the only source of truth for
// "where is everything right now."
export function gatherLiveTrackedRects(
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

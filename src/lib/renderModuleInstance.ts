// Turns a single ModuleInstance DB row into the Polotno element(s) it
// should render as. Shared between the Server Component that builds the
// initial canvas snapshot (planner/page.tsx) and the server actions that
// need to hand back freshly-rendered JSON for a module added mid-session
// (planner/actions.ts) — both need the exact same logic, so it lives here
// instead of being duplicated.

import { dayUnitColumns, gridCellToPixels, gridCellToAllocation, type PageGrid } from "@/lib/grid";
import { moduleDefinition, withDerivedProps } from "@/lib/moduleRegistry";
import { FONT_SERIF } from "@/lib/theme";

// A structural subset of the Prisma ModuleInstance (+ its ModuleType), not
// tied to any specific query's generated type — anything shaped like this
// works, whether it came from getOrCreatePlanner's include or a narrower
// single-row fetch in a server action.
export type ModuleInstanceForRender = {
  id: string;
  locked: boolean;
  columnStart: number | null;
  rowStart: number | null;
  columnSpan: number;
  rowSpan: number;
  propValues: unknown;
  moduleType: { slug: string };
};

// The plain Polotno element JSON every module renderer emits — a proper
// name and shape for what used to just be typed `object[]` here, so
// PolotnoJsonRenderer.tsx (the native editor's generic JSON->DOM
// interpreter) has something to interpret against instead of `unknown`.
// Deliberately loose/optional on every field beyond id/type, matching
// each individual module renderer's own local `RenderedElement` type
// (which this is structurally compatible with, not a replacement for —
// none of the 5 renderer files change) — only two real element shapes
// exist today (`type:"text"` and `type:"figure",subType:"rect"`), plus
// the synthetic `type:"group"` wrapper this file itself adds around a
// non-locked instance's children.
export type RenderedPolotnoElement = {
  id: string;
  type: string;
  subType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  align?: string;
  opacity?: number;
  letterSpacing?: number;
  draggable?: boolean;
  selectable?: boolean;
  resizable?: boolean;
  children?: RenderedPolotnoElement[];
  [key: string]: unknown;
};

function renderBySlug(
  slug: string,
  geometry: { x: number; y: number; width: number; height: number },
  propValues: unknown,
  idPrefix: string,
  fontFamily: string,
  // The page's dot lattice, for the renderers that draw on it. Square
  // cells, so one pitch; originX/originY are the page margin, which is
  // where the lattice starts.
  lattice: { pitchPx: number; originX: number; originY: number; insetPx: number; dayCells?: number }
): RenderedPolotnoElement[] {
  // A switch over slugs used to live here, one case per module, and it was
  // one of nine places that had to learn a module's name. The registry is
  // that list now; an unregistered slug draws nothing, exactly as the
  // default case did.
  return (
    moduleDefinition(slug)?.render?.(geometry, propValues, idPrefix, fontFamily, lattice) ?? []
  );
}

// Locked "core" blocks (hourly-grid-core, week-title, todo-checklist,
// habit-tracker, month-grid-core, month-title) render as plain,
// non-interactive elements — nothing marks them draggable/selectable
// otherwise, which would let a user drag pieces of the hourly grid
// around by accident.
//
// Everything else grid-placed (currently just labeled-box) renders
// wrapped in a Polotno `type: "group"` element, `id` set to the
// ModuleInstance's own id. That id is what lets the editor recognize
// "this thing on the canvas is module X" when saving, snapping, or
// deleting it — see PlannerEditorCanvas.tsx.
//
// `resizable: false` has to be set on each CHILD, not the group wrapper
// — a group's own `draggable`/`resizable`/etc. are computed views
// derived from its children (true only if every child agrees), not real
// stored props, so setting them on the group object itself when
// constructing it is silently ignored. Span-aware resize (snapping
// width/height to whole columns/rows) isn't built yet, only position, so
// this keeps Polotno's own free-form resize handles from appearing.
/** What a renderer is handed: the box, the props it actually draws, and the
 *  page's dot lattice. */
export type DrawingInputs = {
  geometry: { x: number; y: number; width: number; height: number };
  propValues: unknown;
  lattice: { pitchPx: number; originX: number; originY: number; insetPx: number; dayCells?: number };
};

/**
 * THE THREE ARGUMENTS EVERY MODULE IS DRAWN FROM, worked out once.
 *
 * Exported because the editor needs them without drawing anything: to turn a
 * click inside the hourly grid back into a day and a time it has to know the
 * same box, the same props and the same lattice the marks were placed from.
 * Deriving those a second time in the browser is how a click at 10:30 ends up
 * saved as 10:00 - see hourlyGridGeometry's own note.
 *
 * Null for an instance with no placement, which is what the render returned
 * for one before this was pulled out.
 */
export function drawingInputsFor(
  instance: ModuleInstanceForRender,
  pageGrid: PageGrid
): DrawingInputs | null {
  if (instance.columnStart === null || instance.rowStart === null) return null;
  const geometry = gridCellToPixels(pageGrid, {
    columnStart: instance.columnStart,
    rowStart: instance.rowStart,
    columnSpan: instance.columnSpan,
    rowSpan: instance.rowSpan,
  });
  const cell = gridCellToAllocation(pageGrid, {
    columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1,
  });
  // Facts that are consequences of the geometry rather than settings are
  // recomputed here from the box about to be drawn, so no caller can hand a
  // renderer a prop that disagrees with the size it passed. See the
  // registry's derivedProps for the reasoning and for which modules have any.
  const propValues = withDerivedProps(
    instance.moduleType.slug,
    pageGrid,
    { columnSpan: instance.columnSpan, rowSpan: instance.rowSpan },
    instance.propValues
  );
  return {
    geometry,
    propValues,
    lattice: {
      pitchPx: cell.width,
      originX: pageGrid.marginPx,
      originY: pageGrid.marginPx,
      insetPx: pageGrid.boxInsetPx,
      dayCells: dayUnitColumns(pageGrid),
    },
  };
}

export function renderModuleInstance(
  instance: ModuleInstanceForRender,
  pageGrid: PageGrid,
  fontFamily: string = FONT_SERIF
): RenderedPolotnoElement[] {
  if (instance.moduleType.slug === "freeform-element") {
    const props = instance.propValues as { polotnoElement?: RenderedPolotnoElement };
    return props.polotnoElement ? [props.polotnoElement] : [];
  }

  const inputs = drawingInputsFor(instance, pageGrid);
  if (!inputs) {
    return [];
  }

  const elements = renderBySlug(
    instance.moduleType.slug,
    inputs.geometry,
    inputs.propValues,
    instance.id,
    fontFamily,
    inputs.lattice
  );
  if (!elements.length) {
    return elements;
  }

  if (instance.locked) {
    return elements.map((el) => ({ ...el, draggable: false, selectable: false }));
  }

  return [
    {
      id: instance.id,
      type: "group",
      draggable: true,
      children: elements.map((el) => ({ ...el, resizable: false })),
    },
  ];
}

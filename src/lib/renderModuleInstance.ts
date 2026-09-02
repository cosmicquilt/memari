// Turns a single ModuleInstance DB row into the Polotno element(s) it
// should render as. Shared between the Server Component that builds the
// initial canvas snapshot (planner/page.tsx) and the server actions that
// need to hand back freshly-rendered JSON for a module added mid-session
// (planner/actions.ts) — both need the exact same logic, so it lives here
// instead of being duplicated.

import { gridCellToPixels, gridCellToAllocation, type PageGrid } from "@/lib/grid";
import {
  renderHourlyGridCore,
  type HourlyGridCoreConfig,
} from "@/lib/modules/hourlyGridCore";
import { renderLabeledBox, type LabeledBoxConfig } from "@/lib/modules/labeledBox";
import { renderWeekTitle, type WeekTitleConfig } from "@/lib/modules/weekTitle";
import {
  renderTodoChecklist,
  type TodoChecklistConfig,
} from "@/lib/modules/todoChecklist";
import {
  renderHabitTracker,
  type HabitTrackerConfig,
} from "@/lib/modules/habitTracker";
import {
  renderMonthGridCore,
  type MonthGridCoreConfig,
} from "@/lib/modules/monthGridCore";
import { renderMonthTitle, type MonthTitleConfig } from "@/lib/modules/monthTitle";
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
  lattice: { pitchPx: number; originX: number; originY: number; insetPx: number }
): RenderedPolotnoElement[] {
  switch (slug) {
    case "hourly-grid-core":
      return renderHourlyGridCore(
        geometry,
        propValues as unknown as HourlyGridCoreConfig,
        idPrefix,
        fontFamily,
        lattice
      );
    case "labeled-box":
      return renderLabeledBox(geometry, propValues as unknown as LabeledBoxConfig, idPrefix, fontFamily);
    case "week-title":
      return renderWeekTitle(geometry, propValues as unknown as WeekTitleConfig, idPrefix, fontFamily);
    case "todo-checklist":
      return renderTodoChecklist(
        geometry,
        propValues as unknown as TodoChecklistConfig,
        idPrefix,
        fontFamily
      );
    case "habit-tracker":
      return renderHabitTracker(
        geometry,
        propValues as unknown as HabitTrackerConfig,
        idPrefix,
        fontFamily
      );
    case "month-grid-core":
      return renderMonthGridCore(
        geometry,
        propValues as unknown as MonthGridCoreConfig,
        idPrefix,
        fontFamily
      );
    case "month-title":
      return renderMonthTitle(geometry, propValues as unknown as MonthTitleConfig, idPrefix, fontFamily);
    default:
      // Other module types (e.g. quote-block) don't have renderers yet.
      return [];
  }
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
export function renderModuleInstance(
  instance: ModuleInstanceForRender,
  pageGrid: PageGrid,
  fontFamily: string = FONT_SERIF
): RenderedPolotnoElement[] {
  if (instance.moduleType.slug === "freeform-element") {
    const props = instance.propValues as { polotnoElement?: RenderedPolotnoElement };
    return props.polotnoElement ? [props.polotnoElement] : [];
  }

  if (instance.columnStart === null || instance.rowStart === null) {
    return [];
  }
  const geometry = gridCellToPixels(pageGrid, {
    columnStart: instance.columnStart,
    rowStart: instance.rowStart,
    columnSpan: instance.columnSpan,
    rowSpan: instance.rowSpan,
  });

  const cell = gridCellToAllocation(pageGrid, {
    columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1,
  });
  const elements = renderBySlug(
    instance.moduleType.slug,
    geometry,
    instance.propValues,
    instance.id,
    fontFamily,
    { pitchPx: cell.width, originX: pageGrid.marginPx, originY: pageGrid.marginPx, insetPx: pageGrid.boxInsetPx }
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

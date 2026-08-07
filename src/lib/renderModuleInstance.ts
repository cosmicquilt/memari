// Turns a single ModuleInstance DB row into the Polotno element(s) it
// should render as. Shared between the Server Component that builds the
// initial canvas snapshot (planner/page.tsx) and the server actions that
// need to hand back freshly-rendered JSON for a module added mid-session
// (planner/actions.ts) — both need the exact same logic, so it lives here
// instead of being duplicated.

import { gridCellToPixels, type PageGrid } from "@/lib/grid";
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

function renderBySlug(
  slug: string,
  geometry: { x: number; y: number; width: number; height: number },
  propValues: unknown,
  idPrefix: string
): object[] {
  switch (slug) {
    case "hourly-grid-core":
      return renderHourlyGridCore(
        geometry,
        propValues as unknown as HourlyGridCoreConfig,
        idPrefix
      );
    case "labeled-box":
      return renderLabeledBox(geometry, propValues as unknown as LabeledBoxConfig, idPrefix);
    case "week-title":
      return renderWeekTitle(geometry, propValues as unknown as WeekTitleConfig, idPrefix);
    case "todo-checklist":
      return renderTodoChecklist(
        geometry,
        propValues as unknown as TodoChecklistConfig,
        idPrefix
      );
    case "habit-tracker":
      return renderHabitTracker(
        geometry,
        propValues as unknown as HabitTrackerConfig,
        idPrefix
      );
    default:
      // Other module types (e.g. quote-block) don't have renderers yet.
      return [];
  }
}

// Locked "core" blocks (hourly-grid-core, week-title, todo-checklist,
// habit-tracker) render as plain, non-interactive elements — nothing
// marks them draggable/selectable otherwise, which would let a user drag
// pieces of the hourly grid around by accident.
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
  pageGrid: PageGrid
): object[] {
  if (instance.moduleType.slug === "freeform-element") {
    const props = instance.propValues as { polotnoElement?: object };
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

  const elements = renderBySlug(
    instance.moduleType.slug,
    geometry,
    instance.propValues,
    instance.id
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

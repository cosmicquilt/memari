import { auth } from "@clerk/nextjs/server";
import { getOrCreatePlanner } from "./actions";
import { PlannerEditor } from "./PlannerEditor";
import type { PageGrid } from "@/lib/grid";
import { renderModuleInstance } from "@/lib/renderModuleInstance";

export default async function PlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const planner = await getOrCreatePlanner();

  // Two-page spread — shown together, matching the reference planner
  // viewed with the book open flat (left = Sun-Tue, right = Wed-Sat).
  const pages = planner.pages.map((page) => {
    const pageGrid: PageGrid = {
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      gridColumns: page.gridColumns,
      gridRows: page.gridRows,
      boxInsetPx: page.gridGapPx / 2,
      marginPx: page.marginPx,
    };
    const elements = page.moduleInstances
      .sort((a, b) => a.zIndex - b.zIndex)
      .flatMap((instance) => renderModuleInstance(instance, pageGrid));

    // Every grid-placed, non-locked instance renders as a draggable group
    // (see renderModuleInstance) — the editor needs each one's current
    // column/row span client-side to compute where a drag should snap to
    // and to recognize "this element on the canvas is module X" when
    // saving or deleting. Locked core blocks and freeform elements are
    // left out: they're either immovable or already freely positioned.
    const moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }> = {};
    // Slug + current config per non-locked instance, separate from
    // moduleGridInfo above — this is for the Properties panel (editing
    // heading text, habit names, etc. after placement), not placement
    // math, so it's kept as its own map rather than widening
    // moduleGridInfo's shape and risking the placement/collision code
    // that already depends on it.
    const moduleConfig: Record<string, { slug: string; propValues: unknown }> = {};
    // Locked core blocks' cell ranges — static for the whole session
    // (they never move), so the editor's collision/reflow logic can
    // check against them without needing a live lookup like it does for
    // other draggable modules.
    const lockedRects: Array<{
      columnStart: number;
      rowStart: number;
      columnSpan: number;
      rowSpan: number;
    }> = [];
    // Ids of locked instances (not their rects — those are lockedRects
    // above) — used to dim their rendered elements during a drag (see
    // PlannerEditorCanvas's opacity-ghosting effect). Locked instances
    // render as many flat elements per instance, each id-prefixed with
    // the instance id (see renderModuleInstance.ts), so the client
    // matches by prefix against this list rather than needing every
    // individual element's id.
    const lockedInstanceIds: string[] = [];
    for (const instance of page.moduleInstances) {
      if (instance.moduleType.slug === "freeform-element") continue;
      if (instance.columnStart === null || instance.rowStart === null) continue;
      if (instance.locked) {
        lockedRects.push({
          columnStart: instance.columnStart,
          rowStart: instance.rowStart,
          columnSpan: instance.columnSpan,
          rowSpan: instance.rowSpan,
        });
        lockedInstanceIds.push(instance.id);
      } else {
        moduleGridInfo[instance.id] = {
          columnSpan: instance.columnSpan,
          rowSpan: instance.rowSpan,
        };
        moduleConfig[instance.id] = {
          slug: instance.moduleType.slug,
          propValues: instance.propValues,
        };
      }
    }

    // Empty-state dropzones (PlannerEditorCanvas's EmptyZoneOverlay) need
    // to know two semantic regions per page, not just "everything
    // locked": the sidebar column below week-title (left page only —
    // there's no week-title, and so no sidebar, on the right page), and
    // the below-zone under the hourly grid (both pages). Computed here
    // directly from the instances' own slugs rather than reverse-
    // engineered client-side from the generic lockedRects list above,
    // which doesn't carry slugs and would make "which locked rect is the
    // hourly grid" a fragile guess.
    const hourlyGrid = page.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
    const weekTitle = page.moduleInstances.find((mi) => mi.moduleType.slug === "week-title");
    const belowHourlyGrid =
      hourlyGrid && hourlyGrid.columnStart !== null && hourlyGrid.rowStart !== null
        ? {
            columnStart: hourlyGrid.columnStart,
            rowStart: hourlyGrid.rowStart + hourlyGrid.rowSpan,
            columnSpan: hourlyGrid.columnSpan,
            rowSpan: Math.max(0, page.gridRows - (hourlyGrid.rowStart + hourlyGrid.rowSpan)),
          }
        : null;
    const sidebar =
      weekTitle && weekTitle.columnStart !== null && weekTitle.rowStart !== null
        ? {
            columnStart: weekTitle.columnStart,
            rowStart: weekTitle.rowStart + weekTitle.rowSpan,
            columnSpan: weekTitle.columnSpan,
            rowSpan: Math.max(0, page.gridRows - (weekTitle.rowStart + weekTitle.rowSpan)),
          }
        : null;
    const interactiveZones = { sidebar, belowHourlyGrid };

    return {
      pageId: page.id,
      elements,
      pageGrid,
      moduleGridInfo,
      moduleConfig,
      lockedRects,
      lockedInstanceIds,
      interactiveZones,
    };
  });

  // week-title and both pages' hourly-grid-core are locked/structural —
  // not individually selectable on the canvas (see renderModuleInstance),
  // so they don't go through the per-module Properties panel above.
  // Surfaced here instead for the Week Settings panel, which edits them
  // as one batch (see actions.ts's updateWeekSettings).
  const [leftPage, rightPage] = planner.pages;
  const weekTitleInstance = leftPage?.moduleInstances.find((mi) => mi.moduleType.slug === "week-title");
  const leftHourly = leftPage?.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
  const rightHourly = rightPage?.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
  const weekTitleProps = weekTitleInstance?.propValues as
    | { weekNumber?: number; weekTotal?: number; dateRangeLabel?: string }
    | undefined;
  const dayDates = (instance: typeof leftHourly) => {
    const props = instance?.propValues as { dayLabels?: Array<{ date: number }> } | undefined;
    return (props?.dayLabels ?? []).map((d) => d.date);
  };
  const weekSettings = {
    weekNumber: weekTitleProps?.weekNumber ?? 1,
    weekTotal: weekTitleProps?.weekTotal ?? 52,
    dateRangeLabel: weekTitleProps?.dateRangeLabel ?? "",
    leftDates: dayDates(leftHourly),
    rightDates: dayDates(rightHourly),
  };

  return <PlannerEditor pages={pages} weekSettings={weekSettings} />;
}

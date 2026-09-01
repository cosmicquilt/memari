// Exercises a MONTH planner through the same editor the WEEK planner
// uses (see ../page.tsx) — deliberately reuses PlannerEditor/
// PlannerEditorCanvas completely unchanged, per the migration plan: a
// locked module type (month-grid-core, month-title) needs no editor
// changes at all, since locked instances already render flat and
// non-interactive regardless of slug. This route exists to verify that
// claim and to give the new monthly-layout renderers something real to
// look at, not as a finished "pick your own month" feature — see
// getOrCreateMonthPlanner's own header comment for why it's pinned to
// January 2024 rather than "the current month."
//
// interactiveZonesByPage's sidebar/belowHourlyGrid zones (see ../page.tsx)
// are computed generically off *specific* slugs ("hourly-grid-core",
// "week-title") that a month page doesn't have — both come out null
// here, which just means the "+" empty-zone dropzone buttons don't
// appear on this route. Harmless and unforced: fixing it would mean
// touching page.tsx's zone-computation logic to also recognize
// month-grid-core/month-title, which isn't needed for what this route is
// actually verifying (that the new renderers place and display
// correctly) and is exactly the kind of change the migration plan's
// "ship Phase 1 with zero editor changes" claim is about not needing.

import { auth } from "@clerk/nextjs/server";
import { getOrCreateMonthPlanner } from "../actions";
import { PlannerEditor } from "../PlannerEditor";
import type { PageGrid } from "@/lib/grid";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { renderModuleInstance } from "@/lib/renderModuleInstance";

export default async function MonthPlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const planner = await getOrCreateMonthPlanner();

  const pages = planner.pages.map((page) => {
    const pageGrid: PageGrid = {
      widthPx: PRINT_WIDTH_PX,
      heightPx: PRINT_HEIGHT_PX,
      gridColumns: page.gridColumns,
      gridRows: page.gridRows,
      boxInsetPx: page.gridGapPx / 2,
      marginPx: page.marginPx,
    };
    const elements = page.moduleInstances
      .sort((a, b) => a.zIndex - b.zIndex)
      .flatMap((instance) => renderModuleInstance(instance, pageGrid));

    const moduleGridInfo: Record<string, { columnSpan: number; rowSpan: number }> = {};
    const moduleConfig: Record<string, { slug: string; propValues: unknown }> = {};
    const lockedRects: Array<{
      columnStart: number;
      rowStart: number;
      columnSpan: number;
      rowSpan: number;
    }> = [];
    // Deliberately left empty (not populated below the way page.tsx's own
    // does) — PlannerEditorCanvas's opacity-ghosting effect dims whatever
    // ids show up here during a drag, and month-title/month-grid-core
    // dimming while repositioning a sidebar box read as unwanted here,
    // unlike week-title/hourly-grid-core's identical dimming on the
    // weekly page, which stays as-is. lockedRects (below) is unaffected
    // — that's real collision/placement math, not a visual effect.
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

    return {
      pageId: page.id,
      elements,
      pageGrid,
      moduleGridInfo,
      moduleConfig,
      lockedRects,
      lockedInstanceIds,
      // See this file's header comment — no month-aware zone computation
      // yet, so no empty-zone dropzones on this route.
      interactiveZones: { sidebar: null, belowHourlyGrid: null },
    };
  });

  // PlannerEditorCanvas requires weekSettings (drives its always-present
  // "Week" side-panel tab); a month planner has nothing meaningful to
  // put there. A placeholder rather than making the prop optional, which
  // would mean touching PlannerEditorCanvas.tsx — the "Week" tab simply
  // goes unused on this route, not broken.
  const weekSettings = {
    weekNumber: 1,
    weekTotal: 52,
    dateRangeLabel: "",
    leftDates: [],
    rightDates: [],
  };

  return <PlannerEditor pages={pages} weekSettings={weekSettings} />;
}

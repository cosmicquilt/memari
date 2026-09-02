// Shared data-loading + page-shaping logic for the WEEK planner, used by
// both the native editor route and the (upcoming) headless export route
// — factored out so the two can never independently drift on what
// "correct" output looks like. The original /planner route (page.tsx +
// PlannerEditorCanvas.tsx, the still-live Polotno-hosted editor) is left
// untouched and does not use this — it keeps its own copy of similar
// logic, deliberately, so it stays a stable comparison point until the
// native editor reaches parity (see the migration plan's "build behind a
// parallel route" decision).
//
// Shaped differently from page.tsx's own version in one deliberate way:
// this groups elements *per module instance*, each carrying its own
// grid position (columnStart/rowStart/columnSpan/rowSpan) and pixel
// origin — page.tsx's shape flattens every instance's elements into one
// page-wide list, which was fine for handing straight to Polotno's
// store.loadJSON(), but the native editor needs each module as its own
// separately-positioned CSS Grid item, which needs that per-instance
// position kept intact, not just span info (moduleGridInfo, elsewhere in
// this codebase, deliberately never carries position — this file's
// LoadedModuleInstance does, since a server-rendered CSS Grid page needs
// it up front, unlike the live-Polotno-tree approach that reads position
// off the canvas instead).
//
// Server-only (reads via getOrCreatePlanner, a server action) — every
// caller must be a Server Component or another server action.

import { getOrCreatePlanner } from "./actions";
import { gridCellToPixels, type PageGrid, type GridRect } from "@/lib/grid";
import { renderModuleInstance, type RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { resolveFontFamily, type FontChoice, type PlannerTheme } from "@/lib/theme";
import { rotateWeekDays, type DayLabel } from "@/lib/weekDays";
import type { WeekSettings } from "./WeekSettingsPanel";

export type LoadedModuleInstance = {
  id: string;
  slug: string;
  locked: boolean;
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
  propValues: unknown;
  // This instance's own pixel origin (top-left of its grid cell, in the
  // same 0..PRINT_WIDTH_PX/HEIGHT_PX space its elements' own x/y are
  // already expressed in) — PolotnoJsonRenderer subtracts this from
  // each element to get container-relative positions, so callers don't
  // need to re-derive it from columnStart/rowStart themselves.
  originX: number;
  originY: number;
  // Whatever renderModuleInstance returned for this one instance — a
  // flat list for locked instances, or a single synthetic type:"group"
  // wrapper for non-locked ones. PolotnoJsonRenderer handles both.
  elements: RenderedPolotnoElement[];
};

export type LoadedPage = {
  pageId: string;
  pageGrid: PageGrid;
  moduleInstances: LoadedModuleInstance[];
  interactiveZones: { sidebar: GridRect | null; belowHourlyGrid: GridRect | null };
};

// Page Settings values the Native editor's sidebar needs to know the
// current state of (which side of the Font toggle is active, current
// start/end/interval, etc.) — separate from weekSettings above, which is
// edited through the older, unrelated Week Settings flow.
// startTime/endTime/intervalMinutes/intervalMode read from the left
// page's own hourly-grid-core propValues — updateHourlySettings always
// writes both pages' instances together, so they're kept in sync and
// either would do.
export type PageSettings = {
  fontFamily: FontChoice;
  weekStartDay: number; // 0=Sun..6=Sat
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  intervalMode: "on" | "off";
  compactHourRows: boolean;
};

export type LoadedPlanner = {
  pages: LoadedPage[];
  weekSettings: WeekSettings;
  pageSettings: PageSettings;
};

export async function loadPlannerPages(): Promise<LoadedPlanner> {
  const planner = await getOrCreatePlanner();
  const theme = planner.theme as PlannerTheme | null;
  const fontChoice: FontChoice = theme?.fontFamily === "sans" ? "sans" : "serif";
  const fontFamily = resolveFontFamily(fontChoice);
  const weekStartDay = theme?.weekStartDay ?? 0;

  // Computed once, up front, from both pages together — rotateWeekDays
  // needs the full canonical 7-day list (left's 3 + right's 4) to rotate
  // correctly, which isn't available yet one page at a time inside the
  // per-page loop below. The stored dayLabels themselves are untouched;
  // this only overrides what gets rendered.
  const [plannerLeftPage, plannerRightPage] = planner.pages;
  const plannerLeftHourly = plannerLeftPage?.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
  const plannerRightHourly = plannerRightPage?.moduleInstances.find((mi) => mi.moduleType.slug === "hourly-grid-core");
  const rotatedDayLabels = rotateWeekDays(
    ((plannerLeftHourly?.propValues as { dayLabels?: DayLabel[] } | undefined)?.dayLabels ?? []) as DayLabel[],
    ((plannerRightHourly?.propValues as { dayLabels?: DayLabel[] } | undefined)?.dayLabels ?? []) as DayLabel[],
    weekStartDay
  );

  const pages: LoadedPage[] = planner.pages.map((page, pageIndex) => {
    const pageGrid: PageGrid = {
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      gridColumns: page.gridColumns,
      gridRows: page.gridRows,
      // The DB still stores this as gridGapPx, a gap between boxes. It is
      // now consumed as an inset of half that on each box, which puts the
      // same amount of white between two neighbours while leaving the
      // pitch equal to the cell. See PageGrid.boxInsetPx. The column is
      // renamed when the lattice migration touches the schema.
      boxInsetPx: page.gridGapPx / 2,
      marginPx: page.marginPx,
    };
    // pageIndex 0 = left, 1 = right — matches planner.pages' own
    // orderBy: position "asc" ordering, same assumption the weekSettings
    // block below (leftPage/rightPage destructure) already relies on.
    const rotatedForThisPage = pageIndex === 0 ? rotatedDayLabels.left : rotatedDayLabels.right;

    const moduleInstances: LoadedModuleInstance[] = [];
    for (const instance of page.moduleInstances) {
      if (instance.moduleType.slug === "freeform-element") continue;
      if (instance.columnStart === null || instance.rowStart === null) continue;
      const origin = gridCellToPixels(pageGrid, {
        columnStart: instance.columnStart,
        rowStart: instance.rowStart,
        columnSpan: instance.columnSpan,
        rowSpan: instance.rowSpan,
      });
      // Substitute the rotated day labels only for hourly-grid-core, only
      // for rendering — the raw instance (and what's stored in the DB)
      // keeps its original, unrotated dayLabels.
      const renderInstance =
        instance.moduleType.slug === "hourly-grid-core"
          ? { ...instance, propValues: { ...(instance.propValues as object), dayLabels: rotatedForThisPage } }
          : instance;
      moduleInstances.push({
        id: instance.id,
        slug: instance.moduleType.slug,
        locked: instance.locked,
        columnStart: instance.columnStart,
        rowStart: instance.rowStart,
        columnSpan: instance.columnSpan,
        rowSpan: instance.rowSpan,
        propValues: instance.propValues,
        originX: origin.x,
        originY: origin.y,
        elements: renderModuleInstance(renderInstance, pageGrid, fontFamily),
      });
    }
    // Sorted so DOM order matches z-index intent (later = painted on
    // top) — the old flat-elements list got this from
    // `.sort((a,b)=>a.zIndex-b.zIndex)` before flatMap; same idea, just
    // applied to whole instances instead of individual elements, since
    // each instance is now its own DOM subtree.
    moduleInstances.sort((a, b) => {
      const za = (page.moduleInstances.find((mi) => mi.id === a.id)?.zIndex ?? 0) as number;
      const zb = (page.moduleInstances.find((mi) => mi.id === b.id)?.zIndex ?? 0) as number;
      return za - zb;
    });

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

    return {
      pageId: page.id,
      pageGrid,
      moduleInstances,
      interactiveZones: { sidebar, belowHourlyGrid },
    };
  });

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
  const weekSettings: WeekSettings = {
    weekNumber: weekTitleProps?.weekNumber ?? 1,
    weekTotal: weekTitleProps?.weekTotal ?? 52,
    dateRangeLabel: weekTitleProps?.dateRangeLabel ?? "",
    leftDates: dayDates(leftHourly),
    rightDates: dayDates(rightHourly),
  };

  const hourlyProps = leftHourly?.propValues as
    | {
        startTime?: string;
        endTime?: string;
        intervalMinutes?: number;
        intervalMode?: "on" | "off";
        compactHourRows?: boolean;
      }
    | undefined;

  return {
    pages,
    weekSettings,
    pageSettings: {
      fontFamily: fontChoice,
      weekStartDay,
      startTime: hourlyProps?.startTime ?? "05:30",
      endTime: hourlyProps?.endTime ?? "23:30",
      intervalMinutes: hourlyProps?.intervalMinutes ?? 30,
      intervalMode: hourlyProps?.intervalMode ?? "on",
      compactHourRows: hourlyProps?.compactHourRows ?? false,
    },
  };
}

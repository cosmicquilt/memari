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

import type { BookWithPages } from "./bookSeeding";
import { findSpine, findTitle } from "@/lib/moduleRegistry";
import { flatten } from "@/lib/proofSvg";
import { toPreviewMarks, type PreviewMark } from "@/lib/previewMarks";
import { LEVELS_IN_BINDING_ORDER, type PageLevel } from "@/lib/pageLevels";
import { gridCellToPixels, type PageGrid, type GridRect } from "@/lib/grid";
import { type ModuleInstanceForRender, type RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { resolveFontFamily, type FontChoice, type PlannerTheme } from "@/lib/theme";
import { renderContextForPage, renderOnPage, type PageRenderContext } from "@/lib/renderContext";
import type { WeekSettings } from "./WeekSettingsPanel";

/** What a thumbnail is drawn from: a page's size and its modules. A journal's
 *  page is one; so is a saved page's content - see savedItems.ts. */
export type ThumbnailSource = {
  widthPx: number;
  heightPx: number;
  gridColumns: number;
  gridRows: number;
  gridGapPx: number;
  marginPx: number;
  moduleInstances: ModuleInstanceForRender[];
};

export type LoadedModuleInstance = {
  id: string;
  slug: string;
  locked: boolean;
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
  propValues: unknown;
  /** A use of a saved module - its settings are every use's - or null. */
  savedModule: { id: string; name: string } | null;
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
  // Which repeating set this page belongs to, and where in it. The timeline
  // groups by the first and orders by the second; nothing else reads them
  // yet. Carried here rather than re-queried because loadPlannerPages is
  // already the one place that turns a planner row into pages.
  level: PageLevel;
  position: number;
  pageGrid: PageGrid;
  /** What this page's modules are drawn with - the occurrence it is edited
   *  as, its rotated day columns, dated or not. Handed over so that every
   *  LATER drawing of a module (a live resize, a drop) is dated the same
   *  way as the first; see src/lib/renderContext.ts. */
  renderContext: PageRenderContext | null;
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
  /** False on a planner you write the dates into yourself. */
  dated: boolean;
  weekStartDay: number; // 0=Sun..6=Sat
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  intervalMode: "on" | "off";
  compactHourRows: boolean;
  // One of ROW_HEIGHT_OPTIONS_PT; 9pt when unset.
  rowHeightPt: number;
};

/**
 * One page of the WHOLE book, for the timeline drawer.
 *
 * Every level, not just the one on the canvas - the drawer's job is that
 * "every page in the planner is reachable from the timeline", which it
 * cannot be if the pages of the other levels were never loaded.
 *
 * The preview is the REAL DRAWING - the same elements the PDF exporter
 * reads, reduced HERE to the few fields a thumbnail can draw. A preview
 * built any other way would be a picture of a page rather than the page,
 * which is the mistake the proof sheets exist to avoid.
 *
 * It used to be an <svg> string, serialised on this side for the same
 * reason. The marks replaced it when the previews moved to canvas, which
 * they did because resizing ten pages of SVG live costs 7.32ms a frame
 * against a 16.7ms budget - see drawPreview. The bytes went down on the way
 * past: a mark carries five or six numbers where the SVG carried the same
 * numbers plus angle brackets.
 */
export type TimelinePage = {
  pageId: string;
  level: PageLevel;
  /** Null for the default layout - the one printed for every occurrence
   *  that has none of its own. A key like "2026-02" is February's alone. */
  variantKey: string | null;
  position: number;
  /** Every drawable mark on the page, in PRINT px. The painter scales; a
   *  mark that had been pre-scaled would have to be re-sent on every frame
   *  of a drag, which is the cost this whole change exists to remove. */
  previewMarks: PreviewMark[];
  /** The page's own size in print px - the marks' coordinate space, and what
   *  the canvas fits them into. Carried per page rather than assumed from a
   *  constant: every page in a book shares a trim today, and the drawing
   *  would silently stretch on the day one does not. */
  pageWidthPx: number;
  pageHeightPx: number;
  moduleCount: number;
  /** The saved page this is a use of, and which of its pages (0, or 1 for a
   *  spread's right page) - or null for a page of the journal's own. */
  saved: { id: string; name: string; index: number } | null;
};

export type LoadedPlanner = {
  /** Which journal this is - the id in the address, and its name. The
   *  editor passes the id to every action that works on the journal as a
   *  whole; the name is shown in the header. */
  journal: { id: string; title: string };
  pages: LoadedPage[];
  /** Which occurrence's layout these pages ACTUALLY are - null for the
   *  default. Not always what was asked for: a key with no pages behind it
   *  falls back, and the caller has to know so it does not claim otherwise. */
  variantKey: string | null;
  /** Every page of the book, in binding order, for the drawer. */
  timeline: TimelinePage[];
  /** What term this book covers, if it has one yet. Sequence generation
   *  walks it, and the cog's popup divides it into the occurrences a person
   *  can give their own layout to. ISO dates rather than Date objects: this
   *  crosses into a client component, where a Date would be serialised and
   *  come back as a string anyway. */
  term: { start: string | null; end: string | null };
  weekSettings: WeekSettings;
  pageSettings: PageSettings;
};

/**
 * @param planner The book. Supplied by the caller rather than fetched here,
 * so a route picks its own level - the week spread and the month spread are
 * the same editor over different spine modules, not two editors.
 * @param level Which of the book's levels to shape into pages. A book holds
 * pages at every level at once now, and the editor draws ONE spread, so the
 * others are filtered out here rather than by the caller - this is already
 * the one place that turns a planner row into pages, and a second filter
 * somewhere else is a second description of what a spread is.
 */
export async function loadPlannerPages(
  planner: BookWithPages,
  level: PageLevel,
  /** Which occurrence's layout to put on the canvas. Null is the default -
   *  the one almost every book only ever has. */
  variantKey: string | null = null
): Promise<LoadedPlanner> {
  // Everything below reads this, never planner.pages: an unfiltered read
  // would put the monthly spread's modules onto the weekly page - and, once
  // a month has its own layout, February's modules onto the default one.
  const at = (key: string | null) =>
    planner.pages
      .filter((page) => page.level === level && (page.variantKey ?? null) === key)
      .sort((a, b) => a.position - b.position);

  // FALL BACK TO THE DEFAULT when the asked-for occurrence has no pages.
  // Found the hard way: resetting February while editing February left the
  // browser on ?variant=2026-02 with nothing behind it, and the editor read
  // pages[0] of an empty list. A bookmarked or hand-typed key does the same.
  // The default is what that occurrence prints anyway, so falling back shows
  // the truth rather than an error.
  const resolvedVariantKey = variantKey !== null && at(variantKey).length === 0 ? null : variantKey;
  const levelPages = at(resolvedVariantKey);

  const theme = planner.theme as PlannerTheme | null;
  // Not from the theme blob: `dated` is a real column, because it is
  // structural rather than presentational - it says what kind of planner
  // this is, and sequence generation will need to query on it.
  const dated = (planner as { dated?: boolean }).dated !== false;
  const fontChoice: FontChoice = theme?.fontFamily === "sans" ? "sans" : "serif";
  const fontFamily = resolveFontFamily(fontChoice);
  const weekStartDay = theme?.weekStartDay ?? 0;

  const pages: LoadedPage[] = levelPages.map((page) => {
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
    // Which occurrence this page is edited AS, its day columns rotated to
    // the book's week start, dated or not - one function, shared with the
    // editor and the server actions, so a module drawn later is dated the
    // way it was drawn here.
    const renderContext = renderContextForPage(planner, page.id);

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
      moduleInstances.push({
        id: instance.id,
        slug: instance.moduleType.slug,
        locked: instance.locked,
        columnStart: instance.columnStart,
        rowStart: instance.rowStart,
        columnSpan: instance.columnSpan,
        rowSpan: instance.rowSpan,
        propValues: instance.propValues,
        savedModule:
          instance.savedModuleId && instance.savedModule
            ? { id: instance.savedModuleId, name: instance.savedModule.name }
            : null,
        originX: origin.x,
        originY: origin.y,
        // WHAT THIS PAGE WILL ACTUALLY PRINT AS: filled in for the
        // occurrence being edited (or emptied, on an undated book), with the
        // week's days in the book's order. ONLY THE DRAWING - `propValues`
        // above stays the raw stored value, so nothing the editor saves can
        // bake a date into a template. See src/lib/renderContext.ts.
        elements: renderOnPage(instance, pageGrid, fontFamily, renderContext),
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

    // The page's SPINE, whichever cadence this is - the hourly grid on a
    // week, the calendar on a month. Searching for one slug by name is
    // what left a month page with no zones at all, so no dropzones and no
    // sidebar; see the registry's isSpine.
    const hourlyGrid = findSpine(page.moduleInstances);
    const weekTitle = findTitle(page.moduleInstances);
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
      level: page.level,
      position: page.position,
      pageGrid,
      renderContext,
      moduleInstances,
      interactiveZones: { sidebar, belowHourlyGrid },
    };
  });

  // THE WHOLE BOOK, for the drawer. Rendered separately from `pages` above
  // because that one is filtered to the level on the canvas and carries far
  // more per page than a thumbnail needs.
  const timeline: TimelinePage[] = planner.pages
    .slice()
    .sort((a, b) =>
      a.level === b.level
        ? a.position - b.position
        : LEVELS_IN_BINDING_ORDER.indexOf(a.level) - LEVELS_IN_BINDING_ORDER.indexOf(b.level)
    )
    .map((page) => {
      // Its own page's context, so a card is dated the way its page is.
      const previewMarks = pageThumbnail(page, fontFamily, renderContextForPage(planner, page.id));
      return {
        pageId: page.id,
        level: page.level,
        variantKey: page.variantKey,
        position: page.position,
        previewMarks,
        pageWidthPx: page.widthPx,
        pageHeightPx: page.heightPx,
        moduleCount: page.moduleInstances.length,
        saved:
          page.savedPageId && page.savedPage
            ? { id: page.savedPageId, name: page.savedPage.name, index: page.savedPageIndex ?? 0 }
            : null,
      };
    });

  const [leftPage, rightPage] = levelPages;
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
        rowHeightPt?: number;
      }
    | undefined;

  return {
    journal: { id: planner.id, title: planner.title },
    pages,
    variantKey: resolvedVariantKey,
    timeline,
    term: {
      start: (planner as { startDate?: Date | null }).startDate?.toISOString().slice(0, 10) ?? null,
      end: (planner as { endDate?: Date | null }).endDate?.toISOString().slice(0, 10) ?? null,
    },
    weekSettings,
    pageSettings: {
      fontFamily: fontChoice,
      dated,
      weekStartDay,
      startTime: hourlyProps?.startTime ?? "05:30",
      endTime: hourlyProps?.endTime ?? "23:30",
      intervalMinutes: hourlyProps?.intervalMinutes ?? 30,
      intervalMode: hourlyProps?.intervalMode ?? "on",
      compactHourRows: hourlyProps?.compactHourRows ?? false,
      rowHeightPt: hourlyProps?.rowHeightPt ?? 9,
    },
  };
}

/**
 * A page's thumbnail marks: every module drawn THE WAY ITS PAGE DRAWS IT.
 *
 * It used to draw the stored props instead, on the reasoning that the
 * timeline shows the templates rather than one occurrence of them. The
 * timeline does show templates - one card per template page, not one per
 * week of the book - but a template's stored props still carry whatever the
 * seed put in them, and the seed's week is "DEC 31 - JAN 6". So a journal
 * whose term started in October had a canvas dated October above a thumbnail
 * of the same page dated January. Reported as "i set term but timeline
 * previews still show up like as january"; measured on a real book, canvas
 * "DEC 28 - JAN 3" against thumbnail "DEC 31 - JAN 6" for one page.
 *
 * Two descriptions of one page, which is this codebase's oldest fault. It
 * takes the page's render context now - the same one the canvas, the editor
 * and the server actions all go through - so the two cannot disagree.
 *
 * Shared by the timeline and the start dialog's journal cards, so a journal
 * looks the same in both, and by saved pages - which are not a journal's
 * pages at all and so have no occurrence to be drawn as. They pass a context
 * with a null occurrence, which draws the stored values, exactly as before.
 */
export function pageThumbnail(
  page: ThumbnailSource,
  fontFamily: string,
  context: PageRenderContext | null
): PreviewMark[] {
  const pageGrid: PageGrid = {
    widthPx: page.widthPx,
    heightPx: page.heightPx,
    gridColumns: page.gridColumns,
    gridRows: page.gridRows,
    boxInsetPx: page.gridGapPx / 2,
    marginPx: page.marginPx,
  };
  const elements = [];
  for (const instance of page.moduleInstances) {
    if (instance.moduleType.slug === "freeform-element") continue;
    if (instance.columnStart === null || instance.rowStart === null) continue;
    elements.push(...flatten(renderOnPage(instance, pageGrid, fontFamily, context)));
  }
  // `skipped` is deliberately dropped here and fatal in check:preview. A
  // book holding one mark this vocabulary has not met should still show
  // its other pages; the place to find out is the check, not a blank
  // thumbnail in front of somebody.
  return toPreviewMarks(elements).marks;
}

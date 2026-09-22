// A person's journals, as the start dialog shows them, and the templates its
// Create side previews.
//
// A plain server module - it reads the database for a user the caller has
// already signed in, and is imported only by server components (the /app
// page, the legacy /planner page). Not a "use server" file: nothing here may
// be callable from a browser.

import { prisma } from "@/lib/prisma";
import { renderContextForPage } from "@/lib/renderContext";
import type { PageLevel } from "@/generated/prisma/enums";
import { LEVEL_PAGE_COUNT, LEVELS_IN_BINDING_ORDER, bookPageCount } from "@/lib/pageLevels";
import { missingPlacements } from "@/lib/pageLayouts";
import { moduleDefinition } from "@/lib/moduleRegistry";
import { flatten } from "@/lib/proofSvg";
import { toPreviewMarks, type PreviewMark } from "@/lib/previewMarks";
import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { PLANNER_TRIMS, trimKeyForWidth } from "@/lib/planner-trims";
import { resolveFontFamily, type PlannerTheme } from "@/lib/theme";
import type { PageGrid } from "@/lib/grid";
import { WITH_PAGES, LEVEL_LAYOUT } from "./bookSeeding";
import { pageThumbnail } from "./loadPlannerPages";

/** One page's thumbnail - what PagePreview draws. */
export type ThumbnailPage = { previewMarks: PreviewMark[]; pageWidthPx: number; pageHeightPx: number };

export type JournalCard = {
  id: string;
  title: string;
  dated: boolean;
  term: { start: string | null; end: string | null };
  trim: string;
  /** The levels that have pages, in binding order - see generateBook. */
  levels: PageLevel[];
  /** What it prints over its term. Null with no term. */
  pages: number | null;
  /** The spread its card shows: the weekly one where it has one. */
  cover: ThumbnailPage[];
};

/** Which level's spread a journal's card shows, first match wins: the week
 *  is what most journals are organised around. */
const COVER_ORDER: PageLevel[] = ["WEEKLY", "MONTHLY", "DAILY", "FRONT_MATTER", "BACK_MATTER"];

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/** Every journal of `ownerId`, newest first, as Saved lists them. */
export async function journalsOf(ownerId: string): Promise<JournalCard[]> {
  const planners = await prisma.planner.findMany({
    where: { ownerId, isTemplate: false },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: WITH_PAGES,
  });
  return planners.map((planner) => {
    const theme = planner.theme as PlannerTheme | null;
    const fontFamily = resolveFontFamily(theme?.fontFamily);
    // The default layout's pages only: an occurrence's own layout replaces
    // them for that occurrence, so it adds nothing to the count.
    const defaults = planner.pages.filter((page) => (page.variantKey ?? null) === null);
    const perLevel: Partial<Record<PageLevel, number>> = {};
    for (const page of defaults) perLevel[page.level] = (perLevel[page.level] ?? 0) + 1;
    const levels = LEVELS_IN_BINDING_ORDER.filter((level) => (perLevel[level] ?? 0) > 0);
    const coverLevel = COVER_ORDER.find((level) => (perLevel[level] ?? 0) > 0);
    const cover = coverLevel
      ? defaults
          .filter((page) => page.level === coverLevel)
          .sort((a, b) => a.position - b.position)
          .slice(0, LEVEL_PAGE_COUNT[coverLevel])
          .map((page) => ({
            // The page's own context, so a card in the start dialog is dated
            // the way the page is when you open it.
            previewMarks: pageThumbnail(page, fontFamily, renderContextForPage(planner, page.id)),
            pageWidthPx: page.widthPx,
            pageHeightPx: page.heightPx,
          }))
      : [];
    return {
      id: planner.id,
      title: planner.title,
      dated: planner.dated,
      term: { start: iso(planner.startDate), end: iso(planner.endDate) },
      trim: PLANNER_TRIMS[trimKeyForWidth(defaults[0]?.widthPx ?? PLANNER_TRIMS.bound7x10.widthPx)].label,
      levels,
      pages: bookPageCount(perLevel, planner.startDate, planner.endDate, theme?.weekStartDay ?? 0),
      cover,
    };
  });
}

/** The journal the legacy /planner page opens: the oldest, as it always
 *  was when there was only one. */
export async function oldestJournalId(ownerId: string): Promise<string | null> {
  const planner = await prisma.planner.findFirst({
    where: { ownerId, isTemplate: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  return planner?.id ?? null;
}

/**
 * What each level's TEMPLATE looks like, drawn from the layout itself - the
 * same placements a new journal is seeded with, spans filled from each module
 * type's defaults as the seed fills them. So a Create card shows exactly the
 * pages Create will make, not a picture of them.
 */
export function templatePreviews(): Record<PageLevel, ThumbnailPage[]> {
  const spec = PLANNER_TRIMS.bound7x10;
  const pageGrid: PageGrid = {
    widthPx: spec.widthPx,
    heightPx: spec.heightPx,
    gridColumns: 24,
    gridRows: spec.gridRows,
    boxInsetPx: 6,
    marginPx: spec.marginPx,
  };
  const fontFamily = resolveFontFamily("serif");
  const out = {} as Record<PageLevel, ThumbnailPage[]>;
  for (const level of LEVELS_IN_BINDING_ORDER) {
    const layout = LEVEL_LAYOUT[level]?.(spec.gridRows);
    const placements = layout ? missingPlacements(layout, [[], []]) : [];
    out[level] = Array.from({ length: LEVEL_PAGE_COUNT[level] }, (_, pageIndex) => {
      const elements = placements
        .filter((p) => p.page === pageIndex)
        .flatMap((p, n) => {
          const db = moduleDefinition(p.slug)?.db;
          return flatten(
            renderModuleInstance(
              {
                id: `template-${level}-${pageIndex}-${n}`,
                locked: p.locked,
                columnStart: p.columnStart,
                rowStart: p.rowStart,
                columnSpan: p.columnSpan ?? db?.defaultColumnSpan ?? 1,
                rowSpan: p.rowSpan ?? db?.defaultRowSpan ?? 1,
                propValues: p.propValues,
                moduleType: { slug: p.slug },
              },
              pageGrid,
              fontFamily
            )
          );
        });
      return { previewMarks: toPreviewMarks(elements).marks, pageWidthPx: spec.widthPx, pageHeightPx: spec.heightPx };
    });
  }
  return out;
}


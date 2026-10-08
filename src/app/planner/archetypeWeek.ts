// "Use this" (2026-10-06 for the people's weeks; every kind 2026-10-08): one
// of the landing page's spreads as a new journal of your own - exactly as
// the hero printed it, opened in the editor to change. The spreads are
// src/app/landing/heroSpreads.ts (the people's weeks from archetypes.ts),
// and where everything goes is spreads.ts's spreadPlacements - the one
// description both read.
//
// FOUR KINDS, four journals, each made the way the start dialog's Create
// makes one (this quarter, the spread's week start and type) and then laid
// out like the spread:
//
//   week   a weekly book; its weekly spread takes the spread's modules
//   month  a monthly book; its month spread does
//   day    a daily book; its day page takes the spread's left page (the
//          hero shows two facing days of ONE daily template)
//   pages  a weekly book whose Beginning is the spread's two pages
//
// The locked spine stays - the week title, the hours, the month's title and
// calendar - but takes the spread's SETTINGS: the hours' range, increments
// and row height, how tall they are (hoursRows), and how the month's days
// are ruled. Not its dates or events: those are the journal's own.
//
// THE SEEDED DEFAULTS DO NOT COME BACK. ensureLevel runs on every open and
// re-creates whatever a level's layout says is missing, but only into FREE
// cells (placementsOnFreeCells), and every spread's pages are full -
// spreads.test.mts checks every layout fills its rows.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { PageLevel } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import type { HeroSpread } from "@/app/landing/heroSpreads";
import { spreadPlacements, type Placed } from "@/app/landing/spreads";
import { createBookFor, type BookWithPages, type NewJournal } from "./bookSeeding";

/** This quarter from the first of next month, as the start dialog offers -
 *  the term the subscription ships by default. */
function nextQuarter(today: Date): { startISO: string; endISO: string } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startISO: iso(start), endISO: iso(end) };
}

/** Which level a spread's pages become, and the book's levels. */
function shapeOf(spread: HeroSpread): { target: PageLevel; levels: PageLevel[] } {
  switch (spread.layout.kind) {
    case "month":
      return { target: PageLevel.MONTHLY, levels: [PageLevel.FRONT_MATTER, PageLevel.MONTHLY, PageLevel.BACK_MATTER] };
    case "day":
      return { target: PageLevel.DAILY, levels: [PageLevel.FRONT_MATTER, PageLevel.DAILY, PageLevel.BACK_MATTER] };
    case "pages":
      return { target: PageLevel.FRONT_MATTER, levels: [PageLevel.FRONT_MATTER, PageLevel.WEEKLY, PageLevel.BACK_MATTER] };
    default:
      return { target: PageLevel.WEEKLY, levels: [PageLevel.FRONT_MATTER, PageLevel.WEEKLY, PageLevel.BACK_MATTER] };
  }
}

/** The journal a spread starts, at the hero's trim. */
export function journalFor(spread: HeroSpread, title: string, browserTimeZone: string | null, today = new Date()): NewJournal {
  return {
    title,
    trim: "bound7x10",
    ...nextQuarter(today),
    levels: shapeOf(spread).levels,
    dated: true,
    weekStartDay: spread.layout.weekStartsMonday ? 1 : 0,
    font: spread.layout.font,
    browserTimeZone,
  };
}

/** What a spine keeps from the spread: its settings, not its dates. */
function spineSettings(placed: Placed): Record<string, unknown> {
  if (placed.slug === "month-grid-core") return { inside: placed.props.inside };
  // The hours: everything but the days they are drawn for and what is on them.
  const dated = new Set(["dayCount", "dayLabels", "events"]);
  return Object.fromEntries(Object.entries(placed.props).filter(([key]) => !dated.has(key)));
}

/**
 * A spread that cannot be made here: a module it places has no row in this
 * database - in production, one registered since the module types were last
 * seeded (`npx prisma db seed`). Thrown before anything is created.
 */
export class WeekUnavailable extends Error {}

/** A new journal for `ownerId` laid out as `spread`. */
export async function createJournalFromSpread(ownerId: string, spread: HeroSpread, title: string, browserTimeZone: string | null): Promise<BookWithPages> {
  const { target } = shapeOf(spread);
  // A day spread is one daily template shown twice: its left page is it.
  const placed = spreadPlacements(spread).filter((p) => spread.layout.kind !== "day" || p.page === 0);
  const modules = placed.filter((p) => !p.locked);
  const spines = placed.filter((p) => p.locked && p.slug.endsWith("-core"));

  // Every module type first: a missing one used to throw after the journal
  // was made, leaving a half-laid-out journal behind.
  const slugs = [...new Set(modules.map((p) => p.slug))];
  const types = await prisma.moduleType.findMany({ where: { slug: { in: slugs } } });
  const bySlug = new Map(types.map((t) => [t.slug, t]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    throw new WeekUnavailable(`${spread.key} places ${missing.join(", ")}, which this database has no module type for - run \`npx prisma db seed\``);
  }

  const book = await createBookFor(ownerId, journalFor(spread, title, browserTimeZone));
  let pages = book.pages
    .filter((page) => page.level === target && (page.variantKey ?? null) === null)
    .sort((a, b) => a.position - b.position);
  const needed = spread.layout.kind === "day" ? 1 : 2;
  // Beginning starts with one page; module pages need two.
  if (pages.length > 0 && pages.length < needed) {
    const first = pages[0];
    const added = await prisma.page.create({
      data: {
        plannerId: first.plannerId,
        level: first.level,
        position: pages[pages.length - 1].position + 1,
        widthPx: first.widthPx,
        heightPx: first.heightPx,
        gridColumns: first.gridColumns,
        gridRows: first.gridRows,
        gridGapPx: first.gridGapPx,
        marginPx: first.marginPx,
      },
      include: { moduleInstances: { include: { moduleType: true } } },
    });
    pages = [...pages, added as (typeof pages)[number]];
  }
  if (pages.length < needed) throw new Error(`The new journal has no ${target} pages to lay out.`);

  const rows: Prisma.ModuleInstanceCreateManyInput[] = modules.map((p) => ({
    pageId: pages[p.page].id,
    moduleTypeId: bySlug.get(p.slug)!.id,
    placementMode: "GRID" as const,
    locked: false,
    columnStart: p.columnStart,
    rowStart: p.rowStart,
    columnSpan: p.columnSpan,
    rowSpan: p.rowSpan,
    propValues: p.props as Prisma.InputJsonValue,
  }));
  // The journal's own spine, given the spread's settings and height.
  const spineUpdates = spines.flatMap((spine) => {
    const own = pages[spine.page].moduleInstances.find((mi) => mi.locked && mi.moduleType.slug === spine.slug);
    if (!own) return [];
    const propValues = { ...((own.propValues as Record<string, unknown>) ?? {}), ...spineSettings(spine) };
    return [prisma.moduleInstance.update({ where: { id: own.id }, data: { rowSpan: spine.rowSpan, propValues: propValues as Prisma.InputJsonValue } })];
  });
  await prisma.$transaction([
    prisma.moduleInstance.deleteMany({ where: { pageId: { in: pages.slice(0, needed).map((page) => page.id) }, locked: false } }),
    ...spineUpdates,
    prisma.moduleInstance.createMany({ data: rows }),
  ]);
  return book;
}

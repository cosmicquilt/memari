// "Use this week" (2026-10-06): one of the landing page's people, as a new
// journal of your own - their weekly spread exactly as the hero printed it,
// opened in the editor to change. The people and their layouts are
// src/app/landing/archetypes.ts, the one place both read.
//
// The journal is made the way the start dialog's Create makes one (a
// weekly book, this quarter, the person's week start and type), and then its
// weekly spread's free modules - the sidebar boxes and the to-dos the weekly
// layout seeds - are replaced with the person's. The locked spine stays: the
// week title and the hours.
//
// THE SEEDED DEFAULTS DO NOT COME BACK. ensureLevel runs on every open and
// re-creates whatever the weekly layout says is missing, but only into FREE
// cells (placementsOnFreeCells), and a person's sidebar and both zones are
// full - spreads.test.mts checks every layout fills its rows.
//
// SERVER-ONLY.

import { prisma } from "@/lib/prisma";
import { PageLevel } from "@/generated/prisma/enums";
import { moduleSchemaDefaults } from "@/lib/moduleRegistry";
import type { Prisma } from "@/generated/prisma/client";
import { layoutPlacements, type Person } from "@/app/landing/archetypes";
import { createBookFor, type BookWithPages, type NewJournal } from "./bookSeeding";

/** The modules a person's week places, page by page, each with its settings
 *  over the module's defaults - from the same description the hero's
 *  spread is drawn from (layoutPlacements). */
export function weekPlacements(person: Person) {
  return layoutPlacements(person.layout).map((p) => ({ ...p, props: { ...moduleSchemaDefaults(p.slug), ...(p.props ?? {}) } }));
}

/** This quarter from the first of next month, as the start dialog offers -
 *  the term the subscription ships by default. */
function nextQuarter(today: Date): { startISO: string; endISO: string } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startISO: iso(start), endISO: iso(end) };
}

/** The journal a person's week starts: weekly pages with the front and back
 *  matter (the start dialog's "Weekly"), at the hero's trim. */
export function journalFor(person: Person, browserTimeZone: string | null, today = new Date()): NewJournal {
  return {
    title: `${person.archetype} journal`,
    trim: "bound7x10",
    ...nextQuarter(today),
    levels: [PageLevel.FRONT_MATTER, PageLevel.WEEKLY, PageLevel.BACK_MATTER],
    dated: true,
    weekStartDay: person.layout.weekStartsMonday ? 1 : 0,
    font: person.layout.font,
    browserTimeZone,
  };
}

/**
 * A week that cannot be made here: a module it places has no row in this
 * database - in production, one registered since the module types were last
 * seeded (`npx prisma db seed`). Thrown before anything is created.
 */
export class WeekUnavailable extends Error {}

/** A new journal for `ownerId` whose weekly spread is `person`'s. */
export async function createJournalFromWeek(ownerId: string, person: Person, browserTimeZone: string | null): Promise<BookWithPages> {
  // Every module type first: a missing one used to throw after the journal
  // was made, leaving a half-laid-out journal behind.
  const placements = weekPlacements(person);
  const slugs = [...new Set(placements.map((p) => p.slug))];
  const types = await prisma.moduleType.findMany({ where: { slug: { in: slugs } } });
  const bySlug = new Map(types.map((t) => [t.slug, t]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length > 0) {
    throw new WeekUnavailable(`${person.key}'s week places ${missing.join(", ")}, which this database has no module type for - run \`npx prisma db seed\``);
  }

  const book = await createBookFor(ownerId, journalFor(person, browserTimeZone));
  const spread = book.pages
    .filter((page) => page.level === PageLevel.WEEKLY && (page.variantKey ?? null) === null)
    .sort((a, b) => a.position - b.position);
  if (spread.length < 2) throw new Error("The new journal has no weekly spread to lay out.");

  const rows: Prisma.ModuleInstanceCreateManyInput[] = placements.map((p) => {
    const type = bySlug.get(p.slug)!;
    return {
      pageId: spread[p.page].id,
      moduleTypeId: type.id,
      placementMode: "GRID" as const,
      locked: false,
      columnStart: p.columnStart,
      rowStart: p.rowStart,
      columnSpan: p.columnSpan,
      rowSpan: p.rowSpan,
      propValues: p.props as Prisma.InputJsonValue,
    };
  });
  await prisma.$transaction([
    prisma.moduleInstance.deleteMany({ where: { pageId: { in: spread.slice(0, 2).map((page) => page.id) }, locked: false } }),
    prisma.moduleInstance.createMany({ data: rows }),
  ]);
  return book;
}

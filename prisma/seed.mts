import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Canvas dimensions match the 6x9" US Trade + bleed print spec from the
// Polotno test project (1875 x 2775 px at 300 DPI). defaultWidth/Height
// are the free-placement fallback size; defaultColumnSpan/RowSpan are the
// grid-placement fallback, sized against Page's default grid (4 cols x
// 30 rows, see schema.prisma) — adjust both together if that changes.
const moduleTypes = [
  {
    // "WEEK X/52" + date range, top of the sidebar. Locked/core like
    // hourly-grid-core — content is structural (which week this is), not
    // user-customizable placement. See src/lib/modules/weekTitle.ts.
    slug: "week-title",
    name: "Week Title (Core)",
    configSchema: {
      type: "object",
      properties: {
        weekNumber: { type: "integer", default: 1 },
        weekTotal: { type: "integer", default: 52 },
        dateRangeLabel: { type: "string", default: "" },
      },
    },
    defaultWidth: 300,
    defaultHeight: 160,
    defaultColumnSpan: 1,
    // 2 rows (~164px) — the actual content (two lines of text) needs
    // ~110-160px; 1 row at this resolution (~76px) would clip it.
    defaultRowSpan: 2,
  },
  {
    // "Core" block, locked by default (see ModuleInstance.locked) — a
    // whole weekly spread's day-header tabs + half-hour ruled grid,
    // matching the real hourlyjournal.pdf reference (3 day-columns on
    // the left page of a spread, 4 on the right). See
    // src/lib/modules/hourlyGridCore.ts for the renderer.
    slug: "hourly-grid-core",
    name: "Hourly Grid (Core)",
    configSchema: {
      type: "object",
      properties: {
        dayCount: { type: "integer", enum: [3, 4], default: 3 },
        dayLabels: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" }, date: { type: "integer" } },
          },
          default: [],
        },
        startTime: { type: "string", default: "05:30" },
        endTime: { type: "string", default: "23:30" },
        intervalMinutes: { type: "integer", default: 30 },
        hourLineStyle: {
          type: "string",
          enum: ["full", "low-transparency", "gone"],
          default: "full",
        },
        dayBorder: { type: "boolean", default: false },
        events: { type: "array", items: { type: "object" }, default: [] },
      },
    },
    // Sized to leave column 0 free for the sidebar zone (exactly 25%
    // width on the default 4-column grid) and the bottom rows free for
    // the below zone. 25/30 rows — the renderer's actual fixed-measurement
    // content (header + gap + 36 rows, all hardcoded pt values matching
    // the reference) needs 24.32 rows' worth of height at this grid's
    // cell size; 24 rows was a 24.6px overflow, so this rounds up.
    defaultWidth: 1560,
    defaultHeight: 2200,
    defaultColumnSpan: 3,
    defaultRowSpan: 25,
  },
  {
    // The reusable "heading + blank/ruled body" pattern — covers Monthly
    // Mantra, Priorities, Reminders, Notes, Tentative Dates, and Things
    // I'm Grateful For from the reference PDF. One type, different
    // heading/ruled config per instance. See src/lib/modules/labeledBox.ts.
    slug: "labeled-box",
    name: "Labeled Box",
    configSchema: {
      type: "object",
      properties: {
        heading: { type: "string", default: "Notes" },
        ruled: { type: "boolean", default: false },
      },
    },
    // Sized for the sidebar column (column 0 of the default 6x10 grid).
    defaultWidth: 300,
    defaultHeight: 700,
    defaultColumnSpan: 1,
    defaultRowSpan: 3,
  },
  {
    slug: "habit-tracker",
    name: "Habit Tracker",
    configSchema: {
      type: "object",
      properties: {
        habits: { type: "array", items: { type: "string" }, default: [] },
        days: { type: "integer", default: 30 },
      },
    },
    defaultWidth: 1400,
    defaultHeight: 1200,
    defaultColumnSpan: 4,
    defaultRowSpan: 5,
  },
  {
    slug: "quote-block",
    name: "Quote / Inspiration Block",
    configSchema: {
      type: "object",
      properties: {
        text: { type: "string", default: "" },
        attribution: { type: "string", default: "" },
      },
    },
    defaultWidth: 1400,
    defaultHeight: 400,
    defaultColumnSpan: 6,
    defaultRowSpan: 1,
  },
  {
    // Placeholder type used while the editor shell only round-trips raw
    // Polotno elements generically. Once the 5 domain modules above have
    // real on-canvas renderers (Phase 1, weeks 5-7), new instances should
    // be created with one of those types instead of this one.
    slug: "freeform-element",
    name: "Freeform Canvas Element",
    configSchema: {
      type: "object",
      properties: {
        polotnoElement: { type: "object" },
      },
    },
    defaultWidth: 200,
    defaultHeight: 200,
    defaultColumnSpan: 1,
    defaultRowSpan: 1,
  },
];

async function main() {
  for (const moduleType of moduleTypes) {
    await prisma.moduleType.upsert({
      where: { slug: moduleType.slug },
      update: moduleType,
      create: moduleType,
    });
  }

  // Remove types that no longer exist in this file (e.g. superseded
  // drafts) — safe as long as no ModuleInstance still references them.
  const currentSlugs = moduleTypes.map((m) => m.slug);
  const stale = await prisma.moduleType.findMany({
    where: { slug: { notIn: currentSlugs } },
  });
  for (const s of stale) {
    const inUse = await prisma.moduleInstance.count({
      where: { moduleTypeId: s.id },
    });
    if (inUse === 0) {
      await prisma.moduleType.delete({ where: { id: s.id } });
      console.log(`Removed stale module type: ${s.slug}`);
    } else {
      console.warn(
        `Skipped removing stale module type "${s.slug}" — ${inUse} instance(s) still reference it.`
      );
    }
  }

  const count = await prisma.moduleType.count();
  console.log(`Seeded module types. ${count} total in database.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

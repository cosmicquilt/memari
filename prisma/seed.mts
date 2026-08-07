import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Canvas dimensions match the 7x10" trim + bleed print spec (2175 x 3075
// px at 300 DPI). defaultWidth/Height are the free-placement fallback
// size; defaultColumnSpan/RowSpan are the grid-placement fallback, sized
// against Page's default grid (4 cols x 30 rows, see schema.prisma) —
// adjust both together if that changes.
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
    defaultHeight: 170,
    defaultColumnSpan: 1,
    // 2 rows at the 30-row grid (~86px/row ≈ 172px) — comfortable room
    // for the two lines of text (~110-160px needed).
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
    // the below zone. 19/30 rows — a component spanning N rows also
    // absorbs (N-1) internal gaps into its own height (matching
    // gridCellToPixels' formula), which an earlier slack calculation
    // missed and wrongly concluded 22-25 rows were needed. Correctly
    // computed, 19 rows already nearly exactly fits the renderer's
    // fixed-measurement content (6.15in) — 1.9px of slack.
    defaultWidth: 1560,
    defaultHeight: 1850,
    defaultColumnSpan: 3,
    defaultRowSpan: 19,
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
    // Sized for the sidebar column (column 0 of the default 4x30 grid).
    // defaultRowSpan only governs freshly palette-dropped instances — the
    // pre-seeded Gratitude/Reminders/Notes sidebar boxes have their own
    // explicit rowSpans in actions.ts, unaffected by this. Set to ~1/3 of
    // the Gratitude box's 6-row height (2 rows) per request, so newly
    // added boxes start compact and several can be stacked in the
    // sidebar without immediately needing a resize.
    defaultWidth: 300,
    defaultHeight: 200,
    defaultColumnSpan: 1,
    defaultRowSpan: 2,
  },
  {
    // Sits below hourly-grid-core, same columns. Full-height on whichever
    // page doesn't have a todo-checklist (see actions.ts) — habits are
    // tracked across the whole week regardless of which 3-4 days that
    // page's hourly grid shows, so it isn't scoped to dayCount like
    // todo-checklist is. See src/lib/modules/habitTracker.ts.
    slug: "habit-tracker",
    name: "Habit Tracker",
    configSchema: {
      type: "object",
      properties: {
        habits: { type: "array", items: { type: "string" }, default: [] },
      },
    },
    defaultWidth: 1560,
    defaultHeight: 1060,
    defaultColumnSpan: 4,
    defaultRowSpan: 11,
  },
  {
    // Sits below hourly-grid-core, same columns and dayCount. Full-height
    // on the page without a habit-tracker. See
    // src/lib/modules/todoChecklist.ts.
    slug: "todo-checklist",
    name: "To-Do Checklist",
    configSchema: {
      type: "object",
      properties: {
        dayCount: { type: "integer", enum: [3, 4], default: 3 },
      },
    },
    defaultWidth: 1560,
    defaultHeight: 1060,
    defaultColumnSpan: 3,
    defaultRowSpan: 11,
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

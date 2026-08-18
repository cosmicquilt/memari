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
        // Page Settings > Hours' "increments off" option — see
        // HourlyGridCoreConfig's own comment in hourlyGridCore.ts.
        // Absent on any instance seeded before this existed; treated as
        // "on" wherever it's read.
        intervalMode: { type: "string", enum: ["on", "off"], default: "on" },
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
        // The heading this instance is "supposed to" have — its seeded
        // default (Priorities/Reminders/etc.) or, for one added via the
        // palette, "Notes" — set once at creation (see actions.ts's
        // getOrCreatePlanner/addPaletteModuleAt) and never touched again
        // by an ordinary heading edit. Backs the native editor's "full
        // reset" button (NativeModule), a debugging aid distinct from
        // just clearing the heading field back to blank.
        templateHeading: { type: "string", default: "" },
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
    // defaultRowSpan 10, not 11 — 11 was the pre-existing value from
    // before hourly-grid-core's own 1-row gap requirement (see
    // NativePlannerEditor.tsx's handleDragMove/actions.ts's
    // addPaletteModuleAt, both of which now reserve that row) was
    // established: hourly-grid-core's own 19 rows + a 1-row gap leaves
    // exactly 10 usable rows below it on this app's 30-row grid, one
    // short of 11. A default that can never actually fit anywhere on
    // the page — reported directly, confirmed by the math: 19 + 1 + 11
    // = 31 > 30, so a full-height habit-tracker was being silently
    // refused on every drop, on either page, regardless of anything
    // else present — isn't a sensible default. 10 matches
    // todo-checklist's own identical gap-respecting sizing (same page,
    // same "just below the hourly grid" positioning).
    defaultWidth: 1560,
    defaultHeight: 964,
    defaultColumnSpan: 4,
    defaultRowSpan: 10,
  },
  {
    // Sits below hourly-grid-core, same columns and dayCount. Full-height
    // on the page without a habit-tracker. See
    // src/lib/modules/todoChecklist.ts. 1 is a third valid value here,
    // alongside the two hourly-grid-matching ones (3, 4) — a sidebar
    // (single-grid-column) placement, once dragging a to-do checklist
    // there became possible, uses dayCount: 1 for a single checkbox+line
    // column instead of several side by side (see actions.ts's
    // addPaletteModuleAt).
    slug: "todo-checklist",
    name: "To-Do Checklist",
    configSchema: {
      type: "object",
      properties: {
        dayCount: { type: "integer", enum: [1, 3, 4], default: 3 },
      },
    },
    // defaultRowSpan 10, not 11 — see habit-tracker's own identical
    // comment above for the full reasoning (hourly-grid-core's 19 rows
    // + a 1-row gap leaves exactly 10 usable rows on this app's 30-row
    // grid). This one was already right in WEEK_TODO_TEMPLATE
    // (actions.ts, rowSpan 10) — that's what getOrCreatePlanner/
    // resetPlannerToTemplate actually seed with — but this module
    // type's own default (what a *fresh* palette drop uses instead of
    // the seed template) had never been brought in line with it, so a
    // todo-checklist dragged in from the palette hit the exact same
    // "never fits, silently refused" bug habit-tracker's own default
    // did.
    defaultWidth: 1560,
    defaultHeight: 964,
    defaultColumnSpan: 3,
    defaultRowSpan: 10,
  },
  {
    // "JANUARY" — top of the sidebar column on a monthly page's left
    // side. Locked/core like week-title, which this exactly mirrors —
    // see src/lib/modules/monthTitle.ts for why it's a separate type
    // from month-grid-core rather than folded into that module's own
    // header (they occupy disjoint column ranges, measured directly
    // against the reference).
    slug: "month-title",
    name: "Month Title (Core)",
    configSchema: {
      type: "object",
      properties: {
        monthName: { type: "string", default: "JANUARY" },
      },
    },
    defaultWidth: 300,
    defaultHeight: 170,
    defaultColumnSpan: 1,
    // Same rowSpan as week-title despite one line of (bigger) text
    // instead of two — rowSpan 1 (85.9px cell) is shorter than the
    // title's own ~95px rendered text height and would clip it; rowSpan
    // 2 (183.8px) comfortably contains it. See src/lib/modules/monthTitle.ts.
    defaultRowSpan: 2,
  },
  {
    // "Core" block, locked by default — a whole monthly spread's
    // day-of-week header + calendar grid, matching the reference
    // hourlyjournal.pdf's monthly layout (3 day-columns on the left page
    // of a spread, 4 on the right, same dayCount convention as
    // hourly-grid-core). See src/lib/modules/monthGridCore.ts.
    slug: "month-grid-core",
    name: "Month Grid (Core)",
    configSchema: {
      type: "object",
      properties: {
        dayCount: { type: "integer", enum: [3, 4], default: 3 },
        dayLabels: {
          type: "array",
          items: {
            type: "object",
            properties: { name: { type: "string" } },
          },
          default: [],
        },
        weekCount: { type: "integer", enum: [4, 5, 6], default: 5 },
        cells: { type: "array", items: { type: "array" }, default: [] },
      },
    },
    // 17/30 rows: the renderer's own header + N-row calendar grid has a
    // near-constant measured content height (~386.9pt = 1612.1px, header
    // and each row's date-strip are fixed regardless of week count, only
    // the row body stretches — see monthGridCore.ts's own header
    // comment) regardless of whether the month needs 4, 5, or 6 rows.
    // Same slack-minimizing approach hourly-grid-core's own comment
    // documents: 16 rows (1554.4px) is too short and would clip the
    // content; 17 rows (1652.3px) is the smallest span that fully
    // contains it, ~40px/0.13in of slack.
    defaultWidth: 1560,
    defaultHeight: 1652,
    defaultColumnSpan: 3,
    defaultRowSpan: 17,
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

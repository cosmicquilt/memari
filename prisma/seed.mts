import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Canvas dimensions match the 6x9" US Trade + bleed print spec from the
// Polotno test project (1875 x 2775 px at 300 DPI). defaultWidth/Height
// are the free-placement fallback size; defaultColumnSpan/RowSpan are the
// grid-placement fallback, sized against Page's default grid (6 cols x
// 10 rows, see schema.prisma) — adjust both together if that changes.
const moduleTypes = [
  {
    slug: "weekly-grid",
    name: "Weekly Grid",
    configSchema: {
      type: "object",
      properties: {
        startDay: { type: "string", enum: ["MON", "SUN"], default: "MON" },
        showWeekends: { type: "boolean", default: true },
      },
    },
    defaultWidth: 1650,
    defaultHeight: 2400,
    defaultColumnSpan: 6,
    defaultRowSpan: 8,
  },
  {
    slug: "monthly-grid",
    name: "Monthly Grid",
    configSchema: {
      type: "object",
      properties: {
        startDay: { type: "string", enum: ["MON", "SUN"], default: "MON" },
      },
    },
    defaultWidth: 1650,
    defaultHeight: 2000,
    defaultColumnSpan: 6,
    defaultRowSpan: 7,
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
    slug: "goal-page",
    name: "Goal / Notes Page",
    configSchema: {
      type: "object",
      properties: {
        heading: { type: "string", default: "Goals" },
        ruled: { type: "boolean", default: true },
      },
    },
    defaultWidth: 1650,
    defaultHeight: 2400,
    defaultColumnSpan: 6,
    defaultRowSpan: 8,
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

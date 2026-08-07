import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Canvas dimensions match the 6x9" US Trade + bleed print spec from the
// Polotno test project (1875 x 2775 px at 300 DPI). Module default sizes
// are expressed in that same pixel space so they drop onto a page at a
// sane starting size.
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

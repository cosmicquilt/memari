import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { MODULE_TYPE_SEED } from "../src/lib/moduleRegistry";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// The module types come from the module registry, which is the one place
// that knows what a module is - its renderer, its minimum height, its
// palette card, and the row it needs here.
//
// They were written out again in this file, which made adding a module two
// entries that could disagree. They already had: the editor's own copy of
// the default spans said 1, 3 and 4 columns, a whole grid generation
// behind, and nobody noticed because nothing read them.
//
// Registering a module is therefore enough to seed it. That matters at the
// size the catalogue is headed - the ~108 planned modules are presets over
// about eleven drawing primitives, so most of them are a name, a label set
// and a schema against a renderer that already exists.
//
// Canvas dimensions match the 7x10" trim + bleed print spec (2175 x 3075
// px at 300 DPI). defaultWidth/Height are the free-placement fallback
// size; defaultColumnSpan/RowSpan are the grid-placement fallback.
const moduleTypes = MODULE_TYPE_SEED;

async function main() {
  for (const moduleType of moduleTypes) {
    // configSchema is typed Record<string, unknown> on the registry and
    // InputJsonValue here; it is the same JSON either way.
    const row = { ...moduleType, configSchema: moduleType.configSchema as Prisma.InputJsonValue };
    await prisma.moduleType.upsert({
      where: { slug: moduleType.slug },
      update: row,
      create: row,
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

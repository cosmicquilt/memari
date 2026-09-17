// What is at each level of each book, and what it would cost to print.
//
// The timeline drawer is not built yet; this is the same query it will make,
// printed. That is deliberate and it is the cheap half of the work: a data
// model you can read back is one you can tell is wrong before any pixels
// depend on it.
//
// It also prints the PRINTED COUNT per level, because that is the thing the
// level concept exists for - a per-day page prints about 90 times in a
// quarter where a per-month page prints 3, so the level toggle is the price
// dial (see the business model). A book with no term yet says so rather than
// reporting 0, which would read as free.
//
//   npm run check:levels
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { byLevel, LEVEL_LABELS, LEVEL_CADENCE, occurrences } = await import(
  "../src/lib/pageLevels.js"
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const planners = await prisma.planner.findMany({
  where: { isTemplate: false },
  include: {
    pages: {
      // level first, then position: the enum sorts by DECLARATION order in
      // Postgres, so this is binding order without a CASE expression.
      orderBy: [{ level: "asc" }, { position: "asc" }],
      include: { moduleInstances: true },
    },
  },
  orderBy: { createdAt: "asc" },
});

if (planners.length === 0) {
  console.log("No planners to look at.");
  await prisma.$disconnect();
  process.exit(0);
}

let problems = 0;

for (const planner of planners) {
  const term =
    planner.startDate && planner.endDate
      ? `${planner.startDate.toISOString().slice(0, 10)} to ${planner.endDate
          .toISOString()
          .slice(0, 10)}`
      : "no term set";
  console.log(
    `
"${planner.title}"  ${planner.dated ? "dated" : "UNDATED"}  (${term})`
  );

  const groups = byLevel(planner.pages);
  let sheets: number | null = 0;
  for (const group of groups) {
    const list = occurrences(group.level, planner.startDate, planner.endDate);
    const label = LEVEL_LABELS[group.level].padEnd(9);

    // Split by VARIANT: the default layout, and any occurrence that has one
    // of its own. Positions run 0..n-1 within each, not across them, so a
    // book with a customised February has two page 0s and both are correct.
    const byVariant = new Map<string | null, typeof group.pages>();
    for (const page of group.pages) {
      const key = page.variantKey ?? null;
      byVariant.set(key, [...(byVariant.get(key) ?? []), page]);
    }
    const defaults = byVariant.get(null) ?? [];

    if (group.pages.length === 0) {
      // Not a fault. A level with nothing in it is a real state - skip the
      // dailies and the book gets cheaper - and the timeline has to show it
      // as somewhere you can add one.
      console.log(`  ${label} -                                    (empty)`);
      continue;
    }

    // What this level actually PRINTS: each occurrence contributes its own
    // pages when it has them and the default ones when it does not. Summed
    // per occurrence rather than multiplied, because a customised month may
    // have a different number of pages from the default.
    const printed =
      list === null
        ? null
        : list.reduce(
            (total, occurrence) =>
              total + (byVariant.get(occurrence.key)?.length ?? defaults.length),
            0
          );
    const modules = group.pages.reduce((n, p) => n + p.moduleInstances.length, 0);
    const custom = byVariant.size - (byVariant.has(null) ? 1 : 0);
    console.log(
      `  ${label} ${String(defaults.length).padStart(2)} default page(s)` +
        `${custom > 0 ? `, ${custom} with own layout` : ""}, ` +
        `${String(modules).padStart(3)} module(s)   ${LEVEL_CADENCE[group.level]}` +
        `${list === null ? ", term not set" : `, x${list.length} = ${printed} page(s)`}`
    );
    if (printed === null) sheets = null;
    else if (sheets !== null) sheets += printed;

    // Positions within a level AND VARIANT must be 0..n-1 with no gaps: they
    // are an ORDER, and a gap means either a page was deleted without the
    // rest being renumbered or two sets got merged carelessly.
    for (const [key, variantPages] of byVariant) {
      const positions = variantPages.map((p) => p.position).sort((a, b) => a - b);
      const expected = positions.map((_, i) => i);
      if (positions.join() !== expected.join()) {
        console.error(
          `    FAIL  ${LEVEL_LABELS[group.level]} ${key ?? "default"} positions are ` +
            `[${positions.join(", ")}], expected [${expected.join(", ")}]`
        );
        problems++;
      }
    }

    // A layout for an occurrence the book's term does not contain is
    // orphaned: nothing will ever print it, and it sits in the timeline
    // looking like part of the book. Reported rather than deleted - a term
    // that was shortened by accident should not take pages with it.
    if (list !== null) {
      const known = new Set(list.map((o) => o.key));
      for (const key of byVariant.keys()) {
        if (key !== null && !known.has(key)) {
          console.error(
            `    FAIL  ${LEVEL_LABELS[group.level]} has a layout for "${key}", which is outside this book's term`
          );
          problems++;
        }
      }
    }
  }

  console.log(
    sheets === null
      ? `  -> printed length unknown: this book has no term`
      : `  -> ${sheets} printed page(s) in all`
  );

  // Every page must belong to a level that exists. A book of nothing but
  // front matter is legal; a book with pages at no level is not reachable
  // from a timeline that groups by level, which is the whole navigation.
  const placed = groups.reduce((n, g) => n + g.pages.length, 0);
  if (placed !== planner.pages.length) {
    console.error(
      `    FAIL  ${planner.pages.length - placed} page(s) at a level the timeline does not know`
    );
    problems++;
  }
}

await prisma.$disconnect();

if (problems > 0) {
  console.error(`\n${problems} problem(s).`);
  process.exit(1);
}
console.log(
  `\n${planners.length} book(s), every page at a known level with its positions in order.`
);

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
const { byLevel, LEVEL_LABELS, LEVEL_CADENCE, printedCount } = await import(
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
    `\n"${planner.title}"  ${planner.baseType}  ${planner.dated ? "dated" : "UNDATED"}  (${term})`
  );

  const groups = byLevel(planner.pages);
  let sheets: number | null = 0;
  for (const group of groups) {
    const count = printedCount(group.level, planner.startDate, planner.endDate);
    const times =
      count === null ? "term not set" : `x${count} = ${count * group.pages.length} page(s)`;
    const modules = group.pages.reduce((n, p) => n + p.moduleInstances.length, 0);
    const label = LEVEL_LABELS[group.level].padEnd(9);
    if (group.pages.length === 0) {
      // Not a fault. A level with nothing in it is a real state - skip the
      // dailies and the book gets cheaper - and the timeline has to show it
      // as somewhere you can add one.
      console.log(`  ${label} -                                    (empty)`);
      continue;
    }
    console.log(
      `  ${label} ${String(group.pages.length).padStart(2)} page(s), ${String(modules).padStart(
        3
      )} module(s)   ${LEVEL_CADENCE[group.level]}, ${times}`
    );
    if (count === null) sheets = null;
    else if (sheets !== null) sheets += count * group.pages.length;

    // Positions within a level must be 0..n-1 with no gaps: they are an
    // ORDER, and a gap means either a page was deleted without the rest
    // being renumbered or two sets got merged carelessly. Worth catching
    // now, while a book has four pages, rather than when it has four hundred.
    const positions = group.pages.map((p) => p.position);
    const expected = positions.map((_, i) => i);
    if (positions.join() !== expected.join()) {
      console.error(
        `    FAIL  ${LEVEL_LABELS[group.level]} positions are [${positions.join(", ")}], expected [${expected.join(", ")}]`
      );
      problems++;
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

// Fold a user's separate planners into one book.
//
// Memari used to seed a WEEK planner and a MONTH planner as two unrelated
// rows, because a page had no way of saying how often it was printed. It has
// one now (Page.level), so a person has ONE book and its pages sit at
// whichever level they belong to.
//
// A SCRIPT, NOT A MIGRATION. A fresh database never needs this: getOrCreateBook
// makes one book from the start. This exists only to repair data created
// before levels did, so putting it in the migration history would make every
// future deployment run a repair for a shape it never had.
//
// IDEMPOTENT. Run it twice and the second run reports nothing to do, because
// a user with one book has nothing to fold.
//
//   npm run fold:books          # say what it would do
//   npm run fold:books -- --go  # do it
//
// It is opt-in for the same reason check:gaps --fix is: it edits real
// planners, and deleting a row is not something to do because a script ran
// by accident.
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { LEVEL_LABELS } = await import("../src/lib/pageLevels.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const go = process.argv.includes("--go");

const planners = await prisma.planner.findMany({
  where: { isTemplate: false },
  include: { pages: { include: { moduleInstances: { select: { id: true } } } } },
  // Deterministic, and the same order getOrCreateBook uses to pick a book:
  // oldest first, id as the tie-break. Which planner survives must not depend
  // on what the database felt like returning.
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
});

const byOwner = new Map<string, typeof planners>();
for (const planner of planners) {
  byOwner.set(planner.ownerId, [...(byOwner.get(planner.ownerId) ?? []), planner]);
}

let folded = 0;
let owners = 0;

for (const [ownerId, owned] of byOwner) {
  if (owned.length < 2) continue;
  owners++;
  const [keeper, ...rest] = owned;
  console.log(
    `\n${ownerId.slice(0, 16)}...  keeping "${keeper.title}" (${keeper.pages.length} page(s))`
  );

  // The keeper's highest position AT EACH LEVEL, so incoming pages continue
  // the numbering rather than colliding with it. Positions within a level
  // have to stay 0..n-1 with no gaps - check:levels enforces that - so an
  // incoming page cannot simply keep the number it had.
  const nextPosition = new Map<string, number>();
  for (const page of keeper.pages) {
    nextPosition.set(page.level, Math.max(nextPosition.get(page.level) ?? 0, page.position + 1));
  }

  for (const other of rest) {
    for (const page of [...other.pages].sort((a, b) => a.position - b.position)) {
      const position = nextPosition.get(page.level) ?? 0;
      nextPosition.set(page.level, position + 1);
      const modules = page.moduleInstances.length;
      console.log(
        `  ${go ? "move " : "would move"}  "${other.title}" page ${page.position} ` +
          `(${LEVEL_LABELS[page.level]}, ${modules} module(s)) -> ${LEVEL_LABELS[page.level]} ${position}`
      );
      if (go) {
        await prisma.page.update({
          where: { id: page.id },
          data: { plannerId: keeper.id, position },
        });
      }
      folded++;
    }
    console.log(`  ${go ? "delete" : "would delete"}  now-empty planner "${other.title}"`);
    if (go) {
      // Its pages have been reparented, so the cascade has nothing left to
      // take with it. Checked rather than assumed: a delete that silently
      // took a page's modules with it would be unrecoverable.
      const left = await prisma.page.count({ where: { plannerId: other.id } });
      if (left > 0) {
        console.error(`  FAIL  "${other.title}" still has ${left} page(s); not deleting it`);
        process.exitCode = 1;
        continue;
      }
      await prisma.planner.delete({ where: { id: other.id } });
    }
  }
}

await prisma.$disconnect();

if (owners === 0) {
  console.log("Nothing to fold: every user already has one book.");
} else if (go) {
  console.log(`\n${folded} page(s) moved into ${owners} book(s).`);
} else {
  console.log(
    `\n${folded} page(s) would move into ${owners} book(s). Nothing was changed.\n` +
      `Do it with:  npm run fold:books -- --go`
  );
}

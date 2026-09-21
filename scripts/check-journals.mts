// Creates a journal the way the start dialog's Create does, on a throwaway
// owner, checks what lands in the database, and deletes it again.
//
// The Create action itself needs a signed-in session, so this drives the
// same code underneath it - createBookFor and ensureLevel in bookSeeding.ts,
// which the action calls after checking who is asking.
//
// What it pins:
//   - the chosen levels, and only those, get their pages, at the chosen size;
//   - a journal's page count is what the dialog promised (Jan-Mar 2026 with
//     every level on is 126);
//   - a level opened LATER in a Letter journal comes out Letter too - new
//     pages used to take the schema's 7x10 whatever the journal was;
//   - opening a level whose occurrence copies sort FIRST adds nothing. That
//     ordering once put the right page's full-width Notes onto the monthly
//     LEFT page, over the sidebar.
//
//   npm run check:journals
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../src/lib/prisma.js");
const { createBookFor, ensureLevel, validateNewJournal, WITH_PAGES } = await import("../src/app/planner/bookSeeding.js");
const { bookPageCount, LEVEL_PAGE_COUNT } = await import("../src/lib/pageLevels.js");
const { PLANNER_TRIMS } = await import("../src/lib/planner-trims.js");

const THROWAWAY_OWNER = "journal-check-throwaway";
let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}`);
  if (!ok) failures++;
};

// Anything a previous failed run left behind.
await prisma.planner.deleteMany({ where: { ownerId: THROWAWAY_OWNER } });

try {
  // --- Create: every level, Letter, Jan-Mar 2026 ---------------------------
  const input = validateNewJournal({
    title: "  Check journal  ",
    trim: "letter",
    startISO: "2026-01-01",
    endISO: "2026-03-31",
    levels: ["FRONT_MATTER", "MONTHLY", "WEEKLY", "BACK_MATTER"],
    dated: false,
    weekStartDay: 1,
    font: "sans",
  });
  check(input.title === "Check journal", `the name is trimmed (got "${input.title}")`);
  let book = await createBookFor(THROWAWAY_OWNER, input);
  const perLevel: Record<string, number> = {};
  for (const page of book.pages) perLevel[page.level] = (perLevel[page.level] ?? 0) + 1;
  const wanted = { FRONT_MATTER: 1, MONTHLY: 2, WEEKLY: 2, BACK_MATTER: 1 };
  check(
    Object.keys(perLevel).length === Object.keys(wanted).length &&
      Object.entries(wanted).every(([level, n]) => perLevel[level] === n),
    `the chosen levels and only those: ${JSON.stringify(perLevel)}`
  );
  const letter = PLANNER_TRIMS.letter;
  check(
    book.pages.every((p) => p.widthPx === letter.widthPx && p.heightPx === letter.heightPx && p.gridRows === letter.gridRows),
    `every page is US Letter (${letter.widthPx}x${letter.heightPx}, ${letter.gridRows} rows)`
  );
  check(!book.dated && (book.theme as { weekStartDay?: number; fontFamily?: string }).weekStartDay === 1, "undated, week starting Monday");
  check((book.theme as { fontFamily?: string }).fontFamily === "sans", "sans");
  const monthLeft = book.pages.find((p) => p.level === "MONTHLY" && p.position === 0)!;
  const title = monthLeft.moduleInstances.find((mi) => mi.moduleType.slug === "month-title");
  check(title?.rowSpan === 2, `the month title is 2 rows (got ${title?.rowSpan})`);
  // What the journal as stored prints, against what the dialog showed for
  // the same choices before it was made.
  const stored = bookPageCount(perLevel, book.startDate, book.endDate, 1);
  const promised = bookPageCount(
    Object.fromEntries(input.levels.map((level) => [level, LEVEL_PAGE_COUNT[level]])),
    new Date("2026-01-01T00:00:00.000Z"),
    new Date("2026-03-31T00:00:00.000Z"),
    1
  );
  check(stored !== null && stored === promised, `it prints what the dialog promised (${stored} vs ${promised})`);

  // --- a level opened later takes the journal's size -----------------------
  book = await ensureLevel(book, "DAILY");
  const daily = book.pages.filter((p) => p.level === "DAILY");
  check(
    daily.length === LEVEL_PAGE_COUNT.DAILY && daily.every((p) => p.widthPx === letter.widthPx && p.gridRows === letter.gridRows),
    `the daily page opened later is Letter too (${daily.map((p) => `${p.widthPx}x${p.gridRows}`).join(", ")})`
  );

  // --- a month's own layout, sorted first, adds nothing ---------------------
  // Copy the monthly default the way createLevelVariant does: same pages,
  // same modules, a variantKey of their own.
  for (const page of book.pages.filter((p) => p.level === "MONTHLY" && p.variantKey === null)) {
    await prisma.page.create({
      data: {
        plannerId: book.id,
        level: "MONTHLY",
        variantKey: "2026-02",
        position: page.position,
        widthPx: page.widthPx,
        heightPx: page.heightPx,
        gridColumns: page.gridColumns,
        gridRows: page.gridRows,
        gridGapPx: page.gridGapPx,
        marginPx: page.marginPx,
        moduleInstances: {
          create: page.moduleInstances.map((mi) => ({
            moduleTypeId: mi.moduleTypeId,
            placementMode: mi.placementMode,
            locked: mi.locked,
            columnStart: mi.columnStart,
            rowStart: mi.rowStart,
            columnSpan: mi.columnSpan,
            rowSpan: mi.rowSpan,
            propValues: mi.propValues ?? undefined,
          })),
        },
      },
    });
  }
  const fresh = await prisma.planner.findUniqueOrThrow({ where: { id: book.id }, include: WITH_PAGES });
  const before = await prisma.moduleInstance.count({ where: { page: { plannerId: book.id } } });
  // The copies FIRST at every position - the order that went wrong.
  const copiesFirst = {
    ...fresh,
    pages: [...fresh.pages].sort(
      (a, b) => a.position - b.position || (a.variantKey === null ? 1 : 0) - (b.variantKey === null ? 1 : 0)
    ),
  };
  await ensureLevel(copiesFirst, "MONTHLY");
  const after = await prisma.moduleInstance.count({ where: { page: { plannerId: book.id } } });
  check(after === before, `opening the month with its copy sorted first adds nothing (${before} -> ${after} modules)`);
} finally {
  await prisma.planner.deleteMany({ where: { ownerId: THROWAWAY_OWNER } });
  const left = await prisma.planner.count({ where: { ownerId: THROWAWAY_OWNER } });
  console.log(left === 0 ? "  throwaway journal deleted" : `  ${left} throwaway journal(s) LEFT BEHIND`);
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} journal check(s) failed.`);
  process.exit(1);
}
console.log("\nJournals create at the chosen levels and size, count what the dialog promised, and reopen without adding anything.");

// Does the generated book meet the printer's requirements?
//
// The other checks ask whether the file is what WE meant. This one asks
// whether a print-on-demand house will accept it, against their published
// numbers rather than our own assumptions - which is the last thing standing
// between a design and a book you can hold.
//
// Lulu's published requirements, and where each comes from:
//
//   BLEED 0.125in on every side, and the PDF must be SIZED with it: "a 6 x 9
//   in book requires a PDF with pages sized 6.25 x 9.25 in". Ours is a 7 x 10
//   book exported at 7.25 x 10.25, which is that rule.
//
//   SAFETY MARGIN 0.5in inside the trim edge - "text and other important
//   elements should be placed within" it. This is the one worth measuring
//   rather than believing: the lattice puts content 0.5in inside the trim by
//   construction and the box inset adds 6px more, so it passes by 0.02in.
//   Twenty thousandths of an inch is not margin you want to discover you have
//   lost, so it is checked on every mark of every page.
//
//   PAGE COUNT divisible by 4, and at least 32 for a paperback. Not divisible
//   is not a rejection - the printer adds blanks - but the blanks are at the
//   END, so a 126-page book becomes a 128-page one with two blank leaves
//   after the back matter.
//
//   npm run check:print
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { generateBook } = await import("../src/lib/generateBook.js");
const { flatten } = await import("../src/lib/proofSvg.js");
const { resolveFontFamily } = await import("../src/lib/theme.js");
const { PLANNER_TRIMS, trimKeyForWidth } = await import("../src/lib/planner-trims.js");
const { LEVEL_LABELS } = await import("../src/lib/pageLevels.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// --- the printer's numbers, in one place -------------------------------
const DPI = 300;
const REQUIRED_BLEED_IN = 0.125;
const SAFETY_MARGIN_IN = 0.5;
const PAGE_MULTIPLE = 4;
const MIN_PAGES_PAPERBACK = 32;

const planner = await prisma.planner.findFirst({
  where: { isTemplate: false },
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  include: {
    pages: {
      orderBy: [{ level: "asc" }, { position: "asc" }],
      include: { moduleInstances: { include: { moduleType: true } } },
    },
  },
});
if (!planner) {
  console.error("No book in the database.");
  process.exit(1);
}

const theme = planner.theme as { fontFamily?: "serif" | "sans" } | null;
const book = generateBook(planner, resolveFontFamily(theme?.fontFamily));
if (book.pages.length === 0) {
  console.error("Nothing to print: this book has no term yet (Page Settings > Term).");
  await prisma.$disconnect();
  process.exit(1);
}

let problems = 0;
const fail = (message: string) => {
  console.error(`  FAIL  ${message}`);
  problems++;
};

// --- the sheet ---------------------------------------------------------
const first = book.pages[0].pageGrid;
const trim = PLANNER_TRIMS[trimKeyForWidth(first.widthPx)];
const inches = (px: number) => px / DPI;
console.log(
  `"${book.title}"  ${book.pages.length} pages  ` +
    `sheet ${inches(first.widthPx).toFixed(3)} x ${inches(first.heightPx).toFixed(3)} in  ` +
    `trim ${inches(trim.widthPx - trim.bleedPx * 2).toFixed(3)} x ` +
    `${inches(trim.heightPx - trim.bleedPx * 2).toFixed(3)} in  ` +
    `bleed ${inches(trim.bleedPx).toFixed(3)} in`
);

if (Math.abs(inches(trim.bleedPx) - REQUIRED_BLEED_IN) > 0.0005) {
  fail(
    `bleed is ${inches(trim.bleedPx).toFixed(3)}in, the printer wants ${REQUIRED_BLEED_IN}in on every side.\n` +
      `        The PDF must be sized trim PLUS bleed - a 7 x 10 book is a 7.25 x 10.25 page.`
  );
}

// Every page the same size. A book whose pages differ is not a book.
const odd = book.pages.filter(
  (p) => p.pageGrid.widthPx !== first.widthPx || p.pageGrid.heightPx !== first.heightPx
);
if (odd.length > 0) {
  fail(`${odd.length} page(s) are a different size from the first`);
}

// --- the safety margin, measured on every mark -------------------------
//
// The number that decides whether a line of text gets cut off. Measured from
// the TRIM edge, not the sheet edge: the bleed is cut away, so a mark 0.4in
// from the sheet edge is 0.275in from where the knife lands.
const safetyPx = SAFETY_MARGIN_IN * DPI;
const bleedPx = trim.bleedPx;
let tightest = { inches: Infinity, page: "", what: "" };

for (const [index, page] of book.pages.entries()) {
  const trimLeft = bleedPx;
  const trimTop = bleedPx;
  const trimRight = page.pageGrid.widthPx - bleedPx;
  const trimBottom = page.pageGrid.heightPx - bleedPx;
  for (const element of flatten(page.elements)) {
    const x = element.x ?? 0;
    const y = element.y ?? 0;
    const w = element.width ?? 0;
    const h = element.height ?? 0;
    const clearance = Math.min(
      x - trimLeft,
      y - trimTop,
      trimRight - (x + w),
      trimBottom - (y + h)
    );
    if (clearance < tightest.inches * DPI) {
      tightest = {
        inches: clearance / DPI,
        page: `page ${index + 1} (${LEVEL_LABELS[page.level]} ${page.occurrenceLabel})`,
        what: String(element.id ?? element.type),
      };
    }
  }
}

console.log(
  `closest mark to the trim line: ${tightest.inches.toFixed(3)}in ` +
    `(${(tightest.inches * DPI).toFixed(0)}px) - ${tightest.what} on ${tightest.page}`
);
if (tightest.inches < SAFETY_MARGIN_IN) {
  fail(
    `a mark sits ${tightest.inches.toFixed(3)}in from the trim, inside the ` +
      `${SAFETY_MARGIN_IN}in safety margin.\n` +
      `        ${tightest.what} on ${tightest.page}. It may be cut off.`
  );
} else {
  console.log(
    `  ok    everything clears the ${SAFETY_MARGIN_IN}in safety margin, ` +
      `by ${((tightest.inches - SAFETY_MARGIN_IN) * DPI).toFixed(0)}px at the tightest`
  );
}

// --- the page count ----------------------------------------------------
console.log(`page count: ${book.pages.length}`);
if (book.pages.length < MIN_PAGES_PAPERBACK) {
  fail(
    `${book.pages.length} pages is under the ${MIN_PAGES_PAPERBACK}-page minimum for a paperback`
  );
}
const over = book.pages.length % PAGE_MULTIPLE;
if (over !== 0) {
  // Not a failure - the printer accepts it and adds blanks - but the blanks
  // land AFTER the back matter, so the book ends with empty leaves.
  console.log(
    `  note  not divisible by ${PAGE_MULTIPLE}: the printer will add ` +
      `${PAGE_MULTIPLE - over} blank page(s) after the back matter.\n` +
      `        ${book.pages.length + (PAGE_MULTIPLE - over)} would be exact - ` +
      `adjust the term, or add ${PAGE_MULTIPLE - over} page(s) of matter.`
  );
}

await prisma.$disconnect();
if (problems > 0) {
  console.error(`\n${problems} problem(s) - the printer may reject or misprint this.`);
  process.exit(1);
}
console.log("\nMeets the printer's published requirements.");

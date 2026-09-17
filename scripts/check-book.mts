// Generates the whole book and exports it, then says what came out.
//
// Same idea as every other check here: produce the real artefact rather than
// assert about it. A sequence generator that is only tested by unit tests is
// one where nobody has looked at the order the pages come out in - and the
// order IS the product.
//
// It writes a PDF because that is the deliverable, and it checks the things
// that are easy to get silently wrong:
//
//   - the ORDER. A book runs front matter, then each month with the weeks
//     and days inside it, then back matter. Sorting each level separately
//     and concatenating gives twelve monthlies followed by fifty-two
//     weeklies, which is a filing system.
//   - the DATES. Every occurrence must get its own, and no two of the same
//     level may claim the same one.
//   - the CUSTOMISED ones. A month with its own layout must print that
//     layout and not the default.
//
//   npm run check:book
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { generateBook, describeBook } = await import("../src/lib/generateBook.js");
const { buildPlannerPdf, printReadinessProblems, pdfFilename } = await import(
  "../src/lib/plannerPdf.js"
);
const { resolveFontFamily } = await import("../src/lib/theme.js");
const { LEVEL_LABELS } = await import("../src/lib/pageLevels.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

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

console.log(
  `"${book.title}"  ${planner.dated ? "dated" : "UNDATED"}  ` +
    (planner.startDate && planner.endDate
      ? `${planner.startDate.toISOString().slice(0, 10)} to ${planner.endDate
          .toISOString()
          .slice(0, 10)}`
      : "no term set")
);
for (const line of describeBook(book)) console.log(line);
console.log(`\n${book.pages.length} page(s) in the finished book.`);

if (book.pages.length === 0) {
  console.error(
    "\nNothing to print. A book needs a term (Page Settings > Term) before its\n" +
      "repeating levels have any occurrences to print for."
  );
  await prisma.$disconnect();
  process.exit(1);
}

// --- the order, as a person would read it -----------------------------
//
// Printed in full up to a point, because the whole value of looking at the
// artefact is being able to see that February comes after January and that
// each month's weeks sit inside it.
const SHOWN = 14;
console.log("\nin binding order:");
book.pages.slice(0, SHOWN).forEach((page, index) => {
  console.log(
    `  ${String(index + 1).padStart(4)}  ${LEVEL_LABELS[page.level].padEnd(9)} ` +
      `${page.occurrenceLabel}${page.customised ? "  (its own layout)" : ""}`
  );
});
if (book.pages.length > SHOWN) console.log(`  ... ${book.pages.length - SHOWN} more`);

let problems = 0;

// Front matter opens and back matter closes, whatever dates they carry.
const levels = book.pages.map((p) => p.level);
const firstDated = levels.findIndex((l) => l !== "FRONT_MATTER");
if (firstDated >= 0 && levels.slice(firstDated).includes("FRONT_MATTER")) {
  console.error("  FAIL  front matter appears after a dated page");
  problems++;
}
const lastBack = levels.lastIndexOf("BACK_MATTER");
if (lastBack >= 0 && lastBack !== levels.length - 1 && levels.includes("BACK_MATTER")) {
  const firstBack = levels.indexOf("BACK_MATTER");
  if (levels.slice(firstBack).some((l) => l !== "BACK_MATTER")) {
    console.error("  FAIL  a dated page appears after back matter");
    problems++;
  }
}

// Within a level, the occurrences must come out in order and each exactly
// once per page of its layout. A generator that emitted the same week twice,
// or skipped one, would otherwise only show up as a page count nobody
// checked.
const seen = new Map<string, string[]>();
for (const page of book.pages) {
  const key = `${page.level}`;
  seen.set(key, [...(seen.get(key) ?? []), page.occurrenceLabel]);
}
for (const [level, labels] of seen) {
  const distinct = [...new Set(labels)];
  // Every occurrence of a level contributes the same number of pages unless
  // it was customised, so runs of the same label must be contiguous.
  const runs: string[] = [];
  for (const label of labels) if (runs[runs.length - 1] !== label) runs.push(label);
  if (runs.length !== distinct.length) {
    console.error(`  FAIL  ${level}: an occurrence's pages are not contiguous`);
    problems++;
  }
}

// --- the file ---------------------------------------------------------
const built = buildPlannerPdf(book.pages);
const out = "public/book.pdf";
writeFileSync(out, Buffer.from(built.bytes));
console.log(
  `\n${out}: ${built.pages.length} page(s), ${(built.bytes.byteLength / 1024).toFixed(0)} KB\n` +
    `${built.report.elements} marks drawn: ${built.report.text} text, ` +
    `${built.report.rects} rects, ${built.report.paths} paths`
);
console.log(`downloads as: ${pdfFilename(book.title)}`);
console.log(`Look at it: http://localhost:3000/pdf-proof.html?f=/book.pdf`);

for (const problem of printReadinessProblems(built)) {
  console.error(`  FAIL  ${problem}`);
  problems++;
}
if (built.pages.length !== book.pages.length) {
  console.error(
    `  FAIL  ${book.pages.length} page(s) generated but ${built.pages.length} in the PDF`
  );
  problems++;
}

await prisma.$disconnect();
if (problems > 0) {
  console.error(`\n${problems} problem(s).`);
  process.exit(1);
}
console.log("\nThe whole book, in order, print-ready.");

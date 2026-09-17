// Exports a real planner to a real PDF, and says what it could not draw.
//
// Same idea as the proof sheets: produce the actual artefact and look at
// it, rather than assert about it in the abstract. A print product's last
// step is a file a printer accepts, so the check has to be that file.
//
// It deliberately goes through loadPlannerPages - the same page-shaping the
// editor uses, which that file was factored out to allow - and through
// buildPlannerPdf, which is the same assembly /planner/export hands to a
// person. Nothing about geometry or about the document is restated here, so
// what this verifies is the file that actually gets downloaded rather than
// a lookalike built by the script.
//
//   npx tsx scripts/check-pdf.mts          # the WEEK planner
//   npx tsx scripts/check-pdf.mts MONTH
import { readFileSync, writeFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { loadPlannerPages } = await import("../src/app/planner/loadPlannerPages.js");
const { buildPlannerPdf, printReadinessProblems, pdfFilename, describePageSize, FONT_PATH } =
  await import("../src/lib/plannerPdf.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

// Checked rather than cast: a mistyped argument should say so, not quietly
// query for a planner type that does not exist and report "none found".
const BASE_TYPES = ["WEEK", "MONTH"] as const;
type BaseType = (typeof BASE_TYPES)[number];
const requested = (process.argv[2] ?? "WEEK").toUpperCase();
if (!BASE_TYPES.includes(requested as BaseType)) {
  console.error(`Unknown planner type "${requested}". Expected one of: ${BASE_TYPES.join(", ")}`);
  process.exit(1);
}
const baseType = requested as BaseType;

const planner = await prisma.planner.findFirst({
  where: { isTemplate: false, baseType },
  include: {
    pages: {
      orderBy: { position: "asc" },
      include: { moduleInstances: { include: { moduleType: true } } },
    },
  },
});

if (!planner) {
  console.error(`No ${baseType} planner in the database to export.`);
  process.exit(1);
}

const loaded = await loadPlannerPages(
  planner as unknown as Parameters<typeof loadPlannerPages>[0]
);

const built = buildPlannerPdf(loaded.pages);
const report = built.report;

built.pages.forEach((page, index) => {
  console.log(
    `  page ${index + 1}: ${page.modules} modules, ${page.elements} marks ` +
      `(${page.text} text, ${page.rects} rects, ${page.paths} paths)`
  );
});

const out = `public/planner-${baseType.toLowerCase()}.pdf`;
writeFileSync(out, Buffer.from(built.bytes));
const bytes = built.bytes;

console.log(
  `\n${out}: ${built.pages.length} page(s), ${(bytes.byteLength / 1024).toFixed(0)} KB, ` +
    `${built.widthPt.toFixed(1)} x ${built.heightPt.toFixed(1)} pt - ` +
    describePageSize(built.size)
);
console.log(
  `${report.elements} marks drawn: ${report.text} text, ${report.rects} rects, ${report.paths} paths`
);
// The same file, by the name a person downloading it would get - so the
// filename rule is exercised by something rather than only ever running in
// a route nobody checks.
console.log(`downloads as: ${pdfFilename(planner.title)}`);
// A browser downloads a PDF rather than showing it, so there is a viewer
// page that renders it with pdf.js - otherwise the one artefact that
// actually matters is the one thing you cannot look at.
console.log(`Look at it: http://localhost:3000/pdf-proof.html?f=/${out.replace("public/", "")}`);
console.log(`Or from the editor: the Export PDF button, which serves /planner/export?planner=${baseType}`);

// --- what actually landed in the file --------------------------------
//
// Everything above is jsPDF's own account of itself. This reads the bytes
// back, inflates the page content streams and counts the drawing operators
// in them, so "897 marks drawn" means 897 marks are IN THE FILE. A library
// quietly dropping a call is exactly the kind of failure that would
// otherwise be found by a printer.
const { inflateSync } = await import("node:zlib");
const buffer = Buffer.from(bytes);
let ops = { text: 0, rects: 0, curves: 0, lines: 0 };
let streams = 0;
for (let at = buffer.indexOf("stream"); at !== -1; at = buffer.indexOf("stream", at + 6)) {
  // Skip the "endstream" keyword, which also contains "stream".
  if (at >= 3 && buffer.subarray(at - 3, at + 6).toString("latin1") === "endstream") continue;
  let start = at + "stream".length;
  if (buffer[start] === 0x0d) start++;
  if (buffer[start] === 0x0a) start++;
  const end = buffer.indexOf("endstream", start);
  if (end === -1) continue;
  let body: string;
  try {
    body = inflateSync(buffer.subarray(start, end)).toString("latin1");
  } catch {
    continue; // not a deflated content stream (font files, metadata)
  }
  // A page's content stream, as opposed to the embedded font file or the
  // metadata. Identified by carrying a drawing operator - and NOT by a bare
  // `c`, which was the first attempt and matched a stray byte inside the
  // font program, so the font counted as a third page.
  if (!/\bTj\b/.test(body) && !/^[^\n]*\bre\b/m.test(body)) continue;
  streams++;
  // BOTH text forms. jsPDF writes `(text) Tj` with a standard face and
  // `<hex> Tj` once a font is embedded, because the glyphs are then
  // addressed by CID rather than by character - so a verifier that knows
  // only the literal form reports zero text on exactly the documents that
  // are correct, which is what it did.
  ops = {
    text: ops.text + (body.match(/[)>]\s*Tj/g) ?? []).length,
    rects: ops.rects + (body.match(/^[^\n]*\bre\b/gm) ?? []).length,
    curves: ops.curves + (body.match(/^[^\n]*\bc\b\s*$/gm) ?? []).length,
    lines: ops.lines + (body.match(/^[^\n]*\bl\b\s*$/gm) ?? []).length,
  };
}
console.log(
  `read back from the file: ${streams} content stream(s), ${ops.text} text ops, ` +
    `${ops.rects} rect ops, ${ops.curves} curve ops, ${ops.lines} line ops`
);

let problems = 0;

// --- where the knife goes --------------------------------------------
//
// The page boxes, read out of the raw bytes rather than trusted from the
// builder. MediaBox is the sheet; TrimBox is the finished page; BleedBox
// is how far ink may run past the trim. Nothing in these planners actually
// bleeds - every mark sits at least 0.52in inside the trim line, measured -
// so the 0.125in a 7x10 sheet carries is an INSTRUCTION, and an instruction
// only counts if it is in the file. A printer that infers differently, and
// scales the sheet to fit 7x10 instead of cutting it, puts every measurement
// in the book out by 3.4%.
const pdfText = buffer.toString("latin1");
// Parsed by hand rather than with a regex built from a string: PDF boxes
// are `/MediaBox [0 0 522. 738.]`, and the bracket-and-backslash soup a
// constructed RegExp needs for that is exactly the kind of thing that goes
// wrong silently.
const boxesOf = (name: string) => {
  const key = `/${name}`;
  const out: number[][] = [];
  for (let i = pdfText.indexOf(key); i !== -1; i = pdfText.indexOf(key, i + 1)) {
    const open = pdfText.indexOf("[", i);
    const close = pdfText.indexOf("]", open);
    // The bracket has to belong to THIS key, not to some later one.
    if (open === -1 || close === -1 || open > i + key.length + 2) continue;
    out.push(pdfText.slice(open + 1, close).trim().split(/\s+/).map(Number));
  }
  return out;
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
const size = built.size;
const expected: Record<string, number[]> = {
  MediaBox: [0, 0, size.sheetWidthPt, size.sheetHeightPt],
  TrimBox: [
    size.bleedPt,
    size.bleedPt,
    size.sheetWidthPt - size.bleedPt,
    size.sheetHeightPt - size.bleedPt,
  ],
  BleedBox: [0, 0, size.sheetWidthPt, size.sheetHeightPt],
};
for (const [name, want] of Object.entries(expected)) {
  const found = boxesOf(name);
  if (found.length !== loaded.pages.length) {
    console.error(
      `  FAIL  ${found.length} /${name} in the file, expected one per page (${loaded.pages.length})`
    );
    problems++;
    continue;
  }
  const wrong = found.filter((box) => !box.every((v, i) => near(v, want[i])));
  if (wrong.length > 0) {
    console.error(
      `  FAIL  /${name} is [${wrong[0].join(" ")}], expected [${want.map((v) => Number(v.toFixed(2))).join(" ")}]`
    );
    problems++;
  }
}
// INDEPENDENT of everything above, which only proves the file agrees with
// itself: if the bleed were wrong, MediaBox, TrimBox and BuiltPdf.size
// would all be wrong together and every comparison would still pass. A
// finished page is a NAMED size - 7 x 10, US Letter - and every named trim
// is a multiple of half an inch. A 7.25 x 10.25 trim box is not a size
// anyone sells; it is the sheet with the bleed forgotten, which is the
// exact mistake this whole block exists to prevent.
for (const [edge, pt] of [["width", size.trimWidthPt], ["height", size.trimHeightPt]] as const) {
  const inches = pt / 72;
  if (Math.abs(inches * 2 - Math.round(inches * 2)) > 0.001) {
    console.error(
      `  FAIL  trim ${edge} is ${inches.toFixed(3)}in, which is not a half-inch multiple.\n` +
        `        A finished page is a named size; this looks like the sheet with\n` +
        `        the bleed left in. Check bleedPx in planner-trims.ts.`
    );
    problems++;
  }
}
if (problems === 0) {
  console.log(
    `page boxes: MediaBox ${(size.sheetWidthPt / 72).toFixed(3)} x ${(size.sheetHeightPt / 72).toFixed(3)} in, ` +
      `TrimBox ${(size.trimWidthPt / 72).toFixed(3)} x ${(size.trimHeightPt / 72).toFixed(3)} in ` +
      `(${(size.bleedPt / 72).toFixed(3)}in bleed declared on every page)`
  );
}
if (streams !== loaded.pages.length) {
  console.error(`  FAIL  ${streams} page content stream(s) in the file, expected ${loaded.pages.length}`);
  problems++;
}
if (ops.text !== report.text) {
  console.error(`  FAIL  ${report.text} text marks drawn but ${ops.text} in the file`);
  problems++;
}
if (ops.rects !== report.rects) {
  console.error(`  FAIL  ${report.rects} rects drawn but ${ops.rects} in the file`);
  problems++;
}
// Everything the export route would warn a person about, in the same words
// - one definition of "print-ready", so a green run here and a clean
// download there cannot mean different things.
for (const problem of printReadinessProblems(built)) {
  console.error(`  FAIL  ${problem}`);
  problems++;
}
if (!built.font.embedded) {
  console.error(
    `        Little overflows (1 of 915 catalogue labels), but the planner is\n` +
      `        designed in Newsreader and a substitute face is a different\n` +
      `        product on paper. Put a TTF at ${FONT_PATH} to fix.`
  );
}

await prisma.$disconnect();
if (problems > 0) {
  console.error(`\n${problems} problem(s) - this file is not print-ready.`);
  process.exit(1);
}
console.log("\nEvery mark drawn, in the planner's own face. Print-ready.");

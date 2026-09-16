// Exports a real planner to a real PDF, and says what it could not draw.
//
// Same idea as the proof sheets: produce the actual artefact and look at
// it, rather than assert about it in the abstract. A print product's last
// step is a file a printer accepts, so the check has to be that file.
//
// It deliberately goes through loadPlannerPages - the same page-shaping the
// editor uses, which that file was factored out to allow ("the (upcoming)
// headless export route"). Nothing about geometry is restated here, so the
// PDF cannot drift from what the editor shows.
//
//   npx tsx scripts/check-pdf.mts          # the WEEK planner
//   npx tsx scripts/check-pdf.mts MONTH
import { readFileSync, writeFileSync, existsSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { loadPlannerPages } = await import("../src/app/planner/loadPlannerPages.js");
const { createPdf, drawPage, installFont, emptyReport, pxToPt } = await import(
  "../src/lib/pdfDocument.js"
);

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

// The planner's own face, if a file has been placed for it. Without one the
// document falls back to Times and says so - see installFont on why that is
// not merely a cosmetic difference.
// The variable font from google/fonts, which is what upstream ships - there
// are no static instances in the repository. Its OFL licence sits beside it
// and must travel with it wherever this font goes.
const FONT_PATH = "assets/fonts/Newsreader.ttf";
const ttf = existsSync(FONT_PATH) ? readFileSync(FONT_PATH).toString("base64") : undefined;

const first = loaded.pages[0];
const doc = createPdf(first.pageGrid);
const font = installFont(doc, "Newsreader", ttf);
const report = emptyReport();

loaded.pages.forEach((page, index) => {
  if (index > 0) {
    doc.addPage([pxToPt(page.pageGrid.widthPx), pxToPt(page.pageGrid.heightPx)]);
  }
  const before = { ...report };
  for (const instance of page.moduleInstances) {
    drawPage(doc, instance.elements, font, report);
  }
  console.log(
    `  page ${index + 1}: ${page.moduleInstances.length} modules, ` +
      `${report.elements - before.elements} marks ` +
      `(${report.text - before.text} text, ${report.rects - before.rects} rects, ` +
      `${report.paths - before.paths} paths)`
  );
});

const out = `public/planner-${baseType.toLowerCase()}.pdf`;
const bytes = doc.output("arraybuffer");
writeFileSync(out, Buffer.from(bytes));

const w = pxToPt(first.pageGrid.widthPx);
const h = pxToPt(first.pageGrid.heightPx);
console.log(
  `\n${out}: ${loaded.pages.length} page(s), ${(bytes.byteLength / 1024).toFixed(0)} KB, ` +
    `${w.toFixed(1)} x ${h.toFixed(1)} pt (${(w / 72).toFixed(3)} x ${(h / 72).toFixed(3)} in, trim plus bleed)`
);
console.log(
  `${report.elements} marks drawn: ${report.text} text, ${report.rects} rects, ${report.paths} paths`
);
// A browser downloads a PDF rather than showing it, so there is a viewer
// page that renders it with pdf.js - otherwise the one artefact that
// actually matters is the one thing you cannot look at.
console.log(`Look at it: http://localhost:3000/pdf-proof.html?f=/${out.replace("public/", "")}`);

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
if (report.skipped > 0) {
  console.error(`  FAIL  ${report.skipped} element(s) were not drawn at all`);
  problems++;
}
if (report.unsupportedPathCommands.length > 0) {
  console.error(
    `  FAIL  path command(s) this exporter cannot draw: ${report.unsupportedPathCommands.join(", ")}`
  );
  problems++;
}
if (!font.embedded) {
  console.error(
    `  FAIL  no font embedded - set in ${font.name}, not the planner's own face.\n` +
      `        Little overflows (1 of 915 catalogue labels), but the planner is\n` +
      `        designed in Newsreader and a substitute face is a different\n` +
      `        product on paper. Put a TTF at ${FONT_PATH} to fix.`
  );
  problems++;
}

await prisma.$disconnect();
if (problems > 0) {
  console.error(`\n${problems} problem(s) - this file is not print-ready.`);
  process.exit(1);
}
console.log("\nEvery mark drawn, in the planner's own face. Print-ready.");

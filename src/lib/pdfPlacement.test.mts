// The PDF puts every mark where the proof sheet puts it.
//
// THE GAP THIS FILLS. pdfDocument.test.mts checks the scale, the path
// conversion and that nothing is skipped; check-pdf.mts counts the drawing
// operators that reach the file. Between them they would still pass a
// document with every mark in the wrong PLACE - a y-flip, a margin dropped,
// an off-by-one-page-height - because neither ever asks where a mark
// landed. On a printed product that is the whole ball game.
//
// So this compares the two serialisers of one drawing against each other:
// proofSvg's toSvg, which is what the proof sheets show and what every
// module's spacing was approved against, and pdfDocument's drawElement,
// which is what goes to the printer. The comparison is made on the PDF's
// own bytes - the content stream inflated and its operators parsed - rather
// than on what the exporter says it did.
//
// jsPDF's convention, read off a probe document rather than assumed:
//
//     doc.rect(10, 0, 50, 20)  ->  "10. 738. 50. -20. re"
//     doc.text("top", 10, 30)  ->  "10. 708. Td"
//
// x passes straight through; y becomes pageHeight - y, measured in points,
// and a rect's height goes negative because it is drawn from its top edge
// downward. Everything below is that relationship, checked.
import { inflateSync } from "node:zlib";
import { toSvg, flatten, PROOF_PAGE } from "./proofSvg";
import { createPdf, drawElement, installFont, emptyReport, pxToPt, PX_PER_PT } from "./pdfDocument";
import { renderModuleInstance, type RenderedPolotnoElement } from "./renderModuleInstance";
import { moduleDefinition, moduleSchemaDefaults } from "./moduleRegistry";

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

/** Modules chosen for what they draw, not for coverage's sake: a page-wide
 *  spine of many fine rules, a row-by-column grid, a ruled box, a table,
 *  and a strip of path glyphs. Between them every branch of both
 *  serialisers is exercised. */
const CORPUS: Array<{ slug: string; columnSpan: number; rowSpan: number }> = [
  { slug: "hourly-grid-core", columnSpan: 18, rowSpan: 20 },
  { slug: "habit-tracker", columnSpan: 24, rowSpan: 13 },
  { slug: "labeled-box", columnSpan: 6, rowSpan: 8 },
  { slug: "column-table", columnSpan: 10, rowSpan: 8 },
  { slug: "week-title", columnSpan: 6, rowSpan: 3 },
  { slug: "water-week", columnSpan: 24, rowSpan: 2 },
];

/** Where the module sits on the page. Deliberately NOT the origin - an
 *  exporter that dropped the page margin would still pass at 0,0. */
const COLUMN_START = 6;
const ROW_START = 4;

const PAGE_HEIGHT_PT = pxToPt(PROOF_PAGE.heightPx);

function elementsFor(slug: string, columnSpan: number, rowSpan: number) {
  return flatten(
    renderModuleInstance(
      {
        id: "t",
        locked: true,
        columnStart: COLUMN_START,
        rowStart: ROW_START,
        columnSpan,
        rowSpan,
        // The module's own schema defaults, which is what a placed instance
        // actually carries. previewProps are the palette CARD's compact
        // sample and some modules have none at all - hourly-grid-core is a
        // spine, never in the palette, so it has none.
        propValues: {
          ...moduleSchemaDefaults(slug),
          ...((moduleDefinition(slug)?.previewProps ?? {}) as Record<string, unknown>),
        },
        moduleType: { slug },
      } as never,
      PROOF_PAGE,
      "Newsreader"
    ) as RenderedPolotnoElement[]
  );
}

/** Plain rects and text baselines, as the proof sheet draws them. Rounded
 *  rects are left out on both sides: SVG gives them an rx and PDF turns
 *  them into curves, so they are not comparable as rectangles. */
function fromSvg(elements: RenderedPolotnoElement[]) {
  const rects: Array<[number, number, number, number]> = [];
  const baselines: number[] = [];
  for (const element of elements) {
    const svg = toSvg(element);
    if (!svg) continue;
    if (svg.startsWith("<rect") && !svg.includes(" rx=")) {
      const m = /x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/.exec(svg);
      if (m) rects.push([+m[1], +m[2], +m[3], +m[4]]);
    } else if (svg.startsWith("<text")) {
      // An EMPTY string has no baseline to compare. Both sides agree to
      // draw nothing - SVG emits <text></text> with no content, jsPDF emits
      // no positioning operator at all - so counting one and not the other
      // reports a placement failure where there is no mark. week-title is
      // the live case: its date range is blank until real week data fills
      // it in.
      if (String(element.text ?? "").length === 0) continue;
      const m = /y="([-\d.]+)"/.exec(svg);
      if (m) baselines.push(+m[1]);
    }
  }
  return { rects, baselines };
}

/** The same two things, read back out of a real PDF's content stream. */
function fromPdf(elements: RenderedPolotnoElement[]) {
  const doc = createPdf(PROOF_PAGE);
  // No embedded font: with one, jsPDF writes glyphs by CID and the text
  // positioning is identical but the strings are hex. Position is all this
  // file compares, and the standard face keeps the stream readable.
  const font = installFont(doc, "Newsreader");
  const report = emptyReport();
  for (const element of elements) drawElement(doc, element, font, report);

  const buffer = Buffer.from(doc.output("arraybuffer"));
  let body = "";
  for (let at = buffer.indexOf("stream"); at !== -1; at = buffer.indexOf("stream", at + 6)) {
    if (at >= 3 && buffer.subarray(at - 3, at + 6).toString("latin1") === "endstream") continue;
    let start = at + "stream".length;
    if (buffer[start] === 0x0d) start++;
    if (buffer[start] === 0x0a) start++;
    const end = buffer.indexOf("endstream", start);
    if (end === -1) continue;
    try {
      const inflated = inflateSync(buffer.subarray(start, end)).toString("latin1");
      if (/\bre\b|\bTd\b/.test(inflated)) body += inflated;
    } catch {
      /* not a content stream */
    }
  }

  const rects: Array<[number, number, number, number]> = [];
  for (const m of body.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+re/g)) {
    const [x, yPdf, w, h] = [+m[1], +m[2], +m[3], +m[4]];
    // Back to the top-left pixel space every renderer works in.
    rects.push([x * PX_PER_PT, (PAGE_HEIGHT_PT - yPdf) * PX_PER_PT, w * PX_PER_PT, -h * PX_PER_PT]);
  }
  const baselines: number[] = [];
  for (const m of body.matchAll(/([-\d.]+)\s+([-\d.]+)\s+Td/g)) {
    baselines.push((PAGE_HEIGHT_PT - +m[2]) * PX_PER_PT);
  }
  return { rects, baselines, report };
}

const round = (n: number) => Math.round(n * 100) / 100;
const key = (r: number[]) => r.map(round).join(",");

let comparedRects = 0;
let comparedText = 0;

for (const { slug, columnSpan, rowSpan } of CORPUS) {
  if (!moduleDefinition(slug)?.render) {
    fail(`${slug} is not registered with a renderer - the corpus is stale`);
    continue;
  }
  const elements = elementsFor(slug, columnSpan, rowSpan);
  const svg = fromSvg(elements);
  const pdf = fromPdf(elements);

  if (pdf.report.skipped > 0) {
    fail(`${slug}: ${pdf.report.skipped} element(s) skipped by the exporter`);
  }

  // Rectangles, matched as multisets: the two serialisers need not emit
  // them in the same order, only draw the same ones.
  const wantRects = svg.rects.map(key).sort();
  const gotRects = pdf.rects.map(key).sort();
  if (wantRects.length !== gotRects.length) {
    fail(
      `${slug}: proof draws ${wantRects.length} plain rects, PDF has ${gotRects.length}`
    );
  } else {
    for (let i = 0; i < wantRects.length; i++) {
      if (wantRects[i] !== gotRects[i]) {
        fail(`${slug}: rect ${i} is at [${gotRects[i]}] in the PDF but [${wantRects[i]}] in the proof`);
        break;
      }
    }
    comparedRects += wantRects.length;
  }

  // Text baselines. Only the y: the proof anchors text and lets the
  // renderer resolve the alignment, while jsPDF resolves it to a left edge
  // before writing, so the x values are not the same quantity. The y is,
  // and it is the one that carries both the page flip and TEXT_BASELINE_EM.
  const wantY = svg.baselines.map(round).sort((a, b) => a - b);
  const gotY = pdf.baselines.map(round).sort((a, b) => a - b);
  if (wantY.length !== gotY.length) {
    fail(`${slug}: proof draws ${wantY.length} text baselines, PDF has ${gotY.length}`);
  } else {
    for (let i = 0; i < wantY.length; i++) {
      if (Math.abs(wantY[i] - gotY[i]) > 0.02) {
        fail(`${slug}: text baseline ${i} at ${gotY[i]} in the PDF, ${wantY[i]} in the proof`);
        break;
      }
    }
    comparedText += wantY.length;
  }
}

// --- the page flip is real, not an accident of symmetry ----------------
//
// Every check above would still pass if both sides were mirrored together.
// This pins the absolute relationship to the page: a mark near the TOP of
// the page must come out near the top, which in PDF space means a large y.
{
  const nearTop: RenderedPolotnoElement = {
    id: "top", type: "figure", subType: "rect",
    x: 100, y: 150, width: 200, height: 50, stroke: "#231F20", strokeWidth: 1.25,
  };
  const { rects } = fromPdf([nearTop]);
  if (rects.length !== 1) {
    fail(`one rect in, ${rects.length} out`);
  } else {
    const [x, y, w, h] = rects[0];
    if (Math.abs(x - 100) > 0.02 || Math.abs(y - 150) > 0.02 || Math.abs(w - 200) > 0.02 || Math.abs(h - 50) > 0.02) {
      fail(`a rect at (100,150) 200x50 came back as (${round(x)},${round(y)}) ${round(w)}x${round(h)}`);
    }
    // 150px from the top of a 3075px page is 2925px from the bottom - so
    // an unflipped or double-flipped document lands nowhere near here.
    if (y > PROOF_PAGE.heightPx / 2) {
      fail(`a mark 150px from the top came back ${round(y)}px from the top - the page flip is wrong`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} PDF placement problem(s).`);
  process.exit(1);
}
console.log(
  `All PDF placement checks passed (${CORPUS.length} modules: ${comparedRects} rects and ` +
    `${comparedText} text baselines land where the proof sheet puts them).`
);

// What actually landed in a PDF file, read back out of the bytes.
//
// jsPDF's own report says what it was ASKED to draw. This inflates the page
// content streams and counts the drawing operators in them, so a count here
// means the marks are in the file - a library quietly dropping a call is
// exactly the kind of failure that would otherwise be found by a printer.
//
// Extracted from check-pdf.mts when pdfDocument.test.mts needed the same
// reading to prove rounded corners survive to paper. Two copies of "how you
// read a PDF back" would drift, and the hard-won details below are precisely
// what a second copy would get wrong.

import { inflateSync } from "node:zlib";

export type DrawingOps = {
  /** Page content streams found - not font programs or metadata. */
  streams: number;
  text: number;
  rects: number;
  curves: number;
  lines: number;
};

export function readDrawingOps(bytes: ArrayBuffer | Uint8Array): DrawingOps {
  const buffer = Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const ops: DrawingOps = { streams: 0, text: 0, rects: 0, curves: 0, lines: 0 };

  for (let at = buffer.indexOf("stream"); at !== -1; at = buffer.indexOf("stream", at + 6)) {
    // "endstream" contains "stream" too.
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
      continue; // a font file or metadata, not a deflated content stream
    }
    // A PAGE's stream, identified by carrying a drawing operator - and NOT by
    // a bare `c`, which was the first attempt and matched a stray byte inside
    // the font program, so the font counted as a third page.
    //
    // The curve test uses the same ANCHORED form the counting below does, not
    // a bare `c`, so it keeps that property. Without it a page holding only
    // rounded rectangles - no text, no plain `re` - was skipped as if it were
    // a font program: the first run of the rounded-corner proof reported zero
    // curves for a document whose bytes plainly contained four, and read as
    // the exporter dropping cornerRadius when nothing was wrong with it.
    if (
      !/\bTj\b/.test(body) &&
      !/^[^\n]*\bre\b/m.test(body) &&
      !/^[^\n]*\bc\b\s*$/m.test(body)
    ) {
      continue;
    }
    ops.streams++;
    // BOTH text forms. jsPDF writes `(text) Tj` with a standard face and
    // `<hex> Tj` once a font is embedded, because the glyphs are then
    // addressed by CID rather than by character - so a verifier that knows
    // only the literal form reports zero text on exactly the documents that
    // are correct, which is what it did.
    ops.text += (body.match(/[)>]\s*Tj/g) ?? []).length;
    ops.rects += (body.match(/^[^\n]*\bre\b/gm) ?? []).length;
    ops.curves += (body.match(/^[^\n]*\bc\b\s*$/gm) ?? []).length;
    ops.lines += (body.match(/^[^\n]*\bl\b\s*$/gm) ?? []).length;
  }
  return ops;
}

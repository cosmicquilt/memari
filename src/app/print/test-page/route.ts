// memari.studio/print/test-page - one US Letter page to print before the
// planner: a bank-card outline and a ruler, which only line up when the
// printer is at actual size (the commonest failure: "Fit to page" shrinks
// everything a few percent, and the quarter-inch grid with it), and the
// planner's own finest marks, which show whether the printer is saving ink.
//
// A page of its own rather than the book's first page (the research,
// 2026-10-08, suggested the book): a page added to the front would turn
// every left-hand page into a right-hand one, and change what a printed
// book's page count is.
//
// The marks are the planner's: rules 0.3pt in #231F20 (hairline.ts,
// hourlyGridCore LINE_COLOR), grid dots 2.8 print px in radius in #9aa2a8
// (hourlyGridCore DOT_RADIUS_PX, DOT_COLOR), a quarter inch apart.

import { jsPDF } from "jspdf";

export const dynamic = "force-static";

const IN = 72;
const INK: [number, number, number] = [0x23, 0x1f, 0x20];
const DOT: [number, number, number] = [0x9a, 0xa2, 0xa8];
const MUTED: [number, number, number] = [90, 90, 90];
/** ISO/IEC 7810 ID-1: every bank and library card. 85.60 x 53.98 mm. */
const CARD_W = 85.6 / 25.4;
const CARD_H = 53.98 / 25.4;
const CARD_RADIUS = 3.18 / 25.4;
const DOT_RADIUS_PT = (2.8 / 300) * 72;
const RULE_PT = 0.3;

function build(): ArrayBuffer {
  const doc = new jsPDF({ unit: "pt", format: "letter", compress: true });
  doc.setProperties({ title: "Memari print test", creator: "memari.studio" });
  const left = 0.9 * IN;
  const textWidth = 3.1 * IN;
  const right = left + CARD_W * IN + 0.45 * IN;

  const heading = (text: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(text, right, y);
  };
  const body = (text: string, y: number, x = right, width = textWidth) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(text, width), x, y, { lineHeightFactor: 1.35 });
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("Print test", left, 0.95 * IN);
  body("Print this page before your planner, with the same printer and the same settings. Choose Actual size (or Scale 100%), never Fit to page.", 1.25 * IN, left, 6.6 * IN);

  // 1. The card.
  let y = 1.85 * IN;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.75);
  doc.roundedRect(left, y, CARD_W * IN, CARD_H * IN, CARD_RADIUS * IN, CARD_RADIUS * IN, "S");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Lay a bank or library card here", left + (CARD_W * IN) / 2, y + (CARD_H * IN) / 2 + 3, { align: "center" });
  heading("1. The card fits the box", y + 12);
  body(
    "Any bank, library or ID card is this size. If the card covers the box edge to edge, the printer is at actual size. If the box is smaller than the card, the printer shrank the page: change Fit to page to Actual size and print this again.",
    y + 28
  );

  // 2. The ruler.
  y = 4.55 * IN;
  const rulerLength = 6;
  doc.setLineWidth(0.6);
  doc.line(left, y, left + rulerLength * IN, y);
  for (let q = 0; q <= rulerLength * 4; q++) {
    const x = left + (q / 4) * IN;
    const tick = q % 4 === 0 ? 0.22 : q % 2 === 0 ? 0.14 : 0.08;
    doc.setLineWidth(q % 4 === 0 ? 0.6 : 0.4);
    doc.line(x, y, x, y + tick * IN);
    if (q % 4 === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      doc.text(String(q / 4), x, y + 0.36 * IN, { align: "center" });
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("2. Each number is one inch", left, y - 0.18 * IN);
  body("Check it against a ruler: the marks between are quarter inches, the same as the dots your planner is drawn on.", y + 0.6 * IN, left, 6.6 * IN);

  // 3. The dot grid.
  y = 6.05 * IN;
  const cols = 13;
  const rows = 7;
  doc.setFillColor(...DOT);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) doc.circle(left + c * 0.25 * IN, y + r * 0.25 * IN, DOT_RADIUS_PT, "F");
  heading("3. The dot grid", y + 6);
  body("Your planner's dots, at their real size and grey, a quarter inch apart. Three dots span half an inch. If you can barely see them, ask for darker printing or turn off any toner-saving setting.", y + 22);

  // 4. The finest rules.
  y = 8.25 * IN;
  doc.setDrawColor(...INK);
  doc.setLineWidth(RULE_PT);
  for (let i = 0; i < 5; i++) doc.line(left, y + i * 0.25 * IN, left + 3 * IN, y + i * 0.25 * IN);
  heading("4. The finest lines", y + 6);
  body("The thinnest lines in your planner, 0.3 point. All five should be solid from end to end. Gaps or missing lines mean the printer is saving toner.", y + 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Memari Studio  ·  memari.studio/print", left, 10.45 * IN);
  return doc.output("arraybuffer");
}

export function GET() {
  return new Response(build(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="memari-print-test.pdf"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}

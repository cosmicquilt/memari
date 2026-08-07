// 6x9" US Trade + 0.125" bleed on each edge, at 300 DPI.
// Matches the dimensions validated in the standalone Polotno print-pipeline test.
export const PRINT_WIDTH_PX = 1875;
export const PRINT_HEIGHT_PX = 2775;
export const PRINT_DPI = 300;

// Module renderers work in this same pixel space, so font sizes must be
// specified as real point sizes converted to pixels here — not arbitrary
// small pixel values, which read as illegibly tiny at 300 DPI (an 11px
// cap is ~2.6pt).
export function ptToPx(pt: number): number {
  return (pt * PRINT_DPI) / 72;
}

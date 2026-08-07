// 7x10" trim (matching hourlyjournal.pdf's actual page size exactly —
// its MediaBox is a round 504x720pt) + 0.125" bleed on each edge, same
// bleed convention as the original 6x9 print-pipeline test, at 300 DPI.
export const PRINT_WIDTH_PX = 2175;
export const PRINT_HEIGHT_PX = 3075;
export const PRINT_DPI = 300;

// Module renderers work in this same pixel space, so font sizes must be
// specified as real point sizes converted to pixels here — not arbitrary
// small pixel values, which read as illegibly tiny at 300 DPI (an 11px
// cap is ~2.6pt).
export function ptToPx(pt: number): number {
  return (pt * PRINT_DPI) / 72;
}

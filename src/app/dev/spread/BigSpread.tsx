"use client";

import { CREAM } from "@/lib/cream";
import { PagePreview } from "@/app/planner/PagePreview";
import type { LandingSpread } from "@/app/landing/spreads";

// The landing grid's page, as StartFeatured draws its thumbs.
const PAGE_W = 2175;
const PAGE_H = 3075;
const HEIGHT = 900;

/** Both pages at a fixed size. Not SpreadThumb: its height lives in the
 *  start dialog's stylesheet, and without it the canvas sized itself from
 *  its own pixels, so at 2.5x each repaint grew the left page again and the
 *  photographs came out one page huge and one small (2026-10-30). */
export function BigSpread({ spread }: { spread: LandingSpread }) {
  const width = Math.round((HEIGHT * PAGE_W) / PAGE_H);
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {[0, 1].map((i) => (
        <div key={i} style={{ position: "relative", width, height: HEIGHT, background: CREAM, flex: "none" }}>
          <PagePreview page={{ previewMarks: spread.pages[i].marks, pageWidthPx: PAGE_W, pageHeightPx: PAGE_H }} />
        </div>
      ))}
    </div>
  );
}

// Where a module is drawn on one of the landing spreads, for a box laid
// over its SpreadPreview: the editor mock's highlight on the habit tracker
// (How it works, step 2). Read from the spread's own placements, so it
// stays on the module when the layout changes (2026-11-06: it was placed by
// hand and stayed short when the tracker grew taller). spreadBox.test.mts
// holds it to the outline the spread actually draws.

import type { CSSProperties } from "react";
import { HERO_BY_KEY } from "@/app/landing/heroSpreads";
import { LANDING_PAGE_GRID, spreadPlacements } from "@/app/landing/spreads";
import { gridCellToPixels } from "@/lib/grid";

/** The module's drawn box on its page, print px. */
export function moduleBox(key: string, slug: string): { page: 0 | 1; x: number; y: number; width: number; height: number } {
  const def = HERO_BY_KEY[key];
  if (!def) throw new Error(`no spread "${key}"`);
  const placed = spreadPlacements(def).find((p) => p.slug === slug);
  if (!placed) throw new Error(`the ${key} spread has no ${slug}`);
  return { page: placed.page, ...gridCellToPixels(LANDING_PAGE_GRID, placed) };
}

/** That box as a position over the spread: two pages side by side, 1px
 *  apart (landing .spreadPages). */
export function moduleOnSpread(key: string, slug: string): CSSProperties {
  const { page, x, y, width, height } = moduleBox(key, slug);
  const { widthPx, heightPx } = LANDING_PAGE_GRID;
  const across = (n: number) => n / (2 * widthPx);
  return {
    left: `calc((100% - 1px) * ${across(page * widthPx + x)} + ${page}px)`,
    width: `calc((100% - 1px) * ${across(width)})`,
    top: `${(y / heightPx) * 100}%`,
    height: `${(height / heightPx) * 100}%`,
  };
}

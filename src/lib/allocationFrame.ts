// Which modules lay their content out in the ALLOCATION frame.
//
// A module's ink box is inset 6px inside its allocation, and the allocation's
// edges are lattice lines. Modules that measure their columns or strips from
// the allocation rather than the ink box - so their boundaries land on the
// dots - draw marks up to one inset outside their own box. That is the
// technique working, not a mark escaping, and the two checks that measure
// marks against the box both have to know which modules it is.
//
// They used to know separately: moduleHouseStyle.test.mts derived its set
// from the primitives, and scripts/check-week-page.mts kept three slugs by
// hand. The icon strip moved to the allocation frame and only the first
// heard - so the page check failed a one-row Water strip in a real journal
// for doing exactly what the strip is designed to do (2026-10-05). One
// definition, here, for both.
//
// Derived from the primitive, not listed by slug, so a preset drawn by one of
// these is covered the day it is registered.

import { slugsDrawnBy } from "./moduleRegistry";

export const ALLOCATION_FRAME: ReadonlySet<string> = new Set([
  ...slugsDrawnBy("todo-checklist", "icon-strip"),
  "hourly-grid-core",
  "month-grid-core",
]);

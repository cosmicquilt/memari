// How short a module is allowed to get, in grid rows.
//
// This lived twice - once in actions.ts and once in NativePlannerEditor -
// and the server copy's own comment explained why: a client component
// cannot import a synchronous helper out of a "use server" module. True,
// but the answer was never to copy it. A third file both sides import is,
// and src/lib/planner-trims.ts already had to exist for exactly the same
// reason.
//
// The two copies had already drifted, though not yet visibly. The server
// called pixelHeightToRowSpan; the client inlined the same arithmetic
// WITHOUT its epsilon nudge, so a height meant to land exactly on a row
// boundary could round up a whole row on one side and not the other.
// Checked before merging them: 16 real slug/width/trim combinations agree
// today, so nothing was broken - but the client's floor is what gates the
// live shrink preview and the server's is what gates the commit, and those
// disagreeing is the "preview lied" family this refactor exists to close.
//
// Requested originally as "make them have a min height of the title and
// one row below."
import { gridCellToPixels, pixelHeightToRowSpan, type PageGrid } from "@/lib/grid";
import { getTodoChecklistRowMetricsPx } from "@/lib/modules/todoChecklist";
import { getHabitTrackerRowMetricsPx, isHabitTrackerCompact } from "@/lib/modules/habitTracker";

export const MIN_ROW_SPAN = 2;

export function getMinRowSpanForSlug(slug: string, pageGrid: PageGrid, columnSpan: number): number {
  let targetPx: number | null = null;
  if (slug === "todo-checklist") {
    const m = getTodoChecklistRowMetricsPx();
    targetPx = m.headerHeightPx + m.nominalRowHeightPx;
  } else if (slug === "habit-tracker") {
    const widthPx = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan, rowSpan: 1 }).width;
    const m = getHabitTrackerRowMetricsPx(widthPx);
    // Compact (sidebar) placement needs room for at least 2 full habit
    // pairs, not just 1 — requested directly: "can the habits side
    // module have a minimum vertical height of two habits (4 rows)."
    // Verified by direct computation against this app's real page
    // geometry before writing this, same as every other minimum here:
    // header + 2 compact pairs lands at exactly 4 grid rows. The wide
    // layout keeps its original "header + 1 row" floor.
    const pairsNeeded = isHabitTrackerCompact(widthPx) ? 2 : 1;
    targetPx = m.headerHeightPx + m.nominalRowHeightPx * pairsNeeded;
  }
  if (targetPx === null) return MIN_ROW_SPAN;
  return Math.max(MIN_ROW_SPAN, pixelHeightToRowSpan(pageGrid, targetPx));
}

/**
 * The per-sibling floors that let a stack shrink to admit an arriving
 * module — `resolveModulePlacement`'s `minRowSpanById` argument.
 *
 * Only unlocked siblings sharing the candidate's exact column range can
 * give way, which is the same set `resolveModulePlacement` recognises as
 * that stack.
 *
 * This loop was written twice, byte-identical apart from how each side
 * looked a slug up: the server searched `page.moduleInstances`, the client
 * read its `moduleLookup`. That lookup is now the caller's to supply, and
 * the rule is not.
 *
 * The two callers still differ in WHEN they build it — the editor only
 * does so while a drag is actually crossing zones, the server always does
 * — and that is a policy about when shrinking is offered, not a rule about
 * how far things shrink, so it stays where it is.
 */
export function minRowSpansForStack(
  pageGrid: PageGrid,
  candidate: { columnStart: number; columnSpan: number },
  others: Array<{ id: string; locked: boolean; columnStart: number; columnSpan: number }>,
  slugOf: (id: string) => string | undefined
): Record<string, number> {
  const floors: Record<string, number> = {};
  for (const other of others) {
    if (other.locked) continue;
    if (other.columnStart !== candidate.columnStart || other.columnSpan !== candidate.columnSpan) continue;
    const slug = slugOf(other.id);
    if (!slug) continue;
    floors[other.id] = getMinRowSpanForSlug(slug, pageGrid, candidate.columnSpan);
  }
  return floors;
}

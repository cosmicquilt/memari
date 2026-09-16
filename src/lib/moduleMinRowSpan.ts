// The per-sibling shrink floors a stack uses to admit an arriving module.
//
// The RULE for how short one module may get moved to the module registry,
// which is the one place that knows what a module is. This file keeps the
// loop over a stack, which is about stacks rather than about modules, and
// re-exports the pieces its callers already import so nothing had to be
// rewired to follow the rule to its new home.
//
// Both halves used to live here, and both had lived somewhere else before
// that: the rule existed twice, once in actions.ts and once in
// NativePlannerEditor, and the two had drifted. The server called
// pixelHeightToRowSpan; the client inlined the same arithmetic WITHOUT its
// epsilon nudge, so a height meant to land exactly on a row boundary could
// round up a whole row on one side and not the other. The client's floor
// gates the live shrink preview and the server's gates the commit, and
// those disagreeing is the "preview lied" family this refactor exists to
// close.
import type { PageGrid } from "@/lib/grid";
import { MIN_ROW_SPAN, getMinRowSpanForSlug } from "@/lib/moduleRegistry";

export { MIN_ROW_SPAN, getMinRowSpanForSlug };

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
 *
 * `moduleOf` returns the slug AND the stored propValues, because a floor
 * depends on content: shrinking a sibling to admit an arriving module must
 * not shrink it past its own rows. Returning both together is deliberate -
 * a resolver that handed back only a slug is how these floors came to
 * ignore content in the first place.
 */
export function minRowSpansForStack(
  pageGrid: PageGrid,
  candidate: { columnStart: number; columnSpan: number },
  others: Array<{ id: string; locked: boolean; columnStart: number; columnSpan: number }>,
  moduleOf: (id: string) => { slug: string; propValues: Record<string, unknown> } | undefined
): Record<string, number> {
  const floors: Record<string, number> = {};
  for (const other of others) {
    if (other.locked) continue;
    if (other.columnStart !== candidate.columnStart || other.columnSpan !== candidate.columnSpan) continue;
    const sibling = moduleOf(other.id);
    if (!sibling) continue;
    floors[other.id] = getMinRowSpanForSlug(
      sibling.slug,
      pageGrid,
      candidate.columnSpan,
      sibling.propValues
    );
  }
  return floors;
}

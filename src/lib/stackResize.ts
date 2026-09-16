// Where the rows come from when you drag the boundary between two stacked
// modules.
//
// WHY THIS EXISTS AS ITS OWN FILE. The arithmetic was written twice, once
// in the editor to drive the live preview and once in actions.ts to commit
// it, and the two agreeing was a matter of someone remembering. That is the
// "preview lied" defect family, and it is the same reason
// minRowSpansForStack was lifted out. One description, two callers.
//
// WHAT WAS WRONG WITH IT. Both copies read:
//
//     clamped = max(-(topSpan - topMin), min(bottomSpan - bottomMin, delta))
//
// so growing the top could ONLY take rows from the module directly below.
// When that module sat at its own floor there were none to take and the
// drag did nothing at all - no movement, no explanation. Free space further
// down the column was never considered, even when the whole stack could
// simply have slid into it.
//
// That was always true and was mostly invisible, because a module normally
// had slack. It stopped being invisible when module floors began to follow
// their CONTENT: a named tracker's floor is now its own height, 28 modules
// have no slack at their default size, and a palette drop is sized AT its
// floor - so the common case became the broken one. Reported as "expand any
// module except the last and nothing happens, even with space below".

import { MIN_ROW_SPAN } from "@/lib/moduleRegistry";

export type PairResizeInput = {
  /** Rows the boundary was dragged. Positive moves it DOWN, growing the top. */
  requestedDelta: number;
  topRowSpan: number;
  topMinRowSpan: number;
  bottomRowSpan: number;
  bottomMinRowSpan: number;
  /**
   * Free rows between the bottom edge of the LOWEST module in this column
   * stack and whatever bounds it from below - a locked block's own top
   * edge, or the page.
   *
   * Measured from the lowest module rather than from the pair's own bottom
   * because a stack is gravity-packed: there is no gap between neighbours,
   * so the only room to grow into is under all of them. Pass 0 for a stack
   * that reaches its bound.
   */
  spaceBelow: number;
};

export type PairResize = {
  /** Change to the top module's rowSpan. */
  topDelta: number;
  /**
   * Rows the bottom module AND everything below it move down.
   *
   * The bottom module always moves by `topDelta` (it sits on the boundary);
   * it SHRINKS by `topDelta - pushDown`. So a pure push leaves every module
   * the size it was and just slides them, and a pure shrink moves nothing
   * below the pair at all.
   */
  pushDown: number;
};

/**
 * How a boundary drag is actually satisfied.
 *
 * SPACE FIRST, THEN SHRINK. Growing slides the stack down into whatever
 * free rows are under it, and only starts taking rows off the module below
 * once that space is used up - "it should push the module below it down
 * until there's no space below all the modules", asked for directly after
 * the first version did the opposite.
 *
 * That order is also the one that matches what the gesture means. Dragging
 * this boundary down says "make the top one taller"; it does not say "make
 * the next one shorter", and there is no reason to destroy a size while
 * there is empty page to move into. Shrinking still happens once the stack
 * is against its bound, because otherwise the top could never grow past it.
 */
export function resolvePairResize(input: PairResizeInput): PairResize {
  const {
    requestedDelta,
    topRowSpan,
    topMinRowSpan,
    bottomRowSpan,
    bottomMinRowSpan,
    spaceBelow,
  } = input;

  if (requestedDelta === 0) return { topDelta: 0, pushDown: 0 };

  if (requestedDelta < 0) {
    // The boundary moves UP: the top gives rows back and the bottom grows
    // into them. The pair's own footprint does not change, so nothing below
    // is touched and there is nothing to bound it but the top's own floor.
    const topSlack = Math.max(0, topRowSpan - topMinRowSpan);
    return { topDelta: -Math.min(-requestedDelta, topSlack), pushDown: 0 };
  }

  const room = Math.max(0, spaceBelow);
  let fromPush = Math.min(requestedDelta, room);
  // Never leave a gap nothing can fill.
  //
  // Reported from a real page: the stack slid down and stopped one row
  // short of the page edge, and since no module may be shorter than
  // MIN_ROW_SPAN that row can never hold anything. It is not space, it is
  // waste - so the last sliver is taken with the rest, which moves the
  // boundary at most MIN_ROW_SPAN - 1 rows further than the drag asked for.
  //
  // Only while actually sliding: a drag that takes nothing from the space
  // below has not opened a gap and must not close one either.
  const leftover = room - fromPush;
  if (fromPush > 0 && leftover > 0 && leftover < MIN_ROW_SPAN) fromPush = room;
  const bottomSlack = Math.max(0, bottomRowSpan - bottomMinRowSpan);
  const fromShrink = Math.min(Math.max(0, requestedDelta - fromPush), bottomSlack);
  return { topDelta: fromPush + fromShrink, pushDown: fromPush };
}

/**
 * The rows a boundary can travel, as a pair of bounds for a caller that
 * wants to clamp a raw drag before resolving it.
 *
 * Same numbers resolvePairResize would arrive at; stated separately because
 * the live drag needs to know how far it may go while it is still moving,
 * not only what a particular delta resolves to.
 */
export function pairResizeRange(
  input: Omit<PairResizeInput, "requestedDelta">
): { min: number; max: number } {
  return {
    min: -Math.max(0, input.topRowSpan - input.topMinRowSpan),
    max:
      Math.max(0, input.bottomRowSpan - input.bottomMinRowSpan) +
      Math.max(0, input.spaceBelow),
  };
}

/**
 * Whether a resolved move ends with the stack flush against its bound.
 *
 * Used by the tests below rather than by the callers - stated here so the
 * no-orphan-gap rule has one place to be read from.
 */
export function gapAfter(input: PairResizeInput, resolved: PairResize): number {
  return Math.max(0, input.spaceBelow - resolved.pushDown);
}

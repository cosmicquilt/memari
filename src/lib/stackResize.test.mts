// Dragging a boundary between two stacked modules resolves to a real move.
//
// The reported bug, stated as a test: two modules stacked with free space
// below them, the lower one at its own floor, and dragging the boundary
// between them did nothing at all. Every case below is written so that the
// OLD arithmetic - which could only ever take rows from the module directly
// below - fails it.
import { resolvePairResize, pairResizeRange, gapAfter } from "./stackResize";
import { MIN_ROW_SPAN } from "./moduleRegistry";

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

const check = (
  what: string,
  got: { topDelta: number; pushDown: number },
  want: { topDelta: number; pushDown: number }
) => {
  if (got.topDelta !== want.topDelta || got.pushDown !== want.pushDown) {
    fail(
      `${what}: got topDelta ${got.topDelta}, pushDown ${got.pushDown}; ` +
        `expected ${want.topDelta} and ${want.pushDown}`
    );
  }
};

// --- the bug ----------------------------------------------------------
//
// A labeled box over a self-care tracker. The tracker is 8 rows and its
// floor is 8 - its rows ARE its height - so it has nothing to give. There
// are 6 free rows under the stack.
{
  const stack = {
    topRowSpan: 8,
    topMinRowSpan: 2,
    bottomRowSpan: 8,
    bottomMinRowSpan: 8,
    spaceBelow: 6,
  };
  check("growing past a floored neighbour", resolvePairResize({ ...stack, requestedDelta: 3 }), {
    topDelta: 3,
    pushDown: 3,
  });
  // Nothing special about the neighbour being floored, now that space is
  // taken first - but this was the reported case, so it stays named.

  // The tracker keeps every row it had; it only moves.
  const r = resolvePairResize({ ...stack, requestedDelta: 3 });
  const bottomShrink = r.topDelta - r.pushDown;
  if (bottomShrink !== 0) fail(`the floored module must not shrink, it lost ${bottomShrink} row(s)`);

  // And it stops at the page, rather than pushing the stack off it.
  check("growing further than there is room", resolvePairResize({ ...stack, requestedDelta: 20 }), {
    topDelta: 6,
    pushDown: 6,
  });
  // With nothing below to move into, the old behaviour is the right one:
  // refuse, because there is genuinely nowhere for the rows to come from.
  check(
    "floored neighbour and no space below",
    resolvePairResize({ ...stack, spaceBelow: 0, requestedDelta: 3 }),
    { topDelta: 0, pushDown: 0 }
  );
}

// --- nothing shrinks while there is room ------------------------------
//
// SPACE FIRST. Asked for directly after the first version did the opposite:
// "it should push the module below it down until there's no space below all
// the modules". Dragging this boundary down means "make the top one
// taller", not "make the next one shorter", so a module keeps its size for
// as long as there is empty page to slide into.
{
  const stack = {
    topRowSpan: 8,
    topMinRowSpan: 2,
    bottomRowSpan: 10,
    bottomMinRowSpan: 2,
    spaceBelow: 6,
  };
  check(
    "a neighbour with slack is still not touched while there is space",
    resolvePairResize({ ...stack, requestedDelta: 3 }),
    { topDelta: 3, pushDown: 3 }
  );
  const r = resolvePairResize({ ...stack, requestedDelta: 3 });
  if (r.topDelta - r.pushDown !== 0) {
    fail(`the module below lost ${r.topDelta - r.pushDown} row(s) with 6 rows of space going spare`);
  }
  // Only once the stack is against its bound does anything give way.
  check("past the space, the neighbour starts giving", resolvePairResize({ ...stack, requestedDelta: 10 }), {
    topDelta: 10,
    pushDown: 6, // all 6 rows of space, then 4 off a neighbour that can spare 8
  });
  // And with no space at all it behaves exactly as it always did.
  check(
    "no space: shrink the neighbour, as before",
    resolvePairResize({ ...stack, spaceBelow: 0, requestedDelta: 3 }),
    { topDelta: 3, pushDown: 0 }
  );
}

// --- no gap nothing can fill ------------------------------------------
//
// Measured off a real page: a column stack ended at row 35 of 36, so one
// row sat free below it forever - no module may be shorter than
// MIN_ROW_SPAN, so nothing could ever go there. "It allows one cell height
// below it empty when the minimum module height is two cell height."
{
  const stack = {
    topRowSpan: 8,
    topMinRowSpan: 2,
    bottomRowSpan: 3,
    bottomMinRowSpan: 3, // at its floor, so the space below is the only source
    spaceBelow: 7,
  };
  // Asking for 6 of the 7 free rows would strand the seventh. Take it.
  const r = resolvePairResize({ ...stack, requestedDelta: 6 });
  check("a drag that would strand one row takes it too", r, { topDelta: 7, pushDown: 7 });
  if (gapAfter({ ...stack, requestedDelta: 6 }, r) !== 0) fail("a row was still stranded");

  // Asking for less than that leaves a gap a module CAN use, so it stands.
  const partial = resolvePairResize({ ...stack, requestedDelta: 3 });
  check("a drag leaving usable space is left alone", partial, { topDelta: 3, pushDown: 3 });
  if (gapAfter({ ...stack, requestedDelta: 3 }, partial) !== 4) {
    fail("four usable rows should have been left below");
  }

  // And a drag that never reaches the space below does not close anything.
  const noSlide = resolvePairResize({
    ...stack, bottomRowSpan: 10, bottomMinRowSpan: 2, spaceBelow: 1, requestedDelta: 0,
  });
  check("a zero drag moves nothing", noSlide, { topDelta: 0, pushDown: 0 });
}

// --- dragging the boundary up -----------------------------------------
//
// The top gives rows back and the bottom grows into them. The pair's
// footprint is unchanged, so nothing below it is touched - pushDown must
// stay 0 or modules would drift on an operation that never moves the
// stack's outer edge.
{
  const stack = {
    topRowSpan: 8,
    topMinRowSpan: 3,
    bottomRowSpan: 8,
    bottomMinRowSpan: 8,
    spaceBelow: 6,
  };
  check("shrinking the top", resolvePairResize({ ...stack, requestedDelta: -4 }), {
    topDelta: -4,
    pushDown: 0,
  });
  check("shrinking past the top's own floor", resolvePairResize({ ...stack, requestedDelta: -99 }), {
    topDelta: -5,
    pushDown: 0,
  });
  check("a top already at its floor", resolvePairResize({ ...stack, topRowSpan: 3, requestedDelta: -2 }), {
    topDelta: 0,
    pushDown: 0,
  });
}

// --- the bottom's arithmetic stays consistent -------------------------
//
// The caller derives the bottom module from these two numbers, so the
// relationship has to hold for every case: it MOVES by topDelta and SHRINKS
// by topDelta - pushDown. If that ever went wrong the pair would overlap or
// leave a gap, which is the one thing this operation must never do.
{
  const cases = [-9, -4, -1, 0, 1, 3, 7, 15];
  for (const spaceBelow of [0, 2, 6]) {
    for (const bottomMinRowSpan of [2, 8]) {
      for (const requestedDelta of cases) {
        const input = {
          requestedDelta,
          topRowSpan: 8,
          topMinRowSpan: 2,
          bottomRowSpan: 8,
          bottomMinRowSpan,
          spaceBelow,
        };
        const { topDelta, pushDown } = resolvePairResize(input);
        const bottomShrink = topDelta - pushDown;
        const newTop = input.topRowSpan + topDelta;
        const newBottom = input.bottomRowSpan - bottomShrink;
        if (newTop < input.topMinRowSpan) {
          fail(`delta ${requestedDelta}: top ended at ${newTop}, below its floor ${input.topMinRowSpan}`);
        }
        if (newBottom < input.bottomMinRowSpan) {
          fail(`delta ${requestedDelta}: bottom ended at ${newBottom}, below its floor ${bottomMinRowSpan}`);
        }
        if (pushDown > spaceBelow) {
          fail(`delta ${requestedDelta}: pushed ${pushDown} rows into ${spaceBelow} rows of space`);
        }
        if (pushDown < 0) fail(`delta ${requestedDelta}: pushed ${pushDown} rows, which is upward`);
        if (topDelta * requestedDelta < 0) {
          fail(`delta ${requestedDelta}: resolved to ${topDelta}, which is the wrong direction`);
        }
        // A move may EXCEED what was asked for, but only to swallow a
        // leftover gap too small to hold any module, and never by more than
        // that gap could be.
        const overshoot = Math.abs(topDelta) - Math.abs(requestedDelta);
        if (overshoot > 0) {
          if (overshoot >= MIN_ROW_SPAN) {
            fail(`delta ${requestedDelta}: overshot by ${overshoot}, more than a placeable module`);
          }
          if (gapAfter(input, { topDelta, pushDown }) !== 0) {
            fail(`delta ${requestedDelta}: overshot by ${overshoot} and still left a gap`);
          }
        }
        // Whatever it resolved to, it must not leave an orphan.
        const gap = gapAfter(input, { topDelta, pushDown });
        if (gap > 0 && gap < MIN_ROW_SPAN && pushDown > 0) {
          fail(
            `delta ${requestedDelta}: slid the stack and left ${gap} row(s) below it, ` +
              `which is less than the ${MIN_ROW_SPAN} any module needs`
          );
        }
      }
    }
  }
}

// --- the range a live drag is clamped to ------------------------------
{
  const stack = {
    topRowSpan: 8,
    topMinRowSpan: 2,
    bottomRowSpan: 8,
    bottomMinRowSpan: 8,
    spaceBelow: 6,
  };
  const range = pairResizeRange(stack);
  if (range.min !== -6) fail(`range.min is ${range.min}, expected -6 (the top's own slack)`);
  if (range.max !== 6) fail(`range.max is ${range.max}, expected 6 (no slack below, 6 rows of space)`);
  // The range has to be exactly what resolvePairResize will honour, or the
  // live preview shows a boundary the commit then refuses.
  for (const delta of [range.min, range.max, range.min - 3, range.max + 3]) {
    const resolved = resolvePairResize({ ...stack, requestedDelta: delta });
    const clamped = Math.max(range.min, Math.min(range.max, delta));
    if (resolved.topDelta !== clamped) {
      fail(`delta ${delta}: range says ${clamped} but resolve says ${resolved.topDelta}`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} stack resize problem(s).`);
  process.exit(1);
}
console.log(
  "All stack resize checks passed (space below is taken before anything shrinks; no gap too small " +
    "for a module is left behind; the pair never overlaps or drifts)."
);

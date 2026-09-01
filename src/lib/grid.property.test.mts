// Property-based tests for grid.ts — the invariants that must hold for
// EVERY layout, not just the specific arrangements grid.test.mts pins.
//
// Why both files exist. grid.test.mts encodes real bugs as regressions:
// concrete inputs, concrete expected numbers, one case per bug found. That
// catches those bugs again but says nothing about the cases nobody thought
// to write down. This file states the rules the layout engine must never
// break and lets fast-check search for a counterexample, then shrink it to
// the smallest one — which is most of the value, since a failure over
// thirty random rectangles is unreadable and the same failure over two is
// obvious.
//
// These invariants are also deliberately written to SURVIVE the coordinate
// migration (gap to zero, 4x30 to 24x36, integer dot units). They describe
// relationships, not magnitudes, so they should still pass afterwards —
// which is what makes them the safety net that migration runs under. If
// one starts failing during it, the change altered semantics, not units.
//
// Run with: npx tsx src/lib/grid.property.test.mts
import fc from "fast-check";
import {
  gridCellToPixels,
  pixelsToGridCell,
  rectsOverlap,
  findNearestFreeCell,
  resolveModulePlacement,
  packStackFromTop,
  gravityRepackAfterDeparture,
  type PageGrid,
  type GridRect,
} from "./grid";

let failures = 0;

function check(name: string, property: fc.IProperty<unknown>, runs = 500) {
  try {
    fc.assert(property, { numRuns: runs });
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures++;
    console.error(`  FAIL  ${name}`);
    console.error(String(error).split("\n").slice(0, 12).join("\n"));
  }
}

// The real page geometry, plus room to vary it — a property that only
// holds at 4x30 is not a property.
const pageArb: fc.Arbitrary<PageGrid> = fc.record({
  widthPx: fc.constant(2175),
  heightPx: fc.constant(3075),
  gridColumns: fc.integer({ min: 1, max: 8 }),
  gridRows: fc.integer({ min: 4, max: 36 }),
  gridGapPx: fc.constantFrom(0, 12),
  marginPx: fc.constantFrom(0, 37.5),
});

type Member = { id: string; locked: boolean } & GridRect;

// A column stack: modules packed contiguously from `top` in one column,
// which is the shape this engine actually deals in. Generating free-form
// rectangles would mostly produce overlapping garbage and test nothing.
function stackArb(page: PageGrid, columnStart: number): fc.Arbitrary<Member[]> {
  return fc
    .array(fc.record({ rowSpan: fc.integer({ min: 1, max: 6 }), locked: fc.boolean() }), {
      minLength: 1,
      maxLength: 5,
    })
    .map((specs) => {
      const out: Member[] = [];
      let cursor = 0;
      for (let i = 0; i < specs.length; i++) {
        if (cursor + specs[i].rowSpan > page.gridRows) break;
        out.push({
          id: `m${columnStart}_${i}`,
          locked: specs[i].locked,
          columnStart,
          rowStart: cursor,
          columnSpan: 1,
          rowSpan: specs[i].rowSpan,
        });
        cursor += specs[i].rowSpan;
      }
      return out;
    });
}

const sceneArb = pageArb.chain((page) =>
  stackArb(page, 0).chain((others) =>
    fc
      .record({
        rowStart: fc.integer({ min: -3, max: page.gridRows + 3 }),
        rowSpan: fc.integer({ min: 1, max: Math.max(1, Math.min(6, page.gridRows)) }),
      })
      .map((c) => ({
        page,
        others,
        candidate: { columnStart: 0, rowStart: c.rowStart, columnSpan: 1, rowSpan: c.rowSpan } as GridRect,
      }))
  )
);

function anyOverlap(rects: GridRect[]): [number, number] | null {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectsOverlap(rects[i], rects[j])) return [i, j];
    }
  }
  return null;
}

function inBounds(page: PageGrid, r: GridRect): boolean {
  return (
    r.columnStart >= 0 &&
    r.rowStart >= 0 &&
    r.columnStart + r.columnSpan <= page.gridColumns &&
    r.rowStart + r.rowSpan <= page.gridRows
  );
}

/** The layout resolveModulePlacement actually produces: the dragged module
 *  at its resolved placement, plus every other module with its reflow
 *  applied. Reconstructing this in one place keeps every property below
 *  arguing about the same thing. */
// resolveModulePlacement returns only { columnStart, rowStart } — the spans
// are the caller's, unchanged. Rebuilding the full rect here rather than at
// each call site: the first version of this file treated the return value
// as a whole rect, so every bounds and overlap check was comparing against
// an undefined span and silently passing NaN around.
function placedRect(candidate: GridRect, placement: { columnStart: number; rowStart: number }): GridRect {
  return { ...candidate, columnStart: placement.columnStart, rowStart: placement.rowStart };
}

function finalLayout(
  others: Member[],
  placement: GridRect,
  reflow: Array<{ id: string; rowStart: number; rowSpan?: number }>
): GridRect[] {
  const moved = new Map(reflow.map((m) => [m.id, m]));
  const out: GridRect[] = [placement];
  for (const o of others) {
    const m = moved.get(o.id);
    out.push(m ? { ...o, rowStart: m.rowStart, rowSpan: m.rowSpan ?? o.rowSpan } : o);
  }
  return out;
}

console.log("grid.ts properties");

// --- the coordinate system itself ------------------------------------------

check(
  "gridCellToPixels -> pixelsToGridCell round-trips",
  fc.property(
    pageArb.chain((page) =>
      fc
        .record({
          columnStart: fc.integer({ min: 0, max: page.gridColumns - 1 }),
          rowStart: fc.integer({ min: 0, max: page.gridRows - 1 }),
        })
        .map((cell) => ({ page, cell }))
    ),
    ({ page, cell }) => {
      const px = gridCellToPixels(page, { ...cell, columnSpan: 1, rowSpan: 1 });
      const back = pixelsToGridCell(page, { x: px.x, y: px.y });
      return back.columnStart === cell.columnStart && back.rowStart === cell.rowStart;
    }
  )
);

check(
  "a row's height is the same wherever it sits on the page",
  fc.property(
    pageArb.chain((page) =>
      fc
        .tuple(
          fc.integer({ min: 0, max: page.gridRows - 1 }),
          fc.integer({ min: 0, max: page.gridRows - 1 })
        )
        .map(([a, b]) => ({ page, a, b }))
    ),
    ({ page, a, b }) => {
      const ha = gridCellToPixels(page, { columnStart: 0, rowStart: a, columnSpan: 1, rowSpan: 1 }).height;
      const hb = gridCellToPixels(page, { columnStart: 0, rowStart: b, columnSpan: 1, rowSpan: 1 }).height;
      return Math.abs(ha - hb) < 1e-9;
    }
  )
);

// The gap-versus-pitch confusion that put the printed hour rules off the
// dot lattice and rendered the stack resize handle 12px low. Stated as a
// property so it cannot come back silently: the bottom of row N and the
// top of row N+1 are the same line only when there is no gap.
check(
  "row N's bottom and row N+1's top differ by exactly gridGapPx",
  fc.property(
    pageArb.chain((page) =>
      fc.integer({ min: 0, max: Math.max(0, page.gridRows - 2) }).map((row) => ({ page, row }))
    ),
    ({ page, row }) => {
      const a = gridCellToPixels(page, { columnStart: 0, rowStart: row, columnSpan: 1, rowSpan: 1 });
      const b = gridCellToPixels(page, { columnStart: 0, rowStart: row + 1, columnSpan: 1, rowSpan: 1 });
      return Math.abs(b.y - (a.y + a.height) - page.gridGapPx) < 1e-9;
    }
  )
);

// --- resolveModulePlacement ------------------------------------------------

check(
  "resolved placement is always inside the grid",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const r = resolveModulePlacement(page, candidate, others);
    return inBounds(page, placedRect(candidate, r.placement));
  })
);

check(
  "the resolved layout never overlaps, whenever the content actually fits",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    // Precondition, not a weakening: findNearestFreeCell documents that a
    // genuinely full grid gets the clamped (still overlapping) candidate
    // back, because there is nothing better to return. Asserting no-overlap
    // there would be asserting the impossible.
    const needed = candidate.rowSpan + others.reduce((sum, o) => sum + o.rowSpan, 0);
    if (needed > page.gridRows) return true;
    const r = resolveModulePlacement(page, candidate, others);
    return anyOverlap(finalLayout(others, placedRect(candidate, r.placement), r.reflow)) === null;
  })
);

check(
  "reflow never moves a locked module",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const r = resolveModulePlacement(page, candidate, others);
    const lockedIds = new Set(others.filter((o) => o.locked).map((o) => o.id));
    return r.reflow.every((m) => !lockedIds.has(m.id));
  })
);

check(
  "reflow never invents or drops a module",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const r = resolveModulePlacement(page, candidate, others);
    const known = new Set(others.map((o) => o.id));
    return r.reflow.every((m) => known.has(m.id)) && new Set(r.reflow.map((m) => m.id)).size === r.reflow.length;
  })
);

check(
  "every module in the resolved layout stays inside the grid",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const r = resolveModulePlacement(page, candidate, others);
    return finalLayout(others, placedRect(candidate, r.placement), r.reflow).every((rect) =>
      inBounds(page, rect)
    );
  })
);

// Idempotence: dropping a module exactly where it was just resolved to
// should be a no-op. If this fails, a drag that changes nothing still
// rewrites the page — and the second result is the one that ships.
// KNOWN FAILURE, and the reason this file is not yet wired into `npm test`.
// The stack-reorder path gathers all unlocked same-column siblings and
// repacks them as one contiguous run, ignoring locked blocks between them:
// dropping a 1-row module at row 12 of
//   m0_0 0-3 unlocked | LOCKED 4-7 | LOCKED 8-10 | LOCKED 11 | m0_4 12-17
// returns placement row 4 and moves m0_4 to row 5, both inside the locked
// blocks, while rows 18-25 sit empty. Locked modules are never *moved* (that
// property passes) - they are laid on top of.
check(
  "resolving an already-resolved placement moves nothing further",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const first = resolveModulePlacement(page, candidate, others);
    const firstRect = placedRect(candidate, first.placement);
    const settled = finalLayout(others, firstRect, first.reflow);
    const settledOthers: Member[] = others.map((o, i) => ({ ...o, ...settled[i + 1] }));
    const second = resolveModulePlacement(page, firstRect, settledOthers);
    return (
      second.placement.rowStart === first.placement.rowStart &&
      second.placement.columnStart === first.placement.columnStart
    );
  })
);

// --- packStackFromTop ------------------------------------------------------

check(
  "packing is confluent: input order does not change the result",
  fc.property(
    fc
      .array(fc.record({ id: fc.string({ minLength: 1, maxLength: 3 }), rowSpan: fc.integer({ min: 1, max: 6 }) }), {
        minLength: 1,
        maxLength: 6,
      })
      .filter((ms) => new Set(ms.map((m) => m.id)).size === ms.length)
      .chain((ms) =>
        fc.tuple(fc.constant(ms), fc.shuffledSubarray(ms, { minLength: ms.length, maxLength: ms.length }))
      ),
    ([ordered, shuffled]) => {
      const withRows = (list: typeof ordered) => {
        let cursor = 0;
        return list.map((m) => {
          const out = { id: m.id, rowStart: cursor, rowSpan: m.rowSpan };
          cursor += m.rowSpan;
          return out;
        });
      };
      const base = withRows(ordered);
      const byId = new Map(base.map((m) => [m.id, m]));
      const permuted = shuffled.map((m) => byId.get(m.id)!);
      const a = packStackFromTop(0, base);
      const b = packStackFromTop(0, permuted);
      const norm = (moves: Array<{ id: string; rowStart: number }>) =>
        JSON.stringify([...moves].sort((x, y) => x.id.localeCompare(y.id)));
      return norm(a) === norm(b);
    }
  )
);

check(
  "packing leaves the stack contiguous from the top",
  fc.property(
    fc.integer({ min: 0, max: 10 }),
    fc.array(fc.record({ id: fc.string({ minLength: 1, maxLength: 3 }), rowStart: fc.integer({ min: 0, max: 30 }), rowSpan: fc.integer({ min: 1, max: 6 }) }), { minLength: 1, maxLength: 6 })
      .filter((ms) => new Set(ms.map((m) => m.id)).size === ms.length),
    (top, members) => {
      const moves = new Map(packStackFromTop(top, members).map((m) => [m.id, m.rowStart]));
      const settled = [...members]
        .sort((a, b) => a.rowStart - b.rowStart)
        .map((m) => ({ ...m, rowStart: moves.get(m.id) ?? m.rowStart }));
      let cursor = top;
      for (const m of settled) {
        if (m.rowStart !== cursor) return false;
        cursor += m.rowSpan;
      }
      return true;
    }
  )
);

check(
  "packing an already-packed stack produces no moves",
  fc.property(
    fc.integer({ min: 0, max: 10 }),
    fc.array(fc.record({ id: fc.string({ minLength: 1, maxLength: 3 }), rowSpan: fc.integer({ min: 1, max: 6 }) }), { minLength: 1, maxLength: 6 })
      .filter((ms) => new Set(ms.map((m) => m.id)).size === ms.length),
    (top, specs) => {
      let cursor = top;
      const packed = specs.map((s) => {
        const out = { id: s.id, rowStart: cursor, rowSpan: s.rowSpan };
        cursor += s.rowSpan;
        return out;
      });
      return packStackFromTop(top, packed).length === 0;
    }
  )
);

// --- gravity ---------------------------------------------------------------

check(
  "gravity leaves the stack contiguous and no taller than it was",
  fc.property(sceneArb, ({ others }) => {
    if (others.length < 2) return true;
    const departing = others[others.length - 1];
    const remaining = others.filter((o) => o.id !== departing.id && !o.locked);
    if (remaining.length === 0) return true;
    const moves = new Map(
      gravityRepackAfterDeparture(departing, others.filter((o) => o.id !== departing.id)).map((m) => [m.id, m])
    );
    const settled = remaining
      .map((o) => {
        const m = moves.get(o.id);
        return m ? { ...o, rowStart: m.rowStart, rowSpan: m.rowSpan ?? o.rowSpan } : o;
      })
      .sort((a, b) => a.rowStart - b.rowStart);
    const originalBottom = Math.max(...others.map((o) => o.rowStart + o.rowSpan));
    // Not contiguity across every unlocked module: a locked block between
    // two of them legitimately splits one column into two independent
    // stacks, and gravity only ever repacks the stack the departing module
    // belonged to. What must hold is that nothing collides and nothing
    // grows past where the stack already ended.
    if (anyOverlap(settled) !== null) return false;
    return settled.every((m) => m.rowStart + m.rowSpan <= originalBottom);
  })
);

// --- findNearestFreeCell ---------------------------------------------------

check(
  "findNearestFreeCell returns an in-bounds cell",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const r = findNearestFreeCell(page, candidate, others);
    return inBounds(page, placedRect(candidate, r));
  })
);

check(
  "findNearestFreeCell returns a free cell whenever one exists",
  fc.property(sceneArb, ({ page, others, candidate }) => {
    const r = findNearestFreeCell(page, candidate, others);
    const chosen = placedRect(candidate, r);
    if (!others.some((o) => rectsOverlap(chosen, o))) return true;
    // It returned an overlapping cell — legal ONLY if the grid genuinely
    // has nowhere to put this span.
    for (let c = 0; c <= page.gridColumns - candidate.columnSpan; c++) {
      for (let row = 0; row <= page.gridRows - candidate.rowSpan; row++) {
        const test = { ...candidate, columnStart: c, rowStart: row };
        if (!others.some((o) => rectsOverlap(test, o))) return false;
      }
    }
    return true;
  })
);

if (failures > 0) {
  console.error(`\n${failures} property/properties failed.`);
  process.exit(1);
}
console.log("\nAll grid.ts properties held.");

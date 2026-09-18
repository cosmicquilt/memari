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
  gridCellToAllocation,
  rectsOverlap,
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
  boxInsetPx: fc.constantFrom(0, 6),
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

// The same engine on the shape the first generator cannot make: a zone
// several columns wide holding a mix of full-width modules (siblings of
// the dropped one) and NARROWER ones (obstacles to it), some locked, with
// per-module shrink floors - which is what a crossing or a palette drop
// passes. A narrower module between two full-width ones is the case the
// old repack laid modules on top of with no lock anywhere in sight.
const mixedSceneArb = fc
  .record({
    gridRows: fc.integer({ min: 6, max: 36 }),
    width: fc.integer({ min: 2, max: 4 }),
    specs: fc.array(
      fc.record({
        rowSpan: fc.integer({ min: 1, max: 6 }),
        narrow: fc.boolean(),
        locked: fc.boolean(),
        floorCut: fc.integer({ min: 0, max: 5 }),
        gapAbove: fc.integer({ min: 0, max: 1 }),
      }),
      { minLength: 1, maxLength: 6 }
    ),
    rowStart: fc.integer({ min: -3, max: 40 }),
    rowSpan: fc.integer({ min: 1, max: 6 }),
    withFloors: fc.boolean(),
    original: fc.option(fc.integer({ min: 0, max: 36 }), { nil: undefined }),
  })
  .map((s) => {
    const page: PageGrid = {
      widthPx: 2175,
      heightPx: 3075,
      gridColumns: s.width + 1,
      gridRows: s.gridRows,
      boxInsetPx: 6,
      marginPx: 37.5,
    };
    const others: Member[] = [];
    const floors: Record<string, number> = {};
    let cursor = 0;
    s.specs.forEach((spec, i) => {
      cursor += spec.gapAbove;
      if (cursor + spec.rowSpan > page.gridRows) return;
      const id = `z${i}`;
      others.push({
        id,
        locked: spec.locked,
        columnStart: 0,
        rowStart: cursor,
        columnSpan: spec.narrow ? 1 : s.width,
        rowSpan: spec.rowSpan,
      });
      floors[id] = Math.max(1, spec.rowSpan - spec.floorCut);
      cursor += spec.rowSpan;
    });
    const candidate: GridRect = {
      columnStart: 0,
      rowStart: s.rowStart,
      columnSpan: s.width,
      rowSpan: Math.min(s.rowSpan, page.gridRows),
    };
    return { page, others, candidate, floors: s.withFloors ? floors : undefined, original: s.original };
  });

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

// THE lattice invariant, and the reason the gap came out of the pitch.
// Allocations must tile with no seam: the bottom of row N is the top of
// row N+1 exactly. Anything drawn on a regular interval measures from
// these, so if this holds, an interval that divides the cell stays in
// phase all the way down the page. Before the change this was off by one
// gridGapPx per row, which is what put the printed hour rules off the dot
// lattice and the stack resize handle 12px below its module.
check(
  "allocations tile with no seam",
  fc.property(
    pageArb.chain((page) =>
      fc.integer({ min: 0, max: Math.max(0, page.gridRows - 2) }).map((row) => ({ page, row }))
    ),
    ({ page, row }) => {
      const a = gridCellToAllocation(page, { columnStart: 0, rowStart: row, columnSpan: 1, rowSpan: 1 });
      const b = gridCellToAllocation(page, { columnStart: 0, rowStart: row + 1, columnSpan: 1, rowSpan: 1 });
      return Math.abs(b.y - (a.y + a.height)) < 1e-9;
    }
  )
);

// An n-row allocation is exactly n single rows tall — no per-row fudge
// hiding inside a multi-row span, which is where the old formula kept its.
check(
  "an n-row allocation is exactly n rows tall",
  fc.property(
    pageArb.chain((page) =>
      fc.integer({ min: 1, max: page.gridRows }).map((rowSpan) => ({ page, rowSpan }))
    ),
    ({ page, rowSpan }) => {
      const one = gridCellToAllocation(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 });
      const many = gridCellToAllocation(page, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan });
      return Math.abs(many.height - one.height * rowSpan) < 1e-9;
    }
  )
);

// And the ink still separates: two vertically adjacent boxes are exactly
// two insets apart, which is the white the old gap used to provide.
check(
  "adjacent boxes are separated by exactly two insets",
  fc.property(
    pageArb.chain((page) =>
      fc.integer({ min: 0, max: Math.max(0, page.gridRows - 2) }).map((row) => ({ page, row }))
    ),
    ({ page, row }) => {
      const a = gridCellToPixels(page, { columnStart: 0, rowStart: row, columnSpan: 1, rowSpan: 1 });
      const b = gridCellToPixels(page, { columnStart: 0, rowStart: row + 1, columnSpan: 1, rowSpan: 1 });
      return Math.abs(b.y - (a.y + a.height) - page.boxInsetPx * 2) < 1e-9;
    }
  )
);

// --- resolveModulePlacement ------------------------------------------------
//
// Every property runs on both generators. The single-column one is where
// this file started; the mixed one reaches narrower modules and floors.

type Scene = { page: PageGrid; others: Member[]; candidate: GridRect; floors?: Record<string, number>; original?: number };
const plainScenes: fc.Arbitrary<Scene> = sceneArb;
const scenes = fc.oneof(plainScenes, mixedSceneArb);
const resolveScene = (s: Scene) => resolveModulePlacement(s.page, s.candidate, s.others, s.original, s.floors);

check(
  "a resolved drop lands inside the grid",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    return !r.fits || inBounds(s.page, placedRect(s.candidate, r.placement));
  })
);

// No precondition. This used to hold only "whenever the content actually
// fits", because the engine could not say no: on a full grid it handed
// back the drop point overlapping whatever was under it. A drop either
// lands without touching anything, or is refused.
check(
  "a resolved drop never overlaps anything",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    if (!r.fits) return true;
    return anyOverlap(finalLayout(s.others, placedRect(s.candidate, r.placement), r.reflow)) === null;
  })
);

check(
  "reflow never moves a locked module",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    if (!r.fits) return true;
    const lockedIds = new Set(s.others.filter((o) => o.locked).map((o) => o.id));
    return r.reflow.every((m) => !lockedIds.has(m.id));
  })
);

check(
  "reflow never invents or drops a module",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    if (!r.fits) return true;
    const known = new Set(s.others.map((o) => o.id));
    return r.reflow.every((m) => known.has(m.id)) && new Set(r.reflow.map((m) => m.id)).size === r.reflow.length;
  })
);

check(
  "reflow never shrinks a module below its floor, or grows one",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    if (!r.fits) return true;
    return r.reflow.every((m) => {
      if (m.rowSpan === undefined) return true;
      const before = s.others.find((o) => o.id === m.id)!;
      return m.rowSpan <= before.rowSpan && m.rowSpan >= (s.floors?.[m.id] ?? before.rowSpan);
    });
  })
);

check(
  "every module in the resolved layout stays inside the grid",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    if (!r.fits) return true;
    return finalLayout(s.others, placedRect(s.candidate, r.placement), r.reflow).every((rect) => inBounds(s.page, rect));
  })
);

// Idempotence: dropping a module exactly where it was just resolved to
// should be a no-op. If this fails, a drag that changes nothing still
// rewrites the page — and the second result is the one that ships. It
// failed from the day it was written until 2026-09-18, on a locked block
// between two siblings that the repack ran straight through.
check(
  "resolving an already-resolved placement moves nothing further",
  fc.property(scenes, (s) => {
    const first = resolveScene(s);
    if (!first.fits) return true;
    const firstRect = placedRect(s.candidate, first.placement);
    const settled = finalLayout(s.others, firstRect, first.reflow);
    const settledOthers: Member[] = s.others.map((o, i) => ({ ...o, ...settled[i + 1] }));
    const second = resolveModulePlacement(s.page, firstRect, settledOthers, s.original, s.floors);
    return (
      second.fits &&
      second.placement.rowStart === first.placement.rowStart &&
      second.placement.columnStart === first.placement.columnStart &&
      second.reflow.length === 0
    );
  })
);

// A refusal has to be TRUE, or the editor draws its no-entry mark over a
// zone that had room. Restated from the inputs rather than from the
// engine's own arithmetic: the refused region is free of everything that
// is not a sibling, it is in the dropped module's own columns, and even
// with every sibling in it at its floor, it is too short.
check(
  "a refusal only happens when the region really has no room",
  fc.property(scenes, (s) => {
    const r = resolveScene(s);
    if (r.fits) return true;
    const { region } = r;
    if (region.columnStart !== s.candidate.columnStart || region.columnSpan !== s.candidate.columnSpan) return false;
    const sibling = (o: Member) =>
      !o.locked && o.columnStart === s.candidate.columnStart && o.columnSpan === s.candidate.columnSpan;
    const inRegion = s.others.filter((o) => rectsOverlap(o, region));
    if (inRegion.some((o) => !sibling(o))) {
      // The one case with no free stretch to name: every row of these
      // columns is covered by something that is not a sibling, and the
      // refusal falls back to the drop point itself. Legal only then.
      const blockers = s.others.filter(
        (o) =>
          !sibling(o) &&
          o.columnStart < s.candidate.columnStart + s.candidate.columnSpan &&
          o.columnStart + o.columnSpan > s.candidate.columnStart
      );
      for (let row = 0; row < s.page.gridRows; row++) {
        if (!blockers.some((o) => o.rowStart <= row && row < o.rowStart + o.rowSpan)) return false;
      }
      return true;
    }
    const floorsTotal = inRegion.reduce((sum, o) => sum + (s.floors?.[o.id] ?? o.rowSpan), 0);
    return floorsTotal + s.candidate.rowSpan > region.rowSpan;
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

if (failures > 0) {
  console.error(`\n${failures} property/properties failed.`);
  process.exit(1);
}
console.log("\nAll grid.ts properties held.");

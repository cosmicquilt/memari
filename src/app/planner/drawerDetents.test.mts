// The drawer's detents, and the one thing that must not depend on their
// heights.
//
// `2598cc1` added a compact detent BELOW resting, and three separate pieces
// of this component assumed resting was the shortest open state:
//
//   1. expandedHeight became reachable on the server, so every /app/j/<id>
//      threw `window is not defined` and 500'd on production while still
//      LOOKING fine (1b5d265, and check:routes exists because of it);
//   2. the card height floor (fixed in the same commit that added compact);
//   3. the TAB's own width, reported by Andrew as "at the smallest drawer
//      size the tab shrinks maybe like 20% when it shouldn't".
//
// The third was `openness`, interpolating the detent's height from closed to
// RESTING. Compact landed at 0.7215 of the way, so the tab drew at 950px of
// a 1280px window - 25.8% narrower - and kept 2.8px of the corner radius
// that belongs to a closed tab.
//
// So this does NOT check that the denominator is right. A corrected
// denominator breaks again the next time a detent is added underneath. It
// checks that the tab's shape is not a function of height at all.
//
//   npx tsx src/app/planner/drawerDetents.test.mts

import {
  DRAWER_DETENTS,
  DRAWER_CLOSED_HEIGHT,
  DRAWER_COMPACT_HEIGHT,
  DRAWER_RESTING_HEIGHT,
  tabOpenness,
  type DrawerDetent,
} from "./TimelineDrawer";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
};

// --- Every open detent is EQUALLY open -------------------------------------
//
// Stated over the whole list rather than over the three that exist today, so
// a detent added later is covered the moment it is added to DRAWER_DETENTS.
for (const detent of DRAWER_DETENTS) {
  const openness = tabOpenness(detent);
  if (detent === "closed") {
    check(openness === 0, `closed must be a tab, got openness ${openness}`);
  } else {
    check(
      openness === 1,
      `"${detent}" is an open detent and must be a full-width edge, got openness ${openness}` +
        ` (a tab at ${Math.round(100 * (96 + openness * (1280 - 96)) / 1280)}% of a 1280px window)`
    );
  }
}

// --- And it does not read a height -----------------------------------------
//
// The regression case as a NUMBER: compact sits between closed and resting,
// so anything interpolating against resting gives it a fraction. If
// tabOpenness ever starts consulting a height again, this is the case that
// catches it first - but only while compact really does sit in between, so
// that is asserted rather than assumed.
check(
  DRAWER_CLOSED_HEIGHT < DRAWER_COMPACT_HEIGHT && DRAWER_COMPACT_HEIGHT < DRAWER_RESTING_HEIGHT,
  `compact (${DRAWER_COMPACT_HEIGHT}) must sit between closed (${DRAWER_CLOSED_HEIGHT}) and ` +
    `resting (${DRAWER_RESTING_HEIGHT}), or this test is checking nothing`
);
const wouldBe =
  (DRAWER_COMPACT_HEIGHT - DRAWER_CLOSED_HEIGHT) / (DRAWER_RESTING_HEIGHT - DRAWER_CLOSED_HEIGHT);
check(
  wouldBe < 0.95,
  `this test needs the old arithmetic to give compact a visibly wrong answer; it gives ${wouldBe.toFixed(4)}`
);
check(
  (tabOpenness("compact") as number) !== wouldBe,
  `compact's openness is the interpolated ${wouldBe.toFixed(4)} - a height is back in it`
);

// --- The list is ordered, shortest first -----------------------------------
//
// Only the three heights that are constants; middle and expanded are
// functions of the window. Nothing reads the list's ORDER today - the snap
// loop takes a minimum - but it is written shortest-first and a future reader
// will assume it.
const staticHeights: Partial<Record<DrawerDetent, number>> = {
  closed: DRAWER_CLOSED_HEIGHT,
  compact: DRAWER_COMPACT_HEIGHT,
  resting: DRAWER_RESTING_HEIGHT,
};
const ordered = DRAWER_DETENTS.filter((d) => staticHeights[d] !== undefined);
for (let i = 1; i < ordered.length; i++) {
  const previous = staticHeights[ordered[i - 1]]!;
  const current = staticHeights[ordered[i]]!;
  check(
    previous < current,
    `DRAWER_DETENTS is meant to run shortest first, but "${ordered[i - 1]}" (${previous}) ` +
      `is not below "${ordered[i]}" (${current})`
  );
}

// --- One list, not two -----------------------------------------------------
check(DRAWER_DETENTS.length === 5, `expected 5 detents, found ${DRAWER_DETENTS.length}`);
check(new Set(DRAWER_DETENTS).size === DRAWER_DETENTS.length, "DRAWER_DETENTS has a duplicate");

if (failures > 0) {
  console.error(`\nDrawer detents: ${failures} problem(s).`);
  process.exit(1);
}

console.log(
  `All drawer detent checks passed (${DRAWER_DETENTS.length} detents; every open one is a ` +
    `full-width edge, and the tab's shape reads no height - compact would interpolate to ` +
    `${wouldBe.toFixed(4)}).`
);

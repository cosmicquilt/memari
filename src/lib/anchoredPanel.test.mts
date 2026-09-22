// The anchored panel lands on screen. That is the whole rule, and it is
// stated as a property of the RECTANGLE rather than of the CSS, because the
// two ways this panel has already failed both produced correct-looking CSS.
//
// First it was clipped by a scroll container. Then it was positioned off the
// top of the window: `bottom` was `innerHeight - rect.top + 10` with no
// clamp, so a control near the top of the viewport put the panel's bottom
// edge above the viewport's top edge and nothing showed at all. The symptom
// both times was a control that does nothing when clicked - which is exactly
// what was reported on memari.studio, and is a symptom with no error and no
// console message behind it.
//
// So: every anchor position, at every plausible window size, must produce a
// panel wholly inside the viewport.

import {
  placeAnchoredPanel,
  panelRect,
  PANEL_EDGE_GAP,
  PANEL_MAX_HEIGHT,
} from "./anchoredPanel";

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

const PANEL_WIDTH = 268;

/** Windows worth caring about: a laptop, a short laptop, a small window, and
 *  one narrower than the panel itself. */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 620 },
  { width: 1024, height: 768 },
  { width: 900, height: 420 },
  { width: 240, height: 500 },
];

/** A cog is 20px tall, and sits anywhere from the top of the window to the
 *  bottom - the timeline's cogs ride up with the drawer as it is dragged. */
const COG_HEIGHT = 20;

let checked = 0;
let flipped = 0;
let capped = 0;

for (const viewport of VIEWPORTS) {
  for (let top = 0; top + COG_HEIGHT <= viewport.height; top += 4) {
    for (const right of [PANEL_WIDTH + 40, viewport.width - 4, Math.round(viewport.width / 2)]) {
      const anchor = { top, bottom: top + COG_HEIGHT, right };
      const placement = placeAnchoredPanel(anchor, viewport, PANEL_WIDTH);
      checked++;
      if (placement.place === "below") flipped++;
      if (placement.maxHeight < PANEL_MAX_HEIGHT) capped++;

      const where = `${viewport.width}x${viewport.height} cog top ${top} right ${right}`;

      // THE RULE. Content taller than the cap is the case that matters: a
      // list of 52 weeks always is.
      for (const contentHeight of [PANEL_MAX_HEIGHT, PANEL_MAX_HEIGHT * 3, 40]) {
        const rect = panelRect(placement, viewport, PANEL_WIDTH, contentHeight);
        if (rect.top < 0) fail(`${where}: panel top ${rect.top.toFixed(1)} is above the window`);
        if (rect.bottom > viewport.height) {
          fail(`${where}: panel bottom ${rect.bottom.toFixed(1)} is below the window (${viewport.height})`);
        }
        if (rect.left < 0) fail(`${where}: panel left ${rect.left.toFixed(1)} is off the left edge`);
        // A window narrower than the panel cannot hold it; the panel is
        // pinned to the left gap and overhangs, which is the best available
        // and is what the horizontal clamp already did.
        if (viewport.width >= PANEL_WIDTH + PANEL_EDGE_GAP * 2 && rect.right > viewport.width) {
          fail(`${where}: panel right ${rect.right.toFixed(1)} is off the right edge (${viewport.width})`);
        }
      }

      // AND IT MUST BE BIG ENOUGH TO USE. A panel clamped on screen at two
      // pixels tall is on screen and still does nothing. Half the window,
      // less the gaps, is always available on one side or the other.
      const bestPossible = Math.max(
        anchor.top - PANEL_EDGE_GAP,
        viewport.height - anchor.bottom - PANEL_EDGE_GAP
      );
      if (bestPossible >= 60 && placement.maxHeight < 40) {
        fail(
          `${where}: panel capped at ${placement.maxHeight}px though ${bestPossible}px was available on one side`
        );
      }
    }
  }
}

// The corpus has to exercise both branches, or "it always fits" is a claim
// about one of them.
if (flipped === 0) fail("no anchor position flipped the panel below the control - the flip is untested");
if (capped === 0) fail("no anchor position capped the panel's height - the cap is untested");

// THE ORDINARY CASE IS UNCHANGED. A cog in a resting drawer near the bottom
// of a laptop window opens upward at full height, exactly as before.
{
  const viewport = { width: 1440, height: 900 };
  const anchor = { top: 770, bottom: 790, right: 600 };
  const placement = placeAnchoredPanel(anchor, viewport, PANEL_WIDTH);
  if (placement.place !== "above") fail("a cog near the bottom no longer opens upward");
  if (placement.maxHeight !== PANEL_MAX_HEIGHT) {
    fail(`a cog with room above was capped at ${placement.maxHeight}, expected ${PANEL_MAX_HEIGHT}`);
  }
  // The old formula, kept here as the thing that must still hold when there
  // is room: bottom = innerHeight - rect.top + 10.
  if (placement.offset !== viewport.height - anchor.top + 10) {
    fail("the upward offset changed for a cog that had room all along");
  }
}

// THE BUG, NAMED. A cog at the very top of the window - the drawer dragged
// to full height - used to put the whole panel above the window.
{
  const viewport = { width: 1280, height: 620 };
  const anchor = { top: 4, bottom: 24, right: 600 };
  const oldBottom = viewport.height - anchor.top + 10; // 626, past the window
  if (oldBottom <= viewport.height) {
    fail("the regression case no longer reproduces the old formula's own arithmetic");
  }
  const placement = placeAnchoredPanel(anchor, viewport, PANEL_WIDTH);
  const rect = panelRect(placement, viewport, PANEL_WIDTH, PANEL_MAX_HEIGHT * 3);
  if (placement.place !== "below") fail("a cog at the top of the window did not flip below it");
  if (rect.top < 0 || rect.bottom > viewport.height) {
    fail(`the regression case is still off screen: top ${rect.top}, bottom ${rect.bottom}`);
  }
}

if (failures > 0) {
  console.error(`\nThe anchored panel can leave the window in ${failures} case(s).`);
  process.exit(1);
}

console.log(
  `All anchored panel checks passed (${checked} anchor positions across ${VIEWPORTS.length} window sizes; ` +
    `${flipped} flipped below the control, ${capped} capped to the room available).`
);

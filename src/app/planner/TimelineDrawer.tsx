"use client";

// The book, along the bottom of the editor.
//
// Left to right is BINDING ORDER: front matter, the monthly set, the weekly
// set, the dailies, back matter. Each group holds the pages you design once
// and the finished book is stamped out from - so this row is the whole
// structure of the planner, and clicking a page brings it onto the canvas.
//
// WHAT THIS IS NOT, and the research is the reason. The first design had
// overlapping cards - a macOS Dock stack - whenever a level held more than
// one layout, and a settings cog revealed on hover. Both were measured
// against Apple's own practice and both are wrong:
//
//   - A STACK HIDES N-1 PAGES. The standing requirement is that every page
//     in the planner is reachable from the timeline, and you cannot click a
//     target you cannot see. Reaching the third page of a stack means click,
//     wait for the fan-out, look, click again - which compounds Fitts's Law
//     rather than obeying it. Apple's answer for "a set you must be able to
//     scan" is the FILMSTRIP: Final Cut's browser, the Photos filmstrip,
//     Keynote's slide navigator. All side by side, no expansion step.
//     (A collapsed-stack/expanded-flat compromise fails the same test, since
//     collapsed is the state the drawer is usually in.)
//   - A HOVER-ONLY CONTROL does not exist on a touch screen, is invisible to
//     a screen reader while it is `opacity: 0`, and cannot be reached by
//     keyboard. Apple's substitute is QUIET PERMANENCE: always there, at
//     reduced contrast, saturating on hover.
//
// AND IT OVERLAYS, IT DOES NOT PUSH. Tying the canvas height to the drawer
// height would make every pixel of drag re-scale a two-page spread, which is
// layout thrashing on a canvas this size. The drawer sits above on the z
// axis and the canvas carries a permanent bottom padding instead.
//
// SOLID, NOT FROSTED. A backdrop blur here would be blurring a flat pale
// canvas, which yields no depth for real GPU cost - and a large backdrop
// filter is what gets a WebKit tab killed on an iPad. One 1px top border
// separates it instead.

import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  usePrefersReducedMotion,
  usePrefersHighContrast,
  useIsomorphicLayoutEffect,
} from "./useMediaQuery";
import {
  LEVELS_IN_BINDING_ORDER,
  LEVEL_CADENCE,
  LEVEL_LABELS,
  LEVEL_NOUN,
  inSpreads,
  occurrences,
  repeats,
  type Occurrence,
  type PageLevel,
} from "@/lib/pageLevels";
import type { TimelinePage } from "./loadPlannerPages";
import { useJournalId } from "./journalContext";
import {
  addPageToLevel,
  addSavedPage,
  createLevelVariant,
  deletePageFromLevel,
  deleteLevelVariant,
  replaceWithSavedPage,
  savePagesToSaved,
} from "./actions";
import { useSavedItems, type SavedPageOption } from "./savedContext";
import { SavedThumb } from "./SavedThumb";
import { useAsyncAction } from "./useAsyncAction";
import { PagePreview } from "./PagePreview";
import { placeAnchoredPanel, type PanelPlacement } from "@/lib/anchoredPanel";

// --- geometry, from the spec -----------------------------------------
//
// A thumbnail is the page's own proportion, not a guessed rectangle: 2175 x
// 3075 print px is 1 : 1.4138, so a 72px card is 102px tall. Getting this
// from the page would be better still, but every page in a book shares a
// trim, and the preview's own viewBox already carries the true ratio - this
// only has to reserve the right box for it.
/** The card at rest. Width follows from the ratio rather than being typed
 *  beside it, so the two can never say different things. */
const CARD_HEIGHT = 102;
/** The card at the COMPACT detent - half the resting one, so more of the
 *  book is on screen at once. Derived from CARD_HEIGHT rather than typed
 *  beside it: the two are one decision, and a literal 51 here would go stale
 *  the day the card at rest changes.
 *
 *  Half rather than two thirds because the chrome around the row is 124px
 *  whatever the card is - two thirds moved the drawer by only 41px, which is
 *  not a step anyone would find. */
const CARD_HEIGHT_COMPACT = Math.round(CARD_HEIGHT / 2);
/** A page is 2175 x 3075 print px. The card reserves that same ratio, and
 *  the preview's own viewBox keeps the drawing true inside it. */
const PAGE_RATIO = 2175 / 3075;
const CARD_GAP = 8;
/** The line between the pages of a spread, which is ONE card - see
 *  PageCardInner. One CSS pixel of Apple's light-mode separator grey, laid
 *  BETWEEN the two previews rather than over either, so each page keeps
 *  its own proportions. */
const SPREAD_SEAM_PX = 1;
const SPREAD_SEAM_COLOR = "#c6c6c8";

/**
 * THE ACTIVE SET IS BIGGER, and a hovered one grows toward it. Asked for,
 * 2026-09-18: "increase the size of the active page/spread and for hovering
 * over the other page preview can you un grey them and animate them larger
 * on hover and back small on hover off".
 *
 * Active: 1.2x, and it takes that room in the row - its neighbours move
 * aside rather than being overlapped, since it stays that size for as long
 * as it is open. Every row reserves the active height, so the boxes all
 * stay one height whichever level is open.
 *
 * Hovered (or keyboard-focused): 1.1x, and it PUSHES ITS NEIGHBOURS ASIDE
 * - "shift the other items like adjacent pages and add page button out the
 * way while all of them stay center within container". The card grows
 * about its own centre, what is left of it moves left by half the growth,
 * what is right of it moves right by half, and the level's box does not
 * change size, so the other levels and the rules between them stay still.
 * 1.1 keeps the active set the largest thing in the row.
 *
 * Both are REAL SIZE CHANGES, not transforms. A scaled canvas is a
 * stretched bitmap, soft and with thickened hairlines; resized, it redraws
 * itself crisp at every frame through the same ResizeObserver a drawer drag
 * uses.
 */
const ACTIVE_SCALE = 1.2;
/** The default set's name in LevelGroup's lift state. Variant keys are
 *  occurrence keys like "2026-02", never this. */
const DEFAULT_SET_KEY = "default";
const HOVER_SCALE = 1.1;
/** Quick, as a hover has to be, on the drawer's own curve. */
const HOVER_MS = 220;
/** How tall every row of cards is: room for the active set. */
const CARD_ROW_HEIGHT = `calc(${ACTIVE_SCALE} * var(--memari-card-h))`;

// A NOTE ON WHAT NOT TO DO HERE, because it was tried and reverted.
//
// The previews were briefly laid out at a fixed 420px and scaled to fit with
// a transform, on the theory that rasterising once and compositing is cheaper
// than re-rasterising each frame - and that scaling DOWN is safe because only
// scaling up looks soft.
//
// That last part is true of photographs and false of this. A page preview is
// almost entirely hairlines, and resampling a hairline to a fraction of its
// size does not thin it, it drops it: "the lines look like they are varying
// in size/disappearing as i resize". An <svg> asked for a size draws crisp
// lines at that size; a bitmap of one, shrunk, cannot.
//
// It did not help the frame rate either, which was the tell that the cost was
// somewhere else entirely - see where the custom properties are written.
/**
 * EACH LEVEL IS A BOX, since 2026-09-18: "make each level contained in a
 * thin a bit lighter grey than the timeline background itself rounded
 * rectangle border", the level's name centred along the bottom inside it
 * and the cog in its top-right corner. Its padding and the gap between
 * boxes are GROUP_PAD_TOP, GROUP_PAD_X and GROUP_GAP, further down: they
 * are derived from the band under the cards.
 */
const GROUP_BORDER_PX = 1;
/** A bit lighter than SURFACE (#2a2a2a) - white at 10% over it. */
const GROUP_BORDER = "#3f3f3f";
/** Below the level's name. */
const GROUP_PAD_BOTTOM = 6;
/** Typed, not derived from the padding. It was concentric with the cards -
 *  their 3px corner plus the padding plus the border, 12px - until the
 *  padding grew to 39, where the same rule gives 43: nearly a pill, which
 *  nobody asked for. */
const GROUP_RADIUS = 12;
/** The cog's 24px target sits this far inside the box's top-right corner,
 *  in the band above the cards that centring them leaves - so it needs no
 *  gutter of its own. */
const COG_TARGET = 24;
const COG_INSET = 4;
/** The row's own padding, around the boxes rather than between them. */
const TRACK_PAD_TOP = 8;
const TRACK_PAD_BOTTOM = 8;
/** A column's cards, then its caption. */
const CARD_TO_SUB_LABEL = 4;
/** The level's name: 11px uppercase in a 14px line, 2px under the captions. */
const LEVEL_LABEL_HEIGHT = 14;
const LEVEL_LABEL_GAP = 2;

/** The grabber itself, and the target around it. The visual pill is 36 x 5;
 *  a 5px-high hit area fails WCAG 2.5.8's 24px minimum, so the pill sits
 *  inside a band that takes the events.
 *
 *  The band IS the tab - closed, it is all that is left of the drawer - so
 *  this is also the tab's height, and the height of the open panel's top
 *  edge, which is the tab widened. 28px since 2026-09-18, asked for as "a
 *  bit taller"; it was 22, which was below that 24px minimum. */
const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 5;
const GRABBER_BAND = 28;

/** The caption under a column: which occurrence it is, or "every month" for
 *  the default once something sits beside it. Reserved in every column so
 *  the level labels below them stay on one line. */
const SUB_LABEL_HEIGHT = 13;

/** Above the cards: exactly what sits below them - the caption, the level's
 *  name and the padding under it - so the previews are centred top to
 *  bottom inside the border. Asked for, 2026-09-18: "i want the page
 *  previews to look vertically center within the borders". Derived rather
 *  than typed, so it stays centred if any of those change. */
const GROUP_PAD_TOP =
  CARD_TO_SUB_LABEL + SUB_LABEL_HEIGHT + LEVEL_LABEL_GAP + LEVEL_LABEL_HEIGHT + GROUP_PAD_BOTTOM;

/** Beside the cards, and between two boxes: the same as above and below
 *  them, so each level's previews sit in an even margin all round and the
 *  boxes are spaced at that same rhythm. Asked for, 2026-09-18: "add
 *  similar paddings to the sides as well and between adjacent level
 *  borders". */
const GROUP_PAD_X = GROUP_PAD_TOP;
const GROUP_GAP = GROUP_PAD_TOP;
/** From the screen's edge to the first box, and from the last box to the
 *  row's end: HALF the gap between two boxes. It was 11, from before the
 *  boxes had their 39px, and the first box sat tight against the edge with
 *  far more room on its other side. Andrew was shown matched (39) and half
 *  side by side, 2026-09-21, and chose half. */
const TRACK_PAD_X = GROUP_GAP / 2;
/** A vertical rule in the gap between two boxes, in the border's own grey:
 *  "a vertical line same grey as border between adjacent levels 80% of the
 *  height of the border". Centred both ways - 19px of gap either side of a
 *  1px line, and 10% of the box's height above and below it. */
const LEVEL_DIVIDER_PX = 1;
const LEVEL_DIVIDER_SHARE = 0.8;

/** Everything in the drawer that is not a card, top to bottom: the grabber
 *  band, the row's padding, a box's border and padding, the caption, the
 *  level's name, and the same on the way out. Every term is a constant the
 *  layout itself reads, so this cannot say one height while the row lays
 *  out another - which it did, while the cog sat in the name's row: a 24px
 *  button in a line counted as 14 overflowed the bottom by 10. */
const CHROME_HEIGHT =
  GRABBER_BAND +
  TRACK_PAD_TOP +
  GROUP_BORDER_PX +
  GROUP_PAD_TOP +
  CARD_TO_SUB_LABEL +
  SUB_LABEL_HEIGHT +
  LEVEL_LABEL_GAP +
  LEVEL_LABEL_HEIGHT +
  GROUP_PAD_BOTTOM +
  GROUP_BORDER_PX +
  TRACK_PAD_BOTTOM;

/** Resting height: the chrome plus a row of cards, which is tall enough for
 *  the active set. Computed rather than typed, so changing a card changes
 *  the drawer and the canvas padding together. Rounded UP, so the row never
 *  overruns the drawer by the fraction 102 x 1.2 leaves. */
export const DRAWER_RESTING_HEIGHT = CHROME_HEIGHT + Math.ceil(CARD_HEIGHT * ACTIVE_SCALE);

/** Compact: the same chrome, half the card. Asked for 2026-09-22 - "can we
 *  add one more smaller than the current ones" - and reached by DRAGGING,
 *  like middle and expanded. A click still just closes and reopens, which
 *  is the behaviour to leave alone: "i like it how it is now with click to
 *  close". */
export const DRAWER_COMPACT_HEIGHT =
  CHROME_HEIGHT + Math.ceil(CARD_HEIGHT_COMPACT * ACTIVE_SCALE);

/** Closed: the grabber band and nothing else. Not zero - the lip IS the way
 *  back, and a panel that disappears entirely needs some other control
 *  invented to reopen it. */
export const DRAWER_CLOSED_HEIGHT = GRABBER_BAND;

/**
 * Every detent, shortest first. One list, because it was written out twice -
 * once as the state's type and once as the snap candidates - and two lists
 * of the same five things is one edit away from disagreeing.
 */
export const DRAWER_DETENTS = ["closed", "compact", "resting", "middle", "expanded"] as const;

export type DrawerDetent = (typeof DRAWER_DETENTS)[number];

/**
 * Is the drawer a TAB, or a full-width edge?
 *
 * BINARY, AND DELIBERATELY NOT ARITHMETIC. This used to interpolate the
 * detent's height between closed and RESTING, which read as "how open is
 * it". That was true only while resting was the shortest open detent. Adding
 * the compact detent below it (2598cc1) left compact at 0.72 of the way
 * open, so the tab sat at 74% of the window - reported as "at the smallest
 * drawer size the tab shrinks maybe like 20% when it shouldn't" - and kept
 * 2.8px of the rounded corners that belong to a closed tab.
 *
 * That is the THIRD thing that commit broke by assuming resting was the
 * smallest open state; the first 500'd every journal page on production. So
 * this is not a corrected denominator, which would break again the next time
 * a detent is added underneath. There is no height in it at all: a drawer is
 * open or it is not, and every open detent is equally open. The widening
 * itself is a CSS transition on the width, which is where it belongs.
 */
export function tabOpenness(detent: DrawerDetent): 0 | 1 {
  return detent === "closed" ? 0 : 1;
}

/**
 * How big a card is at a given drawer height.
 *
 * THIS IS WHAT THE HANDLE IS FOR. Expanding used to make the panel taller
 * and show exactly the same row with empty space under it, which is a
 * control that does nothing. The cards grow into the room instead, so
 * dragging the drawer up is how you look at a page closely enough to tell
 * which one it is - the filmstrip's own answer to what a stack's fan-out
 * was for.
 */
function cardSize(drawerHeight: number) {
  // The room left is a row, and a row is ACTIVE_SCALE cards tall.
  const height = Math.max(CARD_HEIGHT_COMPACT, Math.floor((drawerHeight - CHROME_HEIGHT) / ACTIVE_SCALE));
  return { height, width: Math.round(height * PAGE_RATIO) };
}

/**
 * The settle. ONE curve for everything the drawer moves, and it does not
 * overshoot.
 *
 * It used to be a sampled spring, because Apple's panels arrive with a little
 * momentum and a cubic-bezier cannot overshoot at all. That was true and it
 * was still the wrong choice here, for a reason no amount of tuning fixes:
 * AN OVERSHOOT IS A PERCENTAGE OF THE TRAVEL, and this drawer animates
 * properties with wildly different travels off one value. The damping that
 * gives the panel's 165px height a pleasant settle gives the tab's 654px
 * width a 7.3px wobble - and because the grab line is centred in the tab, a
 * width that overshoots and comes back slides that line back and forth. Twice
 * reported: first as the tab "damn near disappears when it first shrinks",
 * then as "the little jiggle the horizontal line in the tab does".
 *
 * Damping was raised from 0.7 to 0.82 for the first one. That was treating
 * the symptom - the bounce was still there, just smaller, and it still had
 * the biggest travel in the drawer to multiply itself against.
 *
 * So: a deceleration curve. All of the speed at the front, a long gentle
 * arrival, and it reaches its target exactly once. Nothing in the drawer can
 * wobble because nothing in it ever passes where it is going.
 */
export const SETTLE = "cubic-bezier(0.35, 0.4, 0.5, 1)";

/** How wide the closed lip is. Closed, the drawer is not a full-width strip
 *  along the bottom of the screen but a TAB - a small shape you pull up,
 *  which is what a thing with one grab point should look like. A full-width
 *  bar promises you can grab it anywhere, and 22px of dead chrome across the
 *  whole viewport is a lot to spend saying nothing. */
const TAB_WIDTH = 96;

/**
 * The zoom bar's element id, so the drawer can position it DIRECTLY.
 *
 * It sits outside the drawer, so its variables cannot be scoped to the
 * drawer's subtree, and putting them on the document root is the very thing
 * that made a drag expensive. One element, written to by id, invalidates one
 * element.
 *
 * Reaching into another component's DOM is not free of cost - it is a real
 * coupling, and the id is the contract. It buys a per-frame write that cannot
 * touch the canvas, which is worth more here than the tidier alternative.
 */
export const ZOOM_BAR_ID = "memari-zoom-bar";
/** How far the closed tab sits in from the right edge, as a PERCENTAGE of the
 *  width rather than a pixel count - so it holds the same place on the edge
 *  on a laptop and on a wide display, instead of drifting into the corner on
 *  one and toward the middle on the other.
 *
 *  Right of centre rather than in it, so the zoom bar keeps the middle of the
 *  bottom edge; in from the corner rather than against it, because hard in
 *  the corner read as stuck there. */
const TAB_RIGHT_INSET_PERCENT = 10;

/**
 * How long the panel takes to travel. Exported because the zoom bar rides the
 * same move and has to leave on the same clock.
 *
 * IT IS ALSO THE CLOCK EVERYTHING ELSE IS SET BY. The shrink starts at 76% of
 * it, the park at 80% of the shrink, and the zoom bar leaves with the park -
 * so raising this number moves all four, and the whole sequence lengthens
 * with it. That is deliberate: the phases should stay in proportion rather
 * than drift apart every time one of them is adjusted. It does mean this is
 * the most expensive number in the file to change by feel.
 *
 * 500ms puts the panel's 165px travel at 330 px/s, chosen against the other
 * moves rather than on its own - see SHIFT_MS, where treating one number in
 * isolation is what made the park five times quicker than everything around
 * it.
 *
 * (An earlier note here justified 480ms by the settling time of the sampled
 * spring that used to drive this. That spring is gone - see SETTLE - so the
 * justification went with it. A duration derived from a curve has to be
 * re-derived when the curve changes, or it is just a number with a story
 * attached.)
 */
export const SLIDE_MS = 500;
/** And how long the bar then takes to tuck into a tab. */
const TUCK_MS = 360;

/**
 * When the tuck starts, which is NOT when the slide's clock runs out.
 *
 * The spring reaches its resting value at about 73% of its duration - the
 * remaining time is the 1.1% overshoot coming back, movement too small to
 * see. Waiting the full 340ms therefore bought about 90ms of the panel
 * sitting still before anything else happened, and a pause in the middle of
 * one gesture is exactly what "seems delayed" describes.
 *
 * At 76% the travel is visibly finished and the tuck picks up where it
 * stopped. The sequence is intact - the tab has reached its final bottom
 * position before it begins to shrink - without the dead beat between them.
 */
const TUCK_DELAY_MS = Math.round(SLIDE_MS * 0.76);

/**
 * The tuck's own easing, and it is NOT the spring.
 *
 * A spring's step response starts at zero velocity - that is what makes it
 * feel like something being pushed, and it is right for the panel's travel.
 * It is wrong here, because the tuck already waits out the whole slide before
 * it begins. Delay plus a slow start compounds: the tab sat still for 340ms
 * and then moved imperceptibly for another 50, so nearly four tenths of a
 * second passed with nothing visibly happening. Reported as "the easing at
 * the beginning makes it seem delayed or slow".
 *
 * A DECELERATION CURVE instead - all of the speed at the front, a long gentle
 * arrival. The motion is legible the instant the delay ends, which is what
 * stops the wait reading as a hang, and it can then take longer overall
 * without feeling slower. Slower and more responsive are not opposites: what
 * reads as responsive is when the movement STARTS, not when it finishes.
 */


/**
 * And how long the tab then takes to travel to its resting place on the
 * right, which is the THIRD move of a close.
 *
 * Asked for: "I want the tab in its closing animation to shrink in the middle
 * first (so it looks good when dragging it closed), then after its at bottom
 * animate to its rightward position."
 *
 * Which separates two things that were one. The tab used to be right-anchored
 * the whole time - margin-left:auto - so narrowing it pulled it toward the
 * corner as it shrank. That is wrong under the finger especially: dragging
 * the drawer down is a vertical gesture, and the handle sliding sideways
 * while you do it is motion nobody asked for.
 *
 * So the width is now centred - it shrinks about the middle, wherever it is -
 * and the rightward move is a separate transform that happens afterwards,
 * only once the drawer has actually settled closed. During a drag it never
 * runs at all, because a drag has not settled anywhere yet.
 *
 * 520ms, and the reason is that this is the LONGEST travel in the drawer and
 * was briefly its quickest move. On a 1440px screen the tab crosses 528px to
 * reach its parking place - more than three times the panel's own 165px
 * slide - and at 300ms that was 1760 px/s against the slide's 344. It read as
 * a flick at the end of an otherwise unhurried sequence.
 *
 * Worth knowing when this is next touched: the distance is a fraction of the
 * VIEWPORT, so unlike every other number here its speed depends on the screen
 * it is running on. A fixed duration means a wider display animates this
 * faster. Matching the slide's velocity outright would take a second and a
 * half, which is its own kind of wrong; 520ms is about 1000 px/s, brisk but
 * no longer the fastest thing on screen.
 */
export const SHIFT_MS = 520;
/** Where the tab parks, measured from the centre it shrank about: the right
 *  inset is a percentage of the viewport, and half a tab is subtracted
 *  because a translate moves the element's centre too. */
/**
 * When the tab starts travelling to the right on a close - EXPORTED, because
 * the zoom bar has to be timed against it rather than guess.
 *
 * The bar sits in the middle of the bottom edge and the tab ends up right of
 * it, so while the tab is still wide and central they want the same pixels.
 * Dropping the bar on the panel's own clock put it there at 480ms, when the
 * tab still had 325ms of width left and had not begun to move aside:
 * reported as "the zoom ui slides down and overlaps the tab before it can get
 * out of way". It now leaves on the park's clock instead, so the bar descends
 * into the space as the tab vacates it rather than into the tab.
 */
export const TAB_PARK_DELAY_MS = Math.round(SLIDE_MS * 0.76) + Math.round(TUCK_MS * 0.8);

const TAB_PARK_X = `calc(${50 - TAB_RIGHT_INSET_PERCENT}vw - ${TAB_WIDTH / 2}px)`;

const ACCENT = "#4a5cff";
const SURFACE = "#2a2a2a";

/** How long either shadow takes to fade. Short: it is a change of lighting
 *  at the ends of a move, not a move of its own. */
const SHADOW_FADE_MS = 180;
/** Closed: the tab (and, while it is on screen, the drawer) casting UP onto
 *  the canvas it sits on. The "none" form keeps the same geometry at zero
 *  alpha, so the fade interpolates the colour rather than the shape.
 *  0.27: raised from 0.22 to 0.30 as "a bit" more, then set to 27% by
 *  Andrew directly. */
const SHADOW_ON_CANVAS = "0 -2px 10px rgba(0, 0, 0, 0.27)";
const SHADOW_ON_CANVAS_NONE = "0 -2px 10px rgba(0, 0, 0, 0)";
/**
 * Open: the canvas casting DOWN onto the drawer's top edge.
 *
 * A GAUSSIAN FALL-OFF, not a straight ramp. A linear gradient reads as a
 * band with an edge where it stops; a blurred shadow thins out along a bell
 * curve, fast at first and then with a long soft tail, and that is what makes
 * it read as blur rather than as a stripe. Asked for as "blurrier", after
 * "increase the spread and intensity a bit" (10px at 0.40 -> 14px at 0.52,
 * both linear). 24px deep, sigma a third of that, so it is effectively clear
 * by the bottom; the darkness at the edge stays 0.52, so it is softer, not
 * darker. Built from the formula rather than typed as stops, so the curve has
 * one description.
 */
const SHADOW_ON_DRAWER_DEPTH = 24;
const SHADOW_ON_DRAWER = (() => {
  const peak = 0.52;
  const sigma = SHADOW_ON_DRAWER_DEPTH / 3;
  const steps = 8;
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const y = (SHADOW_ON_DRAWER_DEPTH * i) / steps;
    const alpha = i === steps ? 0 : peak * Math.exp(-((y / sigma) ** 2) / 2);
    return `rgba(0, 0, 0, ${alpha.toFixed(3)}) ${y}px`;
  });
  return `linear-gradient(to bottom, ${stops.join(", ")})`;
})();
/** The occurrence list's width. A constant rather than a literal because the
 *  panel is positioned in script now, and keeping it on screen near the right
 *  edge means knowing how wide it is - see OccurrencePopover. */
const PANEL_WIDTH = 268;

export function TimelineDrawer({
  pages,
  activeLevel,
  activeVariantKey,
  term,
  onOpen,
  onHeightChange,
}: {
  /** Every page of the book, already in binding order. */
  pages: TimelinePage[];
  /** The level whose spread is on the canvas. Its pages are the selected
   *  ones - the editor draws a whole spread, so both of them are. */
  activeLevel: PageLevel;
  /** Which occurrence's layout is on the canvas; null is the default. */
  activeVariantKey: string | null;
  /** What stretch of time the book covers, as ISO dates. */
  term: { start: string | null; end: string | null };
  /** Bring a spread onto the canvas. */
  onOpen: (level: PageLevel, variantKey: string | null) => void;
  /** How much room the canvas should leave below itself. Called when the
   *  drawer SETTLES, not while it is being dragged. */
  onHeightChange?: (height: number) => void;
}) {
  // FIVE detents: closed, compact, resting, middle, expanded. Closed leaves the
  // grabber band and nothing else - a thin lip you can pull back up, rather
  // than a panel that vanishes and needs some other control to bring back.
  // Asked for directly: "I want to be able to close bottom timeline
  // seamlessly in the design." MIDDLE is halfway between resting and
  // expanded, asked for 2026-09-21: "we should add a level between the two".
  const [detent, setDetent] = useState<DrawerDetent>("resting");
  // Which open detent a close should return to. A grabber that both drags
  // and toggles has to mean ONE thing when clicked, and "close / reopen" is
  // what it is for - the middle detent is reached by dragging, and clicking
  // back open should land where you left it rather than always at resting.
  //
  // STATE, not a ref, because the render reads it: panelHeight needs to know
  // how tall the panel is when open in order to lay the timeline out for that
  // size while it is closed. A ref read during render is unsound under
  // concurrent rendering - a discarded render attempt can write one, and the
  // replay then reads a value from a pass that never happened.
  const [lastOpen, setLastOpen] = useState<"compact" | "resting" | "middle" | "expanded">("resting");
  // Honoured for the drawer's own settle, and for the zoom bar that now rides
  // on it - which is why these moved into a hook rather than staying here.
  const reduceMotion = usePrefersReducedMotion();
  const highContrast = usePrefersHighContrast();

  // Drag the grabber to resize. Pointer events rather than mouse, so a
  // touch screen gets the same behaviour without a second code path.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  /** The drawer's own element, so its custom properties can be scoped to it. */
  // Whether the hand is currently closed on the grabber. Separate from
  // dragHeight, which only exists once the pointer has MOVED - the cursor has
  // to change on press, not on travel, or the grab reads as not having taken.
  const [grabbing, setGrabbing] = useState(false);
  // Did this gesture actually MOVE? The grabber both drags and toggles, and
  // a pointerup after a drag is followed by a click - so without this, every
  // resize would also flip the detent it had just been dragged away from.
  const movedRef = useRef(false);

  // SERVER-SAFE, and it has to be stated rather than relied on.
  //
  // This reads window.innerHeight, and it used to be reachable only above
  // the resting detent - which the server never renders, so the server never
  // called it. That was an invariant held by one comparison somewhere else,
  // and adding the compact detent moved that comparison: contentHeight went
  // from `height <= RESTING` to `height <= COMPACT`, so the resting height
  // the server DOES render stopped taking the constant branch and fell
  // through to here. Every /app/j/<id> request then failed SSR with
  // "window is not defined" - the page still appeared, because the client
  // recovered, which is exactly why it was not noticed by looking at it.
  //
  // Half a window is unknowable without a window, and the resting height is
  // the honest answer until there is one. No hydration mismatch comes of it:
  // at rest the drawer is 247px either way, because the min() takes the
  // height, not this.
  const expandedHeight = () =>
    typeof window === "undefined"
      ? DRAWER_RESTING_HEIGHT
      : Math.max(DRAWER_RESTING_HEIGHT, Math.round(window.innerHeight * 0.5));
  const heightOf = (which: typeof detent) =>
    which === "closed"
      ? DRAWER_CLOSED_HEIGHT
      : which === "compact"
      ? DRAWER_COMPACT_HEIGHT
      : which === "resting"
      ? DRAWER_RESTING_HEIGHT
      : which === "middle"
      ? // Derived from the two it sits between, so it stays between them
        // on any window - expanded follows the window's height.
        Math.round((DRAWER_RESTING_HEIGHT + expandedHeight()) / 2)
      : expandedHeight();

  const onGrabberPointerDown = (event: React.PointerEvent) => {
    // Capture so the drag survives the pointer leaving this band -
    // which it does immediately, since dragging up is the whole point. It is
    // guarded because setPointerCapture THROWS for a pointer the browser
    // does not consider active, and an exception here would abandon the
    // drag before it started rather than merely losing the capture.
    try {
      (event.target as Element).setPointerCapture(event.pointerId);
    } catch {
      // Uncaptured is still draggable; it just ends early if the pointer
      // leaves the element.
    }
    movedRef.current = false;
    setGrabbing(true);
    dragRef.current = {
      startY: event.clientY,
      startHeight: heightOf(detent),
    };
  };
  const onGrabberPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    // A pointer that has not travelled far enough to be a drag is still a
    // click. 3px is about the slop a steady hand produces on a press.
    if (Math.abs(event.clientY - drag.startY) > 3) movedRef.current = true;
    // Dragging UP makes it taller, so the delta is inverted.
    const wanted = drag.startHeight + (drag.startY - event.clientY);
    const max = expandedHeight();
    if (wanted > max) {
      // RUBBER-BANDING past the top: iOS's own resistance curve, where 0.55
      // is the decay constant. Pulling further costs exponentially more
      // movement, which is what makes a limit feel like a limit rather than
      // a bug, and it springs back when you let go.
      //
      // This was briefly a hard stop, because stretching past the maximum had
      // two visible faults - the previews kept growing, and a transparent gap
      // opened below the panel. Removing the stretch removed both, and also
      // removed the thing that was good about it. Both faults are fixed where
      // they actually live instead: see contentHeight, which stops growing at
      // the maximum, and panelFillHeight, which keeps the surface as tall as
      // the stretch. The bounce itself was never the problem.
      const over = wanted - max;
      setDragHeight(max + (1 - 1 / ((over * 0.55) / max + 1)) * max);
    } else {
      // The floor is the CLOSED height, not zero: the grabber band is what
      // you grab to bring it back, so it can never be dragged away.
      setDragHeight(Math.max(DRAWER_CLOSED_HEIGHT, wanted));
    }
  };
  const onGrabberPointerUp = () => {
    const height = dragHeight;
    dragRef.current = null;
    setGrabbing(false);
    setDragHeight(null);
    if (height === null) return;
    // Snap to whichever detent is nearest. Detents, not free resize: a panel
    // that can rest anywhere has no shape you can learn.
    let nearest: DrawerDetent = "resting";
    let best = Infinity;
    for (const candidate of DRAWER_DETENTS) {
      const distance = Math.abs(heightOf(candidate) - height);
      if (distance < best) {
        best = distance;
        nearest = candidate;
      }
    }
    setDetent(nearest);
    // Told NOW, in the same event as the detent change - see toggleOpen.
    onHeightChange?.(heightOf(nearest));
    if (nearest !== "closed") setLastOpen(nearest);
  };

  // Reads the current detent directly rather than through an updater. The
  // updater form would have to call setLastOpen from inside itself, and an
  // updater has to be pure - StrictMode runs it twice, so a side effect in
  // there fires twice too.
  //
  // IT REPORTS ITS HEIGHT HERE, not only from the effect below. The effect
  // runs after this component has already committed and started animating, so
  // anything positioned against the drawer learned the new height a frame or
  // two late and began its own move from behind. At this panel's speed a
  // 33ms head start is about 16px - which is exactly the clearance the zoom
  // bar keeps above it, so the bar spent the whole open behind the drawer.
  // Reported twice as "gets hidden on open".
  //
  // Called from the handler, it batches with these setState calls and both
  // commit in the same frame, so the two transitions start together.
  const toggleOpen = () => {
    if (detent === "closed") {
      setDetent(lastOpen);
      onHeightChange?.(heightOf(lastOpen));
      return;
    }
    setLastOpen(detent);
    setDetent("closed");
    onHeightChange?.(heightOf("closed"));
  };

  const height = dragHeight ?? heightOf(detent);

  // The canvas reserves room for the drawer with a permanent margin rather
  // than being resized by it - see this file's header. Reported on SETTLE
  // only, never mid-drag: telling it every frame is exactly the layout
  // thrashing the overlay exists to avoid.
  useEffect(() => {
    onHeightChange?.(heightOf(detent));
    // heightOf reads window.innerHeight for the expanded detent, so this has
    // to run again when the window changes size as well as when the detent
    // does.
    const resync = () => onHeightChange?.(heightOf(detent));
    window.addEventListener("resize", resync);
    return () => window.removeEventListener("resize", resync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detent, onHeightChange]);
  /**
   * The height the panel has WHEN OPEN - which is what its contents are laid
   * out for, whatever the panel is doing at this instant.
   *
   * THE TIMELINE SLIDES, IT DOES NOT SHRINK. Asked for directly: "it should
   * slide down at the same rate connected to the bottom of the tab then
   * disappear once off screen." The track used to be `flex: 1, minHeight: 0`,
   * so closing squeezed it toward nothing and the cards were eaten from the
   * bottom in place - they never went anywhere, they just stopped existing.
   *
   * Given a fixed height instead, the cards are a block hung under the tab.
   * The tab is the panel's top edge, that edge moves down as the panel
   * shortens, and the block moves with it by exactly the same amount, out
   * past the bottom of the screen. Nothing clips it: a `position: fixed`
   * element's overflow does not contribute to the document's scroll area, so
   * "off the bottom of the viewport" is already "gone".
   *
   * IT FOLLOWS THE LIVE HEIGHT above resting, and holds at resting below it,
   * and the asymmetry is the whole design:
   *
   *   - Above resting the drawer is being SIZED. Dragging up grows the
   *     previews under your hand and dragging down shrinks them, which is
   *     what the handle is for.
   *   - At or below resting the drawer is CLOSING. There is nothing to size
   *     any more, so the block holds its shape and simply travels, sliding
   *     under the tab and off the screen.
   *
   * This used to read `max(heightOf(detent), height)`, which looks similar
   * and is not. The detent does not change until you let go, so dragging down
   * from expanded held the previews at their expanded size and CLIPPED them
   * against the shrinking panel - they never moved, they were just covered -
   * and then resized in one step on release. Reported as "when i drag largest
   * version smaller it jumps to smaller size".
   *
   * Between the two, the contents never reflow on a close from resting, which
   * is the common case: height never exceeds resting there, so panelHeight is
   * constant and nothing inside the panel relayouts while it travels.
   */
  //
  // TWO HEIGHTS, because a stretched drawer needs different answers to two
  // different questions.
  //
  // What the CONTENTS are laid out for: the live height, floored at resting
  // and CAPPED AT THE MAXIMUM. Past the maximum the previews stop growing -
  // "i just didn't want the previews to grow any more" - so the stretch reads
  // as resistance rather than as more room.
  //
  // expandedHeight() reads window.innerHeight, so it is only consulted above
  // resting. At or below it the answer is a constant, which is also the only
  // case that runs on the server.
  // FLOORED AT THE SMALLEST OPEN DETENT, which is compact and was resting.
  // The floor is what stops the contents reflowing while the drawer slides
  // away on a close - it travels with its cards at the size they were. That
  // reasoning is about the SMALLEST OPEN height, not about resting in
  // particular, and leaving it at resting is what made the compact detent
  // land at the right height with cards still laid out for the old one:
  // --memari-drawer-height went to 186 while --memari-card-h stayed 102.
  const contentHeight =
    height <= DRAWER_COMPACT_HEIGHT
      ? DRAWER_COMPACT_HEIGHT
      : Math.min(height, expandedHeight());

  // What the SURFACE has to cover: the whole panel, including any stretch
  // past the maximum. The panel itself paints nothing - the tab and the
  // timeline block do - so a block that stopped at the maximum would leave
  // the stretched remainder transparent, which is the gap that showed below
  // the drawer. It stretches; only its contents stop.
  const panelFillHeight = Math.max(contentHeight, height);

  const panelHeight = contentHeight;
  /** The drag IS the animation; easing it would lag the finger. */
  const moving = dragHeight === null && !reduceMotion;
  /**
   * Whether the tab belongs over on the right.
   *
   * THE SETTLED DETENT, not the live drag. It used to also require that no
   * drag was in flight, which meant the instant you grabbed a closed drawer
   * and pulled, `parked` went false with no transition running - so the tab
   * teleported from the right to the centre on the first frame of the
   * gesture. Reported as "the tab still jumps to middle at beginning of
   * opening".
   *
   * Reading the detent instead, a drag out of the closed position keeps the
   * tab where it was until you let go and it actually lands somewhere open.
   * Dragging the other way still shrinks about the middle, because the detent
   * is not "closed" yet on the way down - which is the behaviour asked for in
   * both directions.
   */
  const parked = detent === "closed";

  /**
   * The card's size AND how it changes, together in one object.
   *
   * The transition has to ride along with the numbers because every card sets
   * `transition` inline for its own hover states, and AN INLINE TRANSITION
   * BEATS A STYLESHEET RULE. A `.is-settling .memari-card { transition: width
   * ... }` rule was in fact being written, and was in fact being ignored: the
   * computed value on a real card read `opacity 0.15s ease-out` and nothing
   * else, so the previews resized in a single frame while everything around
   * them eased. That is the jump, and it was invisible to reading the source
   * - both halves looked right.
   *
   * "none" while dragging: a transition then would put the previews behind
   * the finger rather than under it.
   */
  const card = useMemo(
    () => ({
      sizeTransition: moving
        ? `width ${SLIDE_MS}ms ${SETTLE}, height ${SLIDE_MS}ms ${SETTLE}`
        : "",
    }),
    [moving]
  );

  /**
   * Tab or panel - see tabOpenness. The travel between them is a CSS
   * transition on `width` and `border-radius` (phases.shape below), not a
   * number computed per frame.
   *
   * This line used to read "0 to 1 - and it has to be CONTINUOUS", which was
   * a true lesson about the WRONG mechanism and outlived it. The original was
   * a boolean flipped at a threshold four pixels above the closed height, and
   * it was wrong in both directions. Opening, the threshold was crossed on
   * the first frame, so the surface, the border and the corners all snapped
   * to their panel values at once and you saw a full-width bar appear before
   * the height had moved - "the tab instantly jumps to a bar then opens".
   * Closing, the same snap happened at the very end, so the panel vanished
   * from under its own contents instead of shrinking away with them.
   *
   * The fault there was the LIVE HEIGHT and the threshold in it, not the two
   * values: reading the settled detent instead already made this a step, and
   * the transition has been carrying the travel ever since.
   *
   * The lesson generalises past this drawer: BACKGROUND, BORDER AND RADIUS
   * CANNOT BE SWITCHED PART WAY THROUGH A MOVE. Either every property
   * animates on the same clock, or the ones that cannot interpolate will
   * announce the exact frame they changed on.
   *
   * FROM THE SETTLED DETENT, not from the live height - the tab's shape is a
   * function of where the drawer HAS GOT TO, not of where your hand is.
   *
   * It read the live height, so dragging up from closed widened the tab under
   * the finger the whole way: "instead of clicking it expand on the side
   * while i drag, when it should be staying the same size until i release and
   * it reaches its final location". The same was true dragging the other way.
   *
   * This is the third value in this component to want the settled state
   * rather than the live one - `parked` and `panelHeight` were the others -
   * and the distinction is worth stating once: THE DRAG MOVES THE PANEL, AND
   * ONLY THE PANEL. What size the tab is, which way round its corners are and
   * where it parks all belong to the detent, so they hold still until the
   * drawer actually lands somewhere and then animate there on their own
   * schedule. The one exception is the previews, which are being sized BY the
   * drag and so have to follow it.
   */
  const openness = tabOpenness(detent);
  /**
   * Which way it is going, so the close can be SEQUENCED.
   *
   * Asked for: "make the tab animation to shrink only start once the tab has
   * slid down and reach final bottom position." Two moves, not one - the
   * panel travels down as a full-width edge, arrives, and only then does the
   * bar tuck itself into a tab.
   *
   * BETWEEN DETENTS, not between live heights - and the difference is not
   * academic. Drag up from closed to 232px and let go: the nearest detent is
   * resting at 187, so the live height goes 232 -> 187, a DECREASE, and a
   * gesture that opened the drawer ran the closing sequence. Caught by
   * measuring a real release and finding the tab widening before it
   * un-parked, which is the closing order played on an open.
   *
   * The settled heights say 22 -> 187, which is the question actually being
   * asked: not "did the number just go down" but "is this drawer opening or
   * shutting".
   *
   * React's own "information from previous renders" pattern - compare, then
   * adjust during render - rather than a ref read while rendering. A ref is
   * the obvious way to do this and it is wrong: under concurrent rendering a
   * render can be thrown away and replayed, and a ref written by the
   * discarded attempt would have this reading a direction that never
   * happened. The state adjustment re-runs the component immediately, before
   * anything is committed or painted.
   */
  const settledHeight = heightOf(detent);
  const [previousSettledHeight, setPreviousSettledHeight] = useState(settledHeight);
  const [closing, setClosing] = useState(false);
  if (previousSettledHeight !== settledHeight) {
    setClosing(settledHeight < previousSettledHeight);
    setPreviousSettledHeight(settledHeight);
  }

  /**
   * The travel, and the tuck.
   *
   * OPENING RUNS THEM TOGETHER on purpose. Sequencing it the other way would
   * mean widening the bar first, which puts a full-width strip across the
   * bottom of the screen before the panel has moved - and that is precisely
   * the "tab instantly jumps to a bar then opens" this drawer was already
   * reported for once. Closing earns its sequence because the panel is
   * leaving; opening should feel like one gesture.
   */
  /**
   * The three moves, and OPENING IS CLOSING BACKWARDS.
   *
   * Asked for: "do the same thing vice versa for the opening animation, keep
   * it as its right position until at its final opened position."
   *
   *   closing   slide down  ->  shrink about the middle  ->  park right
   *   opening   slide up    ->  return to the middle     ->  widen
   *
   * Which is the same three moves read in the other direction, with travel
   * first both times. The tab therefore stays where you left it - small, over
   * on the right - for the whole of the panel's rise, and only sets itself
   * back across the top edge once the panel has arrived.
   *
   * Each phase starts at 76-80% of the one before rather than after it. A
   * deceleration curve is within a couple of percent of its target well
   * before its time is up, so waiting for the clock buys nothing but a pause,
   * and a pause inside one gesture is what reads as lag.
   *
   * The VALUES all change on the first frame - openness goes to 1 the moment
   * you click. Only these delays hold each property at its old value until
   * its turn, which is why nothing here needs extra state to sequence it.
   */
  const phases = closing
    ? {
        ease: SETTLE,
        shape: { delay: TUCK_DELAY_MS, ms: TUCK_MS },
        park: { delay: TAB_PARK_DELAY_MS, ms: SHIFT_MS },
      }
    : {
        ease: SETTLE,
        park: { delay: TUCK_DELAY_MS, ms: SHIFT_MS },
        shape: { delay: TUCK_DELAY_MS + Math.round(SHIFT_MS * 0.8), ms: TUCK_MS },
      };

  const phaseTransition = (phase: { delay: number; ms: number }, ...properties: string[]) =>
    !moving
      ? "none"
      : properties.map((p) => `${p} ${phase.ms}ms ${phases.ease} ${phase.delay}ms`).join(", ");

  /**
   * TWO SHADOWS, and they change places around the tab's change of shape.
   *
   * Asked for, 2026-09-18:
   *   - OPEN, the canvas casts onto the drawer - "within and onto the expanded
   *     tab/timeline drawer area (from the canvas so to speak)". It fades in
   *     once the tab has finished widening, and out right before it starts
   *     to shrink back into a tab.
   *   - CLOSED, the tab and the drawer cast onto the canvas. It fades in once
   *     it has become a tab, stays while closed, and fades out right before
   *     the tab starts to widen.
   *
   * The one that LEAVES is gone by the moment the shape starts to move - it
   * already overlaps the slide or the return to the middle, which is clean.
   * The one that ARRIVES starts at 80% of the widen or shrink, the same
   * overlap every phase in this drawer takes (see `phases`), rather than
   * after it: a pause between the tab settling and its lighting changing
   * reads as a second, separate event. At 80% of its time the SETTLE curve
   * is 96% of the way there. That matters most for the shadow onto the
   * drawer, which spans the full width - shown while the tab was still
   * narrow, it would shade the canvas either side of it. The shadow onto the
   * canvas is the tab's own shape, so it is clean at any width; closing, it
   * starts to arrive exactly as the tab starts to travel to the right.
   *
   * Both are timed off `phases.shape` rather than given numbers of their
   * own, so they stay attached to it if the sequence is ever retimed.
   *
   * Keyed to the SETTLED detent, like `parked`: a drag moves the panel and
   * nothing else, so neither shadow changes until the drawer lands.
   */
  const shapeStart = phases.shape.delay;
  const shapeNearlyDone = phases.shape.delay + Math.round(phases.shape.ms * 0.8);
  const fadeOutBy = (at: number) => ({ delay: Math.max(0, at - SHADOW_FADE_MS), ms: SHADOW_FADE_MS });
  const fadeInFrom = (at: number) => ({ delay: at, ms: SHADOW_FADE_MS });
  const shadowOnDrawerFade = closing ? fadeOutBy(shapeStart) : fadeInFrom(shapeNearlyDone);
  const shadowOnCanvasFade = closing ? fadeInFrom(shapeNearlyDone) : fadeOutBy(shapeStart);
  const shadowOnCanvas = parked ? SHADOW_ON_CANVAS : SHADOW_ON_CANVAS_NONE;

  /**
   * The drawer's live edge, published as CSS variables for anything that has
   * to sit against it - today, the zoom bar.
   *
   * NOT THROUGH REACT. `onHeightChange` deliberately reports only on settle,
   * because the canvas reserves its bottom margin from that number and
   * re-laying out a two-page spread every frame of a drag is exactly the
   * thrashing this drawer overlays the canvas to avoid. But the zoom bar
   * should follow the edge continuously - "live track what is below so it
   * moves as I drag". A custom property gives it that: the browser
   * recalculates style, nothing re-renders, and the editor never hears about
   * the drag at all.
   *
   * The drop is the second half of the same request - "slide down to its
   * final original low position after the tab moves out of its way". Tracking
   * alone leaves the bar 16px above a closed drawer, which is 38px up; this
   * carries it the last 22px down to where it used to sit, on the tab's
   * parking clock rather than the panel's, so it only takes that space once
   * the tab has left it.
   */
  useIsomorphicLayoutEffect(() => {
    // The drawer's own copies of these - its height and the preview size -
    // are RENDERED on the section now, so the server's first frame has them;
    // see its style. They stay on the SECTION, NOT ON documentElement, and
    // that is the part that matters for the frame rate: a custom property
    // set on the root is inherited by every element in the document, so
    // writing one invalidates style for all of them - a two-page spread of
    // modules, sixty times a second, to move a drawer. Scoped to the
    // section, the invalidation stops at the drawer's own subtree.
    //
    // The preview size is a VARIABLE rather than the cards' props for the
    // other reason. Every card used to take its width and height as React
    // props, so a drag re-rendered the whole drawer - every group, every
    // card - on every pointer move, and each of those renders sat in front
    // of the browser relaying out and re-rasterising a page of SVG. Reported
    // as the preview area being "laggy during the live resizing", and gone
    // the moment you release. Through a variable, the cards' props stop
    // changing and the memoised components below skip re-rendering entirely.

    // Written onto the bar itself rather than anywhere it could be inherited
    // from - see ZOOM_BAR_ID.
    const bar = document.getElementById(ZOOM_BAR_ID);
    if (!bar) return;
    bar.style.setProperty("--memari-drawer-height", `${height}px`);
    bar.style.setProperty(
      "--memari-zoom-drop",
      parked ? `${DRAWER_CLOSED_HEIGHT}px` : "0px"
    );
    bar.style.setProperty(
      "--memari-zoom-track-transition",
      moving ? `bottom ${SLIDE_MS}ms ${SETTLE}` : "none"
    );
    // The drop waits for the tab ONLY ON THE WAY DOWN. Closing, it has to let
    // the tab park before taking that space. Opening, there is nothing to
    // wait for - the bar is getting out of the way, not moving in - so it
    // leaves with the panel. Carrying the park delay in both directions is
    // what made it "a bit delayed when moving out of the way at top of
    // opening animation": two thirds of a second of nothing, for a queue that
    // was not there.
    bar.style.setProperty(
      "--memari-zoom-drop-transition",
      !moving
        ? "none"
        : closing
        ? `transform ${SHIFT_MS}ms ${SETTLE} ${TAB_PARK_DELAY_MS}ms`
        : `transform ${SLIDE_MS}ms ${SETTLE}`
    );
    // The open layout too: EditorShell rebuilds the editor - and with it the
    // zoom bar - when another layout opens, while this drawer carries on, so
    // the new bar has to be given its place in that same commit, before
    // paint, or it shows for a frame where a resting drawer would put it.
  }, [height, parked, moving, closing, dragHeight, activeLevel, activeVariantKey]);

  // Memoised for the same reason: recomputing `pages.filter` and
  // `occurrences` every render hands every LevelGroup a brand-new array and
  // defeats memoisation on the way down.
  const groups = useMemo(
    () =>
      LEVELS_IN_BINDING_ORDER.map((level) => ({
        level,
        pages: pages.filter((page) => page.level === level),
        levelOccurrences: occurrences(
          level,
          term.start ? new Date(`${term.start}T00:00:00.000Z`) : null,
          term.end ? new Date(`${term.end}T00:00:00.000Z`) : null
        ),
      })),
    [pages, term.start, term.end]
  );

  return (
    <section
      aria-label="Planner timeline"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        // Above the canvas and above the zoom controls, because it is the
        // thing you navigate with; below nothing else.
        zIndex: 40,
        height,
        // NOTHING IS PAINTED HERE. This element only says how tall the drawer
        // currently is and where its bottom edge sits; the surface is the
        // panel inside it.
        //
        // It used to carry a background of `rgba(42,42,42,openness)`, which
        // is where "the timeline still fades in and out" was coming from -
        // the cards had already stopped fading, but the ground behind them
        // had not, and a surface dissolving under its own contents reads as
        // the contents dissolving. ONE SOLID SHAPE THAT CHANGES SIZE, not two
        // shapes cross-fading: there is no opacity anywhere in this drawer
        // now.
        //
        // No clicks either - only the two painted children take them, so no
        // transparent strip is left swallowing clicks along the bottom of the
        // canvas.
        pointerEvents: "none",
        transition: moving ? `height ${SLIDE_MS}ms ${SETTLE}` : "none",
        // The drawer's live edge and the preview size, for everything inside
        // that sizes itself against them. RENDERED, so they are in the
        // server's first frame. They used to be written by a layout effect,
        // which only runs once the page's script has loaded - and until then
        // every card's `width: var(--memari-card-w)` pointed at nothing, and
        // the canvas inside fell back to the browser's default 300x150.
        // Measured on the first frame: fourteen 300x150 cards, half hidden
        // below a drawer that was already the right height, which is the
        // "large, then jumps to the right size" seen on every load.
        //
        // Still not through the CARDS' props, which is the point the effect's
        // comment makes: this section re-renders on a drag anyway (its
        // height is right above), and the memoised cards below do not.
        ...({
          "--memari-drawer-height": `${height}px`,
          "--memari-card-h": `${cardSize(panelHeight).height}px`,
          "--memari-card-w": `${cardSize(panelHeight).width}px`,
        } as CSSProperties),
      }}
    >
      {/* The grabber. One affordance, two jobs: drag to resize, click to
          toggle between the detents. */}
      <div
        role="separator"
        aria-label={detent === "closed" ? "Open the timeline" : "Close the timeline"}
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={onGrabberPointerDown}
        onPointerMove={onGrabberPointerMove}
        onPointerUp={onGrabberPointerUp}
        onPointerCancel={onGrabberPointerUp}
        onClick={() => {
          // Only a press that did not move toggles. A drag has already
          // chosen its detent.
          if (movedRef.current) {
            movedRef.current = false;
            return;
          }
          toggleOpen();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleOpen();
          }
        }}
        style={{
          height: GRABBER_BAND,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          // A HAND, not a resize arrow. ns-resize says "this edge stretches",
          // which is what a window frame does; this is a thing you take hold
          // of and pull, and it snaps to detents rather than resizing freely.
          // Closed on press, open on hover - the cursor reports the state of
          // the hand, not the state of the drawer.
          cursor: grabbing ? "grabbing" : "grab",
          touchAction: "none",
          // THE TAB, and it is the ONLY thing that changes width.
          //
          // The timeline is its SIBLING, not its child, and that is the whole
          // point. It was briefly a child - one panel carrying both - and the
          // result was reported immediately: "the entire timeline now shrinks
          // with the tab and you can see it as it slides down closed." Of
          // course it did. A child is as wide as its parent, so narrowing the
          // parent to 96px narrowed the row of cards to 96px with it.
          //
          // As siblings, each keeps its own width and its own solid surface,
          // and the only thing they share is the edge they meet at.
          background: SURFACE,
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderBottom: "none",
          pointerEvents: "auto",
          width: `calc(${TAB_WIDTH}px + ${openness} * (100% - ${TAB_WIDTH}px))`,
          // ANCHORED RIGHT, not centred. `auto` on the left means the free
          // space all collects on that side, so the tab sits toward the right
          // when closed and GROWS LEFTWARD into the panel's full-width top
          // edge as it opens - one motion from one place, rather than
          // spreading from the middle. At openness 1 there is no free space
          // left for `auto` to take and the inset has gone to zero, so it
          // lands flush.
          // CENTRED, so the width shrinks about the middle rather than
          // dragging the tab toward the corner as it narrows. Where it ends
          // up is the transform's job, not the margin's - see TAB_PARK_X.
          marginLeft: "auto",
          marginRight: "auto",
          // Only once it has SETTLED closed. Mid-drag this is always zero, so
          // the handle stays under the finger and simply narrows.
          transform: parked ? `translateX(${TAB_PARK_X})` : "translateX(0)",
          borderRadius: `${10 * (1 - openness)}px ${10 * (1 - openness)}px 0 0`,
          // Onto the canvas, while closed - see shadowOnCanvasFade.
          boxShadow: shadowOnCanvas,
          transition: !moving
            ? "none"
            : [
                phaseTransition(phases.shape, "width", "border-radius"),
                phaseTransition(phases.park, "transform"),
                phaseTransition(shadowOnCanvasFade, "box-shadow"),
              ].join(", "),
        }}
      >
        <div
          style={{
            width: GRABBER_WIDTH,
            height: GRABBER_HEIGHT,
            borderRadius: GRABBER_HEIGHT / 2,
            background: "rgba(255, 255, 255, 0.3)",
          }}
        />
      </div>

      {/* ONE horizontal scroller for the whole row, not one per group. A
          scroller per group is a scroll trap: a trackpad swipe meant to run
          along the book gets caught inside whichever group the pointer
          happens to be over. */}
      <div
        className="memari-timeline-track"
        style={{
          // Fixed in BOTH directions, and it does not shrink in either.
          //
          // Height: see panelHeight - this is the block that rides down with
          // the tab rather than collapsing under it.
          //
          // Width: always the full screen, never the tab's. It carries its
          // own solid surface for exactly that reason, so that the tab can
          // narrow to 96px without the timeline having any opinion about it.
          flex: "none",
          width: "100%",
          height: panelFillHeight - GRABBER_BAND,
          // ON THE PANEL'S CLOCK. This is a fixed-height block inside a panel
          // whose height animates, so if it resized instantly while the panel
          // eased, the two would disagree for the length of the settle - as a
          // clip across the cards growing, or as transparent panel below them
          // shrinking. Same duration and curve, so they never disagree.
          transition: moving
            ? [`height ${SLIDE_MS}ms ${SETTLE}`, phaseTransition(shadowOnCanvasFade, "box-shadow")].join(", ")
            : "none",
          // The drawer area's half of the shadow onto the canvas: while the
          // tab is small and the panel is on screen under it - the slide - the
          // panel's top edge casts too. Closed, it is below the screen. The
          // tab is transformed, so it paints above this and its own lower
          // edge is not shaded by it.
          boxShadow: shadowOnCanvas,
          boxSizing: "border-box",
          background: SURFACE,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "flex-start",
          gap: GROUP_GAP,
          padding: `${TRACK_PAD_TOP}px ${TRACK_PAD_X}px ${TRACK_PAD_BOTTOM}px`,
          overflowX: "auto",
          overflowY: "hidden",
          // NOT FADED. Asked for directly: "you don't need to fade in or out
          // timeline just make it appear below the tab, you can keep the tab
          // animation though."
          //
          // The cards are at full strength the whole way and the panel's own
          // edge is what hides them - they pass under the tab and off the
          // bottom of the screen. Which is what a drawer does: the things in
          // it do not become translucent as it shuts. The fade was a
          // half-measure against the old threshold snap, and once the surface
          // morphs continuously there is nothing left for it to cover up.
          //
          // Nothing gates clicks here any more. A card is either on screen
          // or below the bottom of it; there is no longer an in-between state
          // where one is visible but too faint to have been aimed at.
        }}
      >
        {groups.map((group, index) => (
          <LevelGroup
            key={group.level}
            level={group.level}
            pages={group.pages}
            activeLevel={activeLevel}
            activeVariantKey={activeVariantKey}
            card={card}
            occurrences={group.levelOccurrences}
            highContrast={highContrast}
            reduceMotion={reduceMotion}
            onOpen={onOpen}
            dividerAfter={index < groups.length - 1}
          />
        ))}
      </div>

      {/* The canvas's shadow onto the open drawer - see shadowOnDrawerFade.
          An overlay rather than an inset box-shadow: the section paints
          nothing, and an inset shadow on the tab would stop at its bottom
          edge, where the tab meets the timeline. Positioned and last, so it
          paints over both. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: SHADOW_ON_DRAWER_DEPTH,
          background: SHADOW_ON_DRAWER,
          pointerEvents: "none",
          opacity: parked ? 0 : 1,
          transition: phaseTransition(shadowOnDrawerFade, "opacity"),
        }}
      />

      {/* Scrollbars hidden: a trackpad-first row is navigated by swiping, and
          a visible bar in a 102px-tall strip eats the cards. A real
          stylesheet rule, in globals.css, because ::-webkit-scrollbar has no
          inline form.

          THE CARDS' SIZE TRANSITION IS NOT HERE, and was, and did nothing.
          A rule like `.is-settling .memari-card { transition: width ... }`
          reads correctly and loses every time, because each card sets
          `transition` inline for its own hover state and an inline
          declaration beats a stylesheet one. It is now part of that inline
          value - see the `card` object. `memari-card` stays as a handle for
          measuring the real thing in a browser, which is the only way this
          was ever going to be caught. */}
    </section>
  );
}

/**
 * MEMOISED, all four of them.
 *
 * A drag re-renders the drawer on every pointer move - it has to, the panel's
 * height is changing - and without this that re-render walks the entire tree
 * below: five groups, every card in each, every one of them rebuilding a
 * style object and handing React a fresh SVG container to diff. None of it
 * produces a different result, because the only thing actually changing is a
 * CSS variable the browser applies without asking React.
 *
 * For these to bail out their props must be stable, which is why the card
 * object carries no numbers, `groups` is memoised, and the callbacks passed
 * in are the same ones each time.
 */
function LevelGroupInner({
  level,
  pages,
  activeLevel,
  activeVariantKey,
  card,
  occurrences: levelOccurrences,
  highContrast,
  reduceMotion,
  onOpen,
  dividerAfter,
}: {
  level: PageLevel;
  pages: TimelinePage[];
  activeLevel: PageLevel;
  activeVariantKey: string | null;
  card: { sizeTransition: string };
  /** Every month (or week, or day) this level covers, or null when the book
   *  has no term and so has no occurrences to divide into. */
  occurrences: Occurrence[] | null;
  highContrast: boolean;
  reduceMotion: boolean;
  onOpen: (level: PageLevel, variantKey: string | null) => void;
  /** Draw the rule between this box and the next. Every box but the last. */
  dividerAfter: boolean;
}) {
  const journalId = useJournalId();
  const [open, setOpen] = useState(false);
  // What the popover hangs off. It has to be measured rather than positioned
  // in CSS - see OccurrencePopover on why the panel cannot live in this tree.
  const cogRef = useRef<HTMLButtonElement>(null);

  // The DEFAULT spread first, then any occurrence that has its own. Grouped
  // rather than interleaved, because "the one every month gets" and "the one
  // February gets" are different kinds of thing, and the default is the one
  // you edit almost always.
  const byVariant = new Map<string | null, TimelinePage[]>();
  for (const page of pages) {
    const key = page.variantKey ?? null;
    byVariant.set(key, [...(byVariant.get(key) ?? []), page]);
  }
  const defaults = byVariant.get(null) ?? [];
  const variants = [...byVariant.entries()]
    .filter(([key]) => key !== null)
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));

  const labelFor = (key: string) => levelOccurrences?.find((o) => o.key === key)?.label ?? key;

  // The sub-label row is reserved in EVERY column, variant or not. Without
  // it a group that has one is taller than its neighbours, the level labels
  // stop lining up, and the group with the variant pushes its own label out
  // of the bottom of the drawer - which is what it did.
  const subLabel = (text: string) => (
    <div
      style={{
        height: SUB_LABEL_HEIGHT,
        lineHeight: `${SUB_LABEL_HEIGHT}px`,
        fontSize: 9.5,
        color: highContrast ? "#ffffff" : "rgba(255, 255, 255, 0.55)",
        whiteSpace: "nowrap",
        textAlign: "center",
        overflow: "hidden",
      }}
    >
      {text}
    </div>
  );

  const hasCog = repeats(level);

  // THE ROWS ARE ON THE CARDS' CLOCK. A row's height is 1.2 cards (room for
  // the active set - see CARD_ROW_HEIGHT), read from the same variable the
  // cards are, and it had no transition while they did: on a settle the rows
  // took their new height at once and the cards, centred in them, eased to
  // theirs over SLIDE_MS. Reported as the contents jumping up (settling down
  // to resting) or down (settling up to expanded) before sliding back.
  // Measured before the fix: 8px above resting and let go, the level's name
  // jumped 8.4px and the cards 4.2px in the first frame. "" while dragging,
  // like the cards, so neither lags the finger.
  const rowTransition = reduceMotion ? "none" : card.sizeTransition;

  // WHICH SET IS LIFTED - hovered, or focused from the keyboard - is held
  // here rather than in the card, because the whole row answers it. The
  // lifted card takes its extra width in the row, so its neighbours move
  // aside; the row then gives back half of that on each side, as negative
  // margins, so its footprint in the box - and so the box - stays the same
  // size and the level stays centred in it. See HOVER_SCALE.
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const liftFor = (key: string, selected: boolean) =>
    !selected && (hoverKey === key || focusKey === key);
  const liftHandlers = (key: string) => ({
    onHover: (on: boolean) => setHoverKey((current) => (on ? key : current === key ? null : current)),
    onFocusVisible: (on: boolean) =>
      setFocusKey((current) => (on ? key : current === key ? null : current)),
  });
  // Hovered or keyboard-focused, INCLUDING the open set - which does not
  // lift, but can still be removed. This is what shows a card's X.
  const showsControls = (key: string) => hoverKey === key || focusKey === key;
  const defaultSelected = level === activeLevel && activeVariantKey === null;
  // Every card this group draws, with the key its lift state goes by: the
  // level's SPREAD as one card, then each added page as its own (see
  // inSpreads), lifted one at a time.
  const cardsOf = (setKey: string, setPages: TimelinePage[], selected: boolean) =>
    inSpreads(setPages, level, joinedSavedSpread).map((spread, index) => ({
      key: `${setKey}:${index}`,
      pages: spread,
      selected,
      index,
      // A card added to the set - not its first - that is a use of a saved
      // page can be taken out whole: what is on it is kept in Saved.
      canRemoveLinked: index > 0 && isOneSavedUse(spread) && setPages.length > spread.length,
      savedInSet: savedIdsIn(setPages),
    }));
  const defaultCards = cardsOf(DEFAULT_SET_KEY, defaults, defaultSelected);
  const variantCards = variants.map(([key, variantPages]) =>
    cardsOf(String(key), variantPages, level === activeLevel && activeVariantKey === key)
  );
  const liftedPages = [...defaultCards, ...variantCards.flat()].reduce(
    (sum, one) => sum + (liftFor(one.key, one.selected) ? one.pages.length : 0),
    0
  );
  // The row gives the lift back on the card's own clock - see liftMs in
  // PageCardInner: SLIDE_MS when the card under the pointer (or focus) is
  // the one just opened, so the row and that card settle together.
  const recentreMs = [...defaultCards, ...variantCards.flat()].some(
    (one) => one.selected && (hoverKey === one.key || focusKey === one.key)
  )
    ? SLIDE_MS
    : HOVER_MS;
  const recentre =
    liftedPages > 0 ? `calc(${round4((-liftedPages * (HOVER_SCALE - 1)) / 2)} * var(--memari-card-w))` : "0px";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        position: "relative",
        border: `${GROUP_BORDER_PX}px solid ${highContrast ? "#777777" : GROUP_BORDER}`,
        borderRadius: GROUP_RADIUS,
        padding: `${GROUP_PAD_TOP}px ${GROUP_PAD_X}px ${GROUP_PAD_BOTTOM}px`,
      }}
    >
      {/* The rule between this box and the next - see LEVEL_DIVIDER_SHARE.
          Hung off the box rather than put in the row as an element of its
          own, which would take a gap on each side of it and push the boxes
          apart. Absolute offsets here are from inside the border, so the
          border is added back: `100%` is the box without it. */}
      {dividerAfter && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: `calc(100% + ${GROUP_BORDER_PX + (GROUP_GAP - LEVEL_DIVIDER_PX) / 2}px)`,
            top: `calc((100% + ${2 * GROUP_BORDER_PX}px) * ${(1 - LEVEL_DIVIDER_SHARE) / 2} - ${GROUP_BORDER_PX}px)`,
            width: LEVEL_DIVIDER_PX,
            height: `calc((100% + ${2 * GROUP_BORDER_PX}px) * ${LEVEL_DIVIDER_SHARE})`,
            background: highContrast ? "#777777" : GROUP_BORDER,
            pointerEvents: "none",
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          gap: CARD_GAP,
          alignItems: "flex-start",
          marginLeft: recentre,
          marginRight: recentre,
          // On the card's own clock, so the row moves back exactly as fast
          // as the card pushes it out.
          transition: reduceMotion
            ? "none"
            : `margin-left ${recentreMs}ms ${SETTLE}, margin-right ${recentreMs}ms ${SETTLE}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: CARD_TO_SUB_LABEL }}>
          <div style={{ display: "flex", gap: CARD_GAP, height: CARD_ROW_HEIGHT, alignItems: "center", transition: rowTransition }}>
            {defaults.length === 0 ? (
              <EmptyLevel />
            ) : (
              defaultCards.map((one) => (
                <PageCard
                  key={one.key}
                  pages={one.pages}
                  selected={one.selected}
                  lifted={liftFor(one.key, one.selected)}
                  controlsShown={showsControls(one.key)}
                  {...liftHandlers(one.key)}
                  card={card}
                  // A page is removable only when it is BLANK and not the
                  // last of its SET - the server refuses anything else, and
                  // offering a control that will be refused is worse than not
                  // offering it. The set, not this card: page 3 alone on its
                  // card is still one of three.
                  canRemoveBlank={defaults.length > 1}
                  canRemoveLinked={one.canRemoveLinked}
                  savedInSet={one.savedInSet}
                  highContrast={highContrast}
                  reduceMotion={reduceMotion}
                  onOpen={() => onOpen(level, null)}
                />
              ))
            )}
          </div>
          {/* Named only once something else is beside it. On its own the
              default needs no caption - it is the only thing there. */}
          {subLabel(variants.length > 0 ? `every ${LEVEL_NOUN[level]}` : "")}
        </div>
        {/* ADD A PAGE to this level's set. A level is a stack of pages, not
            one spread: "add extra pages, either empty/ruled or full of
            modules that cant fit on spread at each level that repeats", and
            every occurrence of the level then gets all of them.

            At the end of the DEFAULT column only. A variant's set is a copy
            of the default's, and offering to grow one of them out of step
            with the other is a question nobody asked. */}
        <div style={{ display: "flex", height: CARD_ROW_HEIGHT, alignItems: "center", flexShrink: 0, transition: rowTransition }}>
          <AddPageCard
            card={card}
            level={level}
            variantKey={null}
            reduceMotion={reduceMotion}
            savedInSet={savedIdsIn(defaults)}
          />
        </div>
        {/* An occurrence with its own layout sits BESIDE the default, not on
            top of it. This is exactly where the design originally had cards
            overlap like a Dock stack - see this file's header for why a
            stack is the wrong answer to "show me there is more than one". */}
        {variants.map(([key], variantIndex) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: CARD_TO_SUB_LABEL }}>
            <div style={{ display: "flex", gap: CARD_GAP, height: CARD_ROW_HEIGHT, alignItems: "center", transition: rowTransition }}>
              {variantCards[variantIndex].map((one) => (
                <PageCard
                  key={one.key}
                  pages={one.pages}
                  selected={one.selected}
                  lifted={liftFor(one.key, one.selected)}
                  controlsShown={showsControls(one.key)}
                  {...liftHandlers(one.key)}
                  // REMOVE THIS OCCURRENCE'S OWN LAYOUT, from the card itself.
                  // Asked for: "I added a january 2026 spread but there is no
                  // button to delete. add an x button to the top corner when
                  // hovering a page preview". The same server action as the
                  // cog's Reset - the month goes back to printing the default.
                  // On the FIRST card only: it removes the whole set, and an X
                  // on every card of it would read as removing that card.
                  removeLabel={one.index === 0 ? `Remove ${labelFor(String(key))}'s own layout` : undefined}
                  onRemove={
                    one.index === 0
                      ? async () => {
                          await deleteLevelVariant(journalId, level, String(key));
                          // Off the deleted occurrence if it is the one open:
                          // the pages behind that URL have just gone.
                          // Otherwise a reload, since the drawer reads the
                          // book from the server.
                          if (level === activeLevel && activeVariantKey === key) onOpen(level, null);
                          else window.location.reload();
                        }
                      : undefined
                  }
                  canRemoveLinked={one.canRemoveLinked}
                  savedInSet={one.savedInSet}
                  card={card}
                  highContrast={highContrast}
                  reduceMotion={reduceMotion}
                  onOpen={() => onOpen(level, key)}
                />
              ))}
            </div>
            {/* Which occurrence this is. A variant card without one is a
                duplicate of the default with no way to tell them apart. */}
            {subLabel(labelFor(String(key)))}
          </div>
        ))}
      </div>

      {/* The level's name, centred along the bottom of its box. Uppercase and
          tracked out, because small uppercase sans-serif collides without the
          extra room. Its own line now - the cog used to share it, and a 24px
          button in a 14px line pushed the three repeating levels' names 3.75px
          below Beginning's and Ending's. */}
      <div
        style={{
          marginTop: LEVEL_LABEL_GAP,
          height: LEVEL_LABEL_HEIGHT,
          lineHeight: `${LEVEL_LABEL_HEIGHT}px`,
          textAlign: "center",
          whiteSpace: "nowrap",
        }}
      >
        <span
          title={LEVEL_CADENCE[level]}
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: highContrast ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
          }}
        >
          {LEVEL_LABELS[level]}
        </span>
      </div>

      {/* The cog, in the box's top-right corner.

          QUIET PERMANENCE, not hover-to-reveal. The original design had
            this appear only when the pointer entered the group, which does
            not exist on a touch screen, cannot be reached by keyboard, and
            is invisible to a screen reader while it is transparent. It is
            always here instead, and saturates to full on hover or focus.

            AT THE SAME WEIGHT AS ITS LABEL, which is the part that was wrong.
            It sat at 40% - 3.58:1 against this surface, which clears the 3:1
            minimum and sounds fine until you measure what it stands next to:
            the level label is 0.6, or 6.18:1. The only control in the row was
            the faintest thing in it, at nearly half the contrast of the
            static text beside it, and it read as decoration. Reported exactly
            that way - "the cogs still look like light icons".

            So "reduced contrast" means reduced against the ACTIVE state, not
            against white. A control is never quieter than the text it sits
            beside; check-contrast.mts holds that as a rule so it cannot drift
            back.

            Only on a level that REPEATS: front and back matter are printed
            once, so there is no second occurrence to give a layout to. */}
      {hasCog && (
        <div style={{ position: "absolute", top: COG_INSET, right: COG_INSET }}>
          <CogButton
            buttonRef={cogRef}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            label={`Choose which ${LEVEL_NOUN[level]} gets its own layout`}
            highContrast={highContrast}
            reduceMotion={reduceMotion}
          />
        </div>
      )}

      {open && (
        <OccurrencePopover
          anchorRef={cogRef}
          level={level}
          occurrences={levelOccurrences}
          customised={new Set(variants.map(([key]) => String(key)))}
          onClose={() => setOpen(false)}
          onOpenDefault={() => onOpen(level, null)}
        />
      )}
    </div>
  );
}

function CogButton({
  buttonRef,
  open,
  onToggle,
  label,
  highContrast,
  reduceMotion,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  open: boolean;
  onToggle: () => void;
  label: string;
  highContrast: boolean;
  reduceMotion: boolean;
}) {
  const [lit, setLit] = useState(false);
  const bright = open || lit || highContrast;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      aria-label={label}
      aria-expanded={open}
      title={label}
      style={{
        // 24px square - WCAG 2.5.8's minimum target - around a 13px glyph.
        width: COG_TARGET,
        height: COG_TARGET,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "none",
        background: "transparent",
        color: bright ? "#ffffff" : "rgba(255, 255, 255, 0.6)",
        cursor: "pointer",
        transition: reduceMotion ? "none" : "color 150ms ease-out",
      }}
    >
      {/* A COG, which this was not. It was a ring with eight DETACHED rays
          around it, and a ring with detached rays is a sun - every brightness
          control ever drawn. Reported as "I still see cogs as light icons",
          which I first read as a complaint about contrast and spent a round
          fixing the opacity of. The word was literal.

          The difference is whether the teeth meet the ring. These do: each
          tooth's flanks run from the root radius out to the tip and the roots
          are joined by arcs of the ring itself, so there is no gap for the
          eye to read as a gap. Filled rather than stroked, because eight
          hairline outlines at 14px turn back into a scatter of marks.

          Generated, not drawn by hand - 8 teeth, root 7.4, tip 10.6, hub 3.3
          in a 24 box. Hand-typing 40 coordinates is how you get a gear with
          one tooth slightly off, which is unfixable by eye at this size. */}
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M9.59 5.00L9.80 1.63L14.20 1.63L14.41 5.00A7.4 7.4 0 0 1 15.24 5.35L17.77 3.11L20.89 6.23L18.65 8.76A7.4 7.4 0 0 1 19.00 9.59L22.37 9.80L22.37 14.20L19.00 14.41A7.4 7.4 0 0 1 18.65 15.24L20.89 17.77L17.77 20.89L15.24 18.65A7.4 7.4 0 0 1 14.41 19.00L14.20 22.37L9.80 22.37L9.59 19.00A7.4 7.4 0 0 1 8.76 18.65L6.23 20.89L3.11 17.77L5.35 15.24A7.4 7.4 0 0 1 5.00 14.41L1.63 14.20L1.63 9.80L5.00 9.59A7.4 7.4 0 0 1 5.35 8.76L3.11 6.23L6.23 3.11L8.76 5.35A7.4 7.4 0 0 1 9.59 5.00ZM8.7 12A3.3 3.3 0 1 0 15.3 12A3.3 3.3 0 1 0 8.7 12Z"
        />
      </svg>
    </button>
  );
}

/**
 * A panel that opens UPWARDS from a control in the drawer: the cog's list of
 * occurrences, the "+" card's choice of page, a card's menu.
 *
 * IT CANNOT LIVE IN THE DRAWER'S TREE, and this shipped broken because it
 * did. The panel opens UPWARDS out of a level group, and every level group
 * sits inside the one horizontal scroller - which is `overflowX: auto,
 * overflowY: hidden`, so everything above the group's own top edge is clipped
 * away. A scroll container clips on both axes whatever the other axis says,
 * so there is no combination of overflow values on that element that lets a
 * child escape it: the panel drew itself entirely outside the visible region
 * and only the bleed of its shadow showed.
 *
 * The scrim did NOT vanish with it - `position: fixed` is laid out against
 * the viewport and escapes the clip - so clicking the cog silently swallowed
 * every click on the canvas while showing nothing. Reported exactly that way:
 * a drop shadow, and scrolling and switching stop working.
 *
 * So it portals to the body and is positioned from the cog's measured rect.
 * Measured rather than computed, because the cog's position depends on how
 * far the filmstrip has been scrolled, which is not a number this component
 * can know.
 */
function AnchoredPanel({
  anchorRef,
  label,
  onClose,
  width = PANEL_WIDTH,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  label: string;
  onClose: () => void;
  width?: number;
  children: React.ReactNode;
}) {
  const [at, setAt] = useState<PanelPlacement | null>(null);

  // Before paint, so it never shows for a frame in the wrong place. Re-run on
  // scroll (capture: the filmstrip's own scroll does not bubble) and on
  // resize, so the panel stays on its control rather than being left behind.
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      // The arithmetic lives in src/lib/anchoredPanel.ts, where a check can
      // reach it - this panel has been invisible twice, once from a clip and
      // once from being positioned off the top of the window.
      setAt(
        placeAnchoredPanel(rect, { width: window.innerWidth, height: window.innerHeight }, width)
      );
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef, width]);

  // Escape closes, like every other dismissible surface in the editor.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined" || at === null) return null;

  return createPortal(
    <>
      {/* A click anywhere else closes it. Behind the panel, so it never eats
          a click meant for the list itself. */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 50, background: "transparent" }}
      />
      <div
        role="dialog"
        aria-label={label}
        style={{
          position: "fixed",
          left: at.left,
          ...(at.place === "above" ? { bottom: at.offset } : { top: at.offset }),
          zIndex: 51,
          width,
          // The room that side of the control actually has, not a constant.
          // It scrolls, so a capped panel is short rather than cut off.
          maxHeight: at.maxHeight,
          overflowY: "auto",
          background: "#1c1c1e",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 10,
          boxShadow: "0 8px 28px rgba(0, 0, 0, 0.5)",
          padding: 8,
          color: "#ddd",
          fontSize: 12,
        }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

/**
 * The months (or weeks, or days) this level covers, and which of them have a
 * layout of their own.
 *
 * REPEAT BY DEFAULT, CUSTOMISE BY EXCEPTION. Every occurrence gets the
 * default layout unless it is given one here, so this list is almost always
 * all "default" - which is the point. Most books want one spread repeated,
 * and the exception has to cost nothing when nobody uses it.
 *
 * Drawn in an AnchoredPanel - see there for why it cannot live in the drawer.
 */
function OccurrencePopover({
  anchorRef,
  level,
  occurrences: list,
  customised,
  onClose,
  onOpenDefault,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  level: PageLevel;
  occurrences: Occurrence[] | null;
  customised: Set<string>;
  onClose: () => void;
  /** Where to go when an occurrence stops having its own layout. */
  onOpenDefault: () => void;
}) {
  const journalId = useJournalId();
  const [pending, error, run] = useAsyncAction();
  return (
    <AnchoredPanel anchorRef={anchorRef} label={`${LEVEL_LABELS[level]} layouts`} onClose={onClose}>
      {list === null ? (
        // NOT an empty list, which would read as "this book has no months".
        // It simply has not been told how long it is yet.
        <div style={{ padding: "10px 8px", color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
          Set the start and end dates under Page Settings, and every{" "}
          {LEVEL_NOUN[level]} the book covers will be listed here.
        </div>
      ) : list.length === 0 ? (
        <div style={{ padding: "10px 8px", color: "rgba(255,255,255,0.6)" }}>
          This book&rsquo;s term covers none.
        </div>
      ) : (
        list.map((occurrence) => {
          const key = occurrence.key as string;
          const isCustom = customised.has(key);
          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {occurrence.label}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: isCustom ? "#8fdc9a" : "rgba(255,255,255,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                {isCustom ? "own layout" : "default"}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    if (isCustom) {
                      await deleteLevelVariant(journalId, level, key);
                      // Off the deleted occurrence, not a reload of it: the
                      // pages behind this URL have just been removed. The
                      // route falls back to the default anyway, but landing
                      // there by way of a URL that names something gone is
                      // a lie about where you are.
                      onOpenDefault();
                      return;
                    }
                    await createLevelVariant(journalId, level, key);
                    // A reload rather than patching state: the drawer, the
                    // canvas and the routes all read this from the server,
                    // and re-deriving each of them here would be a second
                    // description of what the server just did.
                    window.location.reload();
                  })
                }
                style={{
                  padding: "3px 8px",
                  fontSize: 10.5,
                  borderRadius: 5,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "transparent",
                  color: isCustom ? "#ff8f5c" : "#ddd",
                  cursor: pending ? "default" : "pointer",
                  opacity: pending ? 0.5 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {isCustom ? "Reset" : "Customise"}
              </button>
            </div>
          );
        })
      )}
      {error && <div style={{ padding: "6px 8px", color: "#ff8f5c", fontSize: 11 }}>{error}</div>}
    </AnchoredPanel>
  );
}

/**
 * The pages that open together - one page, or a SPREAD - as ONE card.
 *
 * Asked for, 2026-09-18: "connect only spread page previews (not single
 * pages) ... with a thin grey line separating and one active border around
 * both of them when selected instead around each." A spread was two cards
 * eight pixels apart, each with its own ring, which read as two things that
 * happened to be selected at once. It is one thing: clicking either opened
 * the same spread, and the canvas draws them as one.
 *
 * So one button, one ring and one name for the spread, with each page in its
 * own slot and the seam between them. A single page is exactly the card it
 * always was. A PAGE ADDED with the "+" card is its own card: a week's pages
 * 1-2 joined, page 3 alone (Andrew's choice over one strip of three,
 * 2026-09-21), and a page added to Beginning alone beside the first -
 * "pages should be single in the timeline unless they are a part of a two
 * page spread like the monthly and weekly templates". See inSpreads.
 *
 * The page slots FLEX rather than taking the card width themselves. The
 * card's width is what transitions during a settle, and a slot sized from
 * the same variable would need a transition of its own to keep up; a flex
 * slot is simply always its share. At rest the share is exactly one card
 * width, because the seams are added to the total, not taken out of it.
 *
 * Three boxes, for the sizes - see ACTIVE_SCALE. The OUTER one is what the
 * row lays out: card-sized, or 1.2x for the active set. On hover it keeps
 * that size and takes MARGINS, which is what moves its neighbours aside.
 * The FRAME inside it is what visibly grows into those margins: absolutely
 * placed, and in PERCENTAGES of the outer box, so a drawer drag (which
 * changes the outer box every frame) never sets off the hover's transition
 * - a percentage's computed value does not change when its container does.
 * Keeping the two apart is also what lets the outer box's width stay on
 * the drawer's settle clock while the hover runs on its own. The button
 * fills the frame.
 */
function PageCardInner({
  pages,
  selected,
  card,
  canRemoveBlank = false,
  canRemoveLinked = false,
  savedInSet,
  highContrast,
  reduceMotion,
  onOpen,
  lifted,
  controlsShown,
  onHover,
  onFocusVisible,
  onRemove,
  removeLabel,
}: {
  pages: TimelinePage[];
  selected: boolean;
  /** Hovered or keyboard-focused, and not the open set - see LevelGroup. */
  lifted: boolean;
  /** Hovered or keyboard-focused, open or not: show the card's X. */
  controlsShown: boolean;
  /** Remove the whole SET - an occurrence's own layout. Absent for the
   *  default set, which cannot be removed; its blank pages have their own
   *  X each, see canRemoveBlank. */
  onRemove?: () => Promise<void>;
  removeLabel?: string;
  onHover: (on: boolean) => void;
  onFocusVisible: (on: boolean) => void;
  card: { sizeTransition: string };
  /** Offer to remove the set's BLANK pages. Only ever true when the set has
   *  more than one - see deletePageFromLevel. */
  canRemoveBlank?: boolean;
  /** Offer to remove this card whole: a use of a saved page, added to the
   *  set - see deletePageFromLevel. */
  canRemoveLinked?: boolean;
  /** The saved pages already used in this card's set, comma-joined - a set
   *  can use each once. A string so the memo below still compares equal. */
  savedInSet: string;
  highContrast: boolean;
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  const count = pages.length;
  const first = pages[0];
  const moduleCount = pages.reduce((sum, page) => sum + page.moduleCount, 0);
  const linked = isOneSavedUse(pages) ? first.saved : null;
  const title =
    (count === 1
      ? `${LEVEL_LABELS[first.level]} page ${first.position + 1} - ${first.moduleCount} module(s)`
      : `${LEVEL_LABELS[first.level]} spread, pages ${first.position + 1}-${pages[count - 1].position + 1} - ${moduleCount} module(s)`) +
    (linked ? ` - saved as "${linked.name}": editing it changes every use` : "");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  // Outline with an OFFSET, not a border: a border sits inside the box and
  // changes the thumbnail's own proportions, which on a page preview is the
  // one thing that must stay true.
  const seams = (count - 1) * SPREAD_SEAM_PX;
  const scale = selected ? ACTIVE_SCALE : 1;
  // ONE CLOCK WHEN A HOVERED CARD IS CHOSEN. Clicked, a card goes from
  // lifted (1.1x, in place) to open (1.2x, in the row) - two changes at once,
  // the lift going and the size arriving. On their own clocks (the lift's
  // 220ms, the size's SLIDE_MS) the lift finished first and the card visibly
  // shrank before it grew: measured 159.4 -> 157.9 -> 173.8px. Reported as
  // the clicked preview's animation being laggy. On the SAME clock and curve
  // the product (1 + 0.2e)(1.1 - 0.1e) only ever grows, so an open card's
  // lift runs on SLIDE_MS; every other card's stays quick.
  const liftMs = selected ? SLIDE_MS : HOVER_MS;
  // What the frame grows by on each side, and so how far the neighbours
  // move: half of what the pages grow by. The seams do not grow.
  const pushAside = lifted ? `calc(${round4((count * (HOVER_SCALE - 1)) / 2)} * var(--memari-card-w))` : "0px";
  const outer: CSSProperties = {
    position: "relative",
    flexShrink: 0,
    width: `calc(${round4(count * scale)} * var(--memari-card-w) + ${seams}px)`,
    height: `calc(${scale} * var(--memari-card-h))`,
    marginLeft: pushAside,
    marginRight: pushAside,
    transition: reduceMotion
      ? "none"
      : [card.sizeTransition, `margin-left ${liftMs}ms ${SETTLE}`, `margin-right ${liftMs}ms ${SETTLE}`]
          .filter(Boolean)
          .join(", "),
  };
  // The frame grows the PAGES by `grow` and leaves the seams at 1px, so a
  // spread keeps each page's proportions at every step of the hover.
  const grow = lifted ? HOVER_SCALE : 1;
  const unscaled = seams * (grow - 1);
  const frame: CSSProperties = {
    position: "absolute",
    left: `calc(${round4((1 - grow) / 2)} * 100% + ${round4(unscaled / 2)}px)`,
    top: `calc(${round4((1 - grow) / 2)} * 100%)`,
    width: `calc(${grow} * 100% - ${round4(unscaled)}px)`,
    height: `calc(${grow} * 100%)`,
    transition: reduceMotion
      ? "none"
      : ["left", "top", "width", "height"].map((p) => `${p} ${liftMs}ms ${SETTLE}`).join(", "),
  };
  const style: CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    padding: 0,
    border: highContrast && !selected ? "1px solid #777777" : "none",
    borderRadius: 3,
    background: "#fdfcf9",
    // Dimming the unselected is what keeps a row of thumbnails from
    // competing with the canvas it describes. Under Increase Contrast it
    // goes, and the selection ring thickens to carry the distinction alone.
    // A hovered card comes up to full strength while it is under the
    // pointer - "un grey them".
    opacity: selected || lifted || highContrast ? 1 : 0.6,
    outline: selected ? `${highContrast ? 4 : 2}px solid ${ACCENT}` : "none",
    outlineOffset: 2,
    cursor: selected ? "default" : "pointer",
    overflow: "hidden",
    transition: reduceMotion ? "none" : `opacity ${HOVER_MS}ms ${SETTLE}`,
  };
  const removable = canRemoveBlank && pages.some((page) => page.moduleCount === 0);
  return (
    <div style={outer}>
      <div
        style={frame}
        // On the frame, not the button, so the remove badge - which sits
        // half outside the card - counts as part of it.
        onPointerEnter={() => onHover(true)}
        onPointerLeave={() => onHover(false)}
        // Keyboard focus lifts a card as a hover does; a click's focus does
        // not, or a card clicked and then left would stay large.
        onFocus={(event) => onFocusVisible((event.target as HTMLElement).matches(":focus-visible"))}
        onBlur={() => onFocusVisible(false)}
      >
        {/* The set's X, over its top-right corner. Before the button in the
            DOM, like the blank-page layer below, so a keyboard reaches the
            card's controls in reading order; positioned, so it paints above
            the card either way. */}
        {onRemove && (
          <CornerRemoveButton
            label={removeLabel ?? "Remove"}
            visible={controlsShown}
            reduceMotion={reduceMotion}
            onRemove={onRemove}
          />
        )}
        {!onRemove && canRemoveLinked && (
          <CornerRemoveButton
            label={count === 2 ? "Remove this saved spread from the journal" : "Remove this saved page from the journal"}
            visible={controlsShown}
            reduceMotion={reduceMotion}
            onRemove={async () => {
              await deletePageFromLevel(first.pageId);
              window.location.reload();
            }}
          />
        )}
        {/* The card's menu - save it, or put a saved one in its place - over
            its top-LEFT corner, the X having the right. */}
        <CornerMenuButton
          buttonRef={menuRef}
          label={count === 2 ? "Spread options" : "Page options"}
          visible={controlsShown || menuOpen}
          open={menuOpen}
          reduceMotion={reduceMotion}
          onToggle={() => setMenuOpen((v) => !v)}
        />
        {menuOpen && (
          <AnchoredPanel
            anchorRef={menuRef}
            label={count === 2 ? "Spread options" : "Page options"}
            onClose={() => setMenuOpen(false)}
          >
            <CardMenu pages={pages} linked={linked} savedInSet={savedInSet} />
          </AnchoredPanel>
        )}
        {/* A use of a saved page says so, always: an edit to it is an edit
            to every journal that uses it. */}
        {linked && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 4,
              bottom: 4,
              zIndex: 1,
              width: 16,
              height: 16,
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: ACCENT,
              color: "#ffffff",
              pointerEvents: "none",
            }}
          >
            <LinkGlyph size={9} />
          </span>
        )}
        {/* Each blank page's remove control, over that page's own top-right
            corner. A layer laid out like the slots below rather than inside
            them, because a button cannot hold another button. */}
        {removable && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              gap: SPREAD_SEAM_PX,
              pointerEvents: "none",
            }}
          >
            {pages.map((page) => (
              <div key={page.pageId} style={{ position: "relative", flex: "1 1 0", minWidth: 0 }}>
                {page.moduleCount === 0 && (
                  <CornerRemoveButton
                    label="Remove this blank page"
                    visible={controlsShown}
                    reduceMotion={reduceMotion}
                    onRemove={async () => {
                      await deletePageFromLevel(page.pageId);
                      window.location.reload();
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onOpen}
          aria-current={selected ? "page" : undefined}
          title={title}
          className="memari-card"
          style={style}
        >
          {pages.map((page, index) => (
            <Fragment key={page.pageId}>
              {index > 0 && (
                <span
                  aria-hidden="true"
                  style={{ flex: `0 0 ${SPREAD_SEAM_PX}px`, background: SPREAD_SEAM_COLOR }}
                />
              )}
              {/* Positioned for the loading indicator, which centres itself
                  in its page. */}
              <span style={{ position: "relative", flex: "1 1 0", minWidth: 0, height: "100%" }}>
                {/* The real drawing at page scale, from the same elements the
                    PDF exporter reads - see loadPlannerPages' TimelinePage. A
                    preview made any other way would be a picture OF the page
                    rather than the page. */}
                <PagePreview page={page} />
              </span>
            </Fragment>
          ))}
        </button>
      </div>
    </div>
  );
}

/** A calc() coefficient without floating-point tails: (1 - 1.1) / 2 is
 *  -0.050000000000000044. */
function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

/**
 * A card's X: remove a blank page from a level's set, or an occurrence's own
 * layout.
 *
 * SHOWN WHEN ITS CARD IS HOVERED or focused from the keyboard, and when it
 * is itself focused from the keyboard - "add an x button to the top corner
 * when hovering a page preview". It was permanently visible at 35%, which on
 * a row of cards is a row of Xs. But it is PRESENT the whole time, only
 * transparent, so it stays in the accessibility tree and in the tab order;
 * and since it is part of its card's frame, the pointer cannot be over it
 * without the card being hovered and the X therefore showing.
 *
 * TWO CLICKS - "make it two clicks with red remove". The first turns the X
 * into a red "Remove", growing left out of the corner; the second removes.
 * Leaving the card, Escape or tabbing away puts it back. An occurrence's
 * layout is a month's worth of design, and one stray click on a control
 * that only appears under the pointer was all that stood between it and
 * gone. Blank pages get the same two steps, so the control means one thing.
 *
 * A 24px target (WCAG 2.5.8's minimum) around the 18px disc that was here
 * before, centred where the disc was, over the card's top-right corner.
 * Only ever rendered where the server will agree to the removal, so it
 * never offers something that fails.
 */
function CornerRemoveButton({
  label,
  visible,
  reduceMotion,
  onRemove,
}: {
  label: string;
  visible: boolean;
  reduceMotion: boolean;
  onRemove: () => Promise<void>;
}) {
  const [pending, error, run] = useAsyncAction();
  const [lit, setLit] = useState(false);
  // Keyboard focus only. A mouse click focuses a button too (in Chrome),
  // and counting that would keep the X up after the pointer had left.
  const [focusVisible, setFocusVisible] = useState(false);
  const [armed, setArmed] = useState(false);
  // Disarmed the moment its card stops being hovered or focused - adjusted
  // during render, so there is never a frame of a red "Remove" left behind
  // on a card the pointer has already left.
  if (armed && !visible && !focusVisible && !pending) setArmed(false);
  const shown = visible || focusVisible || pending || error !== null || armed;
  const discWidth = armed ? REMOVE_PILL_WIDTH : REMOVE_DISC;
  const ease = (property: string) => `${property} 150ms ease-out`;
  return (
    <button
      type="button"
      disabled={pending}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={(event) => setFocusVisible(event.currentTarget.matches(":focus-visible"))}
      onBlur={() => {
        setFocusVisible(false);
        setArmed(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && armed) {
          event.stopPropagation();
          setArmed(false);
        }
      }}
      onClick={(event) => {
        event.stopPropagation();
        if (!armed) {
          setArmed(true);
          return;
        }
        void run(onRemove).then(() => setArmed(false));
      }}
      aria-label={armed ? `Confirm: ${label}` : label}
      title={error ?? (armed ? `Click again to ${label.toLowerCase()}` : label)}
      style={{
        pointerEvents: "auto",
        position: "absolute",
        // Anchored by its RIGHT edge, so the "Remove" grows out of the
        // corner to the left, over the card, rather than off it.
        top: -(REMOVE_TARGET - REMOVE_DISC) / 2 - 7,
        right: -(REMOVE_TARGET - REMOVE_DISC) / 2 - 7,
        zIndex: 2,
        width: discWidth + (REMOVE_TARGET - REMOVE_DISC),
        height: REMOVE_TARGET,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: pending ? "default" : "pointer",
        opacity: shown ? (pending ? 0.5 : 1) : 0,
        transition: reduceMotion ? "none" : [ease("opacity"), ease("width")].join(", "),
      }}
    >
      <span
        style={{
          position: "relative",
          width: discWidth,
          height: REMOVE_DISC,
          borderRadius: REMOVE_DISC / 2,
          overflow: "hidden",
          background: error
            ? "#ff8f5c"
            : armed
            ? REMOVE_RED
            : lit
            ? "#ffffff"
            : "rgba(255,255,255,0.35)",
          color: "#1c1c1e",
          transition: reduceMotion ? "none" : [ease("width"), ease("background")].join(", "),
        }}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            opacity: armed ? 0 : 1,
            transition: reduceMotion ? "none" : ease("opacity"),
          }}
        >
          <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ffffff",
            fontSize: 10.5,
            fontWeight: 600,
            lineHeight: 1,
            whiteSpace: "nowrap",
            opacity: armed ? 1 : 0,
            transition: reduceMotion ? "none" : ease("opacity"),
          }}
        >
          Remove
        </span>
      </span>
    </button>
  );
}

/** The X's visible disc, and the target around it. */
const REMOVE_DISC = 18;
const REMOVE_TARGET = 24;
/** The disc once armed, wide enough for "Remove" with room either side. */
const REMOVE_PILL_WIDTH = 58;
/** The armed disc. Not Apple's system red (#ff3b30 / #ff453a): white type
 *  on that is 3.55:1, under the 4.5 that 10.5px text needs. This one is
 *  4.83:1 and still unmistakably red. check:contrast holds it there. */
const REMOVE_RED = "#d92d20";

/**
 * The card that adds a page to a level.
 *
 * A dashed outline the size of a page with a plus in it - the shape of the
 * thing it makes, so what will happen is legible before you click. Quiet
 * until hovered, like everything else in this row that is not content.
 */
function AddPageCardInner({
  card,
  level,
  variantKey,
  reduceMotion,
  savedInSet,
}: {
  card: { sizeTransition: string };
  level: PageLevel;
  variantKey: string | null;
  reduceMotion: boolean;
  /** See PageCard's. */
  savedInSet: string;
}) {
  const journalId = useJournalId();
  const [pending, error, run] = useAsyncAction();
  const [lit, setLit] = useState(false);
  // WITH NOTHING SAVED, "+" ADDS A BLANK PAGE AT ONCE, as it always has - a
  // menu of one choice is a click for nothing. With saved pages it asks which.
  const saved = useSavedItems().pages;
  const [menuOpen, setMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addBlank = () =>
    run(async () => {
      await addPageToLevel(journalId, level, variantKey);
      // The server shapes the pages; re-deriving the drawer, the canvas
      // and the routes here would be a second description of what it
      // just did.
      window.location.reload();
    });
  const printed = `printed ${LEVEL_NOUN[level] === "book" ? "once" : `every ${LEVEL_NOUN[level]}`} alongside the others`;
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={pending}
        onPointerEnter={() => setLit(true)}
        onPointerLeave={() => setLit(false)}
        onFocus={() => setLit(true)}
        onBlur={() => setLit(false)}
        onClick={() => (saved.length > 0 ? setMenuOpen((v) => !v) : addBlank())}
        aria-label={`Add a page to ${LEVEL_LABELS[level].toLowerCase()}`}
        aria-haspopup={saved.length > 0 ? "dialog" : undefined}
        aria-expanded={saved.length > 0 ? menuOpen : undefined}
        title={
          error ??
          (saved.length > 0
            ? `Add a page to ${LEVEL_LABELS[level].toLowerCase()} - blank, or one you saved - ${printed}`
            : `Add a page to ${LEVEL_LABELS[level].toLowerCase()} - a blank one, ${printed}`)
        }
        className="memari-card"
        style={{
          width: "var(--memari-card-w)",
          height: "var(--memari-card-h)",
          flexShrink: 0,
          padding: 0,
          borderRadius: 3,
          border: `2px dashed ${error ? "#ff8f5c" : lit ? "rgba(255,255,255,0.5)" : "rgba(255, 255, 255, 0.2)"}`,
          background: "transparent",
          color: error ? "#ff8f5c" : lit ? "#ffffff" : "rgba(255, 255, 255, 0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.5 : 1,
          transition: reduceMotion
            ? "none"
            : ["color 150ms ease-out", "border-color 150ms ease-out", card.sizeTransition]
                .filter(Boolean)
                .join(", "),
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {menuOpen && (
        <AnchoredPanel
          anchorRef={buttonRef}
          label={`Add a page to ${LEVEL_LABELS[level].toLowerCase()}`}
          onClose={() => setMenuOpen(false)}
        >
          <MenuButton disabled={pending} onClick={addBlank}>
            <span
              aria-hidden="true"
              style={{ width: 22, height: 30, flexShrink: 0, border: "1.5px dashed rgba(255,255,255,0.4)", borderRadius: 2 }}
            />
            <span style={{ flex: 1 }}>Blank page</span>
          </MenuButton>
          <MenuHeading>Saved</MenuHeading>
          {saved.map((option) => (
            <SavedOption
              key={option.id}
              option={option}
              unavailable={
                !option.fits
                  ? "A different page size"
                  : savedInSet.split(",").includes(option.id)
                  ? "Already in this set"
                  : null
              }
              disabled={pending}
              onChoose={() =>
                run(async () => {
                  await addSavedPage(journalId, level, variantKey, option.id);
                  window.location.reload();
                })
              }
            />
          ))}
          {error && <MenuError>{error}</MenuError>}
        </AnchoredPanel>
      )}
    </>
  );
}

/**
 * A level with nothing in it.
 *
 * Drawn, not skipped. An empty level is a real state - leave the dailies out
 * and the book gets cheaper - and a gap where a group should be tells a
 * reader nothing. A dashed card holds the row's shape and says what is
 * missing.
 *
 * Reached only if a level's pages are all deleted - every level seeds one
 * now. The card beside it adds a page; this one says why there is nothing to
 * add it after.
 */
// No props: its size comes from the CSS variables and it has no transition
// of its own to carry.
function EmptyLevelInner() {
  return (
    <div
      className="memari-card"
      style={{
        width: "var(--memari-card-w)",
        height: "var(--memari-card-h)",
        flexShrink: 0,
        borderRadius: 3,
        border: "2px dashed rgba(255, 255, 255, 0.2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        color: "rgba(255, 255, 255, 0.35)",
      }}
    >
      empty
    </div>
  );
}

// --- saved pages -----------------------------------------------------------
//
// Saved > Pages in the timeline: a card's menu saves it or puts a saved one in
// its place, and the "+" card offers saved pages beside a blank one. A saved
// page is LINKED - every use is the same page, and an edit to any of them is
// an edit to all (see savedItems.ts) - so a use wears a link badge, always.

/** Page b is the right-hand page of the saved spread that page a starts. */
function joinedSavedSpread(a: TimelinePage, b: TimelinePage): boolean {
  return !!a.saved && !!b.saved && a.saved.id === b.saved.id && a.saved.index === 0 && b.saved.index === 1;
}

/** Every page of the card is the same use of one saved page. */
function isOneSavedUse(pages: TimelinePage[]): boolean {
  const first = pages[0]?.saved;
  return !!first && pages.every((page, index) => page.saved?.id === first.id && page.saved.index === index);
}

/** The saved pages a set already uses, comma-joined - see PageCard. */
function savedIdsIn(pages: TimelinePage[]): string {
  return [...new Set(pages.map((page) => page.saved?.id).filter(Boolean))].join(",");
}

/** A chain link, for "this is a use of a saved page". */
function LinkGlyph({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 14a4.5 4.5 0 0 0 6.4 0l3.2-3.2a4.5 4.5 0 0 0-6.4-6.4L12 5.6M14 10a4.5 4.5 0 0 0-6.4 0l-3.2 3.2a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A card's menu control, over its top-LEFT corner - the X's mirror image,
 * shown and hidden with it, for the same reasons (see CornerRemoveButton).
 */
function CornerMenuButton({
  buttonRef,
  label,
  visible,
  open,
  reduceMotion,
  onToggle,
}: {
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  label: string;
  visible: boolean;
  open: boolean;
  reduceMotion: boolean;
  onToggle: () => void;
}) {
  const [lit, setLit] = useState(false);
  const [focusVisible, setFocusVisible] = useState(false);
  const shown = visible || focusVisible || open;
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      title={label}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={(event) => setFocusVisible(event.currentTarget.matches(":focus-visible"))}
      onBlur={() => setFocusVisible(false)}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      style={{
        pointerEvents: "auto",
        position: "absolute",
        top: -(REMOVE_TARGET - REMOVE_DISC) / 2 - 7,
        left: -(REMOVE_TARGET - REMOVE_DISC) / 2 - 7,
        zIndex: 2,
        width: REMOVE_TARGET,
        height: REMOVE_TARGET,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        opacity: shown ? 1 : 0,
        transition: reduceMotion ? "none" : "opacity 150ms ease-out",
      }}
    >
      <span
        style={{
          width: REMOVE_DISC,
          height: REMOVE_DISC,
          borderRadius: REMOVE_DISC / 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          background: open || lit ? "#ffffff" : "rgba(255,255,255,0.35)",
          transition: reduceMotion ? "none" : "background 150ms ease-out",
        }}
      >
        {[0, 1, 2].map((dot) => (
          <span key={dot} style={{ width: 2.5, height: 2.5, borderRadius: 2, background: "#1c1c1e" }} />
        ))}
      </span>
    </button>
  );
}

/** One row of a timeline menu: a full-width button. */
function MenuButton({
  disabled,
  onClick,
  title,
  children,
}: {
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [lit, setLit] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 8px",
        border: "none",
        borderRadius: 6,
        background: lit && !disabled ? "rgba(255,255,255,0.08)" : "transparent",
        color: disabled ? "rgba(255,255,255,0.4)" : "#ddd",
        font: "inherit",
        fontSize: 12,
        textAlign: "left",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function MenuHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 8px 4px",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.6)",
      }}
    >
      {children}
    </div>
  );
}

function MenuError({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" style={{ padding: "6px 8px", color: "#ff8f5c", fontSize: 11, lineHeight: 1.4 }}>
      {children}
    </div>
  );
}

/** A saved page in a menu: its drawing, its name, and what choosing it does
 *  - or why it cannot be chosen here. */
function SavedOption({
  option,
  unavailable,
  disabled,
  armed = null,
  onChoose,
}: {
  option: SavedPageOption;
  /** Why it cannot be used here, or null. */
  unavailable: string | null;
  disabled: boolean;
  /** Set once it has been clicked and is waiting for the confirming click. */
  armed?: string | null;
  onChoose: () => void;
}) {
  return (
    <MenuButton disabled={disabled || unavailable !== null} onClick={onChoose} title={unavailable ?? undefined}>
      <SavedThumb previews={option.previews} widthPx={option.size.widthPx} heightPx={option.size.heightPx} height={30} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {option.name}
        </span>
        <span
          style={{
            display: "block",
            fontSize: 10.5,
            color: armed ? "#ff8f5c" : "rgba(255,255,255,0.5)",
          }}
        >
          {armed ?? unavailable ?? (option.pageCount === 2 ? "Spread" : "Page")}
        </span>
      </span>
    </MenuButton>
  );
}

/**
 * A card's menu: save its page or spread, or put a saved one in its place.
 *
 * A card that is ALREADY a use of a saved page says which, and what that
 * means, instead of offering to save it - it is saved. Forking one use into a
 * journal's own ("save as") is for later (Andrew, 2026-09-21).
 *
 * Replacing takes two clicks, like removing: the first says what will happen
 * - on a page of the journal's own, that what is on it now is lost.
 */
function CardMenu({
  pages,
  linked,
  savedInSet,
}: {
  pages: TimelinePage[];
  linked: TimelinePage["saved"];
  savedInSet: string;
}) {
  const saved = useSavedItems().pages;
  const [pending, error, run] = useAsyncAction();
  const kind = pages.length === 2 ? "spread" : "page";
  const [name, setName] = useState(`${LEVEL_LABELS[pages[0].level]} ${kind}`);
  const [armed, setArmed] = useState<string | null>(null);
  const pageIds = pages.map((page) => page.pageId);
  const inSet = savedInSet.split(",");
  const replacements = saved.filter((option) => option.pageCount === pages.length && option.id !== linked?.id);
  return (
    <>
      {linked ? (
        <div style={{ padding: "6px 8px 4px", lineHeight: 1.45 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#ffffff", fontWeight: 600 }}>
            <LinkGlyph />
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Saved as &ldquo;{linked.name}&rdquo;
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            Linked: a change to this {kind} changes it in every journal that uses it.
          </div>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await savePagesToSaved(pageIds, name);
              window.location.reload();
            });
          }}
          style={{ display: "grid", gap: 6, padding: "4px 8px 6px" }}
        >
          <label htmlFor="memari-save-page-name" style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            Save this {kind}
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              id="memari-save-page-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "5px 8px",
                font: "inherit",
                fontSize: 12,
                color: "#ffffff",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 6,
                outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={pending || name.trim().length === 0}
              style={{
                padding: "5px 12px",
                font: "inherit",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                borderRadius: 6,
                background: ACCENT,
                color: "#ffffff",
                cursor: pending ? "default" : "pointer",
                opacity: pending || name.trim().length === 0 ? 0.5 : 1,
              }}
            >
              Save
            </button>
          </div>
          <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", lineHeight: 1.4 }}>
            Add it to any journal from the &ldquo;+&rdquo; at the end of a row. It stays linked: a change to any use
            changes them all.
          </div>
        </form>
      )}
      {replacements.length > 0 && (
        <>
          <MenuHeading>Replace with</MenuHeading>
          {replacements.map((option) => (
            <SavedOption
              key={option.id}
              option={option}
              unavailable={
                !option.fits ? "A different page size" : inSet.includes(option.id) ? "Already in this set" : null
              }
              disabled={pending}
              armed={
                armed === option.id
                  ? linked
                    ? "Click again to replace"
                    : "Click again - what is on it now is lost"
                  : null
              }
              onChoose={() => {
                if (armed !== option.id) {
                  setArmed(option.id);
                  return;
                }
                void run(async () => {
                  await replaceWithSavedPage(pageIds, option.id);
                  window.location.reload();
                });
              }}
            />
          ))}
        </>
      )}
      {error && <MenuError>{error}</MenuError>}
    </>
  );
}

// --- memo boundaries -----------------------------------------------------
//
// Declared at the end so the components above read as plain functions; these
// are what the tree actually renders. See LevelGroupInner's comment for why.
const LevelGroup = memo(LevelGroupInner);
const PageCard = memo(PageCardInner);
const AddPageCard = memo(AddPageCardInner);
const EmptyLevel = memo(EmptyLevelInner);

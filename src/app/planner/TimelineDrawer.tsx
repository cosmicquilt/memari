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
  occurrences,
  repeats,
  type Occurrence,
  type PageLevel,
} from "@/lib/pageLevels";
import type { TimelinePage } from "./loadPlannerPages";
import {
  addPageToLevel,
  createLevelVariant,
  deletePageFromLevel,
  deleteLevelVariant,
} from "./actions";
import { useAsyncAction } from "./useAsyncAction";

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
/** A page is 2175 x 3075 print px. The card reserves that same ratio, and
 *  the preview's own viewBox keeps the drawing true inside it. */
const PAGE_RATIO = 2175 / 3075;
const CARD_GAP = 8;

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
/** Between one group's last card and the next group's first. Whitespace,
 *  not a divider: Apple groups by proximity and draws no rule. */
const GROUP_GAP = 32;

/** The grabber itself, and the target around it. The visual pill is 36 x 5;
 *  a 5px-high hit area fails WCAG 2.5.8's 24px minimum and Apple's own 44pt,
 *  so the pill sits inside a transparent 44px band that takes the events. */
const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 5;
const GRABBER_BAND = 22;

/** The caption under a column: which occurrence it is, or "every month" for
 *  the default once something sits beside it. Reserved in every column so
 *  the level labels below them stay on one line. */
const SUB_LABEL_HEIGHT = 13;

/** Everything in the drawer that is not a card: the grabber band, the
 *  padding above and below the row, the sub-label, the level label and the
 *  gaps between them. */
const CHROME_HEIGHT = GRABBER_BAND + 10 + 4 + SUB_LABEL_HEIGHT + 8 + 14 + 14;

/** Resting height: the chrome plus one card. Computed rather than typed, so
 *  changing a card changes the drawer and the canvas padding together. */
export const DRAWER_RESTING_HEIGHT = CHROME_HEIGHT + CARD_HEIGHT;

/** Closed: the grabber band and nothing else. Not zero - the lip IS the way
 *  back, and a panel that disappears entirely needs some other control
 *  invented to reopen it. */
export const DRAWER_CLOSED_HEIGHT = GRABBER_BAND;

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
  const height = Math.max(CARD_HEIGHT, Math.round(drawerHeight - CHROME_HEIGHT));
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
  // THREE detents, not two: closed, resting, expanded. Closed leaves the
  // grabber band and nothing else - a thin lip you can pull back up, rather
  // than a panel that vanishes and needs some other control to bring back.
  // Asked for directly: "I want to be able to close bottom timeline
  // seamlessly in the design."
  const [detent, setDetent] = useState<"closed" | "resting" | "expanded">("resting");
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
  const [lastOpen, setLastOpen] = useState<"resting" | "expanded">("resting");
  // Honoured for the drawer's own settle, and for the zoom bar that now rides
  // on it - which is why these moved into a hook rather than staying here.
  const reduceMotion = usePrefersReducedMotion();
  const highContrast = usePrefersHighContrast();

  // Drag the grabber to resize. Pointer events rather than mouse, so a
  // touch screen gets the same behaviour without a second code path.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  /** The drawer's own element, so its custom properties can be scoped to it. */
  const sectionRef = useRef<HTMLElement>(null);
  // Whether the hand is currently closed on the grabber. Separate from
  // dragHeight, which only exists once the pointer has MOVED - the cursor has
  // to change on press, not on travel, or the grab reads as not having taken.
  const [grabbing, setGrabbing] = useState(false);
  // Did this gesture actually MOVE? The grabber both drags and toggles, and
  // a pointerup after a drag is followed by a click - so without this, every
  // resize would also flip the detent it had just been dragged away from.
  const movedRef = useRef(false);

  const expandedHeight = () =>
    Math.max(DRAWER_RESTING_HEIGHT, Math.round(window.innerHeight * 0.5));
  const heightOf = (which: typeof detent) =>
    which === "closed"
      ? DRAWER_CLOSED_HEIGHT
      : which === "resting"
      ? DRAWER_RESTING_HEIGHT
      : expandedHeight();

  const onGrabberPointerDown = (event: React.PointerEvent) => {
    // Capture so the drag survives the pointer leaving this 22px band -
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
    const candidates = ["closed", "resting", "expanded"] as const;
    let nearest: typeof detent = "resting";
    let best = Infinity;
    for (const candidate of candidates) {
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
  const contentHeight =
    height <= DRAWER_RESTING_HEIGHT
      ? DRAWER_RESTING_HEIGHT
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
   * How far from tab to panel, 0 to 1 - and it has to be CONTINUOUS.
   *
   * This was a boolean, flipped at a threshold four pixels above closed, and
   * it was wrong in both directions. Opening, the threshold was crossed on
   * the first frame, so the surface, the border and the corners all snapped
   * to their panel values at once and you saw a full-width bar appear before
   * the height had moved - "the tab instantly jumps to a bar then opens".
   * Closing, the same snap happened at the very end, so the panel vanished
   * from under its own contents instead of shrinking away with them.
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
  const openness = Math.min(
    1,
    Math.max(
      0,
      (heightOf(detent) - DRAWER_CLOSED_HEIGHT) /
        (DRAWER_RESTING_HEIGHT - DRAWER_CLOSED_HEIGHT)
    )
  );
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
    // ON THIS SECTION, NOT ON documentElement - and this is the change that
    // matters for the frame rate.
    //
    // A custom property set on the root is inherited by every element in the
    // document, so writing one invalidates style for all of them. On this
    // probe-sized page that is nothing; in the editor the same write asks the
    // browser to re-resolve a two-page spread of modules, sixty times a
    // second, to move a drawer. Scoped here, the invalidation stops at the
    // drawer's own subtree.
    const element = sectionRef.current;
    if (!element) return;
    const root = element.style;
    root.setProperty("--memari-drawer-height", `${height}px`);
    // THE PREVIEW SIZE TOO, for the same reason and one more.
    //
    // Every card used to take its width and height as React props, so a drag
    // re-rendered the whole drawer - every group, every card - on every
    // pointer move, and each of those renders sat in front of the browser
    // relaying out and re-rasterising a page of SVG. Reported as the preview
    // area being "laggy during the live resizing", and gone the moment you
    // release, which is the tell: after release it is pure CSS and React is
    // doing nothing at all.
    //
    // Through a variable, the cards' props stop changing, so the memoised
    // components below skip re-rendering entirely and the browser is left to
    // do the one job that genuinely has to happen.
    root.setProperty("--memari-card-h", `${cardSize(panelHeight).height}px`);
    root.setProperty("--memari-card-w", `${cardSize(panelHeight).width}px`);
    // How far the fixed-size drawing has to shrink to fill that card.

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
  }, [height, panelHeight, parked, moving, closing, dragHeight]);

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
      ref={sectionRef}
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
          transition: !moving
            ? "none"
            : [
                phaseTransition(phases.shape, "width", "border-radius"),
                phaseTransition(phases.park, "transform"),
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
          transition: moving ? `height ${SLIDE_MS}ms ${SETTLE}` : "none",
          boxSizing: "border-box",
          background: SURFACE,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "flex-start",
          gap: GROUP_GAP,
          padding: "10px 20px 14px",
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
        {groups.map((group) => (
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
          />
        ))}
      </div>

      {/* Scrollbars hidden: a trackpad-first row is navigated by swiping, and
          a visible bar in a 102px-tall strip eats the cards. Kept as a real
          stylesheet rule because ::-webkit-scrollbar has no inline form. */}
      {/* Scrollbars hidden: a trackpad-first row is navigated by swiping, and
          a visible bar in a 102px-tall strip eats the cards. Kept as a real
          stylesheet rule because ::-webkit-scrollbar has no inline form.

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
}) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0, position: "relative" }}>
      <div style={{ display: "flex", gap: CARD_GAP, alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: CARD_GAP }}>
            {defaults.length === 0 ? (
              <EmptyLevel />
            ) : (
              defaults.map((page) => (
                <PageCard
                  key={page.pageId}
                  page={page}
                  selected={level === activeLevel && activeVariantKey === null}
                  card={card}
                  // Removable only when it is BLANK and not the last one -
                  // the server refuses anything else, and offering a control
                  // that will be refused is worse than not offering it.
                  removable={defaults.length > 1 && page.moduleCount === 0}
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
        <AddPageCard card={card} level={level} variantKey={null} reduceMotion={reduceMotion} />
        {/* An occurrence with its own layout sits BESIDE the default, not on
            top of it. This is exactly where the design originally had cards
            overlap like a Dock stack - see this file's header for why a
            stack is the wrong answer to "show me there is more than one". */}
        {variants.map(([key, variantPages]) => (
          <div key={key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: CARD_GAP }}>
              {variantPages.map((page) => (
                <PageCard
                  key={page.pageId}
                  page={page}
                  selected={level === activeLevel && activeVariantKey === key}
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

      {/* The label sits UNDER its cards, 8px down. Uppercase and tracked out,
          because small uppercase sans-serif collides without the extra room.
          The cog sits inline with it. */}
      <div
        style={{
          marginTop: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
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
        {/* QUIET PERMANENCE, not hover-to-reveal. The original design had
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
        {repeats(level) && (
          <CogButton
            buttonRef={cogRef}
            open={open}
            onToggle={() => setOpen((v) => !v)}
            label={`Choose which ${LEVEL_NOUN[level]} gets its own layout`}
            highContrast={highContrast}
            reduceMotion={reduceMotion}
          />
        )}
      </div>

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
        width: 24,
        height: 24,
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
 * The months (or weeks, or days) this level covers, and which of them have a
 * layout of their own.
 *
 * REPEAT BY DEFAULT, CUSTOMISE BY EXCEPTION. Every occurrence gets the
 * default layout unless it is given one here, so this list is almost always
 * all "default" - which is the point. Most books want one spread repeated,
 * and the exception has to cost nothing when nobody uses it.
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
  const [pending, error, run] = useAsyncAction();
  const [at, setAt] = useState<{ left: number; bottom: number } | null>(null);

  // Before paint, so it never shows for a frame in the wrong place. Re-run on
  // scroll (capture: the filmstrip's own scroll does not bubble) and on
  // resize, so the panel stays on its cog rather than being left behind.
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAt({
        // Kept on screen when a cog near the right edge would push a 268px
        // panel off it.
        left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
        bottom: window.innerHeight - rect.top + 10,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchorRef]);

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
        aria-label={`${LEVEL_LABELS[level]} layouts`}
        style={{
          position: "fixed",
          left: at.left,
          bottom: at.bottom,
          zIndex: 51,
          width: PANEL_WIDTH,
          maxHeight: 320,
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
                        await deleteLevelVariant(level, key);
                        // Off the deleted occurrence, not a reload of it: the
                        // pages behind this URL have just been removed. The
                        // route falls back to the default anyway, but landing
                        // there by way of a URL that names something gone is
                        // a lie about where you are.
                        onOpenDefault();
                        return;
                      }
                      await createLevelVariant(level, key);
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
      </div>
    </>,
    document.body
  );
}

function PageCardInner({
  page,
  selected,
  card,
  removable = false,
  highContrast,
  reduceMotion,
  onOpen,
}: {
  page: TimelinePage;
  selected: boolean;
  card: { sizeTransition: string };
  /** Show the remove control. Only ever true for a blank page that is not
   *  the last of its set - see deletePageFromLevel. */
  removable?: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  // Outline with an OFFSET, not a border: a border sits inside the box and
  // changes the thumbnail's own proportions, which on a page preview is the
  // one thing that must stay true.
  const style: CSSProperties = {
    width: "var(--memari-card-w)",
    height: "var(--memari-card-h)",
    display: "block",
    padding: 0,
    border: highContrast && !selected ? "1px solid #777777" : "none",
    borderRadius: 3,
    background: "#fdfcf9",
    // Dimming the unselected is what keeps a row of thumbnails from
    // competing with the canvas it describes. Under Increase Contrast it
    // goes, and the selection ring thickens to carry the distinction alone.
    opacity: selected || highContrast ? 1 : 0.6,
    outline: selected ? `${highContrast ? 4 : 2}px solid ${ACCENT}` : "none",
    outlineOffset: 2,
    cursor: selected ? "default" : "pointer",
    overflow: "hidden",
    transition: reduceMotion
      ? "none"
      : ["opacity 150ms ease-out", card.sizeTransition].filter(Boolean).join(", "),
  };
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {removable && <RemovePageButton pageId={page.pageId} reduceMotion={reduceMotion} />}
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "page" : undefined}
      title={`${LEVEL_LABELS[page.level]} page ${page.position + 1} - ${page.moduleCount} module(s)`}
      className="memari-card"
      style={style}
    >
      {/* The real drawing at page scale, serialised on the server - see
          loadPlannerPages' TimelinePage. A preview made any other way would
          be a picture OF the page rather than the page. It is sized by the
          card, and drawn at whatever size that is - see the note by the
          constants on why it is not rasterised once and scaled. */}
      <div
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        dangerouslySetInnerHTML={{ __html: page.previewSvg }}
      />
    </button>
    </div>
  );
}

/**
 * Remove a blank page from a level's set.
 *
 * Sits over the card's top-right corner. Quiet until the pointer is near -
 * but PRESENT, not hover-created, so it is in the accessibility tree and a
 * keyboard can reach it. Only rendered for a page the server will actually
 * agree to delete, so it never offers something that fails.
 */
function RemovePageButton({
  pageId,
  reduceMotion,
}: {
  pageId: string;
  reduceMotion: boolean;
}) {
  const [pending, error, run] = useAsyncAction();
  const [lit, setLit] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      onClick={(event) => {
        event.stopPropagation();
        run(async () => {
          await deletePageFromLevel(pageId);
          window.location.reload();
        });
      }}
      aria-label="Remove this blank page"
      title={error ?? "Remove this blank page"}
      style={{
        position: "absolute",
        top: -7,
        right: -7,
        zIndex: 2,
        width: 18,
        height: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        borderRadius: 9,
        border: "none",
        background: error ? "#ff8f5c" : lit ? "#ffffff" : "rgba(255,255,255,0.35)",
        color: "#1c1c1e",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.5 : 1,
        transition: reduceMotion ? "none" : "background 150ms ease-out",
      }}
    >
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </button>
  );
}

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
}: {
  card: { sizeTransition: string };
  level: PageLevel;
  variantKey: string | null;
  reduceMotion: boolean;
}) {
  const [pending, error, run] = useAsyncAction();
  const [lit, setLit] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onPointerEnter={() => setLit(true)}
      onPointerLeave={() => setLit(false)}
      onFocus={() => setLit(true)}
      onBlur={() => setLit(false)}
      onClick={() =>
        run(async () => {
          await addPageToLevel(level, variantKey);
          // The server shapes the pages; re-deriving the drawer, the canvas
          // and the routes here would be a second description of what it
          // just did.
          window.location.reload();
        })
      }
      aria-label={`Add a page to ${LEVEL_LABELS[level].toLowerCase()}`}
      title={
        error ??
        `Add a page to ${LEVEL_LABELS[level].toLowerCase()} - a blank one, ` +
          `printed ${LEVEL_NOUN[level] === "book" ? "once" : `every ${LEVEL_NOUN[level]}`} alongside the others`
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

// --- memo boundaries -----------------------------------------------------
//
// Declared at the end so the components above read as plain functions; these
// are what the tree actually renders. See LevelGroupInner's comment for why.
const LevelGroup = memo(LevelGroupInner);
const PageCard = memo(PageCardInner);
const AddPageCard = memo(AddPageCardInner);
const EmptyLevel = memo(EmptyLevelInner);

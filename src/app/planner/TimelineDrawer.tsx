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

import { useEffect, useRef, useState, type CSSProperties } from "react";
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
import { createLevelVariant, deleteLevelVariant } from "./actions";
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
 * The settle.
 *
 * A spring, not an ease: Apple's panels arrive with momentum and overshoot
 * very slightly before resting, and a cubic-bezier cannot overshoot at all.
 * These are the sampled points of a response-0.5s, damping-0.7 spring, which
 * is what `linear()` exists for.
 */
const SPRING =
  "linear(0, 0.063, 0.235, 0.474 15.6%, 0.7 21.3%, 0.884 27.6%, 0.985 32.5%, " +
  "1.045, 1.077 42.6%, 1.085 46.5%, 1.079 50.8%, 1.04 59.8%, 1.015 66%, " +
  "0.997 73%, 0.993 79.4%, 0.996 87.7%, 1)";

const ACCENT = "#4a5cff";
const SURFACE = "#2a2a2a";

export function TimelineDrawer({
  pages,
  activeLevel,
  activeVariantKey,
  term,
  onOpen,
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
}) {
  const [expanded, setExpanded] = useState(false);
  // Honoured for the drawer's own settle. Read once and kept live, because a
  // person can turn Reduce Motion on without reloading the page.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const [highContrast, setHighContrast] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-contrast: more)");
    const sync = () => setHighContrast(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Drag the grabber to resize. Pointer events rather than mouse, so a
  // touch screen gets the same behaviour without a second code path.
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // Did this gesture actually MOVE? The grabber both drags and toggles, and
  // a pointerup after a drag is followed by a click - so without this, every
  // resize would also flip the detent it had just been dragged away from.
  const movedRef = useRef(false);

  const expandedHeight = () =>
    Math.max(DRAWER_RESTING_HEIGHT, Math.round(window.innerHeight * 0.5));
  const settledHeight = expanded ? undefined : DRAWER_RESTING_HEIGHT;

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
    dragRef.current = {
      startY: event.clientY,
      startHeight: expanded ? expandedHeight() : DRAWER_RESTING_HEIGHT,
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
      // RUBBER-BANDING past the top, rather than a brick wall: iOS's own
      // resistance curve, where 0.55 is the decay constant. Pulling further
      // costs exponentially more movement, which is what makes a limit feel
      // like a limit rather than a bug.
      const over = wanted - max;
      setDragHeight(max + (1 - 1 / ((over * 0.55) / max + 1)) * max);
    } else {
      setDragHeight(Math.max(GRABBER_BAND * 2, wanted));
    }
  };
  const onGrabberPointerUp = () => {
    const height = dragHeight;
    dragRef.current = null;
    setDragHeight(null);
    if (height === null) return;
    // Snap to whichever detent is nearer. Two detents, not free resize: a
    // panel that can rest anywhere has no shape you can learn.
    const midpoint = (DRAWER_RESTING_HEIGHT + expandedHeight()) / 2;
    setExpanded(height > midpoint);
  };

  const height = dragHeight ?? settledHeight ?? expandedHeight();
  const card = cardSize(height);

  const start = term.start ? new Date(`${term.start}T00:00:00.000Z`) : null;
  const end = term.end ? new Date(`${term.end}T00:00:00.000Z`) : null;

  const groups = LEVELS_IN_BINDING_ORDER.map((level) => ({
    level,
    pages: pages.filter((page) => page.level === level),
  }));

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
        display: "flex",
        flexDirection: "column",
        background: SURFACE,
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
        // No transition while the pointer is down - the drag IS the
        // animation, and easing it would lag the finger.
        transition:
          dragHeight !== null ? "none" : reduceMotion ? "none" : `height 500ms ${SPRING}`,
      }}
    >
      {/* The grabber. One affordance, two jobs: drag to resize, click to
          toggle between the detents. */}
      <div
        role="separator"
        aria-label={expanded ? "Collapse the timeline" : "Expand the timeline"}
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
          setExpanded((v) => !v);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          height: GRABBER_BAND,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "ns-resize",
          touchAction: "none",
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
          flex: 1,
          minHeight: 0,
          display: "flex",
          alignItems: "flex-start",
          gap: GROUP_GAP,
          padding: "10px 20px 14px",
          overflowX: "auto",
          overflowY: "hidden",
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
            occurrences={occurrences(group.level, start, end)}
            highContrast={highContrast}
            reduceMotion={reduceMotion}
            onOpen={onOpen}
          />
        ))}
      </div>

      {/* Scrollbars hidden: a trackpad-first row is navigated by swiping, and
          a visible bar in a 102px-tall strip eats the cards. Kept as a real
          stylesheet rule because ::-webkit-scrollbar has no inline form. */}
      <style>{`.memari-timeline-track::-webkit-scrollbar { display: none; }
        .memari-timeline-track { scrollbar-width: none; }`}</style>
    </section>
  );
}

function LevelGroup({
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
  card: { width: number; height: number };
  /** Every month (or week, or day) this level covers, or null when the book
   *  has no term and so has no occurrences to divide into. */
  occurrences: Occurrence[] | null;
  highContrast: boolean;
  reduceMotion: boolean;
  onOpen: (level: PageLevel, variantKey: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

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
              <EmptyLevel card={card} />
            ) : (
              defaults.map((page) => (
                <PageCard
                  key={page.pageId}
                  page={page}
                  selected={level === activeLevel && activeVariantKey === null}
                  card={card}
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
            always here instead, at 40% - which clears 3:1 against this
            surface - and saturates to full on hover or focus.

            Only on a level that REPEATS: front and back matter are printed
            once, so there is no second occurrence to give a layout to. */}
        {repeats(level) && (
          <CogButton
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
  open,
  onToggle,
  label,
  highContrast,
  reduceMotion,
}: {
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
        color: bright ? "#ffffff" : "rgba(255, 255, 255, 0.4)",
        cursor: "pointer",
        transition: reduceMotion ? "none" : "color 150ms ease-out",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9L5.3 5.3"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
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
 */
function OccurrencePopover({
  level,
  occurrences: list,
  customised,
  onClose,
  onOpenDefault,
}: {
  level: PageLevel;
  occurrences: Occurrence[] | null;
  customised: Set<string>;
  onClose: () => void;
  /** Where to go when an occurrence stops having its own layout. */
  onOpenDefault: () => void;
}) {
  const [pending, error, run] = useAsyncAction();

  return (
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
          position: "absolute",
          bottom: "100%",
          left: 0,
          marginBottom: 10,
          zIndex: 51,
          width: 268,
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
    </>
  );
}

function PageCard({
  page,
  selected,
  card,
  highContrast,
  reduceMotion,
  onOpen,
}: {
  page: TimelinePage;
  selected: boolean;
  card: { width: number; height: number };
  highContrast: boolean;
  reduceMotion: boolean;
  onOpen: () => void;
}) {
  // Outline with an OFFSET, not a border: a border sits inside the box and
  // changes the thumbnail's own proportions, which on a page preview is the
  // one thing that must stay true.
  const style: CSSProperties = {
    width: card.width,
    height: card.height,
    flexShrink: 0,
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
    transition: reduceMotion ? "none" : "opacity 150ms ease-out",
  };
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "page" : undefined}
      title={`${LEVEL_LABELS[page.level]} page ${page.position + 1} - ${page.moduleCount} module(s)`}
      style={style}
    >
      {/* The real drawing at page scale, serialised on the server - see
          loadPlannerPages' TimelinePage. A preview made any other way would
          be a picture OF the page rather than the page. */}
      <div
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
        dangerouslySetInnerHTML={{ __html: page.previewSvg }}
      />
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
 * Not yet a button: adding a page here would create one no route can open,
 * which breaks the very rule this drawer exists to keep. It becomes the
 * "add" affordance when a level can be opened on the canvas.
 */
function EmptyLevel({ card }: { card: { width: number; height: number } }) {
  return (
    <div
      style={{
        width: card.width,
        height: card.height,
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

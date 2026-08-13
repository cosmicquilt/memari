"use client";

// Native CSS Grid replacement for PlannerEditorCanvas.tsx (Polotno-
// hosted), per the migration plan. This version adds drag-to-reposition
// via @dnd-kit/core, on top of the static-rendering checkpoint that
// shipped first — layout and interaction verified separately, on
// purpose, so a bug in one couldn't get compounded with a bug in the
// other.
//
// Grid configuration (gridTemplateColumns/Rows: repeat(N, 1fr), gap,
// padding, border-box) is a deliberate, exact translation of grid.ts's
// own usableArea() math — CSS Grid's 1fr-track sizing computes the
// identical cellWidth/cellHeight formula gridCellToPixels already uses
// server-side, so each module's container just needs gridColumn/gridRow
// (the browser's own grid engine places it) while landing pixel-
// identical to what the server computed for each element's own x/y.
//
// One thing worth being deliberate about: a module's placement
// (columnStart/rowStart/columnSpan/rowSpan, tracked in `placements`
// state, mutable via drag) is kept entirely separate from its rendered
// content (elements/originX/originY, read straight from the loaded
// props, never touched by a reposition). Repositioning doesn't change
// what's *inside* a module, only which grid cell its container sits in
// — recomputing originX/originY from the module's *current* placement
// instead of the origin its elements were actually generated against
// would silently misalign every element inside it by exactly the drag
// distance. A future resize implementation is different: resizing
// genuinely changes a module's internal layout, so it'll need to refetch
// fresh elements/origin from the server, the same way the Polotno-hosted
// editor's swapCanvasElement already does for resize today.
//
// Cross-page dragging isn't specially prevented — it doesn't need to be.
// The delta-based target cell is always resolved against the dragged
// module's own page's grid, and clampGridPlacement keeps it within that
// page's own bounds regardless of how far the pointer actually moved, so
// a drag toward the other page just clamps at the edge instead of
// crossing over. Matches this project's existing "skip cross-spine
// dragging" scope decision from earlier this session, for free.
//
// --- Why this doesn't use <DragOverlay> ---
// The first version of this file did, and it was broken: dragging the
// topmost module moved something, but not in step with the pointer;
// dragging any other module didn't visibly move anything at all.
// Researched this rather than guessing at a patch — it's a confirmed,
// documented @dnd-kit limitation (github.com/clauderic/dnd-kit#398 and
// related issues), not a fluke in this code specifically: DragOverlay
// positions itself with `position: fixed`, which is relative to the
// viewport *unless* an ancestor has a CSS `transform` — and a
// `transform` is exactly what the on-screen zoom wrapper below uses.
// That ancestor becomes DragOverlay's containing block instead of the
// viewport, so its screen-pixel positioning math comes out wrong (and
// inconsistently so depending on where in the transformed subtree the
// dragged item happens to sit) — matching exactly what got reported.
//
// The fix isn't a portal-plus-counter-scale workaround (also considered
// — more moving parts, more ways to get the compensation wrong twice
// over). It's simpler: skip DragOverlay, and translate the dragged
// element itself, in place, the same way plain vanilla-JS drag-to-
// reorder implementations do (e.g. tahazsh.com's "Seamless UI" writeup:
// track pointer delta, apply `transform: translate()` directly to the
// dragged item, animate everything else with a CSS transition on
// `transform` too — not by touching layout mid-drag). That element
// already lives inside the same scaled wrapper as everything else on
// the page, so a local `translate()` on it composes correctly with the
// ancestor's scale automatically — it never has its own opinion about
// what its containing block is, unlike `position: fixed`.
//
// One further piece taken from that same research and from this app's
// own established patterns (e.g. iOS springboard-style rearranging):
// other modules now visually slide out of the way *during* the drag —
// a live preview of resolveModulePlacement's result, recomputed on every
// pointer move and rendered as a translateY with a CSS transition — not
// just snapped into place after the fact on drop. Cheap to do (the same
// pure grid.ts function this already called once on drop, just called
// more often), and it's what makes a reorder read as a reorder while
// it's happening instead of only being revealed once you let go.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { LoadedPage } from "./loadPlannerPages";
import type { WeekSettings } from "./WeekSettingsPanel";
import { PolotnoJsonRenderer } from "./PolotnoJsonRenderer";
import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { computeLabeledBoxHeaderHeightPx, computeLabeledBoxHeadingFontSizePx } from "@/lib/modules/labeledBox";
import { getTodoChecklistRowMetricsPx } from "@/lib/modules/todoChecklist";
import { getHabitTrackerRowMetricsPx } from "@/lib/modules/habitTracker";
import {
  gridCellToPixels,
  pixelsToGridCell,
  clampGridPlacement,
  resolveModulePlacement,
  findNearestFreeCell,
  rectsOverlap,
  type GridRect,
  type PageGrid,
} from "@/lib/grid";
import {
  updateModulePlacement,
  resizeAdjacentModules,
  resizeStackFromBottom,
  addPaletteModuleAt,
  deleteModuleWithGravity,
  updateModuleConfig,
  resetPlannerToTemplate,
} from "./actions";

const PAGE_GAP_PX = 0; // matches PlannerEditorCanvas's Workspace pageGap={0}

// Zoom bounds/step match Polotno's own ZoomGroup (node_modules/polotno/
// toolbar/zoom-buttons.js: presets [.1, .25, .5, .75, 1, 1.5, 2, 3, 5],
// step factor 1.2 per click) closely enough to feel like the same tool,
// without needing to replicate its exact preset list.
const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const ZOOM_STEP = 1.2; // per zoom in/out button click
// Wheel/trackpad-pinch zoom is proportional to gesture magnitude
// instead — see the wheel listener's own comment for why a fixed step
// per event (like the buttons use) doesn't work for a wheel/pinch
// gesture. 0.002 (the first value tried) read as too slow; 0.006 (the
// second) was very close, just still very slightly slow — a
// tune-to-feel constant more than a principled one, adjust again if it
// still doesn't feel right.
const WHEEL_ZOOM_SENSITIVITY = 0.0075;
const WHEEL_DELTA_CLAMP = 50;
const VIEWPORT_PADDING_PX = 24; // breathing room around the page(s), each side
const CONTENT_TOP_OFFSET_PX = VIEWPORT_PADDING_PX; // the minimum top gutter centeringOffsetY reserves before adding any extra centering room — see that function's own comment
const HEADER_HEIGHT_PX = 41; // header's own rendered height (8px padding * 2 + ~25px line box) — an estimate, not measured; only used to size the "fit whole page" preset, not anything print-critical

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

// Mirrors resizeAdjacentModules'/resizeStackFromBottom's own floor
// server-side (actions.ts) — kept in sync by hand, this file can't
// import a constant from a "use server" file.
const MIN_ROW_SPAN = 2;

// Module types offered in the drag-to-add palette (ModulePalette below)
// — kept in sync by hand with prisma/seed.mts's own moduleTypes entries
// (defaultColumnSpan/defaultRowSpan specifically), the same "use server"-
// boundary constraint MIN_ROW_SPAN's own comment explains. Only the
// three types with a real native-editor renderer; week-title/hourly-
// grid-core stay auto-placed/locked singletons per page, not something
// a user adds freely. The live drag preview below sizes itself from
// these raw defaults, not the day-count-adjusted columnSpan
// addPaletteModuleAt computes server-side for todo-checklist/habit-
// tracker (matching whichever page's hourly grid it lands on) — a
// reasonable approximation for a still-moving preview; the module
// snaps to its true, server-computed size the instant the drop commits.
//
// todo-checklist/habit-tracker's own defaultRowSpan is 10, not 11 (the
// module type's own historical default, from before hourly-grid-core's
// 1-row gap reservation existed — see prisma/seed.mts's own comment on
// both entries for the full reasoning). 19 (hourly grid) + 1 (gap) + 11
// > 30 (this app's grid height) — an 11-row default could never
// actually fit below the hourly grid at all, on either page, regardless
// of anything else present, so every drop of either type was silently
// refused. Reported directly: "the dragged bottom modules don't show
// up at all."
// `section` groups these for ModulePalette's own collapsible sidebar
// layout — "side" for the sidebar column (labeled-box, its one content
// type), "bottom" for the zone below the hourly grid (todo-checklist/
// habit-tracker, which share that zone and need a real choice between
// them, unlike the sidebar).
// Also what AddModuleButton's own "+" zones use to pick which section
// to open — see that component's own comment.
const PALETTE_MODULE_TYPES: Array<{
  slug: string;
  label: string;
  section: "side" | "bottom";
  defaultColumnSpan: number;
  defaultRowSpan: number;
}> = [
  { slug: "labeled-box", label: "Prompt Box", section: "side", defaultColumnSpan: 1, defaultRowSpan: 2 },
  { slug: "todo-checklist", label: "To-Do Checklist", section: "bottom", defaultColumnSpan: 3, defaultRowSpan: 10 },
  { slug: "habit-tracker", label: "Habit Tracker", section: "bottom", defaultColumnSpan: 4, defaultRowSpan: 10 },
];
const PALETTE_ID_PREFIX = "palette:";

// Minimum resize size for a module, in grid rows — MIN_ROW_SPAN (2) for
// most types, matching the sidebar's own labeled-box (a single-row box
// reads as barely more than a sliver, all header/border chrome, no real
// writing space left). todo-checklist/habit-tracker get a genuinely
// computed minimum instead, requested directly: "make them have a min
// height of the title and one row below" — their own header band (with
// day-letter columns, checkbox segments, etc.) is taller than a
// labeled-box's, so the floor needs its own justification, not just a
// coincidence with the sidebar's. Computed from each type's own real
// measurements (getTodoChecklistRowMetricsPx/getHabitTrackerRowMetricsPx
// — the same header/row-height constants their actual renderers use,
// not a guessed row count) and converted to a grid row count the same
// "measure two real spans, take the difference" technique every other
// px<->row conversion in this file already uses (see ResizeHandle's own
// rowPitchPx) rather than hand-deriving the grid's own per-row pixel
// math a second time. Floored at MIN_ROW_SPAN regardless — verified by
// direct computation before writing this that today's real measurements
// already land there (both types' header+1-row target fits inside 2
// grid rows on this app's page geometry), so this floor is a safety net
// for if either module's own measurements ever change, not currently
// doing any clamping of its own.
function getMinRowSpanForSlug(slug: string, pageGrid: PageGrid): number {
  let targetPx: number | null = null;
  if (slug === "todo-checklist") {
    const m = getTodoChecklistRowMetricsPx();
    targetPx = m.headerHeightPx + m.nominalRowHeightPx;
  } else if (slug === "habit-tracker") {
    const m = getHabitTrackerRowMetricsPx();
    targetPx = m.headerHeightPx + m.nominalRowHeightPx;
  }
  if (targetPx === null) return MIN_ROW_SPAN;
  const oneRow = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 });
  const twoRows = gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 2 });
  const rowPitchPx = twoRows.height - oneRow.height;
  const computed = targetPx <= oneRow.height ? 1 : Math.ceil((targetPx - oneRow.height) / rowPitchPx) + 1;
  return Math.max(MIN_ROW_SPAN, computed);
}

// The stack-bottom cascade's own math (see StackBottom's type comment
// and resizeStackFromBottom's own comment for the full reasoning) —
// shared between the live preview (displayPlacements below) and the
// handle's own drag-clamp, so the two can never disagree about where a
// given deltaRows actually lands. Growing (deltaRows > 0) only ever grows
// the last (bottom-most) member; shrinking cascades upward once each
// member in turn hits *its own* minimum (minSpans, one per member —
// see getMinRowSpanForSlug's own comment on why this isn't always the
// uniform MIN_ROW_SPAN). Pure — doesn't touch rowStart at all, callers
// repack contiguously from their own top anchor afterward.
function cascadeStackSpans(originalSpans: number[], minSpans: number[], deltaRows: number): number[] {
  const spans = [...originalSpans];
  if (deltaRows > 0) {
    spans[spans.length - 1] += deltaRows;
  } else if (deltaRows < 0) {
    let remaining = -deltaRows;
    for (let i = spans.length - 1; i >= 0 && remaining > 0; i--) {
      const shrinkable = spans[i] - minSpans[i];
      const take = Math.min(shrinkable, remaining);
      spans[i] -= take;
      remaining -= take;
    }
  }
  return spans;
}

type Placement = { columnStart: number; rowStart: number; columnSpan: number; rowSpan: number };
type ModuleInfo = {
  pageId: string;
  locked: boolean;
  elements: LoadedPage["moduleInstances"][number]["elements"];
  originX: number;
  originY: number;
  // Needed for inline heading editing (labeled-box only, see
  // NativeModule's own edit-pencil comment): slug says whether this
  // instance even has an editable heading; propValues is the FULL
  // current config, not just heading, since updateModuleConfig replaces
  // the whole object server-side rather than merging — sending just
  // {heading} would silently reset every other field (ruled, etc.) back
  // to its schema default.
  slug: string;
  propValues: Record<string, unknown>;
};

// Two vertically-stacked, directly-adjacent unlocked modules in the same
// column — a candidate for a resize handle at their shared boundary. See
// resizePairsByPageId's own comment for how this is (re)computed.
type ResizePair = {
  key: string;
  pageId: string;
  topId: string;
  bottomId: string;
  columnStart: number;
  columnSpan: number;
  topRowStart: number;
  topRowSpan: number;
  bottomRowSpan: number;
  // Per-side minimum (see getMinRowSpanForSlug's own comment) — the two
  // can differ, e.g. a todo-checklist paired with a habit-tracker.
  // Computed once per render alongside the rest of this shape (see
  // resizePairsByPageId) rather than inside the handle itself, matching
  // maxBottomBound's own reasoning on StackBottom below.
  topMinRowSpan: number;
  bottomMinRowSpan: number;
};

// The bottom-most unlocked module of a same-column stack, with nothing
// directly below it in that column — a candidate for a resize handle at
// the *stack's own* outer bottom edge (see StackBottom's own handle,
// StackResizeHandle, for why this is a materially different operation
// from ResizePair's coupled boundary above, not just a variant of it).
// `members` is the whole stack, top to bottom, each with its own current
// rowSpan (and own minRowSpan, see getMinRowSpanForSlug's own comment —
// a stack can mix module types, e.g. a todo-checklist stacked with a
// habit-tracker, each with a different floor) — the cascading-shrink
// math needs every member's size and floor, not just the bottom one's.
type StackBottom = {
  key: string;
  pageId: string;
  bottomId: string;
  columnStart: number;
  columnSpan: number;
  members: Array<{ id: string; rowSpan: number; minRowSpan: number }>;
  stackTopRowStart: number;
  stackBottomRowEnd: number;
  // The furthest row the stack may grow into — a locked block's own
  // rowStart if one bounds it from below in this column range, or the
  // page's own gridRows otherwise. Computed once per render alongside
  // the rest of this shape (see stackBottomsByPageId) rather than inside
  // the handle itself, since it needs the *same* others-on-the-page list
  // that shape is already built from.
  maxBottomBound: number;
};

// Live state for a palette-item drag-to-add (see PALETTE_MODULE_TYPES'
// own comment and the handleDragMove branch that computes this) — the
// grid cell it would land in *right now* if dropped, recomputed on
// every pointer move the same way a reposition's own live reflow
// preview is. `overlapping` true means findNearestFreeCell couldn't
// find genuinely free room for it (the page is full for this span) —
// the preview box still renders, just styled to read as "won't work
// here," and handleDragEnd refuses to commit it.
type PaletteDragPreview = {
  pageId: string;
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
  overlapping: boolean;
};

function NativeModule({
  instanceId,
  locked,
  placement,
  elements,
  originX,
  originY,
  visualOffset,
  isDragged,
  isResizing,
  frozenSize,
  contentIsLive,
  suppressTransition,
  justAdded,
  scale,
  isFirefox,
  onDelete,
  isHovered,
  onHoverStart,
  onHoverEnd,
  slug,
  heading,
  onUpdateHeading,
  habits,
  onUpdateHabits,
  widthPx,
}: {
  instanceId: string;
  locked: boolean;
  placement: Placement;
  elements: LoadedPage["moduleInstances"][number]["elements"];
  originX: number;
  originY: number;
  // Page-pixel translate applied on top of the committed grid slot — for
  // the dragged item, its live (already scale-divided) follow-the-cursor
  // offset; for a sibling the live preview says should reflow, the
  // pixel distance to its would-be new row. {0,0} the rest of the time.
  visualOffset: { x: number; y: number };
  isDragged: boolean;
  // True for the two modules on either side of a resize boundary
  // currently being dragged (see ResizeHandle) — their box grows/shrinks
  // live, snapped to the grid. For most module types their *content*
  // (elements/origin) still reflects the last-committed size until
  // release (no server round trip mid-drag — see ResizeHandle's own
  // comment on why not); overflow:hidden clips that stale content to
  // the live box instead of letting it spill past a shrinking edge or
  // overlap whatever's now closer on a growing one. todo-checklist/
  // habit-tracker are the exception — see contentIsLive below.
  isResizing: boolean;
  // The pair's frozen (pre-drag) pixel size, while isResizing — see
  // resizeFrozenSize's own comment in the main component. null the rest
  // of the time.
  frozenSize: { width: number; height: number } | null;
  // True while isResizing *and* NativePage has already substituted this
  // instance's `elements`/`originX`/`originY` with a genuine live
  // re-render (todo-checklist/habit-tracker only — see NativePage's own
  // comment on why just these two, and the history behind it: a CSS
  // repeating-gradient row overlay, then hiding the content outright,
  // then a live CSS scaleY, each tried and reported back as still
  // wrong, before landing on actually recomputing the real content live
  // instead of approximating it). When true, `elements` already draws
  // its own correctly-sized-and-positioned outer border for the live
  // box, so none of isResizing's usual stale-content workarounds
  // (the outline stand-in, suppressOuterBorderSize) apply — applying
  // them anyway would draw a second, redundant border alongside the
  // real, already-accurate one.
  contentIsLive: boolean;
  // True for exactly one frame right after a drop, for whichever
  // instances just had their placement committed (the dropped item and
  // any reflowed siblings) — see the settle-FLIP comment on `settling`
  // state below for why a transition has to be suppressed for that one
  // frame specifically, not just while actively dragging.
  suppressTransition: boolean;
  // True for the couple of frames right after this instance was created
  // by a palette drag-drop (see handleAddModule's own comment) —
  // drives a simple opacity fade-in on mount (see the local `mounted`
  // state below). Deliberately just
  // opacity, nothing fancier (no scale/translate) — a plain fade-in
  // doesn't have the "grid jump plus a transform both changing at once"
  // compounding problem the settle-FLIP mechanism exists to solve, so
  // it doesn't need that machinery at all, just a value that starts at
  // 0 and is committed to 1 in a *later* render than the mount itself.
  justAdded: boolean;
  // Current on-screen zoom factor — passed all the way down to
  // PolotnoJsonRenderer so it can keep hairline borders from vanishing
  // under Firefox's transform-scale border bug. See that component's
  // own comment for why.
  scale: number;
  // Also passed down to PolotnoJsonRenderer, alongside scale — see
  // PolotnoJsonRenderer's own isFirefox comment for why this has to be
  // computed client-side-only, further up, rather than read here.
  isFirefox: boolean;
  // Hover-to-delete button below calls this with `instanceId` on click —
  // see handleDeleteModule's own comment (main component) for what
  // happens next (gravity-repack the rest of its stack).
  onDelete: (instanceId: string) => void;
  // Whether *this* module is the one hoveredInstanceId (main component)
  // currently points at — lifted up there rather than tracked as local
  // state here, specifically so a delete can reassign it manually after
  // the DOM shifts under a stationary cursor (see
  // recomputeHoverAfterLayoutChange's own comment).
  isHovered: boolean;
  onHoverStart: (instanceId: string) => void;
  onHoverEnd: (instanceId: string) => void;
  // Module type slug — the edit-pencil/heading UI below only makes sense
  // for labeled-box (the one type with a single free-text heading in
  // this app today); every other slug just never shows it.
  slug: string;
  // Current heading, already read out of propValues by the caller
  // (NativePage) — null for any non-labeled-box module.
  heading: string | null;
  onUpdateHeading: (instanceId: string, newHeading: string) => void;
  // Current habit-name list, already read out of propValues by the
  // caller (NativePage) — null for any non-habit-tracker module. The
  // only other editable content in this app today besides a labeled-
  // box's heading (see habitTracker.ts's own comment: day-letter
  // columns are fixed, habit names are the one free-text piece —
  // todo-checklist has nothing analogous at all, it's a blank
  // physical-pen checklist by design, not tracked as data).
  habits: string[] | null;
  onUpdateHabits: (instanceId: string, habits: string[]) => void;
  // This box's own current rendered width, in page-space px — lets the
  // edit-mode overlay below size its height to match the box's *actual*
  // header band (computeLabeledBoxHeaderHeightPx) instead of a guessed
  // fixed height. Only meaningful (and only passed a real value) for
  // labeled-box.
  widthPx: number;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: instanceId, disabled: locked });
  // Held down but not necessarily dragging yet — dnd-kit's own
  // activationConstraint (5px, see sensors below) means isDragged/
  // onDragStart don't fire until the pointer has actually moved that
  // far, leaving a brief "grab" cursor right after mousedown that reads
  // as unresponsive. Tracked locally (not from onDragStart/onDragEnd)
  // specifically to cover that pre-activation gap; wraps dnd-kit's own
  // onPointerDown (the only handler `listeners` actually provides —
  // PointerSensor's sole activator) rather than replacing it, so its own
  // activation-tracking still runs unchanged.
  const [isPressed, setIsPressed] = useState(false);
  // Simple two-frame mount fade-in (see justAdded's own comment) —
  // starts at opacity 0 with no transition (nothing to visibly animate
  // from yet), then one rAF later flips to 1 with the transition on,
  // giving the browser an actual painted "before" frame to ease away
  // from. Once fadedIn flips true it stays true regardless of what
  // justAdded does afterward (the parent clears that prop a couple of
  // frames after creation) — this only ever needs to fire once, right
  // after mount.
  const [fadedIn, setFadedIn] = useState(!justAdded);
  useEffect(() => {
    if (!justAdded) return;
    const raf = requestAnimationFrame(() => setFadedIn(true));
    return () => cancelAnimationFrame(raf);
  }, [justAdded]);
  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      setIsPressed(true);
      listeners?.onPointerDown?.(event);
    },
    [listeners]
  );
  const clearPressed = useCallback(() => setIsPressed(false), []);
  // Inline heading editing (labeled-box only — see the pencil button
  // below). Local, not lifted: unlike hoveredInstanceId, nothing outside
  // this one module ever needs to read or force "is this module
  // currently being edited," so there's no reason to route it through
  // the main component the way the delete-button hover fix needed to.
  const [isEditingHeading, setIsEditingHeading] = useState(false);
  const [draftHeading, setDraftHeading] = useState(heading ?? "");
  const commitHeading = useCallback(
    (value: string) => {
      setIsEditingHeading(false);
      // Only round-trips to the server if the value actually changed —
      // blurring/Enter-ing without having typed anything (the common
      // case: click to look, then click away) shouldn't fire a write.
      if (value !== heading) onUpdateHeading(instanceId, value);
    },
    [heading, instanceId, onUpdateHeading]
  );
  // Inline habit-name-list editing (habit-tracker only). Separate local
  // state from the heading editor above, not a generalization of it —
  // the interaction shapes genuinely differ (a multi-line list vs a
  // single centered line, no "reset to template" concept for a list
  // that starts empty by default) enough that forcing them through one
  // shared branch would just be a pile of slug-conditionals inside
  // otherwise-identical code.
  const [isEditingHabits, setIsEditingHabits] = useState(false);
  const [draftHabitsText, setDraftHabitsText] = useState((habits ?? []).join("\n"));
  const commitHabits = useCallback(
    (value: string) => {
      setIsEditingHabits(false);
      // Cleaned only at commit time, not on every keystroke — matches
      // the old Polotno-editor PropertiesPanel's own save-time cleanup
      // (see PropertiesPanel.tsx), so a blank line mid-list doesn't get
      // yanked out from under the cursor while still typing.
      const cleaned = value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const current = habits ?? [];
      const changed = cleaned.length !== current.length || cleaned.some((h, i) => h !== current[i]);
      if (changed) onUpdateHabits(instanceId, cleaned);
    },
    [habits, instanceId, onUpdateHabits]
  );
  // Matches the box's own real header band (see this constant's own
  // comment on the edit-mode overlay below for why that matters) —
  // cheap enough to just recompute on every render rather than memoing,
  // same as ResizeHandle/AddModuleButton's own gridCellToPixels calls
  // elsewhere in this file.
  const editOverlayHeight = slug === "labeled-box" ? computeLabeledBoxHeaderHeightPx(heading ?? "", widthPx) : 0;
  // Same committed `heading` (not draftHeading) that editOverlayHeight
  // above already uses, for the same reason: the overlay's own height
  // doesn't live-resize as you type, so the font size it shows
  // shouldn't drift out of sync with that fixed height either — both
  // re-sync together once the edit commits and heading changes.
  const editHeadingFontSizePx = slug === "labeled-box" ? computeLabeledBoxHeadingFontSizePx(heading ?? "", widthPx) : 0;
  return (
    <div
      ref={locked ? undefined : setNodeRef}
      data-module-instance-id={instanceId}
      {...(locked ? {} : listeners)}
      {...(locked ? {} : attributes)}
      onPointerDown={locked ? undefined : handlePointerDown}
      onPointerUp={locked ? undefined : clearPressed}
      onPointerCancel={locked ? undefined : clearPressed}
      onMouseEnter={() => onHoverStart(instanceId)}
      onMouseLeave={() => onHoverEnd(instanceId)}
      style={{
        position: "relative",
        gridColumn: `${placement.columnStart + 1} / span ${placement.columnSpan}`,
        gridRow: `${placement.rowStart + 1} / span ${placement.rowSpan}`,
        cursor: locked ? "default" : isDragged || isPressed ? "grabbing" : "grab",
        transform:
          visualOffset.x !== 0 || visualOffset.y !== 0 ? `translate(${visualOffset.x}px, ${visualOffset.y}px)` : undefined,
        // No transition on the dragged item itself — it needs to track
        // the pointer with zero added lag. Everything reacting to it
        // (a reflow preview, or a gravity-shift settle after a delete —
        // see handleDeleteModule's own comment) gets a real one, so the
        // shift reads as a deliberate slide instead of a jump. Also
        // suppressed for one frame right after a commit
        // (suppressTransition) — see `settling` state's own comment for
        // why. cubic-bezier(0.4, 0, 0.2, 1) is Material/most native
        // mobile UI's standard ease-out curve — fast start, decelerating
        // into place, the same "brain expects things to settle at the
        // end of a movement" shape iOS's own passive-reflow animations
        // (Photos grid closing a gap, Springboard icons resettling) use,
        // as opposed to a springy overshoot curve, which reads better for
        // a single interactive element arriving (a button press, a
        // dragged card being released) than for several passive items
        // moving together — bounce doesn't stay coordinated well across
        // multiple simultaneous movers. 250ms sits in the "standard
        // layout" range (200-300ms) rather than "micro-interaction"
        // (80-150ms, what this was previously): shorter reads as
        // twitchy for a distance-covering slide, longer starts feeling
        // sluggish.
        transition:
          isDragged || suppressTransition
            ? undefined
            : "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease",
        // Mount fade-in for a freshly-added module (see fadedIn's own
        // comment) — 1 for every pre-existing module (this condition is
        // just a no-op true/true comparison for them), only ever
        // genuinely 0 -> 1 for one just after creation.
        opacity: fadedIn ? 1 : 0,
        // Lifted, not dimmed, while actively being dragged — a shadow +
        // being drawn above its neighbors is what makes it read as "this
        // is the thing currently moving," matching the classic
        // iOS-springboard-style pick-up affordance. The previous opacity
        // dim was designed for a separate ghost-overlay approach (see
        // file comment on why that's gone) and didn't do anything useful
        // once the real element is what's moving.
        boxShadow: isDragged ? "0 12px 28px rgba(0,0,0,0.28)" : undefined,
        zIndex: isDragged ? 10 : undefined,
        overflow: isResizing ? "hidden" : undefined,
        // A resize's live preview only ever moves this *box* — for most
        // module types, content (elements/origin) stays frozen at its
        // last-committed size until release (see isResizing's own
        // comment). That's invisible on its own for whichever of the
        // pair is only ever growing/shrinking from a fixed edge (its
        // stale content never has a reason to move, so the box changing
        // size shows up as nothing but blank added/removed space with no
        // line to mark where the new edge actually is) — reported live:
        // "only the module below updates," exactly that half of the
        // pair. This outline is a stand-in for real content specifically
        // for that case: always visible while isResizing (except
        // contentIsLive, whose own real content already draws an
        // accurate border — see its own comment), on both sides of the
        // pair, so the live edge itself is never dependent on what the
        // frozen content happens to show. Solid black, not a muted
        // gray/dashed — a faint dashed gray line against mostly-white
        // content read as the box looking dimmed/disabled, not as an
        // active resize indicator.
        outline: isResizing && !contentIsLive ? "2px solid #000000" : undefined,
        outlineOffset: isResizing && !contentIsLive ? "-2px" : undefined,
        touchAction: locked ? undefined : "none",
      }}
    >
      <PolotnoJsonRenderer
        elements={elements}
        originX={originX}
        originY={originY}
        scale={scale}
        isFirefox={isFirefox}
        suppressOuterBorderSize={isResizing && !contentIsLive ? frozenSize : null}
      />
      {/* Gray circle, darker gray ×, fades in on hover — not rendered at
          all for a locked module (week-title/hourly-grid-core aren't
          individually deletable). stopPropagation on pointerdown keeps
          this click from also being read as the start of a drag — both
          `listeners` (dnd-kit's own activator) and this button live on
          the same element tree, and pointerdown bubbles from this button
          up to the wrapper div's handler otherwise. pointerEvents: none
          while hidden so a hidden button sitting in the corner can't
          swallow a click meant for the module underneath it.
          top/right: -(size/2) straddles the module's own top-right
          corner exactly — the circle's *center*, not its edge, sits on
          the corner point, half hanging outside the box. Safe to let it
          spill past the module's own bounds: NativeModule only sets
          overflow:hidden while isResizing, never during a plain hover,
          and it paints above whatever's behind it via its own z-index
          (the wrapper never sets a z-index of its own outside
          isDragged/settling, so this compares against the page's other
          module wrappers directly rather than being trapped under a
          stacking context of its own). */}
      {!locked && (
        <button
          type="button"
          title="Delete module"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(instanceId);
          }}
          style={{
            position: "absolute",
            top: -35,
            right: -35,
            width: 70,
            height: 70,
            borderRadius: "50%",
            border: "none",
            background: "#c7c7c7",
            color: "#666666",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 45,
            lineHeight: 1,
            padding: 0,
            cursor: "pointer",
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
            transition: "opacity 0.12s ease",
            zIndex: 6,
          }}
        >
          ×
        </button>
      )}
      {/* Heading edit — labeled-box only (the one module type with a
          single free-text heading in this app today). Used to be a
          hover-corner pencil badge (top-left, mirroring the delete
          button's own top-right one) — replaced per direct request:
          "I want to be able to edit the title of prompt boxes live and
          I want it to be a text cursor over the title and that's how
          you edit not the button in the top left." This is now a
          plain, invisible click target sized to match the real header
          band exactly (computeLabeledBoxHeaderHeightPx,
          editOverlayHeight below — same value the edit-mode overlay
          right after this one already used, so both line up with
          wherever the rendered heading text actually sits, not a
          guessed height: reported live the first time this shipped
          with one, "the header gets taller"). cursor:"text" is the
          entire affordance, deliberately — nothing else marks this as
          interactive, matching what was asked for. onPointerDown still
          stops propagation, same as the old button did: without it, a
          click here would also register as the start of a drag (the
          module's own outer wrapper is the drag handle for its whole
          area otherwise) instead of opening the editor. Trade-off this
          creates, worth knowing: the module can no longer be
          drag-repositioned by grabbing its own header band specifically
          — grabbing anywhere below the header still works exactly like
          before. */}
      {!locked && slug === "labeled-box" && !isEditingHeading && (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setDraftHeading(heading ?? "");
            setIsEditingHeading(true);
          }}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: editOverlayHeight,
            cursor: "text",
            zIndex: 6,
          }}
        />
      )}
      {!locked && slug === "labeled-box" && isEditingHeading && (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: editOverlayHeight,
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "0 10px",
            boxSizing: "border-box",
            outline: "2px solid #4a90d9",
            outlineOffset: -2,
            zIndex: 7,
          }}
        >
          <input
            autoFocus
            type="text"
            value={draftHeading}
            onChange={(event) => setDraftHeading(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.currentTarget.blur();
              } else if (event.key === "Escape") {
                setDraftHeading(heading ?? "");
                setIsEditingHeading(false);
              }
            }}
            onBlur={() => commitHeading(draftHeading)}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              textTransform: "uppercase",
              fontSize: editHeadingFontSizePx,
              fontFamily: "Georgia, 'PT Serif', serif",
              border: "none",
              outline: "none",
              background: "transparent",
              padding: 0,
            }}
          />
        </div>
      )}
      {/* Habit-name-list edit — habit-tracker only. Same hover-corner-
          badge language and top-left position as the heading-edit pencil
          above (never a conflict — a module is one slug or the other,
          never both). Unlike the heading editor, this replaces the
          *whole* module while open, not just a header band: habit names
          are one per row, spread down the full height of the grid, so
          there's no single small region that corresponds to "the
          editable content" the way a labeled-box's header is. */}
      {!locked && slug === "habit-tracker" && !isEditingHabits && (
        <button
          type="button"
          title="Edit habit names"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setDraftHabitsText((habits ?? []).join("\n"));
            setIsEditingHabits(true);
          }}
          style={{
            position: "absolute",
            top: -35,
            left: -35,
            width: 70,
            height: 70,
            borderRadius: "50%",
            border: "none",
            background: "#c7c7c7",
            color: "#666666",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            lineHeight: 1,
            padding: 0,
            cursor: "pointer",
            opacity: isHovered ? 1 : 0,
            pointerEvents: isHovered ? "auto" : "none",
            transition: "opacity 0.12s ease",
            zIndex: 6,
          }}
        >
          ✎
        </button>
      )}
      {!locked && slug === "habit-tracker" && isEditingHabits && (
        <div
          onPointerDown={(event) => event.stopPropagation()}
          style={{
            position: "absolute",
            inset: 0,
            background: "#ffffff",
            boxSizing: "border-box",
            outline: "2px solid #4a90d9",
            outlineOffset: -2,
            zIndex: 7,
          }}
        >
          <textarea
            autoFocus
            value={draftHabitsText}
            placeholder="One habit per line"
            onChange={(event) => setDraftHabitsText(event.target.value)}
            onFocus={(event) => event.target.select()}
            onKeyDown={(event) => {
              // Plain Enter inserts a newline (a real list item), same
              // as any multi-line textarea — only Escape short-circuits
              // out of editing here, unlike the single-line heading
              // input where Enter itself commits.
              if (event.key === "Escape") {
                setDraftHabitsText((habits ?? []).join("\n"));
                setIsEditingHabits(false);
              }
            }}
            onBlur={() => commitHabits(draftHabitsText)}
            style={{
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              resize: "none",
              padding: 10,
              fontSize: 16,
              lineHeight: 1.5,
              fontFamily: "Georgia, 'PT Serif', serif",
              border: "none",
              outline: "none",
              background: "transparent",
            }}
          />
        </div>
      )}
    </div>
  );
}

function NativePage({
  page,
  instanceIds,
  placements,
  moduleLookup,
  activeId,
  visualOffsets,
  suppressTransitionIds,
  justAddedIds,
  resizePairs,
  stackBottoms,
  resizingIds,
  resizeFrozenSize,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onStackResizeStart,
  onStackResizeMove,
  onStackResizeEnd,
  onOpenPaletteSection,
  onDeleteModule,
  onUpdateHeading,
  onUpdateHabits,
  hoveredInstanceId,
  onHoverStart,
  onHoverEnd,
  paletteDragPreview,
  scale,
  isFirefox,
}: {
  page: LoadedPage;
  // Which instance ids actually live on this page right now — see
  // instanceIdsByPageId's own comment in the main component for why this
  // drives the render loop instead of `page.moduleInstances` (a module
  // added after initial load, see handleAddModule, wouldn't be in that
  // static list).
  instanceIds: string[];
  // Live display placements — reflects an in-progress resize's snapped
  // preview (see resizeDrag/displayPlacements in the main component),
  // not necessarily the last-committed values.
  placements: Record<string, Placement>;
  moduleLookup: Map<string, ModuleInfo>;
  activeId: string | null;
  visualOffsets: Record<string, { x: number; y: number }>;
  suppressTransitionIds: ReadonlySet<string> | null;
  // See NativeModule's own justAdded comment — a module in this set
  // gets its mount fade-in; the main component clears each id out a
  // couple of frames after adding it, so this only ever briefly
  // contains whatever's newest.
  justAddedIds: ReadonlySet<string> | null;
  resizePairs: ResizePair[];
  stackBottoms: StackBottom[];
  resizingIds: ReadonlySet<string> | null;
  // See the main component's own comment on resizeFrozenSize — lets
  // PolotnoJsonRenderer recognize and hide the resizing pair's own stale
  // outer-border element.
  resizeFrozenSize: Record<string, { width: number; height: number }> | null;
  onResizeStart: (pair: ResizePair) => void;
  onResizeMove: (pair: ResizePair, deltaRows: number) => void;
  onResizeEnd: (pair: ResizePair, deltaRows: number) => void;
  onStackResizeStart: (stackBottom: StackBottom) => void;
  onStackResizeMove: (stackBottom: StackBottom, deltaRows: number) => void;
  onStackResizeEnd: (stackBottom: StackBottom, deltaRows: number) => void;
  // Opens ModulePalette's own sliding panel and highlights the given
  // section — see AddModuleButton's own comment on why its "+" zones
  // do this instead of adding a fixed module type directly.
  onOpenPaletteSection: (section: "side" | "bottom") => void;
  onDeleteModule: (instanceId: string) => void;
  onUpdateHeading: (instanceId: string, newHeading: string) => void;
  onUpdateHabits: (instanceId: string, habits: string[]) => void;
  // See NativeModule's own isHovered comment — lifted to the main
  // component, threaded down through here.
  hoveredInstanceId: string | null;
  onHoverStart: (instanceId: string) => void;
  onHoverEnd: (instanceId: string) => void;
  // Non-null while a palette item is being dragged over *this* page
  // specifically (see PaletteDragPreview's own type comment above) —
  // drives the live, grid-snapped preview box below, PaletteDropPreview.
  paletteDragPreview: PaletteDragPreview | null;
  scale: number;
  isFirefox: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: PRINT_WIDTH_PX,
        height: PRINT_HEIGHT_PX,
        background: "white",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: `repeat(${page.pageGrid.gridColumns}, 1fr)`,
        gridTemplateRows: `repeat(${page.pageGrid.gridRows}, 1fr)`,
        gap: page.pageGrid.gridGapPx,
        padding: page.pageGrid.marginPx,
        flexShrink: 0,
      }}
    >
      {instanceIds.map((id) => {
        const placement = placements[id];
        // Content (elements/origin) comes from moduleLookup, not `mi`
        // directly — moduleLookup is the one this file actually patches
        // after a resize (see handleResizeAdjacent), so reading `mi.*`
        // here would keep showing stale pre-resize content forever.
        const info = moduleLookup.get(id);
        if (!placement || !info) return null;
        // todo-checklist/habit-tracker get a genuine live re-render
        // while resizing, not the frozen last-committed content every
        // other module type still gets (see NativeModule's own
        // contentIsLive comment for the history of why: a stale grid
        // clipped to a mismatched box, then hidden outright, then a
        // live CSS scale, each reported back as still wrong before this
        // — actually recomputing the real content — landed). Cheap:
        // renderModuleInstance is a pure function (no I/O, the same one
        // loadPlannerPages.ts already calls for the initial page load),
        // and `placement` here is already `displayPlacements`' live,
        // in-progress rowStart/rowSpan (see NativePage's own placements
        // prop comment), not the last-committed one — so this
        // reproduces exactly what a real commit at the box's *current*
        // size would render, correct row count included, every render
        // for the duration of the drag.
        const contentIsLive = (resizingIds?.has(id) ?? false) && (info.slug === "todo-checklist" || info.slug === "habit-tracker");
        const liveOrigin = contentIsLive ? gridCellToPixels(page.pageGrid, placement) : null;
        const elements = contentIsLive
          ? renderModuleInstance(
              {
                id,
                locked: info.locked,
                columnStart: placement.columnStart,
                rowStart: placement.rowStart,
                columnSpan: placement.columnSpan,
                rowSpan: placement.rowSpan,
                propValues: info.propValues,
                moduleType: { slug: info.slug },
              },
              page.pageGrid
            )
          : info.elements;
        return (
          <NativeModule
            key={id}
            instanceId={id}
            locked={info.locked}
            placement={placement}
            elements={elements}
            originX={liveOrigin ? liveOrigin.x : info.originX}
            originY={liveOrigin ? liveOrigin.y : info.originY}
            frozenSize={resizeFrozenSize?.[id] ?? null}
            contentIsLive={contentIsLive}
            visualOffset={visualOffsets[id] ?? ZERO_OFFSET}
            isDragged={activeId === id}
            isResizing={resizingIds?.has(id) ?? false}
            suppressTransition={suppressTransitionIds?.has(id) ?? false}
            justAdded={justAddedIds?.has(id) ?? false}
            scale={scale}
            isFirefox={isFirefox}
            onDelete={onDeleteModule}
            isHovered={hoveredInstanceId === id}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            slug={info.slug}
            heading={info.slug === "labeled-box" ? ((info.propValues.heading as string | undefined) ?? "") : null}
            onUpdateHeading={onUpdateHeading}
            habits={info.slug === "habit-tracker" ? ((info.propValues.habits as string[] | undefined) ?? []) : null}
            onUpdateHabits={onUpdateHabits}
            widthPx={info.slug === "labeled-box" ? gridCellToPixels(page.pageGrid, placement).width : 0}
          />
        );
      })}
      {/* Hidden while any module is actively being dragged — a
          reposition can change which modules are adjacent, and the
          handles' own positions would be fighting the live reflow
          preview for the same screen space otherwise. */}
      {activeId === null &&
        resizePairs.map((pair) => (
          <ResizeHandle
            key={pair.key}
            pair={pair}
            pageGrid={page.pageGrid}
            scale={scale}
            onResizeStart={onResizeStart}
            onResizeMove={onResizeMove}
            onResizeEnd={onResizeEnd}
          />
        ))}
      {activeId === null &&
        stackBottoms.map((stackBottom) => (
          <StackResizeHandle
            key={stackBottom.key}
            stackBottom={stackBottom}
            pageGrid={page.pageGrid}
            scale={scale}
            onResizeStart={onStackResizeStart}
            onResizeMove={onStackResizeMove}
            onResizeEnd={onStackResizeEnd}
          />
        ))}
      {/* Whatever a stack has freed up by shrinking (see StackBottom's
          maxBottomBound vs its own current stackBottomRowEnd) is exactly
          where a new module can go — one button per stack, always
          rendered now (not gated on room > 0, and not hidden during an
          active resize) so it can track the live gap continuously
          during a StackResizeHandle drag and grow/shrink/appear right
          along with it — requested directly: "make it resize, snap,
          and appear from the bottom during the live preview." A pair
          resize (ResizeHandle) never actually moves a stack's own
          outer bottom edge — it's zero-sum between two adjacent
          members, so stackBottomRowEnd/maxBottomBound stay fixed
          throughout one — so there was never really anything to fight
          with there in the first place; only StackResizeHandle drags
          ever change what this button is showing, and now it's allowed
          to show it live. rowSpan is clamped to >= 0 (never filtered
          out at exactly 0) specifically so this stays permanently
          mounted rather than conditionally added/removed from the
          DOM — AddModuleButton's own CSS transition on top/height/
          opacity (see its own comment) is what turns "the gap changed"
          into a visible animation; an element that only exists once
          there's room to begin with would have no "before" state for a
          transition to animate from when it first appears. Also still
          shown during a plain reposition-drag, unchanged from before —
          its own position doesn't move then (stackBottomsByPageId
          isn't affected by a reposition's visualOffsets, a pure CSS
          transform, not a placements change), so there's nothing stale
          about keeping it visible, and it doubles as a visual "here's
          where the reserved zone starts" reference while dragging
          toward it (see resolveDrag's own virtual-lock comment). */}
      {stackBottoms.map((sb) => (
            <AddModuleButton
              key={`add:${sb.bottomId}`}
              pageGrid={page.pageGrid}
              columnStart={sb.columnStart}
              columnSpan={sb.columnSpan}
              rowStart={sb.stackBottomRowEnd}
              rowSpan={Math.max(0, sb.maxBottomBound - sb.stackBottomRowEnd)}
              // columnStart === 0 alone isn't enough to identify the
              // sidebar — the right page's hourly-grid-core (and so its
              // own below-the-grid stack) also starts at column 0,
              // since that page has no sidebar to reserve column 0 for
              // in the first place. Reported directly: "when i click on
              // bottom module plus box the side module pallet opens" —
              // exactly this, on the right page. columnSpan is what
              // actually distinguishes them: the sidebar is always
              // exactly 1 column wide (labeled-box's own
              // defaultColumnSpan, prisma/seed.mts), while the
              // below-the-grid zone is always 3 or 4 (matching
              // hourly-grid-core's own width) — never 1. Same
              // hasSidebarContent/resetPlannerToTemplate (actions.ts)
              // convention already relies on columnStart === 0 too, but
              // always paired with an explicit "labeled-box" or
              // columnSpan check for the same reason.
              onClick={() => onOpenPaletteSection(sb.columnStart === 0 && sb.columnSpan === 1 ? "side" : "bottom")}
            />
          ))}
      {/* Hover-triggered "+" over the *whole* zone (top of the stack
          down to maxBottomBound), not just whatever free room
          AddModuleButton above is currently showing — requested
          directly: "when hovering over one of the sections (sidebar,
          left bottom, right bottom), there would be... a plus at the
          bottom middle of the section and that would also bring up
          the relevant side nav module section." Without this, a
          completely full zone (every row already claimed by real
          modules) had no discoverable way to even start adding
          another one — AddModuleButton only exists where there's
          already free room, so the only path was resizing something
          smaller first, purely by trial, to make a target for it
          appear. isHovered is derived from hoveredInstanceId (already
          tracked per-module, unrelated to this) rather than a new
          overlay div spanning the zone: an overlay large enough to
          cover the whole section would sit on top of every real
          module inside it and swallow their own clicks/drags — this
          way nothing new is stacked over the modules at all, hovering
          any one of them is what reveals the button one level up. */}
      {stackBottoms.map((sb) => (
        <SectionAddButton
          key={`section-add:${sb.bottomId}`}
          pageGrid={page.pageGrid}
          columnStart={sb.columnStart}
          columnSpan={sb.columnSpan}
          rowStart={sb.stackTopRowStart}
          rowSpan={sb.maxBottomBound - sb.stackTopRowStart}
          isHovered={hoveredInstanceId !== null && sb.members.some((m) => m.id === hoveredInstanceId)}
          onClick={() => onOpenPaletteSection(sb.columnStart === 0 && sb.columnSpan === 1 ? "side" : "bottom")}
        />
      ))}
      {/* Live palette-drag preview — only rendered on whichever page the
          drag is currently over (see handleDragMove's own comment on how
          that's determined). Grid-snapped, recomputed on every pointer
          move, same "show it before you commit to it" idea as
          resizePairs/stackBottoms' own live previews above. */}
      {paletteDragPreview && paletteDragPreview.pageId === page.pageId && (
        <PaletteDropPreview pageGrid={page.pageGrid} preview={paletteDragPreview} />
      )}
    </div>
  );
}

// page-space px, each side of the boundary line — see ResizeHandle's own
// comment. Widened from the original 8 per direct request ("i would
// also like the vertical resizing zone between modules to be
// vertically larger in size"), then again ("a bit bigger") once 16
// still wasn't enough — shared by both ResizeHandle (the strip between
// two stacked modules) and StackResizeHandle (the strip at a stack's
// own bottom edge) so their hit zones stay the same size as each
// other, same as before.
const RESIZE_HANDLE_HALF_HEIGHT_PX = 24;

// A thin hover strip straddling the shared boundary between two
// vertically-adjacent, same-column unlocked modules — shows an ns-resize
// cursor and, on drag, slides that boundary (see handleResizeAdjacent).
// Positioned as an absolutely-placed sibling of the grid-item module divs
// within the same `position:relative` page container, not a CSS Grid
// item itself (grid-column/grid-row only support whole-cell placement,
// not "centered on a line") — gridCellToPixels' own x/y (already
// page-margin-inclusive) lines up directly with this container's own
// coordinate space with no origin subtraction needed, unlike
// PolotnoJsonRenderer's elements: those subtract their *module's* own
// origin because they're nested one level deeper, inside that module's
// own grid-placed div; a handle here has no such enclosing div of its
// own to subtract.
//
// Live, grid-snapped preview while dragging: the boundary (and this
// handle's own position, since it's derived from `pair`, which reflects
// the live displayPlacements once a drag is in progress — see the main
// component's own comment on displayPlacements) jumps a whole row at a
// time as the drag crosses each row's worth of distance, same as the
// eventual commit snaps to. Content isn't re-rendered mid-drag (elements/
// origin only refresh once resizeAdjacentModules actually returns, on
// release) — a checklist's row count or a labeled-box's ruled lines are
// recomputed from fixed-pt measurements for a given size server-side, not
// something CSS can just stretch, and that's still not something to do on
// every row crossing. NativeModule's own isResizing prop clips that
// stale content to the live (possibly now smaller) box in the meantime,
// rather than letting it visibly spill past a shrinking edge.
// Pins the cursor icon for an entire resize drag, regardless of what
// ends up under the pointer partway through it. Reported directly,
// twice — first "cursor glitches and and flashes between resize move
// and click," then, after a first attempt (document.body.style.cursor)
// didn't fix it, "i still get the cursor flicker." The first attempt's
// own theory (cursor is hit-tested at the real pointer position each
// frame, not tied to pointer capture) was right, but the fix wasn't
// strong enough: setting cursor on body only sets the *inherited
// default* — any element the stray pointer actually lands on with its
// own explicit cursor style still wins over that, and NativeModule's
// own wrapper unconditionally sets one (grab/grabbing/default). Since
// the strip these handles use is thin and only repositions per row
// crossing, straying onto a module mid-drag is the common case, not
// an edge case — meaning body.style.cursor was overridden almost
// immediately in practice. A real stylesheet rule with !important is
// the one thing that *does* beat another element's own inline cursor
// style, which is what this injects for the drag's duration instead.
// Module-level singleton, not one style element per handle instance —
// only one resize can ever be active at a time in this app already
// (see gestureBlockedByPendingCommit), so there's never a reason for
// more than one of these to exist simultaneously.
let cursorLockStyleEl: HTMLStyleElement | null = null;
function lockCursor(cursorValue: string) {
  if (!cursorLockStyleEl) {
    cursorLockStyleEl = document.createElement("style");
    document.head.appendChild(cursorLockStyleEl);
  }
  cursorLockStyleEl.textContent = `*, *:hover { cursor: ${cursorValue} !important; }`;
}
function unlockCursor() {
  cursorLockStyleEl?.remove();
  cursorLockStyleEl = null;
}

function ResizeHandle({
  pair,
  pageGrid,
  scale,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  pair: ResizePair;
  pageGrid: PageGrid;
  scale: number;
  onResizeStart: (pair: ResizePair) => void;
  onResizeMove: (pair: ResizePair, deltaRows: number) => void;
  onResizeEnd: (pair: ResizePair, deltaRows: number) => void;
}) {
  const boundaryRow = pair.topRowStart + pair.topRowSpan;
  const rect = useMemo(
    () => gridCellToPixels(pageGrid, { columnStart: pair.columnStart, rowStart: boundaryRow, columnSpan: pair.columnSpan, rowSpan: 1 }),
    [pageGrid, pair.columnStart, pair.columnSpan, boundaryRow]
  );
  // Page-space px per +1 rowSpan — same technique useEdgeResize.ts's own
  // cellPitch used (the difference between two spans' rendered heights,
  // not a hand-derived formula), so a drag distance can be converted to
  // a row count the same way that hook already did.
  const rowPitchPx = useMemo(() => {
    const oneRow = gridCellToPixels(pageGrid, { columnStart: pair.columnStart, rowStart: 0, columnSpan: pair.columnSpan, rowSpan: 1 });
    const twoRows = gridCellToPixels(pageGrid, { columnStart: pair.columnStart, rowStart: 0, columnSpan: pair.columnSpan, rowSpan: 2 });
    return twoRows.height - oneRow.height;
  }, [pageGrid, pair.columnStart, pair.columnSpan]);

  // Frozen at the moment the drag starts — the pair's rowSpans the
  // ongoing delta/clamp math has to stay anchored to. Deliberately NOT
  // read from the live `pair` prop during the drag: once displayPlacements
  // starts reflecting a nonzero deltaRows (exactly so the handle's own
  // position can track it live — see boundaryRow above), `pair.
  // topRowSpan`/`bottomRowSpan` are already shifted by that same delta,
  // and computing a *new* delta on top of an already-shifted baseline
  // would double-count every row crossed instead of measuring from
  // where the drag actually began.
  const dragRef = useRef<{
    clientY: number;
    topRowSpan: number;
    bottomRowSpan: number;
    topMinRowSpan: number;
    bottomMinRowSpan: number;
  } | null>(null);

  const computeClampedDeltaRows = useCallback(
    (clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return 0;
      const rawDeltaPagePx = (clientY - drag.clientY) / scale;
      const rawDeltaRows = Math.round(rawDeltaPagePx / rowPitchPx);
      // Same clamp resizeAdjacentModules applies server-side, mirrored
      // here so the live preview can never show a boundary position the
      // eventual commit wouldn't actually land on. Per-side minimum, not
      // the uniform MIN_ROW_SPAN — see getMinRowSpanForSlug's own
      // comment on why a pair can have two different floors (e.g. a
      // todo-checklist paired with a habit-tracker).
      return Math.max(
        -(drag.topRowSpan - drag.topMinRowSpan),
        Math.min(drag.bottomRowSpan - drag.bottomMinRowSpan, rawDeltaRows)
      );
    },
    [scale, rowPitchPx]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      // See lockCursor's own comment (right above this component) for
      // why this exists and why body.style.cursor alone wasn't enough.
      lockCursor("ns-resize");
      dragRef.current = {
        clientY: event.clientY,
        topRowSpan: pair.topRowSpan,
        bottomRowSpan: pair.bottomRowSpan,
        topMinRowSpan: pair.topMinRowSpan,
        bottomMinRowSpan: pair.bottomMinRowSpan,
      };
      onResizeStart(pair);
    },
    [pair, onResizeStart]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      onResizeMove(pair, computeClampedDeltaRows(event.clientY));
    },
    [computeClampedDeltaRows, pair, onResizeMove]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const deltaRows = computeClampedDeltaRows(event.clientY);
      dragRef.current = null;
      unlockCursor();
      onResizeEnd(pair, deltaRows);
    },
    [computeClampedDeltaRows, pair, onResizeEnd]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const wasDragging = dragRef.current !== null;
      dragRef.current = null;
      unlockCursor();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      // Reverts the live preview without committing anything, same as a
      // 0-row release would — a cancel (e.g. touch interrupted by a
      // system gesture) isn't a deliberate "put it back where it
      // started" delta of 0, it's "this gesture never happened."
      if (wasDragging) onResizeEnd(pair, 0);
    },
    [pair, onResizeEnd]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y - RESIZE_HANDLE_HALF_HEIGHT_PX,
        width: rect.width,
        height: RESIZE_HANDLE_HALF_HEIGHT_PX * 2,
        // Cursor is the only affordance — no hover/active highlight (had
        // one initially; removed on request).
        cursor: "ns-resize",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}

// A handle at the OUTER bottom edge of a whole column stack (see
// StackBottom's own type comment for why this is a materially different
// operation from ResizeHandle's coupled pair above, not a variant of it —
// no sibling below to couple with, so growing and shrinking aren't
// mirror images of each other here). Growing (drag down) grows only the
// bottom-most member, reaching into free page space. Shrinking (drag up)
// cascades upward via cascadeStackSpans once the bottom-most member hits
// MIN_ROW_SPAN — the drag "reaches" the next member up instead of just
// clamping, matching the request this exists to satisfy ("resize the
// bottom [module] to minimum, then the second to last, until all side
// modules are their respective minimum size"). Otherwise structurally
// identical to ResizeHandle: same live-preview-then-commit shape, same
// frozen-at-pointerdown drag anchor, same no-highlight cursor-only
// affordance.
function StackResizeHandle({
  stackBottom,
  pageGrid,
  scale,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
}: {
  stackBottom: StackBottom;
  pageGrid: PageGrid;
  scale: number;
  onResizeStart: (stackBottom: StackBottom) => void;
  onResizeMove: (stackBottom: StackBottom, deltaRows: number) => void;
  onResizeEnd: (stackBottom: StackBottom, deltaRows: number) => void;
}) {
  const rect = useMemo(
    () =>
      gridCellToPixels(pageGrid, {
        columnStart: stackBottom.columnStart,
        rowStart: stackBottom.stackBottomRowEnd,
        columnSpan: stackBottom.columnSpan,
        rowSpan: 1,
      }),
    [pageGrid, stackBottom.columnStart, stackBottom.columnSpan, stackBottom.stackBottomRowEnd]
  );
  const rowPitchPx = useMemo(() => {
    const oneRow = gridCellToPixels(pageGrid, { columnStart: stackBottom.columnStart, rowStart: 0, columnSpan: stackBottom.columnSpan, rowSpan: 1 });
    const twoRows = gridCellToPixels(pageGrid, { columnStart: stackBottom.columnStart, rowStart: 0, columnSpan: stackBottom.columnSpan, rowSpan: 2 });
    return twoRows.height - oneRow.height;
  }, [pageGrid, stackBottom.columnStart, stackBottom.columnSpan]);

  // Frozen at pointerdown, same reasoning as ResizeHandle's own dragRef —
  // the live `stackBottom` prop's own member spans shift mid-drag (so
  // this handle's own position tracks the live preview), so the ongoing
  // delta/clamp math has to stay anchored to what they were when the
  // drag actually began, not double-count against an already-shifted
  // baseline.
  const dragRef = useRef<{ clientY: number; memberSpans: number[]; memberMinSpans: number[]; maxGrow: number } | null>(null);

  const computeClampedDeltaRows = useCallback(
    (clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return 0;
      const rawDeltaPagePx = (clientY - drag.clientY) / scale;
      // Per-member minimum, not the uniform MIN_ROW_SPAN — see
      // getMinRowSpanForSlug's own comment on why a stack can mix module
      // types (e.g. a todo-checklist stacked with a habit-tracker), each
      // with a different floor.
      const totalShrinkable = drag.memberSpans.reduce(
        (sum, span, i) => sum + (span - drag.memberMinSpans[i]),
        0
      );
      // Snapped in terms of the resulting *gap* below the stack (maxGrow
      // - delta), not delta directly — a gap of exactly 1 row is never a
      // valid landing point, only 0 or >= MIN_ROW_SPAN. Reported
      // directly: "resize bottom side module and leave a small gap then
      // add a new side module, the new overlaps" — AddModuleButton/
      // addPaletteModuleAt always place a full MIN_ROW_SPAN-tall module
      // in whatever gap is offered, so a 1-row gap can never actually
      // fit what it's advertising room for; the module dropped into it
      // spills into whatever's next to it instead. Worked out from the
      // *continuous*, pre-row-rounding drag position (rawDeltaRows/
      // rowPitchPx as a real number, not yet Math.round'ed) rather than
      // rounding to the nearest row first and patching a landing of
      // exactly 1 after the fact — rounding first would only relocate
      // the single dead row, not widen it, leaving some exact mouse
      // position where which side it resolves to is genuinely
      // arbitrary. Working in continuous space instead lets the
      // boundary between the 0 and MIN_ROW_SPAN landings sit at their
      // true midpoint, giving each one a real, full-width catchment the
      // same as every other snap step already has — resizeStackFromBottom
      // (actions.ts) mirrors this same reasoning server-side, in integer
      // form, as the authoritative re-check. Deliberately the uniform
      // MIN_ROW_SPAN here, not a per-member minimum like totalShrinkable
      // above — this is about the *next* module that could go in the
      // freed gap, not about any of this stack's own current members.
      // In the sidebar, that's always a labeled-box (AddModuleButton's
      // own "+" zone there); below the hourly grid it could also be a
      // fresh todo-checklist/habit-tracker shrunk to fit (see
      // addPaletteModuleAt's own shrink-to-fit comment) — but every one
      // of these floors is verified to coincide at 2 rows on this app's
      // real page geometry (see getMinRowSpanForSlug's own comment), so
      // the uniform constant here still gives the right answer for
      // either zone without needing to know which one this stack is.
      const maxPossibleGap = drag.maxGrow + totalShrinkable;
      const effectiveMaxGap = maxPossibleGap >= MIN_ROW_SPAN ? maxPossibleGap : 0;
      const rawGapRows = drag.maxGrow - rawDeltaPagePx / rowPitchPx;
      const boundedGapRows = Math.max(0, Math.min(effectiveMaxGap, rawGapRows));
      const snappedGapRows =
        boundedGapRows <= MIN_ROW_SPAN / 2 ? 0 : Math.max(MIN_ROW_SPAN, Math.round(boundedGapRows));
      return drag.maxGrow - snappedGapRows;
    },
    [scale, rowPitchPx]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      // See lockCursor's own comment (right above ResizeHandle) for
      // why this exists and why body.style.cursor alone wasn't enough
      // — same fix, same underlying problem, this handle's own thin
      // strip has it too.
      lockCursor("ns-resize");
      dragRef.current = {
        clientY: event.clientY,
        memberSpans: stackBottom.members.map((m) => m.rowSpan),
        memberMinSpans: stackBottom.members.map((m) => m.minRowSpan),
        maxGrow: stackBottom.maxBottomBound - stackBottom.stackBottomRowEnd,
      };
      onResizeStart(stackBottom);
    },
    [stackBottom, onResizeStart]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      onResizeMove(stackBottom, computeClampedDeltaRows(event.clientY));
    },
    [computeClampedDeltaRows, stackBottom, onResizeMove]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const deltaRows = computeClampedDeltaRows(event.clientY);
      dragRef.current = null;
      unlockCursor();
      onResizeEnd(stackBottom, deltaRows);
    },
    [computeClampedDeltaRows, stackBottom, onResizeEnd]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const wasDragging = dragRef.current !== null;
      dragRef.current = null;
      unlockCursor();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (wasDragging) onResizeEnd(stackBottom, 0);
    },
    [stackBottom, onResizeEnd]
  );

  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y - RESIZE_HANDLE_HALF_HEIGHT_PX,
        width: rect.width,
        height: RESIZE_HANDLE_HALF_HEIGHT_PX * 2,
        cursor: "ns-resize",
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    />
  );
}

// A dashed rounded-rect "add a module here" button over whatever room a
// StackResizeHandle drag (or the initial page load, if a stack simply
// never filled its whole allotted zone) has left below a stack — the
// native-editor port of the old Polotno-hosted editor's own
// EmptyZoneOverlay.tsx, same visual language (dashed border, "+"), a
// plain DOM overlay there for the same reason it's a plain absolutely-
// positioned div here: it isn't real page content, it shouldn't be part
// of anything that gets persisted or exported.
//
// NOT scoped to any one column range — stackBottomsByPageId (main
// component) groups by whatever column ranges actually exist on the
// page, sidebar or not, so this shows up below *any* stack with room,
// including the zone below the hourly grid once todo-checklist/
// habit-tracker became independently resizable (a claim an earlier
// version of this comment got wrong, back when that zone could never
// have spare room to show this at all).
//
// Used to add a labeled-box directly on click — fine in the sidebar,
// its one unambiguous content type, but silently wrong below the
// hourly grid, where there are two real candidates (todo-checklist,
// habit-tracker) a single click can't choose between; a labeled-box
// added there would land undersized and in the wrong place, since
// addPaletteModuleAt's own column/size overrides only apply to those
// two slugs. Opens ModulePalette's matching section instead — see its
// own comment — so the user picks a card and drags it in themselves,
// landing via the same shrink-to-fit logic a direct drag already uses
// (addPaletteModuleAt's own comment). Requested directly: "when i
// click on plus box under side modules it should bring up the side
// module section of the sidebar... when i click on bottom module plus
// box it should bring me to bottom module section." columnStart === 0
// is what the caller (NativePage) uses to tell which section a given
// button's own stack belongs to — see that call site's own comment.
// AddModuleButton's own dashed edge. First tried as CSS
// `border-style: dashed` (reported: thicker border alone still read
// as "dots," no independent dash-length control), then as four
// repeating-gradient background layers, one per side (reported: exact
// dash length, but corners showed a partial/clipped dash instead of
// one bending smoothly through it), then as one continuous dashed
// rounded-rect stroke via stroke-dasharray (fixed the corner clipping,
// but a single dasharray/no-offset traversal starts its phase at an
// arbitrary point — top-left, by SVG's own rounded-rect path
// convention — so nothing forced the pattern to land the same way on
// the left and right; reported: "make dashed border symmetric across
// the middle vertical").
//
// This version draws the border as four independent straight edges
// (each with its own stroke-dashoffset centering a dash exactly at
// that edge's own midpoint — see edgeDashOffset below) plus four
// solid, undashed quarter-circle arcs connecting them at the corners.
// Two problems solved by one design, not stacked fixes: centering
// each straight edge's own pattern independently is what actually
// guarantees left-right (and, as a side effect, top-bottom) mirror
// symmetry — a single global offset on one continuous path can't
// simultaneously center the top edge, the bottom edge (traversed in
// the *opposite* direction along a rounded-rect path), and match the
// left/right edges to each other, without solving a much gnarlier
// piece of path-length bookkeeping for comparatively little gain. And
// since corners are now solid rather than dashed, there's nothing
// left to clip awkwardly through them — the corner-clipping problem
// the previous version specifically fixed doesn't just stay fixed, it
// stops being a real question at all.
const ADD_MODULE_DASH_PX = 80;
const ADD_MODULE_GAP_PX = 45;
const ADD_MODULE_BORDER_PX = 8;
const ADD_MODULE_RADIUS_PX = 48;
const ADD_MODULE_DASH_COLOR = "rgba(120, 130, 255, 0.6)";

// Centers a dash (not a gap) at the midpoint of a straight run of the
// given length — the standard SVG stroke-dashoffset centering
// formula: offset = dash/2 - length/2. Derivation, since dashoffset's
// own sign convention isn't obvious from the spec text alone: the
// well-known line-draw-animation technique (dasharray = pathLength,
// dashoffset animated from pathLength down to 0 to "reveal" the path)
// only works if increasing dashoffset shifts the pattern so effective
// position = t + offset, which is what this formula assumes.
function edgeDashOffset(length: number): number {
  return ADD_MODULE_DASH_PX / 2 - length / 2;
}

function AddModuleButton({
  pageGrid,
  columnStart,
  columnSpan,
  rowStart,
  rowSpan,
  onClick,
}: {
  pageGrid: PageGrid;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  onClick: () => void;
}) {
  const rect = useMemo(
    () => gridCellToPixels(pageGrid, { columnStart, rowStart, columnSpan, rowSpan }),
    [pageGrid, columnStart, rowStart, columnSpan, rowSpan]
  );
  // gridCellToPixels' own height formula (rowSpan*cellHeight +
  // (rowSpan-1)*gap) goes *negative* at rowSpan 0 — expected now that
  // the caller (NativePage) renders this permanently, clamping rowSpan
  // to >= 0 rather than filtering the whole button out at exactly 0
  // (see that call site's own comment on why: a permanently-mounted
  // element is what lets the CSS transition below animate "the gap
  // changed" into a visible grow/shrink, including the very first time
  // it goes from 0 to some room). Clamped here, once, and used for
  // every downstream visual computation instead of the raw rect.height.
  const visualHeight = Math.max(0, rect.height);
  const iconSize = Math.max(40, Math.min(64, rect.width * 0.24));

  // Inset by half the stroke width on every side — an SVG stroke is
  // centered on its own path by default, so without this the outer
  // half would run past the button's own edge and get clipped instead
  // of landing flush with it (same "inset a stroke to keep its outer
  // edge at the box's own boundary" adjustment PolotnoJsonRenderer's
  // own outline rendering already relies on elsewhere in this file).
  const half = ADD_MODULE_BORDER_PX / 2;
  const x0 = half;
  const y0 = half;
  const x1 = Math.max(half, rect.width - half);
  const y1 = Math.max(half, visualHeight - half);
  // Same clamp CSS border-radius applies automatically (and SVG's own
  // rx/ry did too, in the previous single-<rect> version) — manually
  // replicated here since these are now four independent lines/arcs
  // this component builds itself, with no single shape left for the
  // browser to auto-clamp for it.
  const r = Math.max(0, Math.min(ADD_MODULE_RADIUS_PX, (x1 - x0) / 2, (y1 - y0) / 2));
  const flatWidth = Math.max(0, x1 - x0 - 2 * r);
  const flatHeight = Math.max(0, y1 - y0 - 2 * r);
  const horizontalDashProps = {
    stroke: ADD_MODULE_DASH_COLOR,
    strokeWidth: ADD_MODULE_BORDER_PX,
    strokeDasharray: `${ADD_MODULE_DASH_PX} ${ADD_MODULE_GAP_PX}`,
    strokeDashoffset: edgeDashOffset(flatWidth),
    strokeLinecap: "butt" as const,
  };
  const verticalDashProps = {
    stroke: ADD_MODULE_DASH_COLOR,
    strokeWidth: ADD_MODULE_BORDER_PX,
    strokeDasharray: `${ADD_MODULE_DASH_PX} ${ADD_MODULE_GAP_PX}`,
    strokeDashoffset: edgeDashOffset(flatHeight),
    strokeLinecap: "butt" as const,
  };
  const cornerProps = { fill: "none", stroke: ADD_MODULE_DASH_COLOR, strokeWidth: ADD_MODULE_BORDER_PX };

  return (
    <button
      type="button"
      onClick={rowSpan > 0 ? onClick : undefined}
      title="Add a module here"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: visualHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        border: "none",
        backgroundColor: "rgba(120, 130, 255, 0.06)",
        borderRadius: ADD_MODULE_RADIUS_PX,
        color: "rgba(90, 100, 220, 0.8)",
        cursor: "pointer",
        // Permanently mounted now (see the caller's own comment) — but
        // top/height are deliberately NOT transitioned, only opacity
        // is. First pass at this animated both, and reported back
        // immediately: "it doesn't snap with above module and it
        // jumps around and stuff while resizing." Root cause: a
        // continuous drag can cross several rows within one 0.2s ease
        // window, so each row crossing restarted a new transition from
        // wherever the *previous*, still-mid-flight one had gotten to
        // — permanently chasing a moving target instead of settling,
        // while the module boundary right above it (which this button
        // needs to visually align with) tracks the same live data with
        // zero lag by design, the same "no transition on the thing
        // that's actively being dragged" rule NativeModule's own
        // isDragged/suppressTransition already follows elsewhere in
        // this file. "Snap" (in the same request as "resize") already
        // meant discrete, instant, per-row jumps, not an eased slide —
        // consistent with how every other part of this app's own
        // resize preview behaves (see ResizeHandle's own comment:
        // "jumps a whole row at a time," no easing). Opacity is the
        // one property that's safe to animate: it only flips once per
        // "room appeared/disappeared" transition, never on every row
        // crossing within an ongoing drag, so a short fade-in still
        // reads as "appearing" without ever fighting the drag itself.
        opacity: rowSpan > 0 ? 1 : 0,
        pointerEvents: rowSpan > 0 ? "auto" : "none",
        transition: "opacity 0.2s ease",
      }}
    >
      {/* The dashed edge — see this file's own header comment above
          for the four-edge-plus-solid-corners design and why.
          Absolutely positioned to exactly cover the button,
          pointerEvents:none so it never intercepts the click meant
          for the button itself. */}
      <svg
        width={rect.width}
        height={visualHeight}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      >
        {/* Top and bottom: same flatWidth/offset, so besides each
            being individually centered (the actual requirement), the
            two also end up mirroring each other — a bonus, not
            something separately computed for. */}
        <line x1={x0 + r} y1={y0} x2={x1 - r} y2={y0} {...horizontalDashProps} />
        <line x1={x0 + r} y1={y1} x2={x1 - r} y2={y1} {...horizontalDashProps} />
        <line x1={x0} y1={y0 + r} x2={x0} y2={y1 - r} {...verticalDashProps} />
        <line x1={x1} y1={y0 + r} x2={x1} y2={y1 - r} {...verticalDashProps} />
        {/* Four quarter-circle corners, solid (no dasharray) —
            deliberately not dashed at all, so there's nothing for a
            corner to clip awkwardly through. Clockwise sweep
            (sweep-flag 1) matches the same direction a rounded-rect's
            own implicit path already goes in. */}
        <path d={`M ${x0},${y0 + r} A ${r},${r} 0 0 1 ${x0 + r},${y0}`} {...cornerProps} />
        <path d={`M ${x1 - r},${y0} A ${r},${r} 0 0 1 ${x1},${y0 + r}`} {...cornerProps} />
        <path d={`M ${x1},${y1 - r} A ${r},${r} 0 0 1 ${x1 - r},${y1}`} {...cornerProps} />
        <path d={`M ${x0 + r},${y1} A ${r},${r} 0 0 1 ${x0},${y1 - r}`} {...cornerProps} />
      </svg>
      {/* A real icon, not the text glyph "+" — requested directly
          ("can you change to plus icon as well"). Two round-capped
          strokes rather than a font character: renders at a precise,
          consistent weight/proportion regardless of whatever font the
          browser would've picked for a bare "+", and scales exactly
          with width/height instead of a font's own line-height
          quirks. stroke="currentColor" inherits the button's own
          `color` above rather than duplicating that value here. */}
      <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none">
        <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" />
      </svg>
    </button>
  );
}

// Hover-triggered "+" over an entire zone (stackTopRowStart down to
// maxBottomBound) — see the call site's own comment (NativePage) for
// why this exists alongside AddModuleButton rather than replacing it.
// Same visual language as NativeModule's own delete button (gray
// circle, darker gray glyph, opacity-faded in on hover, same
// background/color/transition values), sized larger than that button
// (105px vs. its own 70px — originally requested at 2x/140px, eased
// down to 75% of that after seeing it live) — centered on the zone's
// own bottom edge instead
// of straddling a corner, via transform:translate(-50%,-50%) rather
// than the delete button's fixed top/right offsets, since this needs
// to center on a computed *point* (the zone's own horizontal midpoint
// at its bottom edge) instead of a fixed corner.
//
// Two fixes on top of the first version, both reported directly:
//
// 1. "mouse still flickering... it only flickers when i move my
// mouse within the button." Root cause: `isHovered` alone (derived
// from hoveredInstanceId — is *some module in this zone* currently
// hovered) creates a feedback loop the delete button doesn't have.
// The delete button is a *child* of the one module whose hover state
// controls it, and mouseenter/mouseleave deliberately don't re-fire
// when the pointer moves onto a descendant — so hovering the delete
// button itself never counts as "leaving" its own module. This
// button is a *sibling* of whatever module it overlaps, not a
// descendant of it, so that protection doesn't apply: the instant it
// becomes interactive and the pointer happens to be sitting where it
// covers part of that module, the module's own mouseleave genuinely
// fires (hoveredInstanceId -> null -> isHovered -> false), which
// hides this button, which lets the pointer fall back onto the
// module, which re-fires *its* mouseenter, which shows this button
// again — an infinite toggle exactly where the two overlap. Fixed
// with the standard pattern for exactly this ("submenu closes in the
// gap between it and its trigger" is the classic version of the same
// bug): track this button's *own* hover locally too, and stay
// visible if *either* source says so. The two transitions
// (module-mouseleave, button-mouseenter) fire back-to-back as part of
// the same continuous pointer movement, so the OR never has a gap
// where both are momentarily false.
//
// 2. "the button should only be the click pointer cursor within the
// bounds of the circle plus button" — border-radius is paint-only,
// it was never true; the actual hit-test area was always this
// element's full square bounding box, including the four transparent
// corners outside the visible circle. clipPath (unlike border-radius)
// does constrain hit-testing, not just what's painted — using it
// here makes the interactive area match the visible circle exactly,
// and as a side effect shrinks how much of this button's own
// footprint can overlap a module underneath it in the first place,
// narrowing the window fix #1 above has to protect against.
function SectionAddButton({
  pageGrid,
  columnStart,
  columnSpan,
  rowStart,
  rowSpan,
  isHovered,
  onClick,
}: {
  pageGrid: PageGrid;
  columnStart: number;
  columnSpan: number;
  rowStart: number;
  rowSpan: number;
  isHovered: boolean;
  onClick: () => void;
}) {
  const rect = useMemo(
    () => gridCellToPixels(pageGrid, { columnStart, rowStart, columnSpan, rowSpan }),
    [pageGrid, columnStart, rowStart, columnSpan, rowSpan]
  );
  const [selfHovered, setSelfHovered] = useState(false);
  const visible = isHovered || selfHovered;
  return (
    <button
      type="button"
      title="Add a module here"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseEnter={() => setSelfHovered(true)}
      onMouseLeave={() => setSelfHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      style={{
        position: "absolute",
        left: rect.x + rect.width / 2,
        top: rect.y + rect.height,
        transform: "translate(-50%, -50%)",
        width: 105,
        height: 105,
        borderRadius: "50%",
        clipPath: "circle(50%)",
        border: "none",
        background: "#c7c7c7",
        color: "#666666",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 67.5,
        lineHeight: 1,
        padding: 0,
        cursor: "pointer",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 0.12s ease",
        zIndex: 6,
      }}
    >
      +
    </button>
  );
}

// The live, grid-snapped landing box for a palette drag (see
// PaletteDragPreview's own comment) — same dashed-box visual language
// as AddModuleButton, in blue when it's a genuinely free landing spot,
// tinted red and non-interactive when overlapping is true (the page has
// no free room for this span; dropping here won't commit anything —
// see handleDragEnd's own check).
function PaletteDropPreview({ pageGrid, preview }: { pageGrid: PageGrid; preview: PaletteDragPreview }) {
  const rect = useMemo(
    () =>
      gridCellToPixels(pageGrid, {
        columnStart: preview.columnStart,
        rowStart: preview.rowStart,
        columnSpan: preview.columnSpan,
        rowSpan: preview.rowSpan,
      }),
    [pageGrid, preview.columnStart, preview.rowStart, preview.columnSpan, preview.rowSpan]
  );
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        border: preview.overlapping ? "2px dashed rgba(220, 90, 90, 0.7)" : "2px dashed rgba(120, 130, 255, 0.7)",
        background: preview.overlapping ? "rgba(220, 90, 90, 0.08)" : "rgba(120, 130, 255, 0.1)",
        borderRadius: 8,
        pointerEvents: "none",
        zIndex: 8,
      }}
    />
  );
}

// One draggable card in ModulePalette below. Its own transform tracks
// the raw pointer delta directly, *not* divided by scale — unlike a
// module dragged inside the scaled page subtree (see the file's own
// header comment on "Why this doesn't use <DragOverlay>" for why that
// one needs the division), this card lives in ordinary, un-scaled UI
// territory outside that transform, so the raw screen-pixel delta
// already is the right offset for it. Reuses the file's established
// "just translate the dragged element itself in place" technique
// rather than dnd-kit's own DragOverlay, for the same documented reason
// that technique exists at all.
function PaletteCard({
  slug,
  label,
  isDragging,
  dragOffset,
}: {
  slug: string;
  label: string;
  isDragging: boolean;
  dragOffset: { x: number; y: number };
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `${PALETTE_ID_PREFIX}${slug}` });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        position: "relative",
        padding: "6px 10px",
        borderRadius: 7,
        border: "none",
        background: isDragging ? "#363636" : "#2a2a2a",
        color: "#ddd",
        fontSize: 11,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        touchAction: "none",
        transform: isDragging ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined,
        boxShadow: isDragging ? "0 12px 28px rgba(0,0,0,0.35)" : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {label}
    </div>
  );
}

const PALETTE_SECTIONS: Array<{ key: "side" | "bottom"; heading: string; hint: string }> = [
  { key: "side", heading: "Side Modules", hint: "Sidebar column" },
  { key: "bottom", heading: "Bottom Modules", hint: "Below the hourly grid" },
];
const PALETTE_SIDEBAR_WIDTH_PX = 260;

// Drag-to-add sidebar — requested directly: "create a pallette on the
// side to drag and add new module." A sibling of the scaled page
// content (see the main render's own comment on why), not a descendant
// of it, specifically so its position:fixed behaves the way
// ZoomControls' own identical positioning already does — relative to
// the real viewport, not hijacked by the scale transform's own
// containing-block behavior.
//
// Collapsible, sliding in from the left — requested directly, twice:
// first "put the pallete in a collapsible sidebar like polotno," then,
// after a first pass put it as a right-side rail+flyout instead, "i
// would like to make a collapsible side bar that slide in from the
// left side... modern minimalist." A single panel (not a rail plus a
// separate flyout, this time) fixed to the left edge, from just below
// the header down to the bottom of the viewport (top: HEADER_HEIGHT_PX,
// not 0 — the header itself, and its own Reset-to-Template/save-error
// content, stays visible and usable regardless of whether this is
// open). Toggled by a button in the header's own flow (not rendered by
// this component — see the main render's own comment on why) —
// translate-based slide (transform: translateX, not an animated
// width/left), the GPU-composited technique modern minimalist sidebar
// implementations consistently use over a layout-triggering property,
// so the slide stays smooth regardless of how much content the panel
// holds.
//
// Both sections' cards show at once inside the open panel rather than
// one flyout per section (there are only 3 cards total across both —
// not enough content to justify a picker step of its own). `open` and
// `highlightSection` are both controlled (owned by the main component,
// not local state) specifically so AddModuleButton's own "+" zones can
// drive them too — see that component's own comment: clicking one
// opens the panel and briefly highlights the matching section, since
// both are already visible together rather than needing to switch
// which one is showing.
function ModulePalette({
  activeId,
  activeDelta,
  open,
  highlightSection,
}: {
  activeId: string | null;
  activeDelta: { x: number; y: number };
  open: boolean;
  highlightSection: "side" | "bottom" | null;
}) {
  // Nested collapsibility inside the panel — requested directly:
  // "'Add Module' collapsible as well as 'side modules' and 'bottom
  // modules'." Local state, not lifted to the main component the way
  // the panel's own open/highlightSection are: nothing outside this
  // component ever needs to read or force these except in reaction to
  // highlightSection changing, right below.
  // Both default collapsed, requested directly — the panel opens to
  // just two header rows rather than every card already expanded.
  const [addModuleOpen, setAddModuleOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState<Record<"side" | "bottom", boolean>>({ side: false, bottom: false });
  // A "+" zone asking to highlight a section (see the main component's
  // own handleOpenPaletteSection) is also implicitly asking to *see*
  // it — force both the "Add Module" group and that specific section
  // open, or the very thing being pointed at would still be hidden
  // behind a collapsed header. React's own "adjust state during
  // rendering" pattern (comparing against a value snapshotted from the
  // previous render, setState called directly in the render body) —
  // not a useEffect: this codebase already prefers deriving from state
  // during render over syncing it with an effect where possible (see
  // fitWidthScale's own comment), and a plain useEffect+setState here
  // would additionally trip this project's own "don't call setState
  // synchronously inside an effect" lint rule.
  const [lastHighlightSection, setLastHighlightSection] = useState(highlightSection);
  if (highlightSection !== lastHighlightSection) {
    setLastHighlightSection(highlightSection);
    if (highlightSection) {
      setAddModuleOpen(true);
      setSectionOpen((prev) => ({ ...prev, [highlightSection]: true }));
    }
  }
  // Forcing a section open (just above) doesn't put it *in view* — the
  // panel is its own scrollable region (overflow: auto below), and a
  // "+" zone can be clicked while the panel's scrolled somewhere that
  // doesn't happen to show the target section at all. Reported
  // directly: "when i click on a plus box, the highlight of the nav
  // section is cut off, I can only see the top right border radius of
  // the highlight, the rest... cut off and hidden" — exactly what
  // scrolling clips: the section (and its highlight, sized to match
  // it) was mostly below the panel's own visible scroll area, only a
  // sliver of its top-right corner actually inside it. A genuine DOM
  // side effect (scrolling), not a value to derive during render, so
  // this one really is a useEffect, unlike the setState calls above.
  const sectionRefs = useRef<Partial<Record<"side" | "bottom", HTMLDivElement>>>({});
  useEffect(() => {
    if (!highlightSection) return;
    // Delayed, not immediate — reported directly, twice more: "still
    // cut off a bit... looks better than before." The section (and,
    // one level up, "Add Module" itself) can both need to force-open
    // right as this same click sets highlightSection, and
    // PaletteCollapse's own open animation is a real 0.22s CSS
    // transition (grid-template-rows), not instant. Calling
    // scrollIntoView immediately measures the target *mid-collapse*
    // — right at the very start of the grow animation, when its own
    // layout height is still close to zero — so the scroll position
    // it picks is correct for that fleeting near-zero-height instant,
    // not for the fully-expanded content the animation keeps growing
    // into for the next ~220ms afterward. Waiting past both possible
    // animations (a small buffer over 0.22s covers either or both
    // needing to run) means this measures the section at its real,
    // final height instead.
    const timeout = setTimeout(() => {
      sectionRefs.current[highlightSection]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 260);
    return () => clearTimeout(timeout);
  }, [highlightSection]);
  // Toggle button itself lives in the page header, not here (see the
  // main render's own comment on why) — this just renders the sliding
  // panel. Stays mounted (not conditionally rendered) at all times,
  // sliding fully off-canvas via transform when closed — a mount/
  // unmount would lose the transition entirely (nothing to animate
  // *from*) and drop whatever drag state a card mid-drag might have.
  // top: HEADER_HEIGHT_PX, not 0 — the header bar (and its own Reset-
  // to-Template/save-error content) stays above and outside the panel
  // rather than being covered by it, so it's still reachable regardless
  // of whether the palette is open.
  //
  // overflow flips to "visible" for the duration of a palette-card drag
  // — reported directly: "when i tried to drag a habit tracker from
  // side nav my mouse got stuck scrolling to the side within the side
  // nav." Root cause: this panel is *both* a CSS-transformed element
  // (its own open/closed translateX slide) *and* a scrolling container
  // (overflow: auto below) at the same time. PaletteCard's own drag
  // also moves via a raw CSS transform (see its own header comment on
  // why — same "translate the element itself" technique used
  // throughout this file instead of dnd-kit's DragOverlay), which
  // doesn't remove it from normal layout, only visually offsets it —
  // so the instant a drag carries the card outside this panel's own
  // box (which is immediately, since every real drop target is
  // elsewhere on the page), the panel's scrollable content area grows
  // to keep "containing" that visually-offset card, and the browser
  // starts treating pointer movement as a scroll gesture on this
  // container instead of purely the JS-driven card drag it's supposed
  // to be. Can't fix it the way NativeModule's own drag avoids the
  // exact same class of problem (per this file's "Why this doesn't use
  // DragOverlay" header comment, position:fixed escapes a transformed
  // ancestor) — this panel's own transform *is* that ancestor, so a
  // fixed-position card here would stay trapped relative to the panel,
  // not the viewport. Simplest real fix instead: this panel only
  // genuinely needs to scroll while nothing's being dragged out of it
  // — so overflow just turns off (`visible`) for the one brief window
  // where staying "auto" would fight the drag, and reverts to `auto`
  // immediately once the drag ends.
  const isDraggingPaletteCard = activeId?.startsWith(PALETTE_ID_PREFIX) ?? false;
  return (
    <div
      style={{
        position: "fixed",
        top: HEADER_HEIGHT_PX,
        left: 0,
        bottom: 0,
        width: PALETTE_SIDEBAR_WIDTH_PX,
        background: "#141414",
        borderRight: "1px solid #262626",
        boxShadow: open ? "8px 0 32px rgba(0,0,0,0.35)" : "none",
        transform: open ? "translateX(0)" : `translateX(-${PALETTE_SIDEBAR_WIDTH_PX}px)`,
        transition: "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.28s ease",
        zIndex: 25,
        overflow: isDraggingPaletteCard ? "visible" : "auto",
        padding: "14px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <button
        type="button"
        onClick={() => {
          // Collapsing a parent also collapses its own children, for
          // the *next* time it's reopened — requested directly: "when
          // a parent is collapsed it collapses all of its children."
          // Only on the way to closed, not open: reopening "Add
          // Module" itself shouldn't force both sections open too,
          // only reset what collapsing it just did.
          const next = !addModuleOpen;
          setAddModuleOpen(next);
          if (!next) setSectionOpen({ side: false, bottom: false });
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          color: "#f0f0f0",
          textAlign: "left",
        }}
      >
        <PaletteChevron open={addModuleOpen} />
        <strong style={{ fontSize: 13, letterSpacing: 0.3 }}>Modules</strong>
      </button>
      <PaletteCollapse open={addModuleOpen} allowOverflow={isDraggingPaletteCard}>
        {/* Back to plain paddingLeft:14 (the intentional nested-indent) —
            the previous "2px 2px 2px 14px" was reserving bleed room for
            each section's highlight, which drew via box-shadow (paints
            outside the element's own box, so it needs an ancestor to
            leave it somewhere to bleed into). The highlight is now a
            real border instead (see the section div below), which is
            part of the box's own dimensions and can't be clipped by an
            ancestor's overflow regardless of how much padding exists
            anywhere in the chain — so this wrapper no longer needs to
            carve out space for it. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 14 }}>
          {PALETTE_SECTIONS.map((s) => {
            const sectionIsOpen = sectionOpen[s.key];
            return (
              <div
                key={s.key}
                ref={(el) => {
                  sectionRefs.current[s.key] = el ?? undefined;
                }}
                // Highlight styling lives directly on this div now —
                // not a separate absolutely-positioned overlay sized to
                // match it. That approach went through three attempts
                // (a negative-margin bleed, then inset:-7, then inset:0)
                // and got reported cut off after each one in a
                // different way ("doesn't match up," then "still cut
                // off," then "still cut off a bit on the bottom and
                // right") — every version depended on a *second* box
                // staying in sync with this one's real content size,
                // and something about the panel's own nested padding/
                // collapse/scroll machinery kept finding a new way to
                // break that sync. Putting the highlight on the actual
                // content box itself removes the whole problem class at
                // the root: there's only one box now, so there's
                // nothing left that could ever get out of sync with it.
                //
                // The outline itself is a real `border`, not a
                // box-shadow. A box-shadow paints *outside* the
                // element's own border box, so it always needs the
                // ancestor chain to reserve extra padding to have
                // somewhere to bleed into — a padding-tuning fix
                // (reserving 2px on the sections-list wrapper) reduced
                // but didn't eliminate reported clipping ("top and
                // right" on the first section, "bottom and right" on
                // the last — the section flush against each end of the
                // scrollable list, same as before, just smaller).
                // `border` is part of the box's own dimensions, so it
                // can never be clipped by an ancestor's overflow no
                // matter how many levels deep or how little padding
                // exists anywhere in the chain. Always rendering a 1px
                // border (transparent when not highlighted) keeps the
                // box's size constant so toggling the highlight never
                // shifts layout.
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                  padding: 7,
                  borderRadius: 14,
                  // Light grey per direct request (was blue). Border
                  // faded down to "almost no border," then dropped
                  // entirely per direct follow-up — background fill
                  // only now. Still an always-present transparent
                  // border (not just omitting the property) so the
                  // section keeps the exact same box size whether or
                  // not it's highlighted — no layout shift on toggle.
                  background: highlightSection === s.key ? "rgba(220, 220, 220, 0.14)" : "transparent",
                  border: "1px solid transparent",
                  transition: "background 0.4s ease",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSectionOpen((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <PaletteChevron open={sectionIsOpen} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#ddd", lineHeight: 1.3 }}>{s.heading}</div>
                    <div style={{ fontSize: 9.5, color: "#707070", lineHeight: 1.3 }}>{s.hint}</div>
                  </div>
                </button>
                <PaletteCollapse open={sectionIsOpen} allowOverflow={isDraggingPaletteCard}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 14, paddingTop: 5 }}>
                    {PALETTE_MODULE_TYPES.filter((m) => m.section === s.key).map((m) => (
                      <PaletteCard
                        key={m.slug}
                        slug={m.slug}
                        label={m.label}
                        isDragging={activeId === `${PALETTE_ID_PREFIX}${m.slug}`}
                        dragOffset={activeDelta}
                      />
                    ))}
                  </div>
                </PaletteCollapse>
              </div>
            );
          })}
        </div>
      </PaletteCollapse>
    </div>
  );
}

// Animated expand/collapse — requested directly ("can you animate the
// collapsing"), replacing the previous instant `{open && children}`
// toggle. The CSS grid-template-rows 0fr/1fr technique: an adaptive-
// height animation with no JS measuring involved, unlike the classic
// max-height hack (which needs a guessed ceiling and animates at the
// wrong apparent speed for any real content shorter than it — a
// PaletteCard list here is only ever a few dozen px tall, nowhere near
// a plausible max-height guess, so that hack would look almost
// instant anyway). Always renders its children (never removes them
// from the tree, just clips them to zero height while collapsed) — a
// card mid-drag inside a collapsing section doesn't lose its own drag
// state, and nothing has to re-mount when reopened.
function PaletteCollapse({
  open,
  allowOverflow,
  children,
}: {
  open: boolean;
  // Overrides the inner wrapper's own overflow:hidden (needed the rest
  // of the time to actually clip content to zero height while
  // collapsed) to "visible" — added after this component shipped, when
  // it turned out to reintroduce the exact class of bug ModulePalette's
  // own overflow:visible-while-dragging fix already existed to solve,
  // just one layer deeper. Every PaletteCard lives inside one (or two,
  // nested — a section's own card list, itself inside "Add Module"'s
  // own list of sections) of these wrappers; a dragged card's own
  // transform carries it outside this wrapper's bounds just as
  // immediately as it does the outer panel's, and PaletteCollapse's
  // hidden clip has no idea a drag is even happening unless told.
  // Reported directly: "it looks like it goes under canvas but it
  // disappears a bit earlier like it stays within the bottom module
  // element, with no overflow" — exactly this: clipped the instant it
  // left its own section's card-list wrapper, well before it ever
  // reached the panel's own edge (or the canvas beyond it) to test
  // ModulePalette's own fix at all.
  allowOverflow: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.22s ease" }}>
      <div style={{ overflow: allowOverflow ? "visible" : "hidden", minHeight: 0 }}>{children}</div>
    </div>
  );
}

// Small rotating disclosure triangle shared by "Add Module" and each
// PALETTE_SECTIONS header — a plain CSS rotate on a fixed glyph rather
// than swapping between two different characters (▸/▾), so the state
// change animates instead of jumping. fontSize 25 (2.5x the original
// 10) read as too large once seen live; pulled back to 16.
function PaletteChevron({ open }: { open: boolean }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 16,
        color: "#888",
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 0.18s ease",
        flexShrink: 0,
      }}
    >
      ▸
    </span>
  );
}

const ZERO_OFFSET = { x: 0, y: 0 };
const EMPTY_RESIZE_PAIRS: ResizePair[] = [];
const EMPTY_STACK_BOTTOMS: StackBottom[] = [];
const EMPTY_INSTANCE_IDS: string[] = [];

export function NativePlannerEditor({
  pages,
}: {
  pages: LoadedPage[];
  weekSettings: WeekSettings;
}) {
  // Current grid placement per module instance — seeded from the loaded
  // snapshot, mutated by drag-to-reposition below. Deliberately separate
  // from each instance's static elements/origin (see file-level
  // comment) — this is the *only* thing a reposition changes.
  const [placements, setPlacements] = useState<Record<string, Placement>>(() => {
    const map: Record<string, Placement> = {};
    for (const page of pages) {
      for (const mi of page.moduleInstances) {
        map[mi.id] = {
          columnStart: mi.columnStart,
          rowStart: mi.rowStart,
          columnSpan: mi.columnSpan,
          rowSpan: mi.rowSpan,
        };
      }
    }
    return map;
  });

  // Per-instance info a reposition never touches (which page it's on,
  // whether it's locked) alongside its rendered content (elements,
  // origin) — which a RESIZE does touch: unlike a reposition, a resize
  // changes a module's actual geometry, so its content needs fresh
  // server-rendered elements for the new size (e.g. a checklist's row
  // count, a labeled-box's ruled lines), not just a moved CSS Grid cell.
  // State, not a memo off `pages`, specifically so handleResizeAdjacent
  // below can patch in that fresh content in place — this is the single
  // source NativePage renders elements/origin from, not `page.
  // moduleInstances` directly, so a patch here is what actually reaches
  // the screen.
  const [moduleLookup, setModuleLookup] = useState<Map<string, ModuleInfo>>(() => {
    const map = new Map<string, ModuleInfo>();
    for (const page of pages) {
      for (const mi of page.moduleInstances) {
        const propValues = (mi.propValues as Record<string, unknown>) ?? {};
        map.set(mi.id, {
          pageId: page.pageId,
          locked: mi.locked,
          elements: mi.elements,
          originX: mi.originX,
          originY: mi.originY,
          slug: mi.slug,
          propValues,
        });
      }
    }
    return map;
  });

  const pageGridByPageId = useMemo(() => {
    const map: Record<string, PageGrid> = {};
    for (const page of pages) map[page.pageId] = page.pageGrid;
    return map;
  }, [pages]);

  // Which instance ids belong to each page — derived from moduleLookup,
  // not `page.moduleInstances` directly, specifically so a module added
  // after initial load (see handleAddModule) shows up: moduleLookup is
  // the one this file patches when a new instance is created, the same
  // reason it's already the source NativePage reads elements/origin
  // from rather than `page.moduleInstances` (see that prop's own
  // comment). Every other per-page iteration in this file (resize
  // pairing, stack-bottom detection, the render loop itself) reads this
  // instead of `page.moduleInstances` for the same reason — a newly
  // added module needs to participate in all of those, not just render.
  const instanceIdsByPageId = useMemo(() => {
    const byPage: Record<string, string[]> = {};
    for (const [id, info] of moduleLookup) {
      const arr = byPage[info.pageId] ?? (byPage[info.pageId] = []);
      arr.push(id);
    }
    return byPage;
  }, [moduleLookup]);

  // Live boundary-resize state — set for the duration of a ResizeHandle
  // drag (see handleResizeStart/Move/End below), null the rest of the
  // time. deltaRows is already clamped and snapped to whole rows by the
  // handle itself (computeClampedDeltaRows) — this is purely "what to
  // display," not raw pointer data.
  const [resizeDrag, setResizeDrag] = useState<{
    pairKey: string;
    pageId: string;
    topId: string;
    bottomId: string;
    deltaRows: number;
  } | null>(null);

  // Same shape of state as resizeDrag above, for a StackResizeHandle drag
  // instead of a ResizePair one — kept separate rather than unified into
  // one type, since the two are genuinely different operations (a pair
  // resize is zero-sum, always preserving the pair's combined height; a
  // stack resize actually changes the stack's total footprint) that only
  // happen to share some plumbing (grid math, minimum clamps). Mutually
  // exclusive in practice — starting either kind of drag clears the
  // other, same as module-reposition already clears settling.
  const [stackResizeDrag, setStackResizeDrag] = useState<{
    stackKey: string;
    pageId: string;
    memberIds: string[]; // top to bottom
    // Parallel to memberIds — each member's own minimum (see
    // getMinRowSpanForSlug's own comment), frozen at drag-start same as
    // StackResizeHandle's own dragRef, so the cascade math below stays
    // anchored to what it was when the drag began.
    memberMinSpans: number[];
    deltaRows: number;
  } | null>(null);

  // What to actually render placements as — the live resize preview(s)
  // layered on top of the last-committed `placements`, not a second copy
  // of state. `placements` itself only changes once a resize's server
  // call actually resolves (see handleResizeEnd/handleStackResizeEnd
  // below); everything in between is this derived view, the same "commit
  // stays real, rendering gets a derived overlay" split drag-to-
  // reposition's own visualOffsets/settling already use, just applied to
  // span/rowStart instead of a translate offset.
  const displayPlacements = useMemo(() => {
    let next = placements;
    if (resizeDrag && resizeDrag.deltaRows !== 0) {
      const top = next[resizeDrag.topId];
      const bottom = next[resizeDrag.bottomId];
      if (top && bottom) {
        next = {
          ...next,
          [resizeDrag.topId]: { ...top, rowSpan: top.rowSpan + resizeDrag.deltaRows },
          [resizeDrag.bottomId]: { ...bottom, rowStart: bottom.rowStart + resizeDrag.deltaRows, rowSpan: bottom.rowSpan - resizeDrag.deltaRows },
        };
      }
    }
    if (stackResizeDrag && stackResizeDrag.deltaRows !== 0) {
      const members = stackResizeDrag.memberIds.map((id) => next[id]);
      if (members.every((m): m is Placement => !!m)) {
        const newSpans = cascadeStackSpans(
          members.map((m) => m.rowSpan),
          stackResizeDrag.memberMinSpans,
          stackResizeDrag.deltaRows
        );
        const patched = { ...next };
        let cursor = members[0].rowStart;
        stackResizeDrag.memberIds.forEach((id, i) => {
          patched[id] = { ...members[i], rowStart: cursor, rowSpan: newSpans[i] };
          cursor += newSpans[i];
        });
        next = patched;
      }
    }
    return next;
  }, [placements, resizeDrag, stackResizeDrag]);

  const resizingIds = useMemo(() => {
    if (!resizeDrag && !stackResizeDrag) return null;
    return new Set([
      ...(resizeDrag ? [resizeDrag.topId, resizeDrag.bottomId] : []),
      ...(stackResizeDrag ? stackResizeDrag.memberIds : []),
    ]);
  }, [resizeDrag, stackResizeDrag]);

  // Frozen (last-committed, pre-drag) pixel size for whichever pair is
  // currently resizing — lets PolotnoJsonRenderer recognize and hide one
  // specific stale element: a module's own outer-border rect (e.g.
  // labeledBox.ts's first element, sized to the module's *entire*
  // geometry). That element can't be made to look right during a live
  // resize by repositioning it — its own recorded width/height are
  // whatever they were at last commit, not the live size — and reported
  // live, twice, in both directions: whichever member of the pair is
  // currently *growing* shows that stale border sitting adrift wherever
  // "old size, measured from wherever the box's content happens to be
  // anchored" lands, not at the box's real new edge — a second border
  // alongside the correct one. (The shrinking member doesn't show this:
  // NativeModule's own isResizing already clips it via overflow:hidden.)
  //
  // A first pass at this fix instead tried compensating the bottom
  // module's *origin* to keep its whole content block anchored to its
  // stable far edge — that did stop the double border, but broke
  // something else in the process: it also dragged the module's heading
  // along with that same rigid compensation, freezing it in place
  // instead of letting it track the box's own live top the way a heading
  // naturally should (and the way it already did, correctly, before that
  // compensation existed) — reported live as "the title banner doesn't
  // update." Repositioning frozen content as one rigid block can only
  // ever get *one* edge right, never both, because the content's own
  // *size* is what's actually stale, not just its position — no amount
  // of shifting fixes that. This replaces that whole approach: leave
  // every element's position exactly as rendered (so a heading keeps
  // tracking the box's live top-left the way it always correctly did),
  // and instead hide the one element that's unfixably wrong-sized.
  // NativeModule's own CSS outline (always computed from the live
  // `placement`, never stale) is a live-accurate stand-in for it.
  const resizeFrozenSize = useMemo(() => {
    if (!resizeDrag && !stackResizeDrag) return null;
    const result: Record<string, { width: number; height: number }> = {};
    if (resizeDrag) {
      const pageGrid = pageGridByPageId[resizeDrag.pageId];
      const top = placements[resizeDrag.topId];
      const bottom = placements[resizeDrag.bottomId];
      if (pageGrid && top && bottom) {
        result[resizeDrag.topId] = gridCellToPixels(pageGrid, top);
        result[resizeDrag.bottomId] = gridCellToPixels(pageGrid, bottom);
      }
    }
    if (stackResizeDrag) {
      const pageGrid = pageGridByPageId[stackResizeDrag.pageId];
      if (pageGrid) {
        for (const id of stackResizeDrag.memberIds) {
          const placement = placements[id];
          if (placement) result[id] = gridCellToPixels(pageGrid, placement);
        }
      }
    }
    return result;
  }, [resizeDrag, stackResizeDrag, placements, pageGridByPageId]);

  // Recomputed from the LIVE displayPlacements (not the static `pages`
  // prop, and not the last-committed `placements` either) on every
  // render — a reposition drag can change which modules are adjacent, and
  // an in-progress resize needs this pair's own boundaryRow (and so this
  // handle's own on-screen position) to track the live snapped preview,
  // not just jump once the drag actually commits. Grouped by same
  // columnStart+columnSpan (matching resolveModulePlacement's own
  // stackSiblings notion of a "column stack" in grid.ts) and paired up
  // only where one's bottom edge sits exactly on the next one's top edge
  // — the reorder/gravity-pack logic elsewhere in this file already
  // guarantees stack members never have a gap between them, so "adjacent"
  // here just means "next to each other in sort order," not a proximity
  // threshold.
  const resizePairsByPageId = useMemo(() => {
    const byPage: Record<string, ResizePair[]> = {};
    for (const page of pages) {
      const byColumn = new Map<string, Array<{ id: string; rowStart: number; rowSpan: number; slug: string }>>();
      for (const id of instanceIdsByPageId[page.pageId] ?? []) {
        const info = moduleLookup.get(id);
        const placement = displayPlacements[id];
        if (!info || info.locked || !placement) continue;
        const columnKey = `${placement.columnStart}:${placement.columnSpan}`;
        const group = byColumn.get(columnKey) ?? [];
        group.push({ id, rowStart: placement.rowStart, rowSpan: placement.rowSpan, slug: info.slug });
        byColumn.set(columnKey, group);
      }
      const pairs: ResizePair[] = [];
      for (const [columnKey, group] of byColumn) {
        const [columnStart, columnSpan] = columnKey.split(":").map(Number);
        const sorted = [...group].sort((a, b) => a.rowStart - b.rowStart);
        for (let i = 0; i < sorted.length - 1; i++) {
          const top = sorted[i];
          const bottom = sorted[i + 1];
          if (top.rowStart + top.rowSpan !== bottom.rowStart) continue;
          pairs.push({
            key: `${top.id}:${bottom.id}`,
            pageId: page.pageId,
            topId: top.id,
            bottomId: bottom.id,
            columnStart,
            columnSpan,
            topRowStart: top.rowStart,
            topRowSpan: top.rowSpan,
            bottomRowSpan: bottom.rowSpan,
            topMinRowSpan: getMinRowSpanForSlug(top.slug, page.pageGrid),
            bottomMinRowSpan: getMinRowSpanForSlug(bottom.slug, page.pageGrid),
          });
        }
      }
      byPage[page.pageId] = pairs;
    }
    return byPage;
  }, [pages, displayPlacements, moduleLookup, instanceIdsByPageId]);

  // One StackBottom per unlocked same-column group (whichever member
  // sorts last) — see that type's own comment. Same recompute-from-live-
  // displayPlacements reasoning as resizePairsByPageId above.
  const stackBottomsByPageId = useMemo(() => {
    const byPage: Record<string, StackBottom[]> = {};
    for (const page of pages) {
      const pageIds = instanceIdsByPageId[page.pageId] ?? [];
      const byColumn = new Map<string, Array<{ id: string; rowStart: number; rowSpan: number; slug: string }>>();
      for (const id of pageIds) {
        const info = moduleLookup.get(id);
        const placement = displayPlacements[id];
        if (!info || info.locked || !placement) continue;
        const columnKey = `${placement.columnStart}:${placement.columnSpan}`;
        const group = byColumn.get(columnKey) ?? [];
        group.push({ id, rowStart: placement.rowStart, rowSpan: placement.rowSpan, slug: info.slug });
        byColumn.set(columnKey, group);
      }
      const stackBottoms: StackBottom[] = [];
      for (const [columnKey, group] of byColumn) {
        const [columnStart, columnSpan] = columnKey.split(":").map(Number);
        const sorted = [...group].sort((a, b) => a.rowStart - b.rowStart);
        const bottomMember = sorted[sorted.length - 1];
        const stackBottomRowEnd = bottomMember.rowStart + bottomMember.rowSpan;
        // How far the stack may grow — mirrors resizeStackFromBottom's own
        // server-side bound (actions.ts): whatever locked block shares
        // this column range and sits at or below the stack's own current
        // bottom, or the page's own gridRows if nothing does.
        const columnsOverlap = (o: { columnStart: number; columnSpan: number }) =>
          o.columnStart < columnStart + columnSpan && o.columnStart + o.columnSpan > columnStart;
        let maxBottomBound = page.pageGrid.gridRows;
        for (const otherId of pageIds) {
          const otherInfo = moduleLookup.get(otherId);
          const otherPlacement = displayPlacements[otherId];
          if (!otherInfo?.locked || !otherPlacement) continue;
          if (otherPlacement.rowStart < stackBottomRowEnd || !columnsOverlap(otherPlacement)) continue;
          maxBottomBound = Math.min(maxBottomBound, otherPlacement.rowStart);
        }
        stackBottoms.push({
          key: `stack:${bottomMember.id}`,
          pageId: page.pageId,
          bottomId: bottomMember.id,
          columnStart,
          columnSpan,
          members: sorted.map((m) => ({ id: m.id, rowSpan: m.rowSpan, minRowSpan: getMinRowSpanForSlug(m.slug, page.pageGrid) })),
          stackTopRowStart: sorted[0].rowStart,
          stackBottomRowEnd,
          maxBottomBound,
        });
      }
      byPage[page.pageId] = stackBottoms;
    }
    return byPage;
  }, [pages, displayPlacements, moduleLookup, instanceIdsByPageId]);

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });
  useEffect(() => {
    const update = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const spreadWidthPx = pages.length * PRINT_WIDTH_PX + Math.max(0, pages.length - 1) * PAGE_GAP_PX;

  // "fit-width"/"fit-page" are pure functions of the viewport size,
  // recomputed on every render — no effect needed to "sync" scale to
  // them, since they're not independent state, they're derived from
  // viewportSize + zoomMode directly (an effect that turns around and
  // calls setState from what it read off other state is the exact
  // pattern React's docs recommend deriving during render instead of).
  // "manual" (the zoom buttons, or ctrl/pinch-scroll) is the one case
  // that's genuinely stateful — an incremental step from wherever it was
  // last, not a function of anything else — so that's the only piece
  // that actually lives in useState.
  const [zoomMode, setZoomMode] = useState<"fit-width" | "fit-page" | "manual">("fit-width");
  const [manualScale, setManualScale] = useState(1);

  // Declared here (ahead of ModulePalette's own state block further
  // down, which still owns setting it) specifically because
  // fitWidthScale/fitPageScale/centeringOffsetX below all need its
  // *value* already — plain useState calls are safe to reorder among
  // themselves as long as each stays unconditional and in the same
  // position every render, so relocating just the declaration (not the
  // logic that sets it) is enough. See paletteReservedWidth's own
  // comment for what this drives.
  const [paletteOpen, setPaletteOpen] = useState(false);
  // How much of the viewport's left edge ModulePalette's own sliding
  // panel currently occupies — requested directly: "when you expand
  // side bar it zooms out a little and scrolls so the canvas is still
  // in frame... looks like the side bar pushes the canvas over and
  // doesn't just cover it." Feeds into two places: fitWidthScale/
  // fitPageScale below (subtracted from the available width, so the
  // two auto zoom modes shrink to keep the *whole* spread fitting in
  // whatever room the sidebar leaves — the "zooms out a little" half)
  // and centeringOffsetX further down (added as a base left margin,
  // the same way VIEWPORT_PADDING_PX already is — the "pushes the
  // canvas over" half, so content starts to the *right* of the open
  // panel instead of just being centered within the full viewport
  // width and ending up partly behind it). Deliberately NOT subtracted
  // from manualScale — a user who's explicitly picked a zoom level via
  // the +/- buttons or wheel-zoom shouldn't have it silently shrunk
  // just because the palette opened; centeringOffsetX's own push still
  // applies in manual mode too (that half is about positioning, not
  // scale, and matters regardless of zoom mode).
  const paletteReservedWidth = paletteOpen ? PALETTE_SIDEBAR_WIDTH_PX : 0;

  const fitWidthScale = clampScale((viewportSize.width - VIEWPORT_PADDING_PX * 2 - paletteReservedWidth) / spreadWidthPx);
  const fitPageScale = clampScale(
    Math.min(
      (viewportSize.width - VIEWPORT_PADDING_PX * 2 - paletteReservedWidth) / spreadWidthPx,
      (viewportSize.height - HEADER_HEIGHT_PX - VIEWPORT_PADDING_PX * 2) / PRINT_HEIGHT_PX
    )
  );
  const scale = zoomMode === "fit-width" ? fitWidthScale : zoomMode === "fit-page" ? fitPageScale : manualScale;

  // Threaded down to PolotnoJsonRenderer (see its own isFirefox comment)
  // for the Firefox-only hairline/border floor. useSyncExternalStore, not
  // a plain useState+useEffect — this is exactly the case it exists for
  // (React's own docs use `window`-derived values as the example): a
  // value that depends on a browser API unavailable during SSR needs a
  // getServerSnapshot to render *something* consistent server-side, and
  // this component's first render does run server-side, where `navigator`
  // doesn't exist at all. Rendering `false` server- and client-side on
  // the first pass, then re-checking after mount, is what keeps that
  // first client render's output identical to what the server already
  // sent — a real hydration mismatch from skipping this shipped and was
  // caught live in the dev log: server always rendered the unadjusted
  // width, Firefox's client render wanted the floored one, on every
  // single page load. No real subscription exists (the answer can't
  // change after mount), so `subscribe` is a no-op.
  const isFirefox = useSyncExternalStore(
    () => () => {},
    () => /firefox/i.test(navigator.userAgent),
    () => false
  );

  // The scaled content's actual marginLeft/marginTop at a given scale —
  // VIEWPORT_PADDING_PX's own minimum gutter on that side, plus half of
  // whatever room is left beyond it once the content's own scaled size
  // is subtracted (never negative — the same "degrades to 0 once it
  // genuinely overflows" fix as the flex-centering bug mentioned below,
  // just computed explicitly here instead of left to a CSS property,
  // because the zoom-anchoring math right below needs to know this
  // value precisely, not just rely on it looking right on screen).
  //
  // Reported directly: at fit-width, this leftover-beyond-padding term
  // is ~0 by construction (fitWidthScale itself is chosen so the scaled
  // content exactly fills viewportWidth - PADDING*2) — a version of
  // this that returned *only* that leftover term (as it used to) would
  // therefore return ~0 too, leaving the content flush against the
  // container's actual left/top edge with zero gutter on that side and
  // the entire reserved PADDING*2 budget stranded on the other
  // side/bottom instead of split evenly — exactly the "hugs the top
  // left instead of sitting centered" bug that was reported. Adding the
  // baseline back in is what makes the reserved padding symmetric
  // again, matching what VIEWPORT_PADDING_PX's own comment ("each
  // side") already promised.
  //
  // centeringOffsetY mirrors this on the vertical axis using
  // HEADER_HEIGHT_PX and PRINT_HEIGHT_PX (pages sit in a single row —
  // see the pages.map wrapper below — so content height at a given
  // scale is always exactly PRINT_HEIGHT_PX * scale, never a function
  // of page count the way spreadWidthPx is). Previously there was no
  // vertical centering at all — CONTENT_TOP_OFFSET_PX was used as a
  // bare constant marginTop, always pinning content to the top once it
  // no longer needed all the viewport's height. Both functions return
  // the *actual* margin value (not just the extra-centering term) so
  // every call site — the JSX margin below and both places in
  // zoomAnchored's focal-point math — can use the result directly.
  // centeringOffsetX carries one further baseline term beyond
  // VIEWPORT_PADDING_PX, same structure/reasoning as this one — see
  // paletteReservedWidth's own comment above.
  const centeringOffsetX = useCallback(
    (atScale: number) =>
      VIEWPORT_PADDING_PX +
      paletteReservedWidth +
      Math.max(0, (viewportSize.width - VIEWPORT_PADDING_PX * 2 - paletteReservedWidth - spreadWidthPx * atScale) / 2),
    [viewportSize.width, spreadWidthPx, paletteReservedWidth]
  );
  const centeringOffsetY = useCallback(
    (atScale: number) =>
      CONTENT_TOP_OFFSET_PX +
      Math.max(0, (viewportSize.height - HEADER_HEIGHT_PX - VIEWPORT_PADDING_PX * 2 - PRINT_HEIGHT_PX * atScale) / 2),
    [viewportSize.height]
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Always the currently-committed scale, readable synchronously from
  // inside zoomAnchored below without making that function depend on
  // `scale` as a React value — see that function's own comment on why
  // the distinction matters. Deliberately useLayoutEffect, not useEffect:
  // a passive effect is only scheduled to run "soon," not necessarily
  // before the next requestAnimationFrame callback, and flushWheelZoom
  // below is exactly that — an rAF callback that can fire again before a
  // passive effect from the previous one has actually run. That's a
  // smaller-scale repeat of the same staleness class the zoomAnchored
  // comment below documents (reported after that fix as lingering jitter,
  // worse zooming in than out — zooming in needs a bigger compensating
  // scroll write per frame, so a given staleness window produces a
  // proportionally bigger visible error). useLayoutEffect runs
  // synchronously right after the DOM commit, before the browser paints
  // and before any later rAF can fire, closing the gap instead of just
  // shrinking it.
  const scaleRef = useRef(scale);
  useLayoutEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Set right before a zoom change takes effect, consumed by the
  // layout effect below once React has re-rendered at the new scale —
  // can't set scrollLeft/scrollTop synchronously in the same event
  // handler that changes scale, the DOM hasn't reflowed to the new
  // content size yet at that point.
  const pendingZoomAnchorRef = useRef<{
    contentX: number;
    contentY: number;
    anchorScreenX: number;
    anchorScreenY: number;
    atScale: number;
  } | null>(null);

  // Keeps whatever page-space point was under the anchor (the cursor,
  // for wheel-zoom; the viewport's own center, for the +/- buttons)
  // visually stationary through a scale change — without this, zooming
  // "grows" from the content's top-left corner, and the thing you were
  // actually looking at ends up who-knows-where, needing the scrollbar
  // to go hunt for it. clientX/clientY are real screen coordinates
  // (e.g. straight from a mouse/wheel event); omit them for the
  // viewport-center default a button click uses, since a button press
  // has no cursor position on the canvas to anchor to.
  //
  // Reads the *current* scale via scaleRef.current, not a closed-over
  // `scale` value — this isn't just style. The wheel path below can call
  // this multiple times across consecutive animation frames before
  // React has fully committed and run effects for the frame in between,
  // and a version of this function that closed over `scale` directly
  // would, when called through a ref (needed to keep the wheel listener
  // itself from being torn down and reattached every tick — see that
  // listener's own comment), sometimes still be the version from a
  // render or two ago. That means computing "what page-space point is
  // under the cursor right now" from a *stale* scale while scrollLeft
  // has already moved on to reflect the newer one — the two go out of
  // sync, producing a wrong jump that then "corrects" once the ref
  // catches up, repeating every frame or two as a visible back-and-forth
  // hop. Reading scaleRef.current directly here removes the staleness
  // window entirely rather than shrinking it — this function no longer
  // depends on `scale` as a value at all, so there's no stale-closure
  // version of it to accidentally call in the first place.
  const zoomAnchored = useCallback(
    (newScale: number, clientX?: number, clientY?: number) => {
      const oldScale = scaleRef.current;
      const clamped = clampScale(newScale);
      const container = scrollContainerRef.current;
      if (!container) {
        setZoomMode("manual");
        setManualScale(clamped);
        return;
      }
      const rect = container.getBoundingClientRect();
      const anchorScreenX = clientX !== undefined ? clientX - rect.left : container.clientWidth / 2;
      const anchorScreenY = clientY !== undefined ? clientY - rect.top : container.clientHeight / 2;

      const oldOffsetX = centeringOffsetX(oldScale);
      const contentX = (container.scrollLeft + anchorScreenX - oldOffsetX) / oldScale;
      // scrollTop/anchorScreenY are measured from the *container's* top
      // edge, not from where page-space y=0 actually renders once
      // centeringOffsetY's margin pushes it down — same reasoning as
      // oldOffsetX above, now that centeringOffsetY is scale-dependent
      // too (see its own comment on why it no longer can be a bare
      // constant now that it centers, not just pads).
      const oldOffsetY = centeringOffsetY(oldScale);
      const contentY = (container.scrollTop + anchorScreenY - oldOffsetY) / oldScale;

      setZoomMode("manual");
      setManualScale(clamped);
      pendingZoomAnchorRef.current = { contentX, contentY, anchorScreenX, anchorScreenY, atScale: clamped };
    },
    [centeringOffsetX, centeringOffsetY]
  );

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    const pending = pendingZoomAnchorRef.current;
    if (!container || !pending) return;
    pendingZoomAnchorRef.current = null;
    const newOffsetX = centeringOffsetX(pending.atScale);
    const newOffsetY = centeringOffsetY(pending.atScale);
    container.scrollLeft = pending.contentX * pending.atScale + newOffsetX - pending.anchorScreenX;
    container.scrollTop = pending.contentY * pending.atScale + newOffsetY - pending.anchorScreenY;
  }, [scale, centeringOffsetX, centeringOffsetY]);

  // Fit-width/Fit-page reset the view from scratch (matching Polotno's
  // own "reset to scale-to-fit" behavior — it shows the page from the
  // top, not wherever you happened to be looking before) rather than
  // trying to anchor a prior focal point through the mode switch. Only
  // fires on an actual mode *change* (tracked via the ref), not on every
  // resize-triggered rescale within an already-active fit mode — a
  // window resize while already fit-to-width shouldn't yank the
  // scroll position back to the top.
  const prevZoomModeRef = useRef(zoomMode);
  useLayoutEffect(() => {
    if (prevZoomModeRef.current === zoomMode) return;
    prevZoomModeRef.current = zoomMode;
    if (zoomMode === "manual") return;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollLeft = 0;
      container.scrollTop = 0;
    }
  }, [zoomMode]);

  // Both step from the currently-committed scale (scaleRef.current), not
  // from whatever manualScale happens to hold, and not from a closed-
  // over `scale` value either — same reasoning as zoomAnchored reading
  // scaleRef.current internally rather than taking scale as a
  // dependency, just applied here too for consistency (a real staleness
  // window needs several rapid calls in a row to actually bite, which a
  // single button click won't hit, but there's no reason to leave a
  // smaller version of the same risk in place now that the pattern for
  // avoiding it exists).
  const zoomIn = useCallback(() => zoomAnchored(scaleRef.current * ZOOM_STEP), [zoomAnchored]);
  const zoomOut = useCallback(() => zoomAnchored(scaleRef.current / ZOOM_STEP), [zoomAnchored]);

  // Ctrl/Cmd+wheel zooms (the standard canvas-tool convention — Figma,
  // Google Maps, Photoshop); plain wheel/trackpad scroll is left
  // untouched so it keeps doing ordinary panning via the container's own
  // native `overflow: auto` scrolling — no custom pan code needed for
  // that half of "zoom and pan", the browser already does it once
  // there's something bigger than the viewport to scroll around in.
  //
  // A *native* listener attached imperatively with { passive: false },
  // not React's onWheel prop — React attaches wheel listeners as
  // passive, which makes preventDefault() below a silent no-op (Chrome
  // logs a warning; nothing else happens). With a passive listener, the
  // browser's own Ctrl/Cmd+scroll page-zoom still fires *in addition to*
  // this handler's own zoom, and since that's a real browser-chrome-level
  // zoom, it's the one you actually see — the in-app zoom happens too,
  // just invisibly, hidden under the browser zooming the whole tab (UI,
  // scrollbars, everything) on top of it. Only a non-passive listener
  // can actually suppress the browser's own handling of the same
  // gesture.
  //
  // Rapid wheel events (a trackpad pinch can fire dozens per second,
  // faster than the display even refreshes) are coalesced into one
  // update per animation frame rather than applied one-for-one — an
  // earlier version ran the full zoomAnchored → setState → layout-effect
  // → scroll-write pipeline on every single raw event, which is real,
  // synchronous work; doing that more often than the screen can actually
  // repaint doesn't make the zoom track any better, it just falls behind
  // and shows as jitter/stutter. Capping it at one flush per frame
  // (rAF) means every update this component does is one the browser can
  // actually show before the next one lands.
  //
  // The listener itself is attached exactly once and never torn down/
  // recreated mid-gesture: flushWheelZoom below only depends on
  // zoomAnchored, which (as of the fix described on that function
  // itself) no longer depends on `scale` — so neither of them, nor this
  // listener, gets recreated on every wheel tick the way an earlier
  // version did (which meant the DOM listener was being detached and
  // reattached on literally every event — avoidable churn that was very
  // likely also contributing to the reported jitter, on top of the
  // once-per-event pipeline cost the coalescing below addresses, and on
  // top of the stale-scale bug described on zoomAnchored that caused the
  // back-and-forth hopping specifically).
  const pendingWheelRef = useRef<{ deltaY: number; clientX: number; clientY: number } | null>(null);
  const wheelRafIdRef = useRef<number | null>(null);

  const flushWheelZoom = useCallback(() => {
    wheelRafIdRef.current = null;
    const pending = pendingWheelRef.current;
    pendingWheelRef.current = null;
    if (!pending) return;
    // Proportional to the actual (accumulated) gesture magnitude, not a
    // fixed step per event the way the +/- buttons use — a fixed
    // multiplicative step compounds explosively fast under a trackpad
    // pinch gesture's many rapid-fire events. Clamping deltaY caps how
    // much even one unusually large accumulated flush can move the
    // scale by. Anchored to the actual cursor position, not the
    // viewport center — this is the one zoom trigger that has a real
    // cursor position to anchor to, matching Figma/Maps/Photoshop's own
    // wheel-zoom feel.
    const clampedDeltaY = Math.max(-WHEEL_DELTA_CLAMP, Math.min(WHEEL_DELTA_CLAMP, pending.deltaY));
    const factor = Math.pow(2, -clampedDeltaY * WHEEL_ZOOM_SENSITIVITY);
    zoomAnchored(scaleRef.current * factor, pending.clientX, pending.clientY);
  }, [zoomAnchored]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const listener = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const prev = pendingWheelRef.current;
      // Sum deltaY across every event since the last flush — several
      // can (and, on a fast pinch, will) arrive before the next frame.
      // clientX/clientY just take the latest; the cursor barely moves
      // within one frame's worth of events.
      pendingWheelRef.current = { deltaY: (prev?.deltaY ?? 0) + e.deltaY, clientX: e.clientX, clientY: e.clientY };
      if (wheelRafIdRef.current === null) {
        wheelRafIdRef.current = requestAnimationFrame(flushWheelZoom);
      }
    };
    container.addEventListener("wheel", listener, { passive: false });
    return () => {
      container.removeEventListener("wheel", listener);
      if (wheelRafIdRef.current !== null) cancelAnimationFrame(wheelRafIdRef.current);
    };
  }, [flushWheelZoom]);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Raw, unscaled screen-pixel delta from @dnd-kit, updated continuously
  // while a drag is in progress — the one thing that genuinely needs
  // dividing by `scale` (see file comment: it's the only value in this
  // component that originates *outside* the scaled coordinate space).
  const [activeDelta, setActiveDelta] = useState<{ x: number; y: number }>(ZERO_OFFSET);
  // Whether ModulePalette's own sliding panel is currently open, and
  // which section (if any) to briefly highlight right now — see that
  // component's own comment. Owned here (not local state inside
  // ModulePalette) specifically so AddModuleButton's own "+" zones can
  // drive them too, opening the panel and pointing at the right
  // section from anywhere on the page, not just the panel's own toggle.
  // paletteOpen itself is declared earlier (see paletteReservedWidth's
  // own comment for why) — this block just continues owning the rest
  // of the palette's state.
  const [paletteHighlightSection, setPaletteHighlightSection] = useState<"side" | "bottom" | null>(null);
  // True for the brief window right after paletteOpen changes —
  // requested directly ("when you expand side bar it zooms out a
  // little and scrolls... looks like the side bar pushes the canvas
  // over"): the canvas's own scale (fitWidthScale/fitPageScale) and
  // left margin (centeringOffsetX) both already account for
  // paletteReservedWidth below, so they change value the instant
  // paletteOpen does — this flag is what makes that change animate
  // (see the margin-div/scale-div's own transition, further down)
  // instead of snapping. Scoped to a brief flag rather than a blanket
  // CSS transition on those same styles, since they're also what
  // wheel-zoom and the manual zoom buttons drive, and both are
  // deliberately instant (see zoomAnchored's own comment on the
  // jitter a delayed/eased scale application caused there before) —
  // this only turns transitions on for a palette-driven change, never
  // those.
  const [paletteZoomTransitioning, setPaletteZoomTransitioning] = useState(false);
  const setPaletteOpenAnimated = useCallback((next: boolean) => {
    setPaletteOpen(next);
    setPaletteZoomTransitioning(true);
    setTimeout(() => setPaletteZoomTransitioning(false), 320);
  }, []);
  // Opens the panel and highlights `section`, then clears the
  // highlight after a couple of animation cycles (the highlight's own
  // background/box-shadow transition above is 0.4s — this leaves it
  // visible for several times that, long enough to actually notice,
  // not just flash) — the same "commit a value, then a later timer
  // reverts the transient part of it" shape justAddedIds' own timeout
  // already uses. Doesn't clear `open`: opening is sticky (stays open
  // until the user closes it themselves), only the highlight is
  // transient.
  const handleOpenPaletteSection = useCallback((section: "side" | "bottom") => {
    setPaletteOpenAnimated(true);
    setPaletteHighlightSection(section);
    setTimeout(() => setPaletteHighlightSection((current) => (current === section ? null : current)), 1400);
  }, [setPaletteOpenAnimated]);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Which module's own delete button is currently shown — lifted up here
  // (not local state inside NativeModule, which is where it lived when
  // this first shipped) specifically so handleDeleteModule below can
  // reassign it manually after a delete. Real mouseenter/mouseleave only
  // fire in response to actual pointer movement; when a delete gravity-
  // shifts a sibling into the screen position the cursor is already
  // sitting at, nothing moved, so no enter event fires there and no
  // leave event fires on the (now-removed) deleted module either — its
  // delete button just stayed showing nowhere, and the module now under
  // the stationary cursor didn't get one until the user actually moved
  // the mouse off and back on. recomputeHoverAfterLayoutChange below is
  // the fix: explicitly re-run the same hit-test the browser would have,
  // using the last real pointer position, once the DOM has actually
  // repainted with the post-delete layout.
  const [hoveredInstanceId, setHoveredInstanceId] = useState<string | null>(null);
  const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
  // Two nested rAFs, not one — a single rAF callback can still fire
  // before the browser has painted the DOM commit that scheduling this
  // was reacting to (rAF runs *before* the next paint, not after it);
  // nesting one more frame reliably lands after that paint has already
  // happened, so elementFromPoint below sees the module's new position,
  // not its pre-delete one.
  const recomputeHoverAfterLayoutChange = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const pos = lastPointerPositionRef.current;
        if (!pos) return;
        const el = document.elementFromPoint(pos.x, pos.y);
        const moduleEl = el?.closest<HTMLElement>("[data-module-instance-id]");
        setHoveredInstanceId(moduleEl?.dataset.moduleInstanceId ?? null);
      });
    });
  }, []);
  const handleHoverStart = useCallback((instanceId: string) => setHoveredInstanceId(instanceId), []);
  const handleHoverEnd = useCallback(
    (instanceId: string) => setHoveredInstanceId((prev) => (prev === instanceId ? null : prev)),
    []
  );

  // FLIP-style settle animation for the instant right after a drop —
  // reported after drag-to-reposition first shipped: "when dropped they
  // jump up and down before settling into place." Root cause: the moment
  // handleDragEnd commits the new grid cell, that's an instant, non-
  // animatable jump (grid-column/grid-row aren't transitionable), but in
  // that exact same render `visualOffsets` also drops back to {0,0} for
  // that instance — and *that* change WAS transitioned (isDragged just
  // went false, turning the transition back on). CSS doesn't know the
  // grid cell jumped; it just eases the transform's own pixel value from
  // wherever it last was down to 0, on top of a box whose base position
  // already jumped by roughly the same distance a frame earlier — the two
  // add up, so the item overshoots past the drop point and eases back,
  // reading as a bounce. Standard fix: a two-phase FLIP. `phase: "start"`
  // renders each just-committed instance at the exact residual offset
  // that keeps its total on-screen position unchanged despite the grid
  // jump (zero net visual movement, no transition — see handleDragEnd),
  // then a rAF later `phase: "settle"` drops that residual to {0,0} *with*
  // the transition back on, so only the genuine last-mile "snap into the
  // grid cell" distance actually animates. For a reflowed sibling that
  // residual is always exactly {0,0} (its live reflow preview already
  // matches its post-commit position pixel-for-pixel — see
  // handleDragEnd's own comment) — it only needs the transition
  // suppressed for the commit frame, nothing to visibly settle.
  const [settling, setSettling] = useState<{
    offsets: Record<string, { x: number; y: number }>;
    phase: "start" | "settle";
  } | null>(null);

  // Live preview state for a palette-item drag (see PaletteDragPreview's
  // own type comment) — null whenever nothing's being dragged from the
  // palette, or the drag isn't currently over any page.
  const [paletteDrag, setPaletteDrag] = useState<PaletteDragPreview | null>(null);
  // Ids of whatever module(s) were created most recently — drives each
  // one's own mount fade-in (see NativeModule's justAdded comment).
  // Cleared a couple of frames after being set; never meant to hold more
  // than what was *just* added.
  const [justAddedIds, setJustAddedIds] = useState<Set<string>>(new Set());

  // A small activation distance, not an instant-trigger sensor — without
  // it, a plain click (no intended drag at all) can register as a
  // zero-distance "drag" and briefly flicker the dragging state.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Converts an absolute screen point (a palette card's own live center,
  // via event.active.rect.current.translated — see handleDragMove below)
  // into "which page, and which of its grid cells" — the same screen-px
  // -> page-space conversion zoomAnchored's own contentX/contentY already
  // does (container.scrollLeft/Top, centeringOffsetX/Y, divide by scale),
  // just reused here for a drag position instead of a wheel-zoom anchor.
  // Pages sit in one horizontal row (see the pages.map wrapper below), so
  // "which page" is just contentX divided into PRINT_WIDTH_PX-wide
  // (plus gap) slots — returns null once that lands outside every page's
  // own bounds (the gap between pages, or off the spread entirely), not
  // just clamped into the nearest one — a palette drag that isn't over
  // any page shouldn't show a preview anywhere.
  const screenPointToPageCell = useCallback(
    (clientX: number, clientY: number): { pageId: string; columnStart: number; rowStart: number } | null => {
      const container = scrollContainerRef.current;
      if (!container) return null;
      const containerRect = container.getBoundingClientRect();
      const contentX = (container.scrollLeft + (clientX - containerRect.left) - centeringOffsetX(scale)) / scale;
      const contentY = (container.scrollTop + (clientY - containerRect.top) - centeringOffsetY(scale)) / scale;
      if (contentX < 0 || contentY < 0 || contentY > PRINT_HEIGHT_PX) return null;
      const spreadUnit = PRINT_WIDTH_PX + PAGE_GAP_PX;
      const pageIndex = Math.floor(contentX / spreadUnit);
      if (pageIndex < 0 || pageIndex >= pages.length) return null;
      const localX = contentX - pageIndex * spreadUnit;
      if (localX > PRINT_WIDTH_PX) return null; // in the gap between pages
      const page = pages[pageIndex];
      const pageGrid = pageGridByPageId[page.pageId];
      if (!pageGrid) return null;
      const cell = pixelsToGridCell(pageGrid, { x: localX, y: contentY });
      return { pageId: page.pageId, columnStart: cell.columnStart, rowStart: cell.rowStart };
    },
    [scale, centeringOffsetX, centeringOffsetY, pages, pageGridByPageId]
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setActiveDelta(ZERO_OFFSET);
    // Unconditional, not just for a palette drag specifically — cheap
    // either way, and keeps this in the same "always reset per-drag
    // state on drag-start" shape as settling right below rather than
    // leaving a stale preview around on the off chance a previous drag
    // ended in some way that skipped clearing it.
    setPaletteDrag(null);
    // Starting a new drag mid-settle (rare — would need to happen within
    // the ~150ms settle window) just cancels the old settle in place
    // rather than trying to run two independently-timed settles at once.
    setSettling(null);
  }, []);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      setActiveDelta({ x: event.delta.x, y: event.delta.y });
      const id = String(event.active.id);
      if (!id.startsWith(PALETTE_ID_PREFIX)) return;
      const slug = id.slice(PALETTE_ID_PREFIX.length);
      const meta = PALETTE_MODULE_TYPES.find((m) => m.slug === slug);
      const rect = event.active.rect.current.translated;
      if (!meta || !rect) {
        setPaletteDrag(null);
        return;
      }
      const target = screenPointToPageCell(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!target) {
        setPaletteDrag(null);
        return;
      }
      const pageGrid = pageGridByPageId[target.pageId];
      if (!pageGrid) return;
      // Mirrors addPaletteModuleAt's own identical lookup (actions.ts)
      // — see that copy's comment for the full reasoning. Kept in sync
      // by hand rather than shared, the same "use server" boundary
      // constraint every other duplicated constant/helper in this file
      // already has to live with.
      const hourlyGridId = (instanceIdsByPageId[target.pageId] ?? []).find(
        (instId) => moduleLookup.get(instId)?.slug === "hourly-grid-core"
      );
      const hourlyGridPlacement = hourlyGridId ? placements[hourlyGridId] : undefined;
      // todo-checklist/habit-tracker size *and position* themselves to
      // match whichever page they're being dragged over — see
      // addPaletteModuleAt's own identical comment for the full
      // reasoning. Without this, the live preview showed a fixed 4-wide
      // box starting at column 0 regardless of which page it was over
      // — reported directly: "habit tracker doesn't work on left side
      // its to big and the highlighted snap box doesn't match the side
      // it (3 wide on left, 4 wide on right)" — 1 column too wide *and*
      // wrongly positioned on the left (3-day) page, where the hourly
      // grid itself starts at column 1, not 0 (column 0 is the
      // sidebar), so it always collided with sidebar content there
      // regardless of where the cursor actually was.
      const isBottomModule = slug === "todo-checklist" || slug === "habit-tracker";
      const effectiveColumnStart =
        isBottomModule && hourlyGridPlacement ? hourlyGridPlacement.columnStart : target.columnStart;
      const effectiveColumnSpan =
        isBottomModule && hourlyGridPlacement ? hourlyGridPlacement.columnSpan : meta.defaultColumnSpan;
      // Mirrors addPaletteModuleAt's own identical shrink-to-fit
      // (actions.ts) — see that copy's comment for the full reasoning.
      // Without this, the live preview kept showing a full-size (and
      // "won't fit here," per the overlapping computation below) box
      // even in a spot the server would actually now accept at a
      // shrunk size, and handleDragEnd refuses to even call the server
      // at all once its own local preview says overlapping — so this
      // isn't just cosmetic, it's what makes the drop reachable in the
      // first place. Reported directly: "i tried to drag to do list
      // below habit tracker and it doesn't fit."
      let effectiveRowSpan = meta.defaultRowSpan;
      let effectiveRowStart = target.rowStart;
      if (isBottomModule && hourlyGridPlacement) {
        const zoneTop = hourlyGridPlacement.rowStart + hourlyGridPlacement.rowSpan + 1;
        const zoneSiblings = (instanceIdsByPageId[target.pageId] ?? [])
          .filter((instId) => moduleLookup.get(instId)?.locked === false)
          .map((instId) => placements[instId])
          .filter(
            (p): p is Placement =>
              !!p && p.columnStart === effectiveColumnStart && p.columnSpan === effectiveColumnSpan && p.rowStart >= zoneTop
          );
        const zoneStart = zoneSiblings.length > 0 ? Math.max(...zoneSiblings.map((p) => p.rowStart + p.rowSpan)) : zoneTop;
        const availableRows = pageGrid.gridRows - zoneStart;
        const minRowSpan = getMinRowSpanForSlug(slug, pageGrid);
        if (availableRows >= minRowSpan) {
          effectiveRowSpan = Math.min(meta.defaultRowSpan, availableRows);
          effectiveRowStart = zoneStart;
        }
      }
      const candidate: GridRect = {
        columnStart: effectiveColumnStart,
        rowStart: effectiveRowStart,
        columnSpan: effectiveColumnSpan,
        rowSpan: effectiveRowSpan,
      };
      const occupied: GridRect[] = (instanceIdsByPageId[target.pageId] ?? [])
        .map((instId) => placements[instId])
        .filter((p): p is Placement => !!p);
      // Reserves the 1-row breathing gap below hourly-grid-core — see
      // addPaletteModuleAt's own identical reservation (actions.ts) for
      // the full reasoning. This is what keeps the live preview from
      // ever showing a spot the server would then relocate away from on
      // drop.
      if (hourlyGridPlacement) {
        occupied.push({
          columnStart: hourlyGridPlacement.columnStart,
          rowStart: hourlyGridPlacement.rowStart + hourlyGridPlacement.rowSpan,
          columnSpan: hourlyGridPlacement.columnSpan,
          rowSpan: 1,
        });
      }
      const resolved = findNearestFreeCell(pageGrid, candidate, occupied);
      const finalRect: GridRect = { ...resolved, columnSpan: effectiveColumnSpan, rowSpan: effectiveRowSpan };
      setPaletteDrag({
        pageId: target.pageId,
        columnStart: resolved.columnStart,
        rowStart: resolved.rowStart,
        columnSpan: effectiveColumnSpan,
        rowSpan: effectiveRowSpan,
        overlapping: occupied.some((o) => rectsOverlap(finalRect, o)),
      });
    },
    [screenPointToPageCell, pageGridByPageId, instanceIdsByPageId, placements, moduleLookup]
  );

  // Shared by the live preview (below, every pointer move) and the real
  // commit (handleDragEnd) — both need to turn "the dragged item moved
  // by this many raw screen pixels" into a resolved grid placement the
  // exact same way, or the preview and the final drop result could
  // disagree.
  const resolveDrag = useCallback(
    (instanceId: string, rawDeltaX: number, rawDeltaY: number) => {
      const info = moduleLookup.get(instanceId);
      const current = placements[instanceId];
      if (!info || !current) return null;
      const pageGrid = pageGridByPageId[info.pageId];
      if (!pageGrid) return null;

      const dxPagePx = rawDeltaX / scale;
      const dyPagePx = rawDeltaY / scale;

      const currentPixel = gridCellToPixels(pageGrid, current);
      const draggedPixel = { x: currentPixel.x + dxPagePx, y: currentPixel.y + dyPagePx };
      const nearestCell = clampGridPlacement(pageGrid, {
        ...pixelsToGridCell(pageGrid, draggedPixel),
        columnSpan: current.columnSpan,
        rowSpan: current.rowSpan,
      });
      const candidate: GridRect = { ...nearestCell, columnSpan: current.columnSpan, rowSpan: current.rowSpan };

      const others: Array<GridRect & { id: string; locked: boolean }> = [];
      let hourlyGridPlacement: Placement | null = null;
      for (const [id, placement] of Object.entries(placements)) {
        if (id === instanceId) continue;
        const otherInfo = moduleLookup.get(id);
        if (!otherInfo || otherInfo.pageId !== info.pageId) continue;
        others.push({ ...placement, id, locked: otherInfo.locked });
        if (otherInfo.slug === "hourly-grid-core") hourlyGridPlacement = placement;
      }
      // Same synthetic 1-row-tall virtual lock addPaletteModuleAt
      // (actions.ts) and handleDragMove's own palette-preview branch
      // already reserve below hourly-grid-core, applied here too —
      // those two only ever covered a *fresh* palette drop; nothing
      // stopped an already-placed todo-checklist/habit-tracker from
      // being dragged flush against the hourly grid with no gap at
      // all, since resolveModulePlacement never knew that specific
      // boundary existed. Reported directly: "you can still drag
      // bottom module to a spot with no gap to the hours above it and
      // it gets stuck there" — once landed there, resolveModulePlacement's
      // own topBound math (grid.ts) had nothing bounding the stack from
      // above at all, so a further drag couldn't reliably discover a
      // valid gapped position either; reserving the row here the same
      // way the "+" zone below is reserved fixes both — the flush
      // position becomes unreachable in the first place, not just
      // patched after landing there.
      if (hourlyGridPlacement) {
        others.push({
          id: "__hourlygridgap__",
          locked: true,
          columnStart: hourlyGridPlacement.columnStart,
          rowStart: hourlyGridPlacement.rowStart + hourlyGridPlacement.rowSpan,
          columnSpan: hourlyGridPlacement.columnSpan,
          rowSpan: 1,
        });
      }
      // Treats each stack's own reserved "+" add-zone (see
      // AddModuleButton) as a virtual locked block for collision/reflow
      // purposes — reuses resolveModulePlacement's own already-tested
      // "bounded by a locked block" logic (grid.ts) instead of writing
      // new ad-hoc clamping: a same-column drag can't cross it, the same
      // way it already can't cross a real locked block like week-title.
      // Reported live: dropping a module into that space left it
      // floating, disconnected from the packed stack above it, with its
      // own stray gap above it — not a bug in resolveModulePlacement,
      // just a boundary it never knew existed.
      for (const stackBottom of stackBottomsByPageId[info.pageId] ?? []) {
        const gapRowSpan = stackBottom.maxBottomBound - stackBottom.stackBottomRowEnd;
        if (gapRowSpan <= 0) continue;
        others.push({
          id: `__addzone__${stackBottom.bottomId}`,
          locked: true,
          columnStart: stackBottom.columnStart,
          rowStart: stackBottom.stackBottomRowEnd,
          columnSpan: stackBottom.columnSpan,
          rowSpan: gapRowSpan,
        });
      }

      const { placement: resolved, reflow } = resolveModulePlacement(pageGrid, candidate, others, current.rowStart);
      return { pageGrid, current, resolved, reflow };
    },
    [placements, moduleLookup, pageGridByPageId, scale, stackBottomsByPageId]
  );

  // Serializes every server call that writes a module's own position/
  // size (reposition, either resize kind, add) against each other —
  // reported live: performing a reposition, then immediately a resize,
  // could leave the resized module in the wrong final spot, overlapping
  // a sibling, even though the resize's own live preview (entirely
  // client-side) had looked correct the whole time. Root cause: these
  // are independently user-triggered async server calls with no
  // ordering guarantee between them — if a resize's own read-and-repack
  // query ran before a moments-earlier reposition's write had actually
  // landed, it computed its result from stale DB rows, and *that*
  // (wrong) result is what overwrote the client's already-correct state
  // once the response came back. `placements` client-side was never
  // wrong; the server's own view of "what's currently there" was
  // momentarily behind. Chaining every commit through this ref means a
  // later one always waits for an earlier one to fully resolve first,
  // closing the race without anything more invasive (a lock, a version
  // counter) — one write genuinely has to be visible to the next read
  // this way, not just eventually.
  const pendingCommitRef = useRef<Promise<unknown>>(Promise.resolve());
  // How many commits are currently in flight — not just for logging, this
  // is what gestureBlockedByPendingCommit below reads to refuse starting a
  // *new* gesture while one's still out. That guard exists because
  // serializing the commits themselves (closing the server-side stale-
  // read race, above) turned out not to be enough on its own: reported
  // again after that fix shipped, still jumping. Traced it further —
  // resize boundary A-B, then *immediately* resize the adjacent boundary
  // B-C (sharing module B) before A-B's commit has landed: B-C's own live
  // preview is computed as its deltaRows applied on top of whatever
  // `placements[B]` currently is, which is still B's *pre-A-B-commit*
  // value the whole time B-C is being dragged — correct in the moment,
  // since that's genuinely what's on screen. But when A-B's commit
  // finally resolves mid-drag, placements[B] jumps to its new value out
  // from under B-C's still-active overlay, which keeps applying its own
  // delta on top of that new value too — B (and C, packed right after it)
  // visibly jumps by the difference, sometimes far enough to overlap.
  // Serializing the commits *causes* this to be reachable in the first
  // place instead of just narrowing it — a queued commit can now sit
  // pending for as long as whatever's ahead of it takes, widening the
  // window a second gesture can start inside. Blocking a new gesture
  // outright while anything is still pending closes it at the source
  // instead of chasing the overlay math through every case that could
  // shift the same module a second way mid-drag.
  const pendingCommitCountRef = useRef(0);
  const serializeCommit = useCallback(<T,>(run: () => Promise<T>): Promise<T> => {
    pendingCommitCountRef.current++;
    const started = pendingCommitRef.current.then(run, run);
    // Swallows a failure for the *chain's* purposes only — a rejected
    // commit still shouldn't block whatever's queued after it. The
    // caller that actually awaited `started` still sees and handles the
    // real error via its own .catch, unaffected by this.
    pendingCommitRef.current = started.then(
      () => undefined,
      () => undefined
    );
    started.finally(() => {
      pendingCommitCountRef.current--;
    });
    return started;
  }, []);

  // See pendingCommitCountRef's own comment. Checked at the start of
  // every gesture that's about to read/derive from `placements` — not
  // mid-gesture, since once a drag has already captured its own frozen
  // baseline (each handle's dragRef), it's the *starting* of a second,
  // overlapping one that creates the hazard, not continuing one already
  // running.
  const gestureBlockedByPendingCommit = useCallback(() => pendingCommitCountRef.current > 0, []);

  // Adds a fresh module of the given type near a specific cell — called
  // by a palette drag-drop (handleDragEnd below, any of
  // PALETTE_MODULE_TYPES) once the user has actually picked and
  // dragged a card. Not called by the "+" button anymore (see
  // AddModuleButton's own comment on why: it opens ModulePalette to
  // the matching section instead of adding a fixed module type
  // directly), but kept as its own function rather than folded into
  // handleDragEnd — still exactly the single-purpose "commit this
  // module type at this requested cell" operation either caller would
  // need. columnStart/rowStart passed
  // in are only ever a *requested* target, not trusted as the final
  // answer — addPaletteModuleAt's own findNearestFreeCell can relocate
  // the candidate (a collision, or the synthetic hourly-grid gap
  // reservation both this file and actions.ts separately compute) to
  // somewhere neither caller explicitly asked for, and this now reads
  // back its response's own columnStart/rowStart (the real, committed
  // position) rather than assuming its request was honored verbatim.
  // Reported directly, after the two gap-reservation copies were added:
  // "the dragged bottom modules don't show up at all" — a module that
  // actually landed somewhere the client didn't expect, rendered (or
  // failed to) against the client's own stale guess instead of what's
  // really in the database, is exactly the same class of bug the
  // resize-after-reposition jump earlier this session turned out to be
  // — trusting a client-side assumption instead of the server's own
  // authoritative result.
  const handleAddModule = useCallback(
    async (pageId: string, moduleTypeSlug: string, columnStart: number, rowStart: number) => {
      // See gestureBlockedByPendingCommit's own comment — the requested
      // target could go stale if a still-pending commit is about to
      // move whatever made this cell look free out from under it.
      if (gestureBlockedByPendingCommit()) return;
      const pageGrid = pageGridByPageId[pageId];
      if (!pageGrid) return;
      try {
        // See serializeCommit's own comment — guards this against the
        // same race too: adding right after a reposition/resize
        // shouldn't read a stale "what's occupied" view server-side
        // either.
        const result = await serializeCommit(() => addPaletteModuleAt(pageId, moduleTypeSlug, columnStart, rowStart));
        if (result.columnStart === null || result.rowStart === null) return; // unreachable — GRID-mode instances always have both
        const finalColumnStart = result.columnStart;
        const finalRowStart = result.rowStart;
        const origin = gridCellToPixels(pageGrid, {
          columnStart: finalColumnStart,
          rowStart: finalRowStart,
          columnSpan: result.columnSpan,
          rowSpan: result.rowSpan,
        });
        setPlacements((prev) => ({
          ...prev,
          [result.instanceId]: {
            columnStart: finalColumnStart,
            rowStart: finalRowStart,
            columnSpan: result.columnSpan,
            rowSpan: result.rowSpan,
          },
        }));
        setModuleLookup((prev) => {
          const next = new Map(prev);
          const propValues = (result.propValues as Record<string, unknown>) ?? {};
          next.set(result.instanceId, {
            pageId,
            locked: false,
            elements: [result.element],
            originX: origin.x,
            originY: origin.y,
            slug: moduleTypeSlug,
            propValues,
          });
          return next;
        });
        // Mount fade-in (see NativeModule's own justAdded comment) —
        // cleared a couple of frames later, the same "needs an actual
        // paint of the *before* state first" reasoning as every other
        // two-phase animation in this file, just via setTimeout instead
        // of the settle-FLIP's own rAF chain since there's no specific
        // frame boundary this one needs to land on, only "soon, but not
        // this exact same tick."
        setJustAddedIds((prev) => new Set(prev).add(result.instanceId));
        setTimeout(() => {
          setJustAddedIds((prev) => {
            if (!prev.has(result.instanceId)) return prev;
            const next = new Set(prev);
            next.delete(result.instanceId);
            return next;
          });
        }, 300);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    },
    [pageGridByPageId, serializeCommit, gestureBlockedByPendingCommit]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const id = String(event.active.id);
      if (id.startsWith(PALETTE_ID_PREFIX)) {
        setActiveId(null);
        setActiveDelta(ZERO_OFFSET);
        const drag = paletteDrag;
        setPaletteDrag(null);
        if (!drag || drag.overlapping) return;
        handleAddModule(drag.pageId, id.slice(PALETTE_ID_PREFIX.length), drag.columnStart, drag.rowStart);
        return;
      }
      setActiveId(null);
      setActiveDelta(ZERO_OFFSET);
      const instanceId = id;
      if (event.delta.x === 0 && event.delta.y === 0) return;

      const result = resolveDrag(instanceId, event.delta.x, event.delta.y);
      if (!result) return;
      const { pageGrid, current, resolved, reflow } = result;

      if (resolved.columnStart === current.columnStart && resolved.rowStart === current.rowStart && reflow.length === 0) {
        return;
      }

      // See `settling` state's own comment above. The dragged item's
      // residual is the gap between where the pointer actually left it
      // (lastOffset, the same raw follow-the-cursor value the live
      // preview used) and where the snapped cell's own native position
      // is — everything else is already accounted for by the grid jump.
      // A reflowed sibling's residual is always exactly {0,0}: its live
      // reflow preview (fromPixel -> toPixel, computed the same way
      // below in visualOffsets) already lands exactly on the pixel
      // position `{...prevPlacement, rowStart: move.rowStart}` commits
      // to, so there's no genuine last-mile left for it to visibly
      // settle — it only needs one transition-free frame.
      const oldPixel = gridCellToPixels(pageGrid, current);
      const newPixel = gridCellToPixels(pageGrid, { ...current, columnStart: resolved.columnStart, rowStart: resolved.rowStart });
      const lastOffset = { x: event.delta.x / scale, y: event.delta.y / scale };
      const settleOffsets: Record<string, { x: number; y: number }> = {
        [instanceId]: { x: lastOffset.x - (newPixel.x - oldPixel.x), y: lastOffset.y - (newPixel.y - oldPixel.y) },
      };
      for (const move of reflow) settleOffsets[move.id] = ZERO_OFFSET;
      setSettling({ offsets: settleOffsets, phase: "start" });

      setPlacements((prev) => {
        const next = { ...prev };
        next[instanceId] = { ...current, columnStart: resolved.columnStart, rowStart: resolved.rowStart };
        for (const move of reflow) {
          const prevPlacement = prev[move.id];
          if (prevPlacement) next[move.id] = { ...prevPlacement, rowStart: move.rowStart };
        }
        return next;
      });

      // See serializeCommit's own comment — the actual updateModulePlacement
      // calls don't fire until this task's turn in the queue, not
      // immediately here, so a resize (or another reposition) started
      // right after this one can't race it server-side.
      serializeCommit(() => {
        const updates = [updateModulePlacement(instanceId, { columnStart: resolved.columnStart, rowStart: resolved.rowStart })];
        for (const move of reflow) {
          const prevPlacement = placements[move.id];
          if (prevPlacement) {
            updates.push(updateModulePlacement(move.id, { columnStart: prevPlacement.columnStart, rowStart: move.rowStart }));
          }
        }
        return Promise.all(updates);
      }).catch((err) => {
        setSaveError(err instanceof Error ? err.message : String(err));
      });
    },
    [placements, resolveDrag, scale, serializeCommit, paletteDrag, handleAddModule]
  );

  // Advances the settle FLIP from "start" (drawn at the residual offset,
  // no transition — see `settling` state's own comment) to "settle" (eased
  // to {0,0}) one animation frame later, so the browser actually paints
  // the transition-free starting frame before the transition-bearing one
  // takes over. Collapsing both into the same render wouldn't give the
  // browser anything to transition *from* — it needs to have already
  // painted the residual-offset, no-transition frame first.
  useEffect(() => {
    if (!settling || settling.phase !== "start") return;
    const raf = requestAnimationFrame(() => {
      setSettling((prev) => (prev && prev.phase === "start" ? { ...prev, phase: "settle" } : prev));
    });
    return () => cancelAnimationFrame(raf);
  }, [settling]);

  // Cleans up once the settle transition (0.15s, matching NativeModule's
  // own transition duration) has actually finished — not load-bearing for
  // correctness (once at {0,0} it's visually identical to no override at
  // all), just avoids leaving a growing, never-cleared map of finished
  // settles sitting in state indefinitely.
  useEffect(() => {
    if (!settling || settling.phase !== "settle") return;
    const timeout = setTimeout(() => {
      setSettling((prev) => (prev && prev.phase === "settle" ? null : prev));
    }, 200);
    return () => clearTimeout(timeout);
  }, [settling]);

  // Slides the shared boundary between two vertically-adjacent, same-
  // column unlocked modules — growing the one above shrinks the one
  // below (or vice versa) by the same amount, so there's never a gap or
  // an overlap, matching the old Polotno-hosted editor's
  // resizeAdjacentModules-backed edge-drag (useEdgeResize.ts). Reuses
  // that exact same server action unchanged — it already re-renders
  // fresh content for both modules' new geometry server-side (a
  // checklist's row count, a labeled-box's ruled lines — content that's
  // recomputed from fixed-pt measurements for a given size, not
  // something CSS can just visually stretch) and clamps so neither
  // module's rowSpan can drop below 1.
  //
  // pageId/columnStart/columnSpan/bottomColumnSpan aren't returned by
  // the server action (they never change in a coupled resize, only
  // rowStart/rowSpan do) — read from the live `placements` closure
  // instead of threading them through the call site, the same pattern
  // resolveDrag/handleDragEnd already use for their own "what's the
  // current state of things" lookups.
  const handleResizeAdjacent = useCallback(
    async (pageId: string, topId: string, bottomId: string, deltaRows: number) => {
      const pageGrid = pageGridByPageId[pageId];
      const topPlacement = placements[topId];
      const bottomPlacement = placements[bottomId];
      if (!pageGrid || !topPlacement || !bottomPlacement) return;
      const pairKey = `${topId}:${bottomId}`;
      try {
        // See serializeCommit's own comment — queued so a resize started
        // right after a reposition (or another resize) can't read the
        // DB before that earlier write has actually landed.
        const result = await serializeCommit(() => resizeAdjacentModules(topId, bottomId, deltaRows));
        if (result.bottom.rowStart === null) return; // unreachable — see resizeAdjacentModules's own comment on why
        const bottomRowStart = result.bottom.rowStart;
        // The top module's own rowStart/columnStart never change *during
        // this resize* (only its rowSpan grows/shrinks) — but that isn't
        // the same as "moduleLookup's existing origin for it is already
        // correct." A reposition earlier could have moved it without
        // ever touching moduleLookup (correctly — see moduleLookup's own
        // comment on why: it's paired with `elements`, which a
        // reposition also leaves untouched, so the two stay internally
        // consistent with each other even though both go stale relative
        // to the module's live CSS grid position). This resize *does*
        // replace `elements` with a fresh server render, generated
        // against the module's current (post-reposition) row/column —
        // pairing that fresh content with a stale, pre-reposition origin
        // silently reintroduces the exact mismatch reposition's own
        // "leave it alone" design was built to avoid. Recomputing here
        // from `topPlacement` (already known correct — same value this
        // function already trusted for other purposes) closes that gap.
        // Confirmed via a full data trace before writing this fix: every
        // value in placements/the server response checked out perfectly
        // at every step for two live-reproduced instances of the bug —
        // the only thing that could still be wrong downstream of
        // provably-correct data was moduleLookup's own content pairing.
        const topOrigin = gridCellToPixels(pageGrid, topPlacement);
        const bottomOrigin = gridCellToPixels(pageGrid, {
          columnStart: bottomPlacement.columnStart,
          rowStart: bottomRowStart,
          columnSpan: bottomPlacement.columnSpan,
          rowSpan: result.bottom.rowSpan,
        });
        setPlacements((prev) => {
          const next = { ...prev };
          const top = prev[topId];
          const bottom = prev[bottomId];
          if (top) next[topId] = { ...top, rowSpan: result.top.rowSpan };
          if (bottom) next[bottomId] = { ...bottom, rowStart: bottomRowStart, rowSpan: result.bottom.rowSpan };
          return next;
        });
        setModuleLookup((prev) => {
          const next = new Map(prev);
          const topInfo = prev.get(topId);
          const bottomInfo = prev.get(bottomId);
          if (topInfo) next.set(topId, { ...topInfo, elements: [result.top.element], originX: topOrigin.x, originY: topOrigin.y });
          if (bottomInfo) {
            next.set(bottomId, { ...bottomInfo, elements: [result.bottom.element], originX: bottomOrigin.x, originY: bottomOrigin.y });
          }
          return next;
        });
        // Clears resizeDrag in the SAME synchronous batch as the two
        // setState calls above (React 18 auto-batches setState calls
        // made back-to-back with no `await` between them), not in a
        // later microtask via a separate .finally() the way this used
        // to. That distinction is exactly what the reported bug traced
        // back to: displayPlacements always applies resizeDrag's own
        // deltaRows on top of whatever `placements` currently holds —
        // correct while `placements` still reflects the pre-drag value,
        // but if `placements` had *already* been updated to the final,
        // server-confirmed value (as it just was, two lines up) and
        // resizeDrag hadn't been cleared *yet* (previously true for one
        // extra render, since the old code cleared it from a separate
        // .finally() callback — a real microtask hop later than the
        // setPlacements call it was chained after), that same delta got
        // applied a second time on top of an already-correct value —
        // visibly jumping the module past where it should land, right at
        // the moment of release, sometimes far enough to overlap a
        // neighbor. Guarded by pairKey so a resolving request from an
        // abandoned drag can't clear a *newer* one's still-in-progress
        // preview (same guard handleResizeEnd's own .finally() used to
        // carry).
        setResizeDrag((prev) => (prev && prev.pairKey === pairKey ? null : prev));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
        setResizeDrag((prev) => (prev && prev.pairKey === pairKey ? null : prev));
      }
    },
    [placements, pageGridByPageId, serializeCommit]
  );

  // Synchronous "what's the currently-live resize" check for
  // handleResizeMove/End below — a ref, not just reading resizeDrag state,
  // for the same reason scaleRef exists elsewhere in this file: a plain
  // closure captured at render time could be one render behind by the
  // time a later pointer event's callback actually runs. Set directly
  // alongside the state updates below rather than through its own syncing
  // effect, since these are the only three places it ever changes and
  // they're already synchronous event handlers, not something arriving
  // faster than an effect could keep up with.
  const activeResizePairKeyRef = useRef<string | null>(null);

  const handleResizeStart = useCallback(
    (pair: ResizePair) => {
      // See gestureBlockedByPendingCommit's own comment — a still-pending
      // commit's eventual result could shift a module this new gesture's
      // own live preview is about to start basing its math on. The handle
      // itself still captures the pointer (harmless — see
      // gestureBlockedByPendingCommit's own comment on why guarding here
      // is enough), it just never becomes the active drag, so
      // handleResizeMove/End's own pairKey checks ignore everything that
      // follows for it.
      if (gestureBlockedByPendingCommit()) return;
      activeResizePairKeyRef.current = pair.key;
      // Mutually exclusive with a stack resize (see stackResizeDrag's own
      // comment) — clears any in-progress one the same way starting a new
      // module drag already clears settling.
      setStackResizeDrag(null);
      setResizeDrag({ pairKey: pair.key, pageId: pair.pageId, topId: pair.topId, bottomId: pair.bottomId, deltaRows: 0 });
    },
    [gestureBlockedByPendingCommit]
  );

  const handleResizeMove = useCallback((pair: ResizePair, deltaRows: number) => {
    // Guards against a second resize drag having started (and overwritten
    // the ref) before this one's own stream of move events has fully
    // stopped — extremely unlikely on a single pointer, but cheap to rule
    // out rather than assume away.
    if (activeResizePairKeyRef.current !== pair.key) return;
    setResizeDrag((prev) => (prev && prev.deltaRows !== deltaRows ? { ...prev, deltaRows } : prev));
  }, []);

  const handleResizeEnd = useCallback(
    (pair: ResizePair, deltaRows: number) => {
      if (activeResizePairKeyRef.current !== pair.key) return;
      activeResizePairKeyRef.current = null;
      if (deltaRows === 0) {
        setResizeDrag(null);
        return;
      }
      // Keeps the live (already-correct-looking, snapped) preview showing
      // for the whole request instead of dropping back to the old
      // pre-drag placements while it's in flight — handleResizeAdjacent
      // itself clears resizeDrag, in the same batch as the placements
      // update that makes it safe to (see its own comment on why that
      // has to be synchronous with the commit, not a later microtask).
      handleResizeAdjacent(pair.pageId, pair.topId, pair.bottomId, deltaRows);
    },
    [handleResizeAdjacent]
  );

  // Cascading resize from a stack's own outer bottom edge — see
  // StackBottom's own type comment and resizeStackFromBottom's own
  // comment (actions.ts) for the full reasoning on why this is a
  // different operation from handleResizeAdjacent above, not a variant
  // of it. Reuses resizeStackFromBottom unchanged; patches every member
  // the server touched (which can be more than two) into both
  // `placements` and `moduleLookup`, recomputing each one's origin fresh
  // — the whole affected range gets repacked server-side, so more than
  // just the immediate pair can have moved.
  const handleStackResizeAdjacent = useCallback(
    async (pageId: string, bottomInstanceId: string, deltaRows: number) => {
      const pageGrid = pageGridByPageId[pageId];
      const bottomPlacement = placements[bottomInstanceId];
      if (!pageGrid || !bottomPlacement) return;
      const stackKey = `stack:${bottomInstanceId}`;
      try {
        // See serializeCommit's own comment.
        const results = await serializeCommit(() => resizeStackFromBottom(bottomInstanceId, deltaRows));
        setPlacements((prev) => {
          const next = { ...prev };
          for (const r of results) {
            const current = prev[r.id];
            if (current) next[r.id] = { ...current, rowStart: r.rowStart, rowSpan: r.rowSpan };
          }
          return next;
        });
        setModuleLookup((prev) => {
          const next = new Map(prev);
          for (const r of results) {
            const info = prev.get(r.id);
            if (!info) continue;
            const origin = gridCellToPixels(pageGrid, {
              columnStart: bottomPlacement.columnStart,
              rowStart: r.rowStart,
              columnSpan: bottomPlacement.columnSpan,
              rowSpan: r.rowSpan,
            });
            next.set(r.id, { ...info, elements: [r.element], originX: origin.x, originY: origin.y });
          }
          return next;
        });
        // See handleResizeAdjacent's own comment on why this has to be
        // synchronous with the placements/moduleLookup updates above, not
        // a later microtask via a separate .finally() — same double-
        // applied-delta bug, same fix, for the stack-cascade case.
        setStackResizeDrag((prev) => (prev && prev.stackKey === stackKey ? null : prev));
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
        setStackResizeDrag((prev) => (prev && prev.stackKey === stackKey ? null : prev));
      }
    },
    [placements, pageGridByPageId, serializeCommit]
  );

  // Same synchronous-ref pattern as activeResizePairKeyRef above.
  const activeStackResizeKeyRef = useRef<string | null>(null);

  const handleStackResizeStart = useCallback(
    (stackBottom: StackBottom) => {
      // See gestureBlockedByPendingCommit's own comment (and
      // handleResizeStart's identical guard).
      if (gestureBlockedByPendingCommit()) return;
      activeStackResizeKeyRef.current = stackBottom.key;
      // Mutually exclusive with a pair resize — see handleResizeStart's own
      // comment.
      setResizeDrag(null);
      setStackResizeDrag({
        stackKey: stackBottom.key,
        pageId: stackBottom.pageId,
        memberIds: stackBottom.members.map((m) => m.id),
        memberMinSpans: stackBottom.members.map((m) => m.minRowSpan),
        deltaRows: 0,
      });
    },
    [gestureBlockedByPendingCommit]
  );

  const handleStackResizeMove = useCallback((stackBottom: StackBottom, deltaRows: number) => {
    if (activeStackResizeKeyRef.current !== stackBottom.key) return;
    setStackResizeDrag((prev) => (prev && prev.deltaRows !== deltaRows ? { ...prev, deltaRows } : prev));
  }, []);

  const handleStackResizeEnd = useCallback(
    (stackBottom: StackBottom, deltaRows: number) => {
      if (activeStackResizeKeyRef.current !== stackBottom.key) return;
      activeStackResizeKeyRef.current = null;
      if (deltaRows === 0) {
        setStackResizeDrag(null);
        return;
      }
      // handleStackResizeAdjacent itself clears stackResizeDrag now — see
      // its own comment.
      handleStackResizeAdjacent(stackBottom.pageId, stackBottom.bottomId, deltaRows);
    },
    [handleStackResizeAdjacent]
  );

  // Hover-delete (NativeModule's own × button). Removes the module and
  // "gravitates" the rest of its same-column stack up to close the gap —
  // see deleteModuleWithGravity's own comment (actions.ts) for the full
  // repack reasoning. Only rowStart changes for whatever shifts, never
  // rowSpan/elements/origin, so — unlike handleResizeAdjacent — there's no
  // moduleLookup update to make here at all for the shifted siblings, only
  // for placements; moduleLookup pairs elements with the origin they were
  // rendered against, and neither one changes for a pure reposition (see
  // moduleLookup's own comment on why leaving it alone is what's
  // correct). The freed rows become one contiguous gap at the stack's new
  // bottom, which stackBottomsByPageId/AddModuleButton already turn back
  // into a "+" zone the next render, sized to exactly what was freed — no
  // separate handling needed here for "deleted the bottom module" (the
  // gap simply starts right where that module already was) vs "deleted
  // one further up" (siblings below it shift into the gap first).
  const handleDeleteModule = useCallback(
    async (instanceId: string) => {
      // See gestureBlockedByPendingCommit's own comment — a still-pending
      // commit could still be mid-flight against this exact module (e.g.
      // a resize that hasn't landed yet), which this delete would then be
      // racing.
      if (gestureBlockedByPendingCommit()) return;
      try {
        const result = await serializeCommit(() => deleteModuleWithGravity(instanceId));
        // FLIP settle for the gravity-shifted siblings — reuses the exact
        // same two-phase `settling` mechanism handleDragEnd's own reflow
        // already relies on (see that state's own comment for the full
        // start/settle mechanics). Requested directly: "when i delete a
        // module, can you make the other animate as they gravity upward
        // to fill the space." Genuinely different from the drag case
        // though, not just a copy-paste of it: a drag's reflowed sibling
        // arrives at the settle already having been *continuously*
        // animated into place by the live preview while the pointer was
        // still moving, so its own settle offset is always {0,0} — one
        // transition-free frame is all it needs. A delete has no such
        // preceding live phase; the whole visual slide from old row to
        // new row has to happen inside this one settle animation, so the
        // residual here is the *entire* pixel distance moved, not a
        // last-mile correction.
        const deletedInfo = moduleLookup.get(instanceId);
        const pageGrid = deletedInfo ? pageGridByPageId[deletedInfo.pageId] : undefined;
        if (pageGrid && result.shifted.length > 0) {
          const settleOffsets: Record<string, { x: number; y: number }> = {};
          for (const s of result.shifted) {
            const oldPlacement = placements[s.id];
            if (!oldPlacement) continue;
            const oldPixel = gridCellToPixels(pageGrid, oldPlacement);
            const newPixel = gridCellToPixels(pageGrid, { ...oldPlacement, rowStart: s.rowStart });
            settleOffsets[s.id] = { x: oldPixel.x - newPixel.x, y: oldPixel.y - newPixel.y };
          }
          if (Object.keys(settleOffsets).length > 0) {
            setSettling({ offsets: settleOffsets, phase: "start" });
          }
        }
        setPlacements((prev) => {
          const next = { ...prev };
          delete next[result.deletedId];
          for (const s of result.shifted) {
            const existing = next[s.id];
            if (existing) next[s.id] = { ...existing, rowStart: s.rowStart };
          }
          return next;
        });
        setModuleLookup((prev) => {
          const next = new Map(prev);
          next.delete(result.deletedId);
          return next;
        });
        // The deleted module's own DOM node is gone, so it'll never fire
        // its own mouseleave — clear it here so hoveredInstanceId can't
        // keep pointing at an id that no longer exists. See
        // recomputeHoverAfterLayoutChange's own comment for the rest:
        // whatever gravitated into the cursor's current screen position
        // needs its hover state set explicitly too, since nothing moved
        // to trigger that the normal way.
        setHoveredInstanceId((prev) => (prev === result.deletedId ? null : prev));
        recomputeHoverAfterLayoutChange();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    },
    [
      serializeCommit,
      gestureBlockedByPendingCommit,
      recomputeHoverAfterLayoutChange,
      moduleLookup,
      placements,
      pageGridByPageId,
    ]
  );

  // Shared by both editable-content types (a labeled-box's heading, a
  // habit-tracker's habit-name list) — same underlying operation either
  // way: patch one or more propValues keys, swap in the freshly-rendered
  // element, resync origin. Sends the module's FULL current propValues
  // with just `patch`'s keys overridden, not `patch` alone —
  // updateModuleConfig replaces the whole config server-side rather than
  // merging (see its own comment), so leaving anything out would reset
  // every other field to its schema default; `ruled` silently flipping
  // back to false the first time someone edited a heading was exactly
  // that bug, before this sent the full object.
  //
  // Recomputes origin fresh from the module's own CURRENT placement, the
  // same way handleAddModule and the (fixed) top-module branch of
  // handleResizeAdjacent already do — updateModuleConfig re-renders this
  // instance's content server-side against whatever row/column it
  // currently sits at in the DB, so pairing that fresh content with
  // moduleLookup's *old* origin would reintroduce the exact "jumps to
  // overlap a neighbor" bug that turned out to be the real cause of the
  // resize-after-reposition issue — see that fix's own commit for the
  // full diagnosis. This path regenerates content the same way a resize
  // does, so it needs the same guard.
  const commitModulePropValues = useCallback(
    async (instanceId: string, patch: Record<string, unknown>) => {
      if (gestureBlockedByPendingCommit()) return;
      const info = moduleLookup.get(instanceId);
      const placement = placements[instanceId];
      const pageGrid = info ? pageGridByPageId[info.pageId] : undefined;
      if (!info || !placement || !pageGrid) return;
      try {
        const nextPropValues = { ...info.propValues, ...patch };
        const result = await serializeCommit(() => updateModuleConfig(instanceId, nextPropValues));
        const origin = gridCellToPixels(pageGrid, placement);
        setModuleLookup((prev) => {
          const next = new Map(prev);
          const prevInfo = prev.get(instanceId);
          if (prevInfo) {
            next.set(instanceId, {
              ...prevInfo,
              elements: [result.element],
              propValues: (result.propValues as Record<string, unknown>) ?? nextPropValues,
              originX: origin.x,
              originY: origin.y,
            });
          }
          return next;
        });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    },
    [moduleLookup, placements, pageGridByPageId, serializeCommit, gestureBlockedByPendingCommit]
  );
  const handleUpdateHeading = useCallback(
    (instanceId: string, newHeading: string) => commitModulePropValues(instanceId, { heading: newHeading }),
    [commitModulePropValues]
  );
  const handleUpdateHabits = useCallback(
    (instanceId: string, habits: string[]) => commitModulePropValues(instanceId, { habits }),
    [commitModulePropValues]
  );

  // Debug-only "put the sidebar and the below-hourly-grid area back
  // exactly like they started" — see resetPlannerToTemplate's own
  // comment (actions.ts) for the exact scope: the left page's sidebar
  // column, plus a full-height TO-DO checklist (and nothing else — any
  // habit-tracker sharing that space is deleted, not preserved) below
  // the hourly grid on BOTH pages. NOT the hourly grid itself or
  // anything else on the page — an earlier version wiped every
  // non-locked instance unconditionally and was reported as "bottom
  // modules are gone after reset." Why this is a whole-page reload
  // rather than a live state patch the way every other action here is:
  // reconstructing placements/moduleLookup/every derived map for a
  // wipe-and-reseed would just be re-deriving what a fresh page load
  // already does correctly. window.location.reload(), not
  // router.refresh() — a Server Component refresh alone wouldn't reset
  // NativePlannerEditor's own client state (placements, moduleLookup,
  // zoom, ...), and this needs all of it rebuilt from scratch, not just
  // the server data underneath it re-fetched.
  const [isResettingPlanner, setIsResettingPlanner] = useState(false);
  const handleResetPlannerToTemplate = useCallback(async () => {
    const confirmed = window.confirm("Reset to original template?");
    if (!confirmed) return;
    setIsResettingPlanner(true);
    try {
      await resetPlannerToTemplate();
      window.location.reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setIsResettingPlanner(false);
    }
  }, []);

  // Live preview: while a drag is in progress, recompute where things
  // would land if released right now, and turn that into per-instance
  // pixel offsets for rendering (see NativeModule's visualOffset). Merges
  // in the post-drop settle FLIP from `settling` state (see its own
  // comment) — the two are mutually exclusive in practice (activeId is
  // always null by the time settling gets set, since it's only computed
  // inside handleDragEnd after clearing it) but merging rather than
  // early-returning keeps that an incidental fact rather than something
  // this has to assume.
  const visualOffsets = useMemo(() => {
    const offsets: Record<string, { x: number; y: number }> = {};

    if (activeId) {
      const preview = resolveDrag(activeId, activeDelta.x, activeDelta.y);
      if (preview) {
        const { pageGrid, reflow } = preview;
        // The dragged item follows the pointer directly and continuously
        // — not snapped to the resolved cell, which would make it feel
        // like it's teleporting between grid lines instead of being
        // carried by the pointer. dxPagePx/dyPagePx (already
        // scale-divided) is exactly that raw follow distance.
        offsets[activeId] = { x: activeDelta.x / scale, y: activeDelta.y / scale };
        for (const move of reflow) {
          const prevPlacement = placements[move.id];
          if (!prevPlacement) continue;
          const fromPixel = gridCellToPixels(pageGrid, prevPlacement);
          const toPixel = gridCellToPixels(pageGrid, { ...prevPlacement, rowStart: move.rowStart });
          offsets[move.id] = { x: 0, y: toPixel.y - fromPixel.y };
        }
      }
    }

    if (settling) {
      for (const [id, value] of Object.entries(settling.offsets)) {
        offsets[id] = settling.phase === "start" ? value : ZERO_OFFSET;
      }
    }

    return offsets;
  }, [activeId, activeDelta, placements, resolveDrag, scale, settling]);

  // Which instances need their transition suppressed for the current
  // render — just the settle FLIP's "start" frame (see `settling` state's
  // own comment); the dragged item's own transition-suppression is
  // handled separately via isDragged, unaffected by this.
  const suppressTransitionIds = useMemo(() => {
    if (!settling || settling.phase !== "start") return null;
    return new Set(Object.keys(settling.offsets));
  }, [settling]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#e8e8e8" }}>
      <header
        style={{
          padding: "8px 16px",
          background: "#1a1a1a",
          color: "white",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* Toggles ModulePalette's own sliding panel (see its own
            comment) — lives here, in the header's normal document flow,
            rather than as a separate position:fixed button floating
            over the page: this exact top-left corner is already where
            the header's own title text sits, and a fixed button there
            would just sit on top of it instead of leaving room. */}
        <button
          type="button"
          onClick={() => setPaletteOpenAnimated(!paletteOpen)}
          title={paletteOpen ? "Close module palette" : "Open module palette"}
          style={{
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: paletteOpen ? "#4a5cff" : "#2a2a2a",
            border: "none",
            borderRadius: 10,
            color: "#fff",
            fontSize: 14,
            lineHeight: 1,
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          {paletteOpen ? "✕" : "☰"}
        </button>
        <strong>
          Memari <span style={{ fontWeight: 200, fontSize: "0.8em", letterSpacing: "0.1em" }}>EDITOR</span>
        </strong>
        {/* Debug-only sidebar + to-do reset — requested directly: "reset
            the entire page to the original layout we first made... from
            the pdf." Scoped to the sidebar column and the below-hourly-
            grid area on both pages, not the whole page — see
            handleResetPlannerToTemplate's own comment on why.
            marginLeft:auto pushes this (and saveError after it) to the
            header's right edge, same trick saveError used on its own
            before this existed. */}
        <button
          type="button"
          onClick={handleResetPlannerToTemplate}
          disabled={isResettingPlanner}
          title="Debug: wipe the sidebar (Things I'm Grateful For / Reminders / Notes) and the to-do area below the hourly grid on both pages, and put back the original template"
          style={{
            marginLeft: "auto",
            padding: "4px 10px",
            fontSize: 12,
            background: "#3a3a3a",
            color: "#ddd",
            border: "1px solid #555",
            borderRadius: 10,
            cursor: isResettingPlanner ? "default" : "pointer",
            opacity: isResettingPlanner ? 0.6 : 1,
          }}
        >
          {isResettingPlanner ? "Resetting…" : "Reset to Template"}
        </button>
        {saveError && <span style={{ color: "#ff5555" }}>Save failed: {saveError}</span>}
      </header>
      <div
        ref={scrollContainerRef}
        onPointerMove={(event) => {
          lastPointerPositionRef.current = { x: event.clientX, y: event.clientY };
        }}
        // overflowAnchor: "none" — reported directly: "when resizing
        // between bottom modules, the window also moves scrolling up
        // and down snapping as i resize up and down." Root cause:
        // browser scroll anchoring, a normally-invisible feature (kicks
        // in whenever a scrollable container's own content changes
        // size, nudging scrollTop to keep whatever was visually in view
        // still in view) that this container never needed disabled
        // before, because nothing inside it used to change its own DOM
        // structure while a drag was live. A resizing todo-checklist/
        // habit-tracker now does exactly that — its content is a
        // genuine live re-render, not frozen (see NativePage's own
        // contentIsLive comment), so its real row count changes on
        // every row crossing, adding/removing actual DOM nodes each
        // time. That's precisely what scroll anchoring watches for; a
        // resizing labeled-box never triggers this since its own
        // content stays frozen (only the box's outline moves) until the
        // drag commits. `none` doesn't disable this container's own
        // scrolling, only the browser's automatic-compensation behavior
        // — nothing else here relies on that behavior to begin with.
        style={{ flex: 1, minHeight: 0, overflow: "auto", overflowAnchor: "none", position: "relative" }}
      >
        {/* marginLeft/marginTop: centeringOffsetX/Y(scale), not CSS
            margin:auto or flex+justifyContent:center — both of those
            have a well-known bug where content wider/taller than its
            container becomes unreachable by scroll on one side (the
            "phantom centering space" issue), and neither gives
            zoomAnchored a precise, known value to fold into its focal-
            point math the way these explicit, JS-computed offsets do.
            Each degrades to its own axis's minimum padding once the
            content genuinely overflows that axis, so it stays
            scrollable in every direction at any zoom level instead of
            only some of them — only matters once zoom-in makes overflow
            a real possibility, which is exactly what's being added
            here. See centeringOffsetX's own comment for the full
            reasoning, including the padding-baseline bug that was
            making content hug the top-left instead of sitting
            centered. */}
        <div
          style={{
            width: "fit-content",
            marginLeft: centeringOffsetX(scale),
            marginTop: centeringOffsetY(scale),
            marginBottom: VIEWPORT_PADDING_PX,
            // See paletteZoomTransitioning's own comment (main
            // component) for why this is scoped to a flag instead of
            // an unconditional transition — wheel-zoom/manual-zoom
            // both drive this same marginLeft and need it applied
            // instantly, not eased.
            transition: paletteZoomTransitioning ? "margin 0.28s cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
            // Reported directly: "when i drag individual modules from
            // side it drags under the canvas instead of over it and i
            // then cant see it anymore." Root cause: this div (and the
            // transform:scale(...) wrapper inside it, both position:
            // static/auto by default) is a plain sibling of ZoomControls
            // and — one level in — of ModulePalette, both of which are
            // position:fixed with their own explicit z-index (20 and 25
            // respectively). A dragged module's own zIndex:10 (see
            // NativeModule's own comment) only ever competes against its
            // OWN siblings *inside* this div's stacking context — it can
            // never outrank a z-indexed element *outside* that context,
            // no matter how high its own local value is, since stacking
            // contexts don't let an inner value "escape" to compete at
            // an outer level. ZoomControls sits fixed at the viewport's
            // own bottom-center and is always on screen, so dragging any
            // module down far enough already had a real, reachable path
            // to end up visually underneath it. position:relative +
            // zIndex here (elevated only while a drag or its post-drop
            // settle animation is in flight, matching the same
            // "elevate only what's actively moving" scoping every other
            // conditional z-index in this file already uses) outranks
            // both fixed-position siblings for that whole window — the
            // dragged module (and the settling one right after drop)
            // can no longer be covered by either, while ZoomControls/
            // ModulePalette still correctly sit on top of the plain,
            // idle canvas the rest of the time.
            position: "relative",
            zIndex: activeId || settling ? 30 : undefined,
          }}
        >
          {/* DndContext wraps this whole marginLeft/marginTop div *and*
              ModulePalette below, as siblings — not nested one inside
              the other. ModulePalette deliberately sits *outside* the
              scale(...) transform right below (see its own comment on
              why: position:fixed needs to stay relative to the real
              viewport, the same reasoning ZoomControls' own identical
              positioning already established), but useDraggable still
              needs it inside the same DndContext's React tree to
              register at all — those are two independent concerns (DOM/
              CSS layout vs. React context), so it's fine for one to
              nest one way and the other a different way. */}
          <DndContext
            id="memari-planner-dnd"
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            <div
              style={{
                transform: `scale(${scale})`,
                transformOrigin: "top left",
                // Same scoping reasoning as the marginLeft transition
                // just above — see paletteZoomTransitioning's own
                // comment.
                transition: paletteZoomTransitioning ? "transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)" : undefined,
              }}
            >
              <div style={{ display: "flex", gap: PAGE_GAP_PX }}>
                {pages.map((page) => (
                  <NativePage
                    key={page.pageId}
                    page={page}
                    instanceIds={instanceIdsByPageId[page.pageId] ?? EMPTY_INSTANCE_IDS}
                    placements={displayPlacements}
                    moduleLookup={moduleLookup}
                    activeId={activeId}
                    visualOffsets={visualOffsets}
                    suppressTransitionIds={suppressTransitionIds}
                    justAddedIds={justAddedIds}
                    resizePairs={resizePairsByPageId[page.pageId] ?? EMPTY_RESIZE_PAIRS}
                    stackBottoms={stackBottomsByPageId[page.pageId] ?? EMPTY_STACK_BOTTOMS}
                    resizingIds={resizingIds}
                    resizeFrozenSize={resizeFrozenSize}
                    onResizeStart={handleResizeStart}
                    onResizeMove={handleResizeMove}
                    onResizeEnd={handleResizeEnd}
                    onStackResizeStart={handleStackResizeStart}
                    onStackResizeMove={handleStackResizeMove}
                    onStackResizeEnd={handleStackResizeEnd}
                    onOpenPaletteSection={handleOpenPaletteSection}
                    onDeleteModule={handleDeleteModule}
                    onUpdateHeading={handleUpdateHeading}
                    onUpdateHabits={handleUpdateHabits}
                    hoveredInstanceId={hoveredInstanceId}
                    onHoverStart={handleHoverStart}
                    onHoverEnd={handleHoverEnd}
                    paletteDragPreview={paletteDrag}
                    scale={scale}
                    isFirefox={isFirefox}
                  />
                ))}
              </div>
            </div>
            <ModulePalette
              activeId={activeId}
              activeDelta={activeDelta}
              open={paletteOpen}
              highlightSection={paletteHighlightSection}
            />
          </DndContext>
        </div>
        <ZoomControls
          scale={scale}
          zoomMode={zoomMode}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitWidth={() => setZoomMode("fit-width")}
          onFitPage={() => setZoomMode("fit-page")}
        />
      </div>
    </div>
  );
}

// Floating pill toolbar, bottom-center of the viewport — same placement
// Polotno's own ZoomGroup uses (node_modules/polotno/toolbar/zoom-
// buttons.js: position:absolute, bottom, centered horizontally) so this
// reads as the same kind of control. `position: fixed`, not sticky or
// absolute: it needs to stay put on screen regardless of zoom level or
// scroll position within a container that can get much taller than the
// viewport once zoomed in, and fixed is unambiguous for that (relative
// to the real viewport specifically *because* none of this component's
// own ancestors carry a CSS transform — only the scaled page content,
// a sibling subtree, does; see the file's own note on why a transformed
// ancestor is exactly the thing that broke position:fixed for
// DragOverlay earlier).
function ZoomControls({
  scale,
  zoomMode,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitPage,
}: {
  scale: number;
  zoomMode: "fit-width" | "fit-page" | "manual";
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitPage: () => void;
}) {
  const buttonStyle = (active: boolean): React.CSSProperties => ({
    border: "none",
    background: active ? "#4a5cff" : "transparent",
    color: active ? "white" : "#333",
    borderRadius: 6,
    padding: "6px 10px",
    fontSize: 13,
    cursor: "pointer",
    lineHeight: 1,
  });
  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        width: "fit-content",
        display: "flex",
        alignItems: "center",
        gap: 2,
        background: "white",
        borderRadius: 10,
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        padding: 4,
        zIndex: 20,
      }}
    >
      <button onClick={onZoomOut} title="Zoom out" style={buttonStyle(false)}>
        −
      </button>
      <span style={{ fontSize: 13, color: "#333", minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
      <button onClick={onZoomIn} title="Zoom in" style={buttonStyle(false)}>
        +
      </button>
      <div style={{ width: 1, alignSelf: "stretch", background: "#ddd", margin: "0 4px" }} />
      <button onClick={onFitWidth} title="Fill screen with page width (default)" style={buttonStyle(zoomMode === "fit-width")}>
        Fit width
      </button>
      <button onClick={onFitPage} title="Zoom out to see the whole page" style={buttonStyle(zoomMode === "fit-page")}>
        Fit page
      </button>
    </div>
  );
}


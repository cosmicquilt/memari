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
import { PRINT_WIDTH_PX, PRINT_HEIGHT_PX } from "@/lib/print-spec";
import { computeLabeledBoxHeaderHeightPx } from "@/lib/modules/labeledBox";
import {
  gridCellToPixels,
  pixelsToGridCell,
  clampGridPlacement,
  resolveModulePlacement,
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

// The stack-bottom cascade's own math (see StackBottom's type comment
// and resizeStackFromBottom's own comment for the full reasoning) —
// shared between the live preview (displayPlacements below) and the
// handle's own drag-clamp, so the two can never disagree about where a
// given deltaRows actually lands. Growing (deltaRows > 0) only ever grows
// the last (bottom-most) member; shrinking cascades upward once each
// member in turn hits MIN_ROW_SPAN. Pure — doesn't touch rowStart at
// all, callers repack contiguously from their own top anchor afterward.
function cascadeStackSpans(originalSpans: number[], deltaRows: number): number[] {
  const spans = [...originalSpans];
  if (deltaRows > 0) {
    spans[spans.length - 1] += deltaRows;
  } else if (deltaRows < 0) {
    let remaining = -deltaRows;
    for (let i = spans.length - 1; i >= 0 && remaining > 0; i--) {
      const shrinkable = spans[i] - MIN_ROW_SPAN;
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
};

// The bottom-most unlocked module of a same-column stack, with nothing
// directly below it in that column — a candidate for a resize handle at
// the *stack's own* outer bottom edge (see StackBottom's own handle,
// StackResizeHandle, for why this is a materially different operation
// from ResizePair's coupled boundary above, not just a variant of it).
// `members` is the whole stack, top to bottom, each with its own current
// rowSpan — the cascading-shrink math needs every member's size, not
// just the bottom one's.
type StackBottom = {
  key: string;
  pageId: string;
  bottomId: string;
  columnStart: number;
  columnSpan: number;
  members: Array<{ id: string; rowSpan: number }>;
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
  suppressTransition,
  scale,
  isFirefox,
  onDelete,
  isHovered,
  onHoverStart,
  onHoverEnd,
  slug,
  heading,
  onUpdateHeading,
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
  // live, snapped to the grid, but their *content* (elements/origin)
  // still reflects the last-committed size until release (no server
  // round trip mid-drag — see ResizeHandle's own comment on why not).
  // Clips that content to the live box instead of letting it spill past
  // a shrinking edge or overlap whatever's now closer on a growing one.
  isResizing: boolean;
  // The pair's frozen (pre-drag) pixel size, while isResizing — see
  // resizeFrozenSize's own comment in the main component. null the rest
  // of the time.
  frozenSize: { width: number; height: number } | null;
  // True for exactly one frame right after a drop, for whichever
  // instances just had their placement committed (the dropped item and
  // any reflowed siblings) — see the settle-FLIP comment on `settling`
  // state below for why a transition has to be suppressed for that one
  // frame specifically, not just while actively dragging.
  suppressTransition: boolean;
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
  // Matches the box's own real header band (see this constant's own
  // comment on the edit-mode overlay below for why that matters) —
  // cheap enough to just recompute on every render rather than memoing,
  // same as ResizeHandle/AddModuleButton's own gridCellToPixels calls
  // elsewhere in this file.
  const editOverlayHeight = slug === "labeled-box" ? computeLabeledBoxHeaderHeightPx(heading ?? "", widthPx) : 0;
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
        // (a reflow preview) gets a short one, so the shift reads as a
        // deliberate slide instead of a jump. Also suppressed for one
        // frame right after a drop (suppressTransition) — see `settling`
        // state's own comment for why.
        transition: isDragged || suppressTransition ? undefined : "transform 0.15s ease",
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
        // A resize's live preview only ever moves this *box* — content
        // (elements/origin) stays frozen at its last-committed size until
        // release (see isResizing's own comment). That's invisible on its
        // own for whichever of the pair is only ever growing/shrinking
        // from a fixed edge (its stale content never has a reason to
        // move, so the box changing size shows up as nothing but blank
        // added/removed space with no line to mark where the new edge
        // actually is) — reported live: "only the module below updates,"
        // exactly that half of the pair. This outline is a stand-in for
        // real content specifically for that case: always visible while
        // isResizing, on both sides of the pair, so the live edge itself
        // is never dependent on what the frozen content happens to show.
        // Solid black, not a muted gray/dashed — a faint dashed gray line
        // against mostly-white content read as the box looking dimmed/
        // disabled, not as an active resize indicator.
        outline: isResizing ? "2px solid #000000" : undefined,
        outlineOffset: isResizing ? "-2px" : undefined,
        touchAction: locked ? undefined : "none",
      }}
    >
      <PolotnoJsonRenderer
        elements={elements}
        originX={originX}
        originY={originY}
        scale={scale}
        isFirefox={isFirefox}
        suppressOuterBorderSize={isResizing ? frozenSize : null}
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
          single free-text heading in this app today). Same hover-corner-
          badge language as the delete button above, mirrored to the
          top-left corner so the two don't collide. Swaps for an input
          rather than living alongside it — simpler than getting an
          overlay to line up with wherever the rendered SVG heading text
          happens to sit exactly, but its height is still computed to
          match that real header band (computeLabeledBoxHeaderHeightPx,
          editOverlayHeight below) — reported live the first time this
          shipped with a guessed fixed height instead: "the header gets
          taller" (that guess ran taller than a real single-line
          header's true, shorter height). A per-module "reset this one
          heading" badge used to sit right next to this one — removed
          per direct request once the header's whole-sidebar Reset to
          Template button existed, which covers the same need at a
          different scope. */}
      {!locked && slug === "labeled-box" && !isEditingHeading && (
        <button
          type="button"
          title="Edit heading"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            setDraftHeading(heading ?? "");
            setIsEditingHeading(true);
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
              fontSize: 18,
              fontFamily: "Georgia, 'PT Serif', serif",
              border: "none",
              outline: "none",
              background: "transparent",
              padding: 0,
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
  onAddModule,
  onDeleteModule,
  onUpdateHeading,
  hoveredInstanceId,
  onHoverStart,
  onHoverEnd,
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
  onAddModule: (pageId: string, columnStart: number, rowStart: number) => void;
  onDeleteModule: (instanceId: string) => void;
  onUpdateHeading: (instanceId: string, newHeading: string) => void;
  // See NativeModule's own isHovered comment — lifted to the main
  // component, threaded down through here.
  hoveredInstanceId: string | null;
  onHoverStart: (instanceId: string) => void;
  onHoverEnd: (instanceId: string) => void;
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
        return (
          <NativeModule
            key={id}
            instanceId={id}
            locked={info.locked}
            placement={placement}
            elements={info.elements}
            originX={info.originX}
            originY={info.originY}
            frozenSize={resizeFrozenSize?.[id] ?? null}
            visualOffset={visualOffsets[id] ?? ZERO_OFFSET}
            isDragged={activeId === id}
            isResizing={resizingIds?.has(id) ?? false}
            suppressTransition={suppressTransitionIds?.has(id) ?? false}
            scale={scale}
            isFirefox={isFirefox}
            onDelete={onDeleteModule}
            isHovered={hoveredInstanceId === id}
            onHoverStart={onHoverStart}
            onHoverEnd={onHoverEnd}
            slug={info.slug}
            heading={info.slug === "labeled-box" ? ((info.propValues.heading as string | undefined) ?? "") : null}
            onUpdateHeading={onUpdateHeading}
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
          where a new module can go — one button per stack that has any
          such room. Deliberately still shown while a module is being
          reposition-dragged (unlike the handles above) — its own
          position doesn't move during that (stackBottomsByPageId isn't
          affected by a reposition's visualOffsets, which is a pure CSS
          transform, not a placements change), so there's nothing stale
          about keeping it visible, and it doubles as a visual "here's
          where the reserved zone starts" reference while dragging
          toward it (see resolveDrag's own virtual-lock comment). Still
          hidden during an active resize specifically, since the gap
          itself *is* live then (stackBottoms is built off
          displayPlacements) and would be visibly resizing right under
          the cursor at the same time as the handle actually being
          dragged. */}
      {!resizingIds &&
        stackBottoms
          .filter((sb) => sb.maxBottomBound - sb.stackBottomRowEnd > 0)
          .map((sb) => (
            <AddModuleButton
              key={`add:${sb.bottomId}`}
              pageGrid={page.pageGrid}
              columnStart={sb.columnStart}
              columnSpan={sb.columnSpan}
              rowStart={sb.stackBottomRowEnd}
              rowSpan={sb.maxBottomBound - sb.stackBottomRowEnd}
              onClick={() => onAddModule(page.pageId, sb.columnStart, sb.stackBottomRowEnd)}
            />
          ))}
    </div>
  );
}

const RESIZE_HANDLE_HALF_HEIGHT_PX = 8; // page-space px, each side of the boundary line — see ResizeHandle's own comment

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
  const dragRef = useRef<{ clientY: number; topRowSpan: number; bottomRowSpan: number } | null>(null);

  const computeClampedDeltaRows = useCallback(
    (clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return 0;
      const rawDeltaPagePx = (clientY - drag.clientY) / scale;
      const rawDeltaRows = Math.round(rawDeltaPagePx / rowPitchPx);
      // Same clamp resizeAdjacentModules applies server-side (mirrors its
      // own MIN_ROW_SPAN, module-level above — kept in sync by hand, this
      // file can't import a constant from a "use server" file), mirrored
      // here so the live preview can never show a boundary position the
      // eventual commit wouldn't actually land on. A single-row sidebar
      // box is barely more than a sliver, all header/border chrome with
      // no real writing space left.
      return Math.max(-(drag.topRowSpan - MIN_ROW_SPAN), Math.min(drag.bottomRowSpan - MIN_ROW_SPAN, rawDeltaRows));
    },
    [scale, rowPitchPx]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { clientY: event.clientY, topRowSpan: pair.topRowSpan, bottomRowSpan: pair.bottomRowSpan };
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
      onResizeEnd(pair, deltaRows);
    },
    [computeClampedDeltaRows, pair, onResizeEnd]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const wasDragging = dragRef.current !== null;
      dragRef.current = null;
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
  const dragRef = useRef<{ clientY: number; memberSpans: number[]; maxGrow: number } | null>(null);

  const computeClampedDeltaRows = useCallback(
    (clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return 0;
      const rawDeltaPagePx = (clientY - drag.clientY) / scale;
      const rawDeltaRows = Math.round(rawDeltaPagePx / rowPitchPx);
      const totalShrinkable = drag.memberSpans.reduce((sum, span) => sum + (span - MIN_ROW_SPAN), 0);
      return Math.max(-totalShrinkable, Math.min(drag.maxGrow, rawDeltaRows));
    },
    [scale, rowPitchPx]
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        clientY: event.clientY,
        memberSpans: stackBottom.members.map((m) => m.rowSpan),
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
      onResizeEnd(stackBottom, deltaRows);
    },
    [computeClampedDeltaRows, stackBottom, onResizeEnd]
  );

  const handlePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const wasDragging = dragRef.current !== null;
      dragRef.current = null;
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
// Scoped to sidebar-shaped stacks specifically (see handleAddModule's own
// comment on why it always adds a labeled-box, not a chosen module type)
// — this app's sidebar content is always labeled-box regardless of
// heading, so there's a single unambiguous answer to "what gets added
// here" and no module-type picker UI to build for it.
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
  return (
    <button
      type="button"
      onClick={onClick}
      title="Add a module here"
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(120, 130, 255, 0.06)",
        border: "2px dashed rgba(120, 130, 255, 0.5)",
        borderRadius: 8,
        color: "rgba(90, 100, 220, 0.8)",
        cursor: "pointer",
        fontSize: Math.max(18, Math.min(32, rect.width * 0.12)),
        lineHeight: 1,
      }}
    >
      +
    </button>
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
      const byColumn = new Map<string, Array<{ id: string; rowStart: number; rowSpan: number }>>();
      for (const id of instanceIdsByPageId[page.pageId] ?? []) {
        const info = moduleLookup.get(id);
        const placement = displayPlacements[id];
        if (!info || info.locked || !placement) continue;
        const columnKey = `${placement.columnStart}:${placement.columnSpan}`;
        const group = byColumn.get(columnKey) ?? [];
        group.push({ id, rowStart: placement.rowStart, rowSpan: placement.rowSpan });
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
      const byColumn = new Map<string, Array<{ id: string; rowStart: number; rowSpan: number }>>();
      for (const id of pageIds) {
        const info = moduleLookup.get(id);
        const placement = displayPlacements[id];
        if (!info || info.locked || !placement) continue;
        const columnKey = `${placement.columnStart}:${placement.columnSpan}`;
        const group = byColumn.get(columnKey) ?? [];
        group.push({ id, rowStart: placement.rowStart, rowSpan: placement.rowSpan });
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
          members: sorted.map((m) => ({ id: m.id, rowSpan: m.rowSpan })),
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

  const fitWidthScale = clampScale((viewportSize.width - VIEWPORT_PADDING_PX * 2) / spreadWidthPx);
  const fitPageScale = clampScale(
    Math.min(
      (viewportSize.width - VIEWPORT_PADDING_PX * 2) / spreadWidthPx,
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
  const centeringOffsetX = useCallback(
    (atScale: number) =>
      VIEWPORT_PADDING_PX + Math.max(0, (viewportSize.width - VIEWPORT_PADDING_PX * 2 - spreadWidthPx * atScale) / 2),
    [viewportSize.width, spreadWidthPx]
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

  // A small activation distance, not an instant-trigger sensor — without
  // it, a plain click (no intended drag at all) can register as a
  // zero-distance "drag" and briefly flicker the dragging state.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    setActiveDelta(ZERO_OFFSET);
    // Starting a new drag mid-settle (rare — would need to happen within
    // the ~150ms settle window) just cancels the old settle in place
    // rather than trying to run two independently-timed settles at once.
    setSettling(null);
  }, []);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    setActiveDelta({ x: event.delta.x, y: event.delta.y });
  }, []);

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
      for (const [id, placement] of Object.entries(placements)) {
        if (id === instanceId) continue;
        const otherInfo = moduleLookup.get(id);
        if (!otherInfo || otherInfo.pageId !== info.pageId) continue;
        others.push({ ...placement, id, locked: otherInfo.locked });
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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setActiveDelta(ZERO_OFFSET);
      const instanceId = String(event.active.id);
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
    [placements, resolveDrag, scale, serializeCommit]
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

  // Adds a fresh, blank labeled-box into whatever room a stack has freed
  // up (see AddModuleButton's own comment on why labeled-box specifically
  // — this app's sidebar content is always that one type, so there's a
  // single unambiguous answer with no module-type picker UI to build).
  // Reuses addPaletteModuleAt unchanged. columnStart/rowStart are trusted
  // as-given rather than re-read from the server's own response — unlike
  // a general palette drop, this always targets a gap this file itself
  // just computed as genuinely empty (stackBottomsByPageId), so
  // addPaletteModuleAt's own findNearestFreeCell search can only ever
  // resolve to exactly that same cell, never relocate.
  const handleAddModule = useCallback(
    async (pageId: string, columnStart: number, rowStart: number) => {
      // See gestureBlockedByPendingCommit's own comment — the clicked
      // target (columnStart/rowStart, captured from the button's own
      // props at click time) could go stale if a still-pending commit is
      // about to move the stack's own bottom out from under it.
      if (gestureBlockedByPendingCommit()) return;
      const pageGrid = pageGridByPageId[pageId];
      if (!pageGrid) return;
      try {
        // See serializeCommit's own comment — guards this against the
        // same race too: adding right after a reposition/resize
        // shouldn't read a stale "what's occupied" view server-side
        // either, even though this specific call's own target is always
        // a gap this file already knows is empty (see this function's
        // own comment).
        const result = await serializeCommit(() => addPaletteModuleAt(pageId, "labeled-box", columnStart, rowStart));
        const origin = gridCellToPixels(pageGrid, {
          columnStart,
          rowStart,
          columnSpan: result.columnSpan,
          rowSpan: result.rowSpan,
        });
        setPlacements((prev) => ({
          ...prev,
          [result.instanceId]: { columnStart, rowStart, columnSpan: result.columnSpan, rowSpan: result.rowSpan },
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
            slug: "labeled-box",
            propValues,
          });
          return next;
        });
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    },
    [pageGridByPageId, serializeCommit, gestureBlockedByPendingCommit]
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
    [serializeCommit, gestureBlockedByPendingCommit, recomputeHoverAfterLayoutChange]
  );

  // Commits a labeled-box's heading — both the pencil-edit path and the
  // reset-to-original button (NativeModule) call this, just with a
  // different target string. Sends the module's FULL current propValues
  // with only `heading` swapped, not `{heading}` alone —
  // updateModuleConfig replaces the whole config server-side rather than
  // merging (see its own comment), so leaving anything out would reset
  // it to that field's schema default; ruled being silently flipped back
  // to false the first time someone edited a heading would be exactly
  // that bug.
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
  const handleUpdateHeading = useCallback(
    async (instanceId: string, newHeading: string) => {
      if (gestureBlockedByPendingCommit()) return;
      const info = moduleLookup.get(instanceId);
      const placement = placements[instanceId];
      const pageGrid = info ? pageGridByPageId[info.pageId] : undefined;
      if (!info || !placement || !pageGrid) return;
      try {
        const nextPropValues = { ...info.propValues, heading: newHeading };
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

  // Debug-only "put the sidebar back exactly like it started" — see
  // resetPlannerToTemplate's own comment (actions.ts) for what it
  // wipes/recreates (just the left page's sidebar column — NOT anything
  // below the hourly grid or on the right page, after an earlier version
  // wiped those too and was reported as "bottom modules are gone after
  // reset") and why this is a whole-page reload rather than a live state
  // patch the way every other action here is: reconstructing placements/
  // moduleLookup/every derived map for a wipe-and-reseed would just be
  // re-deriving what a fresh page load already does correctly.
  // window.location.reload(), not router.refresh() — a Server Component
  // refresh alone wouldn't reset NativePlannerEditor's own client state
  // (placements, moduleLookup, zoom, ...), and this needs all of it
  // rebuilt from scratch, not just the server data underneath it
  // re-fetched.
  const [isResettingPlanner, setIsResettingPlanner] = useState(false);
  const handleResetPlannerToTemplate = useCallback(async () => {
    const confirmed = window.confirm(
      "Reset the sidebar back to its original template?\n\nThis deletes anything you've added, moved, resized, or edited there and re-creates the original Gratitude/Reminders/Notes boxes. Nothing else on the page (like the hourly grid or anything below it) is touched."
    );
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
        <strong>Memari planner editor (native)</strong>
        <span style={{ color: "#999", fontSize: 12 }}>Drag-to-reposition + zoom/pan wired up — resize/palette/save-button still to come</span>
        {/* Debug-only sidebar reset — requested directly: "reset the
            entire page to the original layout we first made... from the
            pdf." Scoped to just the sidebar column, not the whole page
            — see handleResetPlannerToTemplate's own comment on why.
            marginLeft:auto pushes this (and saveError after it) to the
            header's right edge, same trick saveError used on its own
            before this existed. */}
        <button
          type="button"
          onClick={handleResetPlannerToTemplate}
          disabled={isResettingPlanner}
          title="Debug: wipe the sidebar and put back the original template (Things I'm Grateful For / Reminders / Notes)"
          style={{
            marginLeft: "auto",
            padding: "4px 10px",
            fontSize: 12,
            background: "#3a3a3a",
            color: "#ddd",
            border: "1px solid #555",
            borderRadius: 4,
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
        style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative" }}
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
          }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <DndContext
              id="memari-planner-dnd"
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
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
                    onAddModule={handleAddModule}
                    onDeleteModule={handleDeleteModule}
                    onUpdateHeading={handleUpdateHeading}
                    hoveredInstanceId={hoveredInstanceId}
                    onHoverStart={handleHoverStart}
                    onHoverEnd={handleHoverEnd}
                    scale={scale}
                    isFirefox={isFirefox}
                  />
                ))}
              </div>
            </DndContext>
          </div>
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


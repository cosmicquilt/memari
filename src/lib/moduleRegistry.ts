// One place that knows what a module is.
//
// A module's behaviour used to be described by string comparison against
// its slug, in nine separate files and seventy-five separate places: which
// function draws it, how short it may get, whether its content re-renders
// while its box is resizing, which of its stored props are really facts
// about its geometry. Adding a module meant finding all of them, and
// missing one is not a compile error - it is a module quietly absent from
// a list it belonged in.
//
// That is not hypothetical. `contentIsLive` listed four slugs by name to
// decide whose content re-renders during a resize, and an hourly grid with
// increments on was not among them, so it drew its old hours inside a box
// that had already changed size - the "double box" the content-easing rule
// exists to prevent. The same shape of omission left dayCount overridden
// on some paths and not others, and rowHeightPt written at two of the
// three sites that needed it.
//
// The catalogue makes this decisive rather than merely untidy. The ~108
// planned modules are presets over about eleven drawing primitives - a
// water tracker, a medication log and a plant-watering chart are one
// primitive with three label sets. So a new module should be a DATA entry
// against an existing primitive, not a code entry repeated across nine
// files, and that is only true if there is one entry to make.
import type { PageGrid } from "@/lib/grid";
import { gridCellToPixels, columnSpanToDayCount, pixelHeightToRowSpan } from "@/lib/grid";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { renderHourlyGridCore, type HourlyGridCoreConfig } from "@/lib/modules/hourlyGridCore";
import { renderLabeledBox, type LabeledBoxConfig } from "@/lib/modules/labeledBox";
import { renderWeekTitle, type WeekTitleConfig } from "@/lib/modules/weekTitle";
import {
  renderTodoChecklist,
  getTodoChecklistRowMetricsPx,
  type TodoChecklistConfig,
} from "@/lib/modules/todoChecklist";
import {
  renderHabitTracker,
  getHabitTrackerRowMetricsPx,
  isHabitTrackerCompact,
  type HabitTrackerConfig,
} from "@/lib/modules/habitTracker";
import { renderMonthGridCore, type MonthGridCoreConfig } from "@/lib/modules/monthGridCore";
import { renderMonthTitle, type MonthTitleConfig } from "@/lib/modules/monthTitle";

/** The box a module is asked to draw itself into, in print pixels. */
export type ModuleGeometry = { x: number; y: number; width: number; height: number };

/** The page's dot lattice, for the primitives that draw on it. Square
 *  cells, so one pitch; the origin is the page margin. */
export type ModuleLattice = {
  pitchPx: number;
  originX: number;
  originY: number;
  insetPx: number;
};

/**
 * An editable prop, as the properties panel should offer it.
 *
 * Declared rather than hand-written per module, because the panel was a
 * run of `slug === ...` blocks each containing its own JSX, and a hundred
 * modules is a hundred blocks. A preset over an existing primitive should
 * need no panel code at all - the same primitive with different labels is
 * the same fields with different labels.
 *
 * `lines` is a string ARRAY edited as one per line. It is worth its own
 * kind rather than being a text field the module splits itself, because
 * the trim-and-drop-blanks that has to happen on save was previously
 * written into the panel's save handler as a habit-tracker special case,
 * and the next module with a list would have needed the same clause added
 * beside it.
 */
export type ModuleField =
  | { kind: "text"; key: string; label: string }
  | { kind: "boolean"; key: string; label: string }
  | { kind: "lines"; key: string; label: string; rows?: number }
  // No input: something the panel should say about a module whose props
  // are not editable here, in place of an empty panel.
  | { kind: "note"; text: string };

export type ModuleDefinition = {
  /** What to call this module in the editor's own surfaces. */
  label?: string;

  /**
   * The locked block a page is built around, which is what defines its
   * zones: the sidebar is everything left of the spine, the bottom zone
   * is the spine's own columns below it.
   *
   * A week page's spine is its hourly grid, a month page's is its
   * calendar. That was written as `slug === "hourly-grid-core"` in the
   * zone logic, so a month page had no zones at all - the month route's
   * own comment records this, noting the "+" dropzone buttons simply do
   * not appear there. Each cadence has one, which is what makes the
   * cadences share an editor rather than each needing their own.
   */
  isSpine?: boolean;

  /** The page's heading block, in the corner beside the spine - "WEEK
   *  1/52" on a week, the month name on a month. Same reasoning. */
  isTitle?: boolean;

  /**
   * Whether the width can be stepped in the properties panel.
   *
   * Off by default. A to-do or habit tracker's column span is tied to the
   * page's day count, and letting it drift independently recreates the
   * mismatched-checklist problem that sizing exists to avoid.
   */
  resizableWidth?: boolean;

  /** The editable props, rendered generically. */
  fields?: ModuleField[];

  /** Draws the module. The primitive; a preset is this plus propValues. */
  render: (
    geometry: ModuleGeometry,
    propValues: unknown,
    idPrefix: string,
    fontFamily: string,
    lattice: ModuleLattice
  ) => RenderedPolotnoElement[];

  /**
   * The shortest content this module can be drawn at, in print pixels, or
   * undefined to take the uniform floor. Turned into rows by
   * getMinRowSpanForSlug, which is where the epsilon and the page geometry
   * live - a definition here states the module's own rule and nothing else.
   */
  minContentHeightPx?: (pageGrid: PageGrid, columnSpan: number) => number;

  /**
   * Props that are not settings but consequences of the module's own
   * geometry, recomputed on every render so they cannot disagree with the
   * box they describe.
   *
   * A to-do's day count is the worked example: it IS its width, one column
   * per day unit. Storing it made it a second description of the same
   * geometry, and every caller that changed a span had to remember to
   * change the prop to match. Several did, along the paths someone had
   * noticed; a resize did not, nor a reflowed neighbour, nor the window
   * between releasing a drag and the server's answer arriving.
   */
  derivedProps?: (
    pageGrid: PageGrid,
    placement: { columnSpan: number; rowSpan: number },
    propValues: Record<string, unknown>
  ) => Record<string, unknown>;

  /**
   * Does this module's content have to be RE-DRAWN as its box resizes,
   * rather than drawn once and clipped?
   *
   * True wherever the drawing is a function of the box rather than a
   * picture inside it: a checklist whose row count follows its height, a
   * tracker that switches layout below a width. False for a module whose
   * content is fixed and merely revealed or covered, which the clip window
   * handles on its own and more cheaply.
   *
   * Takes propValues because a module can be either depending on its
   * settings - an hourly grid with increments off is a blank field that
   * simply scales, with increments on it is ruled rows that must be
   * recounted.
   */
  contentIsLive: (propValues: Record<string, unknown>) => boolean;
};

const ALWAYS = () => true;
const NEVER = () => false;

export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  "hourly-grid-core": {
    isSpine: true,
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderHourlyGridCore(
        geometry,
        propValues as HourlyGridCoreConfig,
        idPrefix,
        fontFamily,
        lattice
      ),
    // Increments off is a blank height-adjustable field, so it scales and
    // the clip serves. Increments on draws ruled rows whose count and
    // pitch both follow the box, so it has to be redrawn. The editor adds
    // one more case of its own - dragging the row-height handle changes
    // the pitch without changing the mode - which is about that gesture
    // rather than about the module.
    contentIsLive: (propValues) => propValues.intervalMode === "off",
  },

  "labeled-box": {
    label: "Labeled box",
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "boolean", key: "ruled", label: "Ruled (lined) body" },
    ],
    render: (geometry, propValues, idPrefix, fontFamily) =>
      renderLabeledBox(geometry, propValues as LabeledBoxConfig, idPrefix, fontFamily),
    // Its heading drops a point size rather than wrapping when the box
    // narrows, and a ruled box gains rules as it grows, so both axes
    // change the drawing.
    contentIsLive: ALWAYS,
  },

  "week-title": {
    isTitle: true,
    render: (geometry, propValues, idPrefix, fontFamily) =>
      renderWeekTitle(geometry, propValues as WeekTitleConfig, idPrefix, fontFamily),
    contentIsLive: NEVER,
  },

  "todo-checklist": {
    label: "To-do checklist",
    fields: [
      {
        kind: "note",
        text: "This checklist's day columns follow whichever page it's on — nothing to edit here yet.",
      },
    ],
    render: (geometry, propValues, idPrefix, fontFamily) =>
      renderTodoChecklist(geometry, propValues as TodoChecklistConfig, idPrefix, fontFamily),
    minContentHeightPx: () => {
      // "Title and one row below", requested in those words.
      const m = getTodoChecklistRowMetricsPx();
      return m.headerHeightPx + m.nominalRowHeightPx;
    },
    derivedProps: (pageGrid, placement) => ({
      dayCount: columnSpanToDayCount(pageGrid, placement.columnSpan),
    }),
    contentIsLive: ALWAYS,
  },

  "habit-tracker": {
    label: "Habit tracker",
    fields: [{ kind: "lines", key: "habits", label: "Habits (one per line)", rows: 8 }],
    render: (geometry, propValues, idPrefix, fontFamily) =>
      renderHabitTracker(geometry, propValues as HabitTrackerConfig, idPrefix, fontFamily),
    minContentHeightPx: (pageGrid, columnSpan) => {
      const widthPx = gridCellToPixels(pageGrid, {
        columnStart: 0,
        rowStart: 0,
        columnSpan,
        rowSpan: 1,
      }).width;
      const m = getHabitTrackerRowMetricsPx(widthPx);
      // A compact (sidebar) placement needs room for two full habit pairs,
      // not one - asked for directly: "can the habits side module have a
      // minimum vertical height of two habits (4 rows)." The wide layout
      // keeps the header-plus-one-row floor.
      const pairsNeeded = isHabitTrackerCompact(widthPx) ? 2 : 1;
      return m.headerHeightPx + m.nominalRowHeightPx * pairsNeeded;
    },
    contentIsLive: ALWAYS,
  },

  "month-grid-core": {
    isSpine: true,
    render: (geometry, propValues, idPrefix, fontFamily) =>
      renderMonthGridCore(geometry, propValues as MonthGridCoreConfig, idPrefix, fontFamily),
    // Every week row shares out whatever height the block has, so all of
    // them move when it resizes and the drawing has to follow.
    contentIsLive: ALWAYS,
  },

  "month-title": {
    isTitle: true,
    render: (geometry, propValues, idPrefix, fontFamily) =>
      renderMonthTitle(geometry, propValues as MonthTitleConfig, idPrefix, fontFamily),
    contentIsLive: NEVER,
  },
};

/** Every slug that can actually be drawn. The behaviour classifier sweeps
 *  this rather than its own hand-kept list, so a module is measured from
 *  the day it is registered instead of the day someone remembers it. */
export const REGISTERED_SLUGS = Object.keys(MODULE_REGISTRY);

export function moduleDefinition(slug: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY[slug];
}

/** Whether a module's content must be re-rendered as its box resizes. */
export function moduleContentIsLive(slug: string, propValues: unknown): boolean {
  const definition = MODULE_REGISTRY[slug];
  if (!definition) return false;
  return definition.contentIsLive((propValues ?? {}) as Record<string, unknown>);
}

/** propValues with every derived fact recomputed from the geometry it is
 *  about to be drawn at. Returns the input untouched when a module has no
 *  derived props, so this is free for most of the catalogue. */
export function withDerivedProps(
  slug: string,
  pageGrid: PageGrid,
  placement: { columnSpan: number; rowSpan: number },
  propValues: unknown
): unknown {
  const derive = MODULE_REGISTRY[slug]?.derivedProps;
  if (!derive) return propValues;
  const base = (propValues ?? {}) as Record<string, unknown>;
  return { ...base, ...derive(pageGrid, placement, base) };
}

/** The page's spine and title, whichever cadence it is. Callers used to
 *  search for a slug by name, which meant a page of any other cadence had
 *  neither. */
export function findSpine<T extends { moduleType: { slug: string } }>(
  instances: T[]
): T | undefined {
  return instances.find((mi) => MODULE_REGISTRY[mi.moduleType.slug]?.isSpine);
}

/** Is this slug a page's spine? The by-id form, for callers holding a
 *  slug rather than an instance. */
export function isSpineSlug(slug: string): boolean {
  return MODULE_REGISTRY[slug]?.isSpine ?? false;
}

export function findTitle<T extends { moduleType: { slug: string } }>(
  instances: T[]
): T | undefined {
  return instances.find((mi) => MODULE_REGISTRY[mi.moduleType.slug]?.isTitle);
}

/** propValues as they should be SAVED: every `lines` field trimmed and
 *  emptied of blanks. Blank lines are left alone while someone is typing -
 *  fighting the cursor is worse than a stray line - so the cleanup belongs
 *  at save, and belongs here rather than as a per-module clause in the
 *  panel's save handler. */
export function cleanPropsForSave(
  slug: string,
  propValues: Record<string, unknown>
): Record<string, unknown> {
  const fields = MODULE_REGISTRY[slug]?.fields;
  if (!fields) return propValues;
  const out = { ...propValues };
  for (const field of fields) {
    if (field.kind !== "lines") continue;
    out[field.key] = ((out[field.key] as string[] | undefined) ?? [])
      .map((line) => line.trim())
      .filter(Boolean);
  }
  return out;
}

/** The uniform floor, for a module with no rule of its own. */
export const MIN_ROW_SPAN = 2;

/**
 * How short a module may get, in grid rows.
 *
 * The rule per module lives in its registry entry; turning pixels into
 * rows lives here, once. This used to be a switch over slugs that existed
 * twice - client and server - and the two had drifted: the server called
 * pixelHeightToRowSpan, the client inlined the same arithmetic without its
 * epsilon, so a height meant to land exactly on a row boundary could round
 * up a whole row on one side and not the other. The client's floor gates
 * the live shrink preview and the server's gates the commit, and those
 * disagreeing is the "preview lied" family this exists to close.
 */
export function getMinRowSpanForSlug(
  slug: string,
  pageGrid: PageGrid,
  columnSpan: number
): number {
  const rule = MODULE_REGISTRY[slug]?.minContentHeightPx;
  if (!rule) return MIN_ROW_SPAN;
  return Math.max(MIN_ROW_SPAN, pixelHeightToRowSpan(pageGrid, rule(pageGrid, columnSpan)));
}

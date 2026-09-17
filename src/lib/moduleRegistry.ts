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
import { CATALOGUE } from "@/lib/moduleCatalogue";
import { computeMonthCalendar } from "@/lib/monthCalendar";
import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  dateRangeLabel,
  dayNamed,
  type OccurrenceContext,
} from "@/lib/pageLevels";
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
import {
  renderColumnTable,
  getColumnTableMinHeightPx,
  type ColumnTableConfig,
} from "@/lib/modules/columnTable";
import {
  renderPromptedLines,
  getPromptedLinesMinHeightPx,
  type PromptedLinesConfig,
} from "@/lib/modules/promptedLines";
import {
  renderMiniMonth,
  getMiniMonthMinHeightPx,
  type MiniMonthConfig,
} from "@/lib/modules/miniMonth";
import {
  renderProgressMeter,
  getProgressMeterMinHeightPx,
  type ProgressMeterConfig,
} from "@/lib/modules/progressMeter";
import {
  renderIconStrip,
  getIconStripMinHeightPx,
  type IconStripConfig,
} from "@/lib/modules/iconStrip";
import {
  renderRatingStrip,
  getRatingStripMinHeightPx,
  type RatingStripConfig,
} from "@/lib/modules/ratingStrip";
import {
  renderAxisMatrix,
  getAxisMatrixMinHeightPx,
  type AxisMatrixConfig,
} from "@/lib/modules/axisMatrix";
import {
  renderTextBlock,
  getTextBlockMinHeightPx,
  type TextBlockConfig,
} from "@/lib/modules/textBlock";

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
  // A count, not a measurement: how many segments a meter has, how many
  // lines follow a prompt, where a rating scale starts and stops. Kept
  // apart from `text` because a number arriving from an <input type="text">
  // is a string, and a schema default of 5 then meets a saved value of
  // "5" - the two-descriptions-of-one-fact problem in miniature.
  | { kind: "number"; key: string; label: string; min?: number; max?: number }
  // A closed set, where free text would just be a way to misspell one of
  // the options.
  | { kind: "select"; key: string; label: string; options: Array<{ value: string; label: string }> }
  // Multi-line text kept as ONE string, newlines and all - a passage,
  // where `lines` would turn a prayer into an array of its lines and lose
  // the fact that it is a single piece of writing. The two look identical
  // in the panel and store different things, which is the whole
  // distinction.
  | { kind: "paragraph"; key: string; label: string; rows?: number }
  // No input: something the panel should say about a module whose props
  // are not editable here, in place of an empty panel.
  | { kind: "note"; text: string };

/**
 * The palette's sections, in the order they are shown.
 *
 * "General" first - the primitives, blank - then the catalogue, roughly by
 * how many people want it. Philosophy & faith is large and is the niche
 * this project set out to serve, but it sits where it does because a
 * stranger opening the palette is looking for a to-do list.
 */
export const CATEGORIES = [
  "General",
  "Core planning",
  "Health & body",
  "Food",
  "Fitness",
  "Money",
  "Home & family",
  "Philosophy & faith",
  "Self-help & growth",
  "Creative & leisure",
  "Recovery",
  "Travel",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** The four page sets - see the cadence field. */
export type Cadence = "journal" | "month" | "week" | "day";

/** A ModuleType row, as prisma/seed.mts upserts it. */
export type ModuleTypeRow = {
  name: string;
  configSchema: Record<string, unknown>;
  defaultWidth: number;
  defaultHeight: number;
  defaultColumnSpan: number;
  defaultRowSpan: number;
};

export type ModuleDefinition = {
  /** What to call this module in the editor's own surfaces. */
  label?: string;

  /**
   * Which primitive DRAWS this module. A primitive names itself.
   *
   * A preset is its primitive in every respect that matters to a renderer,
   * so nothing could tell afterwards which one it was - and the tests kept
   * needing to. "Every module ruled into rows" and "every module whose
   * columns are weighted rather than on the lattice" are properties of the
   * PRIMITIVE, and writing them as lists of slugs is the mistake this file
   * has had to undo four times.
   */
  primitive?: string;

  /**
   * Which palette section this module appears under.
   *
   * "General" is the primitives themselves - a blank table, a blank set of
   * prompts - for someone who wants to configure one from scratch. Every
   * other section is a slice of the catalogue, where a module is the same
   * primitive with its words already filled in.
   */
  category?: Category;

  /**
   * Which page set this module belongs to - the rhythm it repeats on.
   *
   * Not read by anything yet. It is recorded now because it is the fact
   * the catalogue was sorted by and it would be lost otherwise: a module
   * printed once per journal costs one sheet, one printed per day costs
   * ninety-one in a quarterly book. See the page-levels work.
   */
  cadence?: Cadence;

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
   * A Page Settings form edits THIS module, so the form is only shown on
   * a cadence whose spine is this module.
   *
   * "Hours" is the only one: start, end, increments, row height. They
   * were shown on every cadence, so a month page offered a full set of
   * hourly controls with no hourly grid to apply them to - inert at best,
   * and this project has already had three separate crashes from hourly
   * config reaching a month page. Reported while checking the month page
   * for regressions.
   *
   * Stated on the module rather than tested as `baseType === "WEEK"`,
   * for the reason every other list of slugs here has had to be undone:
   * a cadence added later gets the right answer without anyone
   * remembering this.
   */
  pageSettingsForm?: "hours";

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

  /**
   * Offered in the palette, as a card the user can drag onto a page.
   *
   * Off by default: a spine, a title and the month calendar are placed by
   * the template and are not the user's to add.
   *
   * `paletteName` is the card's caption and `previewProps` the values its
   * preview is drawn with - the module at its narrowest single-day form,
   * which is why a to-do previews at one day rather than the three it will
   * take once dropped.
   *
   * These lived in a PALETTE_MODULE_TYPES array in the editor, alongside a
   * defaultColumnSpan and defaultRowSpan nothing read: a real drop takes
   * its spans from the database, server-side. Dead, but not harmlessly so -
   * they still said 1, 3 and 4 columns, values from before the 24-column
   * lattice, and they looked authoritative. A preset over an existing
   * primitive should add a line here and nothing else.
   */
  inPalette?: boolean;
  paletteName?: string;
  previewProps?: Record<string, unknown>;

  /**
   * The row this module needs in the database: its name, its fallback
   * sizes, and the JSON Schema its propValues are validated and defaulted
   * against. prisma/seed.mts upserts one of these per registered module.
   *
   * Here rather than in the seed because it was the last thing that made
   * adding a module two entries instead of one, and the two could disagree
   * - the palette's own copy of these spans had already drifted a whole
   * grid generation behind before it was deleted.
   */
  db: ModuleTypeRow;

  /**
   * Draws the module. The primitive; a preset is this plus propValues.
   *
   * Optional: a type can exist in the database before it can be drawn.
   * freeform-element is drawn by renderModuleInstance itself rather than by
   * a primitive, and used to reach the old switch's default case - as did
   * quote-block, which was the standing example here until it turned out to
   * be a text-block preset and got that primitive's renderer with it.
   */
  render?: (
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
  minContentHeightPx?: (
    pageGrid: PageGrid,
    columnSpan: number,
    propValues: Record<string, unknown>
  ) => number;

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
   * This module's props with every DATE taken out of them.
   *
   * An undated planner is one you write the dates into yourself, or that a
   * generated sequence fills in later - see the business model, where the
   * book is derived from templates and a template has no dates. Undated is
   * expressed as the ABSENCE of the values, not as a flag threaded down to
   * every renderer: a renderer draws what it is given, and needs no second
   * description of what "undated" means.
   *
   * It lives HERE, beside the module it belongs to, and not as a list of
   * date-bearing slugs inside loadPlannerPages. That list is the
   * hardcoded-slug-list defect class this codebase has undone in the zone
   * logic, in renderBySlug's old switch, and in the edit affordance. A
   * module added tomorrow with a date in it declares its own answer.
   *
   * Applied at RENDER time only. The stored propValues keep their dates, so
   * turning dates back on restores what was there rather than re-seeding -
   * the same read-time substitution loadPlannerPages already does for
   * rotated day labels, and for the same reason.
   */
  undated?: (propValues: Record<string, unknown>) => Record<string, unknown>;

  /**
   * This module's props, FILLED IN for one occurrence of its level.
   *
   * The exact inverse of `undated`, and the other half of sequence
   * generation: a template carries no dates, and printing it for the week of
   * 12 January is a matter of putting that week's dates into it. The week
   * title learns it is week 3 of 13, the hourly grid learns which dates its
   * day columns are, the month grid gets that month's own calendar.
   *
   * DERIVED, NEVER STORED. The generated book is not written to the database
   * - see generateBook. A module says here how to date itself, and the same
   * template prints as every week of the term without 52 copies of it
   * existing anywhere.
   *
   * It lives beside the module for the same reason `undated` does: the
   * alternative is a list of date-bearing slugs inside the generator, which
   * is the hardcoded-slug-list defect class this codebase has undone in the
   * zone logic, in renderBySlug's old switch and in the edit affordance.
   */
  dated?: (
    propValues: Record<string, unknown>,
    at: OccurrenceContext
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
  contentIsLive?: (propValues: Record<string, unknown>) => boolean;
};

const ALWAYS = () => true;
const NEVER = () => false;

const PRIMITIVES = {
  "hourly-grid-core": {
    pageSettingsForm: "hours",
    db: {
      "name": "Hourly Grid (Core)",
      "configSchema": {
        "type": "object",
        "properties": {
          "dayCount": {
            "type": "integer",
            "enum": [
              3,
              4
            ],
            "default": 3
          },
          "dayLabels": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string"
                },
                "date": {
                  "type": "integer"
                }
              }
            },
            "default": []
          },
          "startTime": {
            "type": "string",
            "default": "05:30"
          },
          "endTime": {
            "type": "string",
            "default": "23:30"
          },
          "intervalMinutes": {
            "type": "integer",
            "default": 30
          },
          "hourLineStyle": {
            "type": "string",
            "enum": [
              "full",
              "low-transparency",
              "gone"
            ],
            "default": "full"
          },
          "dayBorder": {
            "type": "boolean",
            "default": false
          },
          "events": {
            "type": "array",
            "items": {
              "type": "object"
            },
            "default": []
          },
          "intervalMode": {
            "type": "string",
            "enum": [
              "on",
              "off"
            ],
            "default": "on"
          },
          "compactHourRows": {
            "type": "boolean",
            "default": false
          }
        }
      },
      "defaultWidth": 1560,
      "defaultHeight": 1850,
      "defaultColumnSpan": 18,
      "defaultRowSpan": 20
    },
    isSpine: true,
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderHourlyGridCore(
        geometry,
        propValues as HourlyGridCoreConfig,
        idPrefix,
        fontFamily,
        lattice
      ),
    // The day NAMES stay - Sunday is Sunday in any year. Only the number
    // in the corner of each tab goes, and the tab's own border still
    // encloses the space it sat in, so there is somewhere to write one.
    undated: (props) => ({
      ...props,
      dayLabels: ((props.dayLabels as Array<Record<string, unknown>>) ?? []).map((d) => ({
        ...d,
        date: null,
      })),
    }),
    // Each column already NAMES its weekday, so which date it is follows
    // from the week this page is being printed for - the module does not
    // have to be told which half of the spread it is on.
    dated: (props, at) => ({
      ...props,
      dayLabels: ((props.dayLabels as Array<Record<string, unknown>>) ?? []).map((d) => {
        const day = dayNamed(at.start, d.name);
        return { ...d, date: day ? day.getUTCDate() : null };
      }),
    }),
    // Increments off is a blank height-adjustable field, so it scales and
    // the clip serves. Increments on draws ruled rows whose count and
    // pitch both follow the box, so it has to be redrawn. The editor adds
    // one more case of its own - dragging the row-height handle changes
    // the pitch without changing the mode - which is about that gesture
    // rather than about the module.
    contentIsLive: (propValues) => propValues.intervalMode === "off",
  },

  "labeled-box": {
    db: {
      "name": "Labeled Box",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": "Notes"
          },
          "ruled": {
            "type": "boolean",
            "default": false
          },
          "templateHeading": {
            "type": "string",
            "default": ""
          }
        }
      },
      "defaultWidth": 300,
      "defaultHeight": 200,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 8
    },
    label: "Labeled box",
    inPalette: true,
    category: "General",
    paletteName: "Note Box",
    previewProps: { heading: "Notes", ruled: false, templateHeading: "" },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "boolean", key: "ruled", label: "Ruled (lined) body" },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderLabeledBox(geometry, propValues as LabeledBoxConfig, idPrefix, fontFamily, lattice),
    // Its heading drops a point size rather than wrapping when the box
    // narrows, and a ruled box gains rules as it grows, so both axes
    // change the drawing.
    contentIsLive: ALWAYS,
  },

  "week-title": {
    db: {
      "name": "Week Title (Core)",
      "configSchema": {
        "type": "object",
        "properties": {
          "weekNumber": {
            "type": "integer",
            "default": 1
          },
          "weekTotal": {
            "type": "integer",
            "default": 52
          },
          "dateRangeLabel": {
            "type": "string",
            "default": ""
          }
        }
      },
      "defaultWidth": 300,
      "defaultHeight": 170,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 3
    },
    isTitle: true,
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderWeekTitle(geometry, propValues as WeekTitleConfig, idPrefix, fontFamily, lattice),
    // Both halves go: "WEEK 1/52" is as much a date as "DEC 31 - JAN 6",
    // and a template that is week 1 of 52 is not undated.
    undated: (props) => ({ ...props, weekNumber: null, weekTotal: null, dateRangeLabel: "" }),
    // "WEEK 3/13" and the range it covers. The week runs seven days from the
    // occurrence's own first day, which is not necessarily a Sunday - see
    // occurrences(), where a book beginning on a Wednesday has its first
    // week begin that Wednesday.
    dated: (props, at) => ({
      ...props,
      weekNumber: at.index + 1,
      weekTotal: at.total,
      dateRangeLabel: dateRangeLabel(at.start, new Date(at.start.getTime() + 6 * 86_400_000)),
    }),
    contentIsLive: NEVER,
  },

  "todo-checklist": {
    db: {
      "name": "To-Do Checklist",
      "configSchema": {
        "type": "object",
        "properties": {
          "dayCount": {
            "type": "integer",
            "enum": [
              1,
              3,
              4
            ],
            "default": 3
          },
          "heading": {
            "type": "string",
            "default": "To - Do"
          }
        }
      },
      "defaultWidth": 1560,
      "defaultHeight": 964,
      "defaultColumnSpan": 18,
      "defaultRowSpan": 13
    },
    label: "To-do checklist",
    inPalette: true,
    category: "General",
    paletteName: "To-Do",
    previewProps: { dayCount: 1 },
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      {
        kind: "note",
        text: "The day columns follow whichever page this is on.",
      },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderTodoChecklist(geometry, propValues as TodoChecklistConfig, idPrefix, fontFamily, lattice),
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
    db: {
      "name": "Habit Tracker",
      "configSchema": {
        "type": "object",
        "properties": {
          "habits": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "default": []
          },
          "heading": {
            "type": "string",
            "default": "Habits"
          },
          "columns": {
            "type": "array",
            "items": {
              "type": "string"
            },
            "default": []
          }
        }
      },
      "defaultWidth": 1560,
      "defaultHeight": 964,
      "defaultColumnSpan": 24,
      "defaultRowSpan": 13
    },
    label: "Habit tracker",
    inPalette: true,
    category: "General",
    paletteName: "Habits",
    previewProps: { heading: "Habits" },
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "lines", key: "habits", label: "Rows (one per line)", rows: 8 },
      { kind: "lines", key: "columns", label: "Columns (one per line, blank for a week)", rows: 4 },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderHabitTracker(geometry, propValues as HabitTrackerConfig, idPrefix, fontFamily, lattice),
    minContentHeightPx: (pageGrid, columnSpan, propValues) => {
      const widthPx = gridCellToPixels(pageGrid, {
        columnStart: 0,
        rowStart: 0,
        columnSpan,
        rowSpan: 1,
      }).width;
      // A tracker's rows are its CONTENT, so they set its floor.
      //
      // This rule used to read only the box, and the result was that all
      // 24 named trackers in the catalogue could be dragged to two rows
      // and would then print none of their own row names - a medication
      // log with no Morning/Midday/Evening, a salah tracker with none of
      // the five prayers. Nothing errored; the module just came out a
      // grid with a heading, which is the same drawing every other
      // tracker collapses to, so you could not tell which one it was.
      //
      // Blank rows do not count. A tracker can be placed with `habits`
      // empty on purpose - that is the bare primitive, ruled space to
      // write your own - and it has no content to protect.
      const named = ((propValues.habits as unknown[]) ?? []).filter(
        (name) => typeof name === "string" && name.trim().length > 0
      ).length;
      // Its own columns, not a week. Feeding the real count is the other
      // half of this fix: the compact row is a name row plus ONE SQUARE
      // CELL and the cell is width/columns, so assuming seven understated
      // the row height for a five-prayer tracker and overstated it for a
      // twelve-month one. getHabitTrackerRowMetricsPx has taken this
      // argument all along and had no way to be given it.
      const columns = (propValues.columns as unknown[]) ?? [];
      const m = getHabitTrackerRowMetricsPx(
        widthPx,
        columns.length > 0 ? columns.length : undefined
      );
      // A compact (sidebar) placement needs room for two full habit pairs,
      // not one - asked for directly: "can the habits side module have a
      // minimum vertical height of two habits (4 rows)." The wide layout
      // keeps the header-plus-one-row floor. That is the floor for a
      // tracker with nothing named; a named one needs all of its rows.
      const pairsNeeded = isHabitTrackerCompact(widthPx) ? 2 : 1;
      return m.headerHeightPx + m.nominalRowHeightPx * Math.max(pairsNeeded, named);
    },
    contentIsLive: ALWAYS,
  },

  "month-grid-core": {
    db: {
      "name": "Month Grid (Core)",
      "configSchema": {
        "type": "object",
        "properties": {
          "dayCount": {
            "type": "integer",
            "enum": [
              3,
              4
            ],
            "default": 3
          },
          "dayLabels": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string"
                }
              }
            },
            "default": []
          },
          "weekCount": {
            "type": "integer",
            "enum": [
              4,
              5,
              6
            ],
            "default": 5
          },
          "cells": {
            "type": "array",
            "items": {
              "type": "array"
            },
            "default": []
          }
        }
      },
      "defaultWidth": 1560,
      "defaultHeight": 1652,
      "defaultColumnSpan": 18,
      "defaultRowSpan": 22
    },
    isSpine: true,
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderMonthGridCore(geometry, propValues as MonthGridCoreConfig, idPrefix, fontFamily, lattice),
    // The grid keeps every cell and every date box; only the numbers go.
    // inCurrentMonth is kept as it is - it decides the shape of the grid,
    // not what it says, and dropping it would change the row count.
    undated: (props) => ({
      ...props,
      cells: ((props.cells as Array<Array<Record<string, unknown>>>) ?? []).map((week) =>
        week.map((cell) => ({ ...cell, date: null }))
      ),
    }),
    // This month's real calendar, sliced to the weekday columns this page
    // shows - the same slice pageLayouts makes when it seeds the template,
    // and derived from the same day names rather than from which page it is.
    dated: (props, at) => {
      const names = ((props.dayLabels as Array<{ name?: unknown }>) ?? []).map((d) =>
        String(d.name ?? "").trim().toUpperCase()
      );
      const first = WEEKDAY_NAMES.indexOf(names[0] ?? "");
      if (first < 0) return props;
      const calendar = computeMonthCalendar(
        at.start.getUTCFullYear(),
        at.start.getUTCMonth() + 1
      );
      return {
        ...props,
        weekCount: calendar.weekCount,
        cells: calendar.weeks.map((week) => week.slice(first, first + names.length)),
      };
    },
    // Every week row shares out whatever height the block has, so all of
    // them move when it resizes and the drawing has to follow.
    contentIsLive: ALWAYS,
  },

  "month-title": {
    db: {
      "name": "Month Title (Core)",
      "configSchema": {
        "type": "object",
        "properties": {
          "monthName": {
            "type": "string",
            "default": "JANUARY"
          }
        }
      },
      "defaultWidth": 300,
      "defaultHeight": 170,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 3
    },
    isTitle: true,
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderMonthTitle(geometry, propValues as MonthTitleConfig, idPrefix, fontFamily, lattice),
    // A month NAME is a date. "JANUARY" pins the page to a month as surely
    // as a day number pins it to a day.
    undated: (props) => ({ ...props, monthName: "" }),
    // Uppercase, which is how the reference sets it and how the renderer
    // expects it - the field's own comment says "already formatted".
    dated: (props, at) => ({
      ...props,
      monthName: MONTH_NAMES[at.start.getUTCMonth()].toUpperCase(),
    }),
    contentIsLive: NEVER,
  },

  // Named columns with ruled rows. The catalogue's workhorse: a spending
  // log, a workout log, a reading list, a Step 4 inventory and twenty-odd
  // more are this drawing with a different set of column heads.
  "column-table": {
    db: {
      "name": "Column Table",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": "Log"
          },
          "columns": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["Date", "Item", "Amount"]
          },
          "weights": {
            "type": "array",
            "items": { "type": "number" },
            "default": [1, 1.6, 1]
          },
          "totalsRow": {
            "type": "boolean",
            "default": false
          },
          "totalsLabel": {
            "type": "string",
            "default": "Total"
          }
        }
      },
      "defaultWidth": 600,
      "defaultHeight": 560,
      "defaultColumnSpan": 10,
      "defaultRowSpan": 8
    },
    label: "Column table",
    inPalette: true,
    category: "General",
    paletteName: "Table",
    previewProps: {
      heading: "Log",
      columns: ["Date", "Item", "Amount"],
      // 1:3:1 gave "Amount" a fifth of a narrow sidebar box, which is less
      // room than the word needs at any size the head ladder offers - so
      // it truncated to "Amo...". The weights are the fix, not a smaller
      // font: a column has to be wide enough for its own name.
      weights: [1, 1.6, 1],
      totalsRow: false,
    },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "lines", key: "columns", label: "Columns (one per line)", rows: 5 },
      { kind: "boolean", key: "totalsRow", label: "Totals row" },
      { kind: "text", key: "totalsLabel", label: "Totals label" },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderColumnTable(geometry, propValues as ColumnTableConfig, idPrefix, fontFamily, lattice),
    minContentHeightPx: () => getColumnTableMinHeightPx(),
    // Rows follow the height and the column dividers follow the width, so
    // both axes redraw it.
    contentIsLive: ALWAYS,
  },

  // A printed question with ruled space under it, repeated. Sixteen
  // catalogue modules, most of them with wording fixed by tradition -
  // which is the case a preset serves best: the geometry is one thing and
  // the words are data.
  "prompted-lines": {
    db: {
      "name": "Prompted Lines",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": "Reflection"
          },
          "prompts": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["What went well?", "What would I change?"]
          },
          "linesPerPrompt": {
            "type": "integer",
            "default": 2
          }
        }
      },
      "defaultWidth": 600,
      "defaultHeight": 560,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 8
    },
    label: "Prompted lines",
    inPalette: true,
    category: "General",
    paletteName: "Prompts",
    previewProps: {
      heading: "Reflection",
      prompts: ["What went well?", "What would I change?"],
      linesPerPrompt: 2,
    },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "lines", key: "prompts", label: "Prompts (one per line)", rows: 6 },
      { kind: "number", key: "linesPerPrompt", label: "Lines per prompt", min: 1, max: 8 },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderPromptedLines(geometry, propValues as PromptedLinesConfig, idPrefix, fontFamily, lattice),
    minContentHeightPx: (_pageGrid, _columnSpan, propValues) =>
      getPromptedLinesMinHeightPx(Number(propValues.linesPerPrompt ?? 2)),
    contentIsLive: ALWAYS,
  },

  // A month's dates printed small, to look at rather than write in - and,
  // with markable on, the dot calendars.
  "mini-month": {
    db: {
      "name": "Mini Month",
      "configSchema": {
        "type": "object",
        "properties": {
          "year": {
            "type": "integer",
            "default": 2026
          },
          "month": {
            "type": "integer",
            "default": 1
          },
          "heading": {
            "type": "string",
            "default": ""
          },
          "markable": {
            "type": "boolean",
            "default": false
          },
          "keepDates": {
            "type": "boolean",
            "default": false
          }
        }
      },
      "defaultWidth": 600,
      "defaultHeight": 370,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 5
    },
    label: "Mini month",
    inPalette: true,
    category: "General",
    paletteName: "Mini Month",
    previewProps: { year: 2026, month: 1, heading: "", markable: false, keepDates: false },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading (blank for the month name)" },
      { kind: "number", key: "year", label: "Year", min: 1900, max: 2100 },
      { kind: "number", key: "month", label: "Month (1-12)", min: 1, max: 12 },
      { kind: "boolean", key: "markable", label: "Box under each date" },
      {
        kind: "boolean",
        key: "keepDates",
        label: "Keep real dates on an undated planner",
      },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderMiniMonth(geometry, propValues as MiniMonthConfig, idPrefix, fontFamily, lattice),
    // The one module with an OPT-OUT, asked for directly - "the option for
    // either 1 or 2". A mini month with no numbers is a seven-column grid
    // you date yourself, which is a real thing (it is the dot calendar,
    // with `markable` on); a mini month that keeps its dates is a reference
    // calendar beside an undated page, which is also a real thing. Neither
    // is wrong, so the instance says which it is.
    undated: (props) =>
      props.keepDates === true ? props : { ...props, month: null },
    // The month this page is being printed for. `keepDates` means the
    // instance was pinned to a month of its own on purpose - a reference
    // calendar beside the page rather than a calendar OF it - so it is left
    // exactly as it was set.
    dated: (props, at) =>
      props.keepDates === true
        ? props
        : {
            ...props,
            year: at.start.getUTCFullYear(),
            month: at.start.getUTCMonth() + 1,
          },
    minContentHeightPx: (_pageGrid, _columnSpan, propValues) =>
      getMiniMonthMinHeightPx(propValues.markable === true),
    // Seven columns of a fixed grid: the drawing is the same marks at
    // every size, only further apart, so nothing has to be recounted.
    // The clip window serves it more cheaply than a redraw.
    contentIsLive: NEVER,
  },

  // One long count wrapped across rows: days sober, pages read, dollars
  // saved, sessions done.
  "progress-meter": {
    db: {
      "name": "Progress Meter",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": "Progress"
          },
          "total": {
            "type": "integer",
            "default": 30
          },
          "milestoneEvery": {
            "type": "integer",
            "default": 10
          },
          "numbered": {
            "type": "boolean",
            "default": true
          }
        }
      },
      "defaultWidth": 1200,
      "defaultHeight": 260,
      "defaultColumnSpan": 12,
      "defaultRowSpan": 4
    },
    label: "Progress meter",
    inPalette: true,
    category: "General",
    paletteName: "Meter",
    previewProps: { heading: "Progress", total: 30, milestoneEvery: 10, numbered: true },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "number", key: "total", label: "Segments", min: 1, max: 400 },
      { kind: "number", key: "milestoneEvery", label: "Heavier rule every", min: 0, max: 100 },
      { kind: "boolean", key: "numbered", label: "Number the milestones" },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderProgressMeter(geometry, propValues as ProgressMeterConfig, idPrefix, fontFamily, lattice),
    // How many rows a count needs depends on how many segments fit across
    // the box, so this one genuinely needs the width - which is why the
    // rule takes the page grid rather than a constant.
    minContentHeightPx: (pageGrid, columnSpan, propValues) =>
      getProgressMeterMinHeightPx(
        Number(propValues.total ?? 30),
        gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan, rowSpan: 1 }).width
      ),
    // Widening it moves every segment to a different row. Nothing about
    // this drawing survives a resize unchanged.
    contentIsLive: ALWAYS,
  },

  // A list of things rated on one shared scale - mood, energy, pain,
  // sleep, focus, craving, satisfaction.
  "icon-strip": {
    db: {
      "name": "Icon Strip",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": { "type": "string", "default": "Water" },
          "icon": {
            "type": "string",
            "enum": [
              "circle", "square", "rounded",
              "droplet", "heart", "star", "moon", "flame", "leaf", "plant"
            ],
            "default": "circle"
          },
          "count": { "type": "integer", "default": 8 },
          "groups": { "type": "integer", "default": 0 },
          "border": { "type": "boolean", "default": false }
        }
      },
      "defaultWidth": 1560,
      "defaultHeight": 150,
      "defaultColumnSpan": 24,
      "defaultRowSpan": 2
    },
    label: "Icon strip",
    inPalette: true,
    category: "General",
    paletteName: "Icon Strip",
    previewProps: { heading: "Water", icon: "droplet", count: 8 },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      {
        kind: "select",
        key: "icon",
        label: "Icon",
        options: [
          { value: "circle", label: "Circles" },
          { value: "square", label: "Squares" },
          { value: "rounded", label: "Rounded squares" },
          { value: "droplet", label: "Droplets" },
          { value: "heart", label: "Hearts" },
          { value: "star", label: "Stars" },
          { value: "moon", label: "Moons" },
          { value: "flame", label: "Flames" },
          { value: "leaf", label: "Leaves" },
          { value: "plant", label: "Potted plants" },
        ],
      },
      { kind: "number", key: "count", label: "Icons per group", min: 1, max: 24 },
      { kind: "number", key: "groups", label: "Groups across (0 = one per column)", min: 0, max: 12 },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderIconStrip(geometry, propValues as IconStripConfig, idPrefix, fontFamily, lattice),
    minContentHeightPx: () => getIconStripMinHeightPx(),
    contentIsLive: ALWAYS,
  },

  "rating-strip": {
    db: {
      "name": "Rating Strip",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": "Ratings"
          },
          "items": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["Mood", "Energy", "Sleep", "Focus"]
          },
          "scaleMin": {
            "type": "integer",
            "default": 1
          },
          "scaleMax": {
            "type": "integer",
            "default": 5
          },
          "shape": {
            "type": "string",
            "enum": ["circle", "square"],
            "default": "circle"
          }
        }
      },
      "defaultWidth": 600,
      "defaultHeight": 560,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 8
    },
    label: "Rating strip",
    inPalette: true,
    category: "General",
    paletteName: "Ratings",
    previewProps: {
      heading: "Ratings",
      items: ["Mood", "Energy", "Sleep"],
      scaleMin: 1,
      scaleMax: 5,
      shape: "circle",
    },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "lines", key: "items", label: "Rows (one per line)", rows: 6 },
      { kind: "number", key: "scaleMin", label: "Scale from", min: 0, max: 10 },
      { kind: "number", key: "scaleMax", label: "Scale to", min: 1, max: 20 },
      {
        kind: "select",
        key: "shape",
        label: "Mark",
        options: [
          { value: "circle", label: "Circles" },
          { value: "square", label: "Squares" },
        ],
      },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderRatingStrip(geometry, propValues as RatingStripConfig, idPrefix, fontFamily, lattice),
    minContentHeightPx: () => getRatingStripMinHeightPx(),
    contentIsLive: ALWAYS,
  },

  // Two axes crossed, four boxes to write in: Eisenhower, SWOT,
  // start/stop/continue, effort against impact.
  "axis-matrix": {
    db: {
      "name": "Two-Axis Matrix",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": "Matrix"
          },
          "xLeft": {
            "type": "string",
            "default": "Less"
          },
          "xRight": {
            "type": "string",
            "default": "More"
          },
          "yTop": {
            "type": "string",
            "default": "Above"
          },
          "yBottom": {
            "type": "string",
            "default": "Below"
          },
          "quadrants": {
            "type": "array",
            "items": { "type": "string" },
            "default": ["", "", "", ""]
          }
        }
      },
      "defaultWidth": 1200,
      "defaultHeight": 740,
      "defaultColumnSpan": 12,
      "defaultRowSpan": 10
    },
    label: "Two-axis matrix",
    inPalette: true,
    category: "General",
    paletteName: "Matrix",
    previewProps: {
      heading: "Matrix",
      xLeft: "Less",
      xRight: "More",
      yTop: "Above",
      yBottom: "Below",
      quadrants: ["", "", "", ""],
    },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading" },
      { kind: "text", key: "xLeft", label: "Across: left end" },
      { kind: "text", key: "xRight", label: "Across: right end" },
      // The down axis is set one letter per line in a gutter, so a long
      // word costs height that a wide one does not - see
      // AXIS_LABEL_DEFAULT_UNITS.
      { kind: "text", key: "yTop", label: "Down: upper half (short)" },
      { kind: "text", key: "yBottom", label: "Down: lower half (short)" },
      // READING ORDER, not clockwise, which is what this said and what the
      // renderer has never done: corners run tl, tr, bl, br. Clockwise
      // would swap the bottom two, which on the Eisenhower matrix puts
      // Delete under "urgent" and Delegate under "not urgent" - the two
      // most consequential boxes, exactly reversed.
      { kind: "lines", key: "quadrants", label: "Box names (4: top-left, top-right, bottom-left, bottom-right)", rows: 4 },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderAxisMatrix(geometry, propValues as AxisMatrixConfig, idPrefix, fontFamily, lattice),
    minContentHeightPx: () => getAxisMatrixMinHeightPx(),
    // The cross sits at the middle of the body, so it moves with every
    // change of height and width both.
    contentIsLive: ALWAYS,
  },

  // Set text, printed rather than written on: a prayer, a creed, an
  // affirmation, the steps of a method.
  "text-block": {
    db: {
      "name": "Text Block",
      "configSchema": {
        "type": "object",
        "properties": {
          "heading": {
            "type": "string",
            "default": ""
          },
          "body": {
            "type": "string",
            "default": ""
          },
          "attribution": {
            "type": "string",
            "default": ""
          },
          "align": {
            "type": "string",
            "enum": ["left", "center"],
            "default": "left"
          }
        }
      },
      "defaultWidth": 600,
      "defaultHeight": 370,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 5
    },
    label: "Text block",
    inPalette: true,
    category: "General",
    paletteName: "Text",
    previewProps: {
      heading: "",
      body: "Set text goes here, wrapped to the width of the box.",
      attribution: "",
      align: "left",
    },
    resizableWidth: true,
    fields: [
      { kind: "text", key: "heading", label: "Heading (optional)" },
      { kind: "paragraph", key: "body", label: "Text", rows: 8 },
      { kind: "text", key: "attribution", label: "Attribution (optional)" },
      {
        kind: "select",
        key: "align",
        label: "Alignment",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Centred" },
        ],
      },
    ],
    render: (geometry, propValues, idPrefix, fontFamily, lattice) =>
      renderTextBlock(geometry, propValues as TextBlockConfig, idPrefix, fontFamily, lattice),
    // How many lines a passage takes is a function of the width it is
    // wrapped to, so the floor needs the box - the same reasoning as the
    // progress meter's.
    minContentHeightPx: (pageGrid, columnSpan, propValues) =>
      getTextBlockMinHeightPx(
        propValues as unknown as TextBlockConfig,
        gridCellToPixels(pageGrid, { columnStart: 0, rowStart: 0, columnSpan, rowSpan: 1 }).width
      ),
    // Narrowing it rewraps every line. Height alone only reveals or hides
    // lines already placed, but the two cannot be separated here.
    contentIsLive: ALWAYS,
  },

  // Drawn by renderModuleInstance directly rather than by a primitive - it
  // carries its own Polotno element in propValues, which is what makes it
  // freeform.
  "freeform-element": {
    db: {
      "name": "Freeform Canvas Element",
      "configSchema": {
        "type": "object",
        "properties": {
          "polotnoElement": {
            "type": "object"
          }
        }
      },
      "defaultWidth": 200,
      "defaultHeight": 200,
      "defaultColumnSpan": 6,
      "defaultRowSpan": 1
    },
  },
} satisfies Record<string, ModuleDefinition>;

/**
 * A module that IS another module with different data.
 *
 * The catalogue is mostly this. A water tracker, a medication log, a salah
 * tracker and a plant-watering chart are one row-by-column primitive with
 * four label sets - so a preset inherits everything about how its
 * primitive behaves (what draws it, how short it may get, whether its
 * content is live, what its properties panel offers) and states only what
 * makes it a different module: its name, its defaults, its card.
 *
 * db merges rather than replaces, since a preset usually changes the name
 * and the schema's defaults while keeping the primitive's sizes.
 *
 * The point of the helper is that a preset cannot accidentally diverge
 * from its primitive by copying its behaviour and then falling behind it.
 */
function preset(
  of: keyof typeof PRIMITIVES,
  over: Partial<Omit<ModuleDefinition, "db">> & { db: Partial<ModuleTypeRow> }
): ModuleDefinition {
  const base = PRIMITIVES[of] as ModuleDefinition;
  return { ...base, ...over, primitive: of, db: { ...base.db, ...over.db } };
}

/**
 * A CATALOGUE MODULE: a primitive, a place in the palette, and its words.
 *
 * This is `preset` with the boilerplate removed, because the catalogue is
 * a hundred of them and the boilerplate was most of each one. A catalogue
 * entry states what makes it a different module - its name, its section,
 * the rhythm it repeats on, and the content - and inherits absolutely
 * everything about how it is DRAWN.
 *
 * `props` does double duty on purpose. They become the schema defaults, so
 * a freshly dropped instance arrives filled in, AND the preview props, so
 * the palette card shows the same thing the drop will produce. Setting
 * those separately is how the quote preset ended up with a card showing a
 * quote and a module that arrived blank.
 *
 * The schema is DEEP-merged into the primitive's, one default at a time,
 * rather than replaced - replacing it wholesale drops the primitive's own
 * property types and validation along with them.
 */
function catalogue(
  of: keyof typeof PRIMITIVES,
  spec: {
    name: string;
    category: Category;
    cadence: Cadence;
    props: Record<string, unknown>;
    /** The palette card's caption. Defaults to the module's own name. */
    paletteName?: string;
    /** Rows or columns the module wants beyond the primitive's default. */
    rowSpan?: number;
    columnSpan?: number;
    /** False to keep it registered and drawable but off the palette - see
     *  CatalogueEntry.inPalette. */
    inPalette?: boolean;
  }
): ModuleDefinition {
  const base = PRIMITIVES[of] as ModuleDefinition;
  const schema = base.db.configSchema as {
    type?: string;
    properties?: Record<string, Record<string, unknown>>;
  };
  const properties = { ...(schema.properties ?? {}) };
  for (const [key, value] of Object.entries(spec.props)) {
    properties[key] = { ...(properties[key] ?? {}), default: value };
  }
  return {
    ...base,
    primitive: of,
    label: spec.name,
    category: spec.category,
    cadence: spec.cadence,
    // Default true: a catalogue entry exists to be offered. The opt-out is
    // for a module that has been superseded and must stay registered so the
    // planners already using it keep drawing.
    inPalette: spec.inPalette ?? true,
    paletteName: spec.paletteName ?? spec.name,
    previewProps: spec.props,
    db: {
      ...base.db,
      name: spec.name,
      configSchema: { ...schema, properties },
      defaultRowSpan: spec.rowSpan ?? base.db.defaultRowSpan,
      defaultColumnSpan: spec.columnSpan ?? base.db.defaultColumnSpan,
    },
  };
}

export const MODULE_REGISTRY: Record<string, ModuleDefinition> = {
  // A primitive is its own primitive, stated here rather than on each
  // entry so no one has to remember to repeat their own name.
  ...Object.fromEntries(
    Object.entries(PRIMITIVES).map(([slug, definition]) => [
      slug,
      { ...(definition as ModuleDefinition), primitive: slug },
    ])
  ),

  // Was a primitive registered with no renderer - the placeholder this
  // file used to point at as "where a catalogue module starts life". It
  // has a renderer now, and the renderer turned out to be a general one:
  // a quote is set text with an attribution, which is what text-block is.
  // So it stops being its own drawing and becomes what it always was, a
  // preset.
  //
  // Its stored prop was `text` where text-block's is `body`. Renaming a
  // saved key would normally blank existing modules, and did not here
  // because nothing had ever placed one - it had no renderer at the time.
  //
  // That sentence used to end "and has never been in the palette", which
  // stopped being true the moment it became a preset: `preset` spreads the
  // base definition first, so it inherited text-block's own
  // `inPalette: true` and General category in the same stroke that gave it
  // a renderer. Both are stated explicitly below now - not to change
  // anything, but so this is a fact about quote-block rather than a
  // consequence of a line in text-block that someone may later move.
  "quote-block": preset("text-block", {
    db: {
      name: "Quote / Inspiration Block",
      // A preset that changes the words has to change the SCHEMA defaults,
      // not just previewProps: previewProps draw the palette card, and the
      // schema is what a freshly placed instance is filled with. Setting
      // one and not the other gives a card that shows a quote and a module
      // that arrives blank.
      configSchema: {
        type: "object",
        properties: {
          heading: { type: "string", default: "" },
          // THE RULE FOR ANY DEFAULT QUOTE, learned from the one this
          // replaces. It shipped "The obstacle is the way." over the name
          // Marcus Aurelius; that sentence is Ryan Holiday's, the title of
          // his 2014 book glossing Meditations 5.20, and Marcus did not
          // write it in any translation. A planner prints its quote a
          // thousand times, and unlike a bug nobody can patch the copies.
          //
          // Copyright is barely the question on a line this short - a
          // single sentence sits below the threshold of originality. The
          // question is whether the credit is TRUE. So either quote a
          // public-domain translation word for word and name its author, or
          // paraphrase freely and say that you have.
          //
          // This is the second: the familiar English rendering of Tao Te
          // Ching 64, which is nobody's translation in particular. "After"
          // is the ordinary way of saying the thought is his and the words
          // are not - the distinction the Marcus Aurelius line collapsed.
          body: {
            type: "string",
            default: "A journey of a thousand miles begins with a single step.",
          },
          attribution: { type: "string", default: "after Lao Tzu" },
          align: { type: "string", enum: ["left", "center"], default: "center" },
        },
      },
      defaultColumnSpan: 24,
      defaultRowSpan: 4,
    },
    label: "Quote",
    paletteName: "Quote",
    // Both INHERITED from text-block already - see above. Restated here so
    // the palette placement belongs to this module.
    //
    // GENERAL, beside text-block, rather than Philosophy & faith: what
    // makes it its own module is its FORM - a line with a credit under it -
    // not its subject. A quote block is as much at home over a training log
    // as over an examen.
    inPalette: true,
    category: "General",
    previewProps: {
      heading: "",
      body: "A journey of a thousand miles begins with a single step.",
      attribution: "after Lao Tzu",
      align: "center",
    },
  }),

};

/**
 * The ModuleType rows prisma/seed.mts upserts, one per registered module.
 *
 * Derived from the registry rather than kept beside it, so a module cannot
 * be registered and left unseeded - which would mean no ModuleType row, no
 * id to reference, and a module that exists in the editor and cannot be
 * placed.
 */
// The catalogue, folded in. Each entry is a primitive plus its words -
// see moduleCatalogue.ts, and `catalogue()` above for what it expands to.
for (const entry of CATALOGUE) {
  if (!(entry.primitive in PRIMITIVES)) {
    throw new Error(`Catalogue entry "${entry.slug}" names no primitive: ${entry.primitive}`);
  }
  if (MODULE_REGISTRY[entry.slug]) {
    throw new Error(`Catalogue entry "${entry.slug}" collides with an existing module`);
  }
  MODULE_REGISTRY[entry.slug] = catalogue(entry.primitive as keyof typeof PRIMITIVES, entry);
}

export const MODULE_TYPE_SEED = Object.entries(MODULE_REGISTRY).map(([slug, definition]) => ({
  slug,
  ...definition.db,
}));

/** The palette's cards, in registration order. Derived rather than kept
 *  beside the registry, so a module cannot be registered and then quietly
 *  left out of the palette - or listed there under stale values. */
export const PALETTE_MODULES = Object.entries(MODULE_REGISTRY)
  .filter(([, definition]) => definition.inPalette)
  .map(([slug, definition]) => ({
    slug,
    label: definition.paletteName ?? definition.label ?? slug,
    previewProps: definition.previewProps ?? {},
    category: definition.category ?? "General",
  }));

/** The palette's cards grouped into its sections, sections in CATEGORIES
 *  order and empty ones left out. */
export const PALETTE_SECTIONS = CATEGORIES.map((category) => ({
  category,
  modules: PALETTE_MODULES.filter((m) => m.category === category),
})).filter((section) => section.modules.length > 0);

/** Every slug that can actually be drawn. The behaviour classifier sweeps
 *  this rather than its own hand-kept list, so a module is measured from
 *  the day it is registered instead of the day someone remembers it. */
export const REGISTERED_SLUGS = Object.keys(MODULE_REGISTRY);

/** Every registered module drawn by this primitive, the primitive itself
 *  included - the question the geometry tests actually want to ask. */
export function slugsDrawnBy(...primitives: string[]): string[] {
  const wanted = new Set(primitives);
  return Object.entries(MODULE_REGISTRY)
    .filter(([, definition]) => wanted.has(definition.primitive ?? ""))
    .map(([slug]) => slug);
}

export function moduleDefinition(slug: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY[slug];
}

/** Whether a module's content must be re-rendered as its box resizes. */
export function moduleContentIsLive(slug: string, propValues: unknown): boolean {
  // A module with no renderer has nothing to re-draw, so the default is no.
  const contentIsLive = MODULE_REGISTRY[slug]?.contentIsLive;
  if (!contentIsLive) return false;
  return contentIsLive((propValues ?? {}) as Record<string, unknown>);
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

/**
 * One instance's props as an UNDATED planner should draw them.
 *
 * Returns the props untouched for a module that has no dates in it, which
 * is all but a handful - so a caller can apply this to every instance
 * without knowing or caring which ones are affected.
 */
export function withoutDates(slug: string, propValues: unknown): unknown {
  const strip = MODULE_REGISTRY[slug]?.undated;
  if (!strip) return propValues;
  return strip((propValues ?? {}) as Record<string, unknown>);
}

/**
 * One instance's props as they should print for a given occurrence.
 *
 * Returns the props untouched for a module with no dates in it, which is all
 * but a handful - so the generator applies this to every instance without
 * knowing or caring which ones are affected.
 */
export function withDates(
  slug: string,
  propValues: unknown,
  at: OccurrenceContext
): unknown {
  const fill = MODULE_REGISTRY[slug]?.dated;
  if (!fill) return propValues;
  return fill((propValues ?? {}) as Record<string, unknown>, at);
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
/**
 * Does this page's spine own a Page Settings form, and which one?
 *
 * Undefined for a cadence whose spine has none - a month page, today -
 * which is the signal to leave that section out entirely.
 */
export function spinePageSettingsForm<T extends { moduleType: { slug: string } }>(
  instances: T[]
): ModuleDefinition["pageSettingsForm"] {
  const spine = findSpine(instances);
  return spine ? MODULE_REGISTRY[spine.moduleType.slug]?.pageSettingsForm : undefined;
}

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

/**
 * Can this module be dragged between a page's zones - sidebar to bottom
 * and back - and dropped into one from the palette?
 *
 * Everything the user can place. Which is every registered module except
 * the ones that are not the user's to move: a spine, a page title, and
 * freeform-element, which is not grid-placed at all.
 *
 * This was a hardcoded list of three slugs in grid.ts, written when three
 * modules existed. Every module added after it silently could not be
 * dragged OR dropped - the client asks this before it will show a phantom
 * over the canvas, so the drag produced no preview and no module, with no
 * error anywhere. Reported as the matrix not dropping, then "other new
 * modules dont work either".
 *
 * Derived rather than listed, so a module registered tomorrow is
 * placeable by default and has to opt OUT by being a spine or a title.
 */
export function canCrossZones(slug: string): boolean {
  const definition = MODULE_REGISTRY[slug];
  if (!definition) return false;
  if (definition.isSpine || definition.isTitle) return false;
  return slug !== "freeform-element";
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
  columnSpan: number,
  // Optional, and NOT yet threaded by any caller.
  //
  // Some modules' floors are a function of their content rather than of
  // their box: a progress meter of a hundred segments needs more rows than
  // one of thirty, and a set passage needs as many lines as it wraps to.
  //
  // NOW THREADED, at every call site on both sides at once - which is the
  // only way it could be done. The client's floor gates the live shrink
  // preview and the server's gates the commit; teaching one of them a
  // module's real content and not the other would make them disagree about
  // how short it may get, which is precisely the "preview lied" family
  // this function exists to close. So the two went together, and
  // minRowSpanFloors.test.mts fails if a floor is ever reachable without
  // content.
  //
  // What is passed is an instance's STORED propValues, which need not be
  // complete: a row saved before a prop existed simply lacks the key. So
  // whatever arrives is layered over the module's own schema defaults
  // below rather than used raw - see moduleSchemaDefaults. A caller with
  // nothing to pass (a palette preview of a module not yet placed) then
  // still gets the right answer, because a fresh module IS its defaults.
  propValues: Record<string, unknown> = {}
): number {
  const rule = MODULE_REGISTRY[slug]?.minContentHeightPx;
  if (!rule) return MIN_ROW_SPAN;
  const content = { ...moduleSchemaDefaults(slug), ...propValues };
  return Math.max(
    MIN_ROW_SPAN,
    // Never taller than the page itself. A rule states what the content
    // needs, and for a 31-row tracker squeezed into a sidebar that can
    // come out larger than any box on the page - a floor nothing can
    // satisfy, which would make the module undroppable rather than short.
    // Clamping keeps "too big for this page" behaving as it does today
    // (it is placed full height and draws what fits) instead of turning
    // into a new failure.
    Math.min(
      pageGrid.gridRows,
      pixelHeightToRowSpan(pageGrid, rule(pageGrid, columnSpan, content))
    )
  );
}

/**
 * A module's own schema defaults, as a propValues object.
 *
 * The floor rules read content - how many rows a tracker names, how many
 * lines a prompt gets - and the thing they are handed is whatever a
 * ModuleInstance has stored, which may be missing keys or, for a module
 * that has not been placed at all, be nothing. Reading the defaults out of
 * the schema is what the seeder and the renderer already do with the same
 * values, so a floor computed here matches the drawing that will appear.
 *
 * Cached: this runs inside drag handlers, once per sibling per frame.
 */
const SCHEMA_DEFAULTS_CACHE = new Map<string, Record<string, unknown>>();

export function moduleSchemaDefaults(slug: string): Record<string, unknown> {
  const hit = SCHEMA_DEFAULTS_CACHE.get(slug);
  if (hit) return hit;
  const properties = (
    MODULE_REGISTRY[slug]?.db.configSchema as
      | { properties?: Record<string, { default?: unknown }> }
      | undefined
  )?.properties;
  const defaults: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(properties ?? {})) {
    if (spec && "default" in spec) defaults[key] = spec.default;
  }
  SCHEMA_DEFAULTS_CACHE.set(slug, defaults);
  return defaults;
}

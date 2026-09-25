// The landing page's resize demo (Andrew, 2026-09-25: "incorporate a cool
// demo of maybe like a module resizing below near Design a week once"): a
// strip of a real page - a habit tracker above a to-do list, drawn by the
// editor's own renderers - at each height the habit tracker can be dragged
// to, the to-do list giving up the rows it takes. ResizeDemo.tsx morphs
// between them. (resizeDemoData.ts, not resizeDemo.ts: Windows would take
// that and ResizeDemo.tsx for one file.)
//
// Server-only, like spreads.ts: it imports the whole module registry. Each
// mark keeps its element's id - the renderers' semantic ids (a habit's
// row keeps its id at every height) are what let the page morph one height
// into the next rather than cross-fade it.

import { renderModuleInstance } from "@/lib/renderModuleInstance";
import { flatten } from "@/lib/proofSvg";
import { toPreviewMarks, type PreviewMark } from "@/lib/previewMarks";
import { gridCellToPixels } from "@/lib/grid";
import { getMinRowSpanForSlug, moduleSchemaDefaults } from "@/lib/moduleRegistry";
import { resolveFontFamily } from "@/lib/theme";
import { LANDING_PAGE_GRID } from "./spreads";

export type DemoMark = PreviewMark & { id: string };

export type ResizeDemoData = {
  /** The strip's size with its margin, print px. */
  width: number;
  height: number;
  /** The page's dot lattice under it: the first dot, and the spacing. */
  dots: { x: number; y: number; dx: number; dy: number; cols: number; rows: number };
  /** The marks at each step - the habit tracker a row taller each time -
   *  in the strip's own coordinates. */
  steps: DemoMark[][];
  fontFamily: string;
};

const COLUMNS = 12;
const ROWS = 16;
const HABIT = "habit-tracker";
const TODO = "todo-checklist";

export function resizeDemo(): ResizeDemoData {
  const fontFamily = resolveFontFamily("serif");
  const habitProps = moduleSchemaDefaults(HABIT);
  const todoProps = moduleSchemaDefaults(TODO);
  const habitMin = getMinRowSpanForSlug(HABIT, LANDING_PAGE_GRID, COLUMNS, habitProps);
  const todoMin = getMinRowSpanForSlug(TODO, LANDING_PAGE_GRID, COLUMNS, todoProps);
  const origin = gridCellToPixels(LANDING_PAGE_GRID, { columnStart: 0, rowStart: 0, columnSpan: COLUMNS, rowSpan: ROWS });
  const one = gridCellToPixels(LANDING_PAGE_GRID, { columnStart: 0, rowStart: 0, columnSpan: 1, rowSpan: 1 });
  // Room round the strip for the selection outline and the cursor.
  const margin = Math.round(one.height * 1.2);

  const render = (id: string, slug: string, rowStart: number, rowSpan: number, props: unknown): DemoMark[] => {
    const elements = flatten(
      renderModuleInstance(
        { id, locked: true, columnStart: 0, rowStart, columnSpan: COLUMNS, rowSpan, propValues: props, moduleType: { slug } },
        LANDING_PAGE_GRID,
        fontFamily
      )
    );
    const out: DemoMark[] = [];
    for (const element of elements) {
      const [mark] = toPreviewMarks([element]).marks;
      if (!mark) continue;
      // Into the strip's coordinates, inside its margin.
      if (mark.k === "r" || mark.k === "t") out.push({ ...mark, x: mark.x - origin.x + margin, y: mark.y - origin.y + margin, id: element.id });
      else out.push({ ...mark, id: element.id });
    }
    return out;
  };

  const steps: DemoMark[][] = [];
  // One row between the two; the to-do list keeps at least its own floor.
  for (let rows = habitMin; ROWS - rows - 1 >= todoMin; rows++) {
    steps.push([...render("habit", HABIT, 0, rows, habitProps), ...render("todo", TODO, rows + 1, ROWS - rows - 1, todoProps)]);
  }
  return {
    width: origin.width + margin * 2,
    height: origin.height + margin * 2,
    dots: { x: margin, y: margin, dx: origin.width / COLUMNS, dy: origin.height / ROWS, cols: COLUMNS, rows: ROWS },
    steps,
    fontFamily,
  };
}

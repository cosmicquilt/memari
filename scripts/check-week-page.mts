// Renders a real planner's pages out of the database and checks the
// things a screenshot cannot: that no two modules overlap, that no mark
// leaves the module that drew it, that every rule sits on the pitch, and
// that nothing runs off the page.
//
// The unit tests already check these against SYNTHETIC placements. This
// checks the page Andrew is actually looking at - real spans, real
// propValues, real neighbours - which is where a regression from a
// geometry change would actually show up.
//
//   npx tsx scripts/check-week-page.mts [WEEK|MONTH]
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split("\n")) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { PrismaPg } = await import("@prisma/adapter-pg");
const { PrismaClient } = await import("../src/generated/prisma/client.js");
const { renderModuleInstance } = await import("../src/lib/renderModuleInstance.js");
const { gridCellToPixels, cellHeightPx } = await import("../src/lib/grid.js");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const baseType = (process.argv[2] ?? "WEEK") as "WEEK" | "MONTH";

const PAGE = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};
const PITCH = cellHeightPx(PAGE);
/** See moduleHouseStyle.test.mts - the two spines still sit 6px off. */
const LATTICE_DEBT = new Set<string>();
/** Modules that lay their columns out in the allocation frame so the
 *  boundaries land on the lattice - see the mark-escape check below. */
const ALLOCATION_FRAME = new Set(["hourly-grid-core", "month-grid-core", "todo-checklist"]);
/**
 * Overhang a module is already known to have, in print px, measured.
 *
 * Empty, and worth keeping that way. It held hourly-grid-core at 12.6px -
 * its last hour row running past its own bottom edge - until that turned
 * out to be one line: the block is designed in allocation terms and only
 * the render measured from the ink box. Fixed rather than recorded.
 */
const KNOWN_OVERHANG: Record<string, number> = {};

type El = {
  id: string;
  type: string;
  subType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  strokeWidth?: number;
  children?: El[];
};
const flat = (els: El[]): El[] =>
  els.flatMap((e) => (e.type === "group" ? flat(e.children ?? []) : [e]));

const planner = await prisma.planner.findFirst({
  where: { baseType, isTemplate: false },
  orderBy: { updatedAt: "desc" },
  include: {
    pages: {
      orderBy: { position: "asc" },
      include: { moduleInstances: { include: { moduleType: true } } },
    },
  },
});
if (!planner) {
  console.error(`No ${baseType} planner found.`);
  process.exit(1);
}

let problems = 0;
const bad = (message: string) => {
  console.error(`  FAIL  ${message}`);
  problems++;
};

for (const [index, page] of planner.pages.entries()) {
  const placed = page.moduleInstances.filter(
    (mi) => mi.columnStart !== null && mi.rowStart !== null
  );
  console.log(`\npage ${index} - ${placed.length} modules`);

  // 1. No two modules may claim the same cell.
  for (let a = 0; a < placed.length; a++) {
    for (let b = a + 1; b < placed.length; b++) {
      const A = placed[a];
      const B = placed[b];
      const overlapX =
        A.columnStart! < B.columnStart! + B.columnSpan &&
        B.columnStart! < A.columnStart! + A.columnSpan;
      const overlapY =
        A.rowStart! < B.rowStart! + B.rowSpan && B.rowStart! < A.rowStart! + A.rowSpan;
      if (overlapX && overlapY) {
        bad(
          `${A.moduleType.slug} and ${B.moduleType.slug} overlap ` +
            `(${A.columnStart},${A.rowStart} ${A.columnSpan}x${A.rowSpan} vs ` +
            `${B.columnStart},${B.rowStart} ${B.columnSpan}x${B.rowSpan})`
        );
      }
    }
  }

  for (const mi of placed) {
    const slug = mi.moduleType.slug;
    const where = `${slug} at ${mi.columnStart},${mi.rowStart} ${mi.columnSpan}x${mi.rowSpan}`;

    // 2. Nothing off the page.
    if (
      mi.columnStart! < 0 ||
      mi.rowStart! < 0 ||
      mi.columnStart! + mi.columnSpan > PAGE.gridColumns ||
      mi.rowStart! + mi.rowSpan > PAGE.gridRows
    ) {
      bad(`${where} runs off the page`);
      continue;
    }

    let elements: El[];
    try {
      elements = flat(renderModuleInstance(mi as never, PAGE) as El[]);
    } catch (error) {
      bad(`${where} threw while rendering - ${error}`);
      continue;
    }
    if (elements.length === 0) continue;

    // The module's INK BOX, from the grid - not "the first stroked element
    // I can find", which was the first version and was wrong for exactly
    // the module it matters most for: hourly-grid-core draws no single
    // outer border, so that picked one day's little header box and then
    // reported 330 marks "outside" it. Every module is supposed to draw
    // inside this rect, so this is the bound to test against.
    const ink = gridCellToPixels(PAGE, {
      columnStart: mi.columnStart!,
      rowStart: mi.rowStart!,
      columnSpan: mi.columnSpan,
      rowSpan: mi.rowSpan,
    });
    const box = elements.find(
      (e) =>
        e.type === "figure" &&
        (e.strokeWidth ?? 0) > 0 &&
        Math.abs((e.width ?? 0) - ink.width) < 1 &&
        Math.abs((e.height ?? 0) - ink.height) < 1
    );
    const left = ink.x;
    const top = ink.y;
    const right = left + ink.width;
    const bottom = top + ink.height;

    let escaped = 0;
    let offPitch = 0;
    let worstEscape = 0;
    for (const e of elements) {
      const x = e.x ?? 0;
      const y = e.y ?? 0;
      const w = e.width ?? 0;
      const h = e.height ?? 0;

      // 3. No mark may leave the module that drew it - beyond the box
      //    INSET, which a spine is entitled to use.
      //
      //    hourly-grid-core measures its day columns from the ALLOCATION
      //    rather than the ink box, precisely so its boundaries land on
      //    lattice columns (todoChecklist does this too now). The
      //    allocation is the ink box grown by the inset on every side, so
      //    a boundary at the module's own edge sits exactly `inset`
      //    outside it. That is the technique working, not a mark escaping.
      const slack = ALLOCATION_FRAME.has(slug) ? PAGE.boxInsetPx + 1 : 1;
      const over = Math.max(left - x, x + w - right, top - y, y + h - bottom);
      if (over > slack) {
        escaped++;
        worstEscape = Math.max(worstEscape, over);
      }

      // 4. Full-width rules sit on the pitch - on a dot row or exactly
      //    between two. See moduleHouseStyle.test.mts's onPitch.
      if (e.type !== "figure" || e.subType !== "rect" || e === box) continue;
      if (h >= w / 4) continue;
      if (w < (right - left) * 0.5) continue;
      // Modules written before the shared frame sit at a known offset -
      // the same list moduleHouseStyle.test.mts carries, and for the same
      // reason: the debt is visible rather than silently skipped.
      if (LATTICE_DEBT.has(slug)) continue;
      const centre = y + h / 2;
      const k = Math.round((centre - PAGE.marginPx) / (PITCH / 2));
      const off = centre - (PAGE.marginPx + (k * PITCH) / 2);
      if (Math.abs(off) > 0.5) offPitch++;
    }
    if (escaped > 0) {
      // The spines are REPORTED rather than failed, with the measured
      // overhang, exactly as LATTICE_DEBT is: hourly-grid-core's last hour
      // row has always run a little past its own bottom edge, and it is
      // not something today's geometry work introduced. Anything worse
      // than what is recorded here is a new fault and does fail.
      const allowed = KNOWN_OVERHANG[slug] ?? 0;
      if (worstEscape > allowed + 0.5) {
        bad(
          `${where} draws ${escaped} mark(s) up to ${worstEscape.toFixed(1)}px outside ` +
            `its own box (known overhang for ${slug}: ${allowed}px)`
        );
      } else {
        console.log(
          `  note  ${slug.padEnd(17)} ${escaped} mark(s) up to ${worstEscape.toFixed(1)}px past its ` +
            `bottom edge - long-standing, see KNOWN_OVERHANG`
        );
      }
    }
    if (offPitch > 0) bad(`${where} has ${offPitch} rule(s) off the pitch`);

    console.log(
      `  ok    ${slug.padEnd(17)} ${String(elements.length).padStart(4)} marks` +
        (escaped || offPitch ? "  <-- see above" : "")
    );
  }
}

await prisma.$disconnect();
if (problems > 0) {
  console.error(`\n${problems} problem(s).`);
  process.exit(1);
}
console.log("\nNo overlaps, no escaped marks, no rules off the pitch.");

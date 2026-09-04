// What does each module actually DO when it grows?
//
// The transition engine has to pick between occlusion, morph and swap. It
// currently guesses, by comparing element counts between the two renders -
// a proxy that was correct by accident at an older grid geometry and
// silently flipped two modules' behaviour when the grid changed.
//
// Rather than replace that guess with a different guess, or with a
// declaration a module author has to remember to keep true, this measures
// it. Each module is rendered across a sweep of sizes, one axis at a time,
// and every mark in the smaller render is looked for in the larger one.
// What happened to it is the module's behaviour on that axis:
//
//   kept      the same mark, same place, same size. Anchored.
//   stretched same position along the axis, longer. A rule spanning a
//             wider box.
//   moved     same size, different position. Respread - a day divider
//             sitting at a fraction of the width.
//   dropped   no counterpart at all.
//
// and in the larger render, marks with no counterpart in the smaller are
// split by where they landed:
//
//   beyond    outside the smaller box's edge on the swept axis. The clip
//             window can reveal these, so they need no animation at all.
//   inside    within bounds the smaller render already covered, and
//             therefore NOT something occlusion can explain.
//
// OCCLUSION MONOTONICITY, the conformance property, is exactly:
//   dropped === 0 && stretched === 0 && moved === 0 && inside === 0
// i.e. the smaller render's marks are a spatial subset of the larger's,
// with zero local delta. Where that holds, the clip window alone is a
// correct transition. Where it fails, this says which of the four ways it
// failed, which is the thing that decides morph versus swap.
//
// Run with: npm run check:behaviour
import { renderModuleInstance } from "./renderModuleInstance";
import { gridCellToPixels, type PageGrid } from "./grid";

const PAGE: PageGrid = {
  widthPx: 2175,
  heightPx: 3075,
  gridColumns: 24,
  gridRows: 36,
  boxInsetPx: 6,
  marginPx: 187.5,
};

type Rect = { x: number; y: number; width: number; height: number };

/** Every axis-aligned rect a module draws, minus its own outer border -
 *  which suppressOuterBorderSize removes during an ease, so counting it
 *  would measure a mark that never appears. Same exclusion as
 *  resizeEndpoints.report.mts, for the same reason. */
function rectsOf(
  slug: string,
  columnSpan: number,
  rowSpan: number,
  propValues: Record<string, unknown>
): Rect[] {
  const elements = renderModuleInstance(
    {
      id: "probe",
      locked: false,
      columnStart: 0,
      rowStart: 0,
      columnSpan,
      rowSpan,
      propValues,
      moduleType: { slug },
    } as Parameters<typeof renderModuleInstance>[0],
    PAGE,
    "PT Serif"
  );
  const flatten = (list: unknown[]): Record<string, unknown>[] =>
    list.flatMap((e) => {
      const el = e as Record<string, unknown>;
      return el.children ? [el, ...flatten(el.children as unknown[])] : [el];
    });
  const box = gridCellToPixels(PAGE, { columnStart: 0, rowStart: 0, columnSpan, rowSpan });
  return (
    flatten(elements as unknown[]).filter(
      (e) => e.type === "figure" && e.subType === "rect"
    ) as Array<Partial<Rect> & { stroke?: string; strokeWidth?: number }>
  )
    .filter((r) => {
      const isOuter =
        !!r.stroke &&
        r.stroke !== "none" &&
        (r.strokeWidth ?? 0) > 0 &&
        Math.abs((r.x ?? 0) - box.x) < 0.5 &&
        Math.abs((r.y ?? 0) - box.y) < 0.5 &&
        Math.abs((r.width ?? 0) - box.width) < 0.5 &&
        Math.abs((r.height ?? 0) - box.height) < 0.5;
      return !isOuter;
    })
    .map((r) => ({ x: r.x ?? 0, y: r.y ?? 0, width: r.width ?? 0, height: r.height ?? 0 }));
}

/** A tenth of a print pixel is 1/3000 inch - far below anything a printer
 *  or a screen resolves, so rounding there makes float noise stop counting
 *  as a difference without ever merging two marks a reader could tell
 *  apart. */
const q = (n: number) => n.toFixed(1);

type Axis = "x" | "y";
const POS = { x: "x", y: "y" } as const;
const SIZE = { x: "width", y: "height" } as const;

type StepResult = {
  from: number;
  to: number;
  n0: number;
  n1: number;
  kept: number;
  stretched: number;
  moved: number;
  dropped: number;
  beyond: number;
  inside: number;
};

/** Bucket every mark of `small` by what became of it in `large`, and every
 *  unclaimed mark of `large` by whether the smaller box already covered
 *  where it landed. `bound` is the smaller box's far edge on the swept
 *  axis: the line the clip window sweeps past. */
function compare(small: Rect[], large: Rect[], axis: Axis, bound: number): Omit<StepResult, "from" | "to"> {
  const pos = POS[axis];
  const size = SIZE[axis];
  // Cross-axis coordinates are what makes a mark recognisable as "the same
  // rule" once it has stretched or slid, so they key every index below.
  const cross = axis === "x" ? (["y", "height"] as const) : (["x", "width"] as const);

  const exact = new Map<string, Rect[]>();
  const byStart = new Map<string, Rect[]>();
  const bySize = new Map<string, Rect[]>();
  const push = (m: Map<string, Rect[]>, k: string, r: Rect) => {
    const list = m.get(k);
    if (list) list.push(r);
    else m.set(k, [r]);
  };
  const take = (m: Map<string, Rect[]>, k: string): Rect | null => {
    const list = m.get(k);
    if (!list || list.length === 0) return null;
    return list.pop() ?? null;
  };

  const claimed = new Set<Rect>();
  for (const r of large) {
    const c = `${q(r[cross[0]])},${q(r[cross[1]])}`;
    push(exact, `${c}|${q(r[pos])},${q(r[size])}`, r);
    push(byStart, `${c}|${q(r[pos])}`, r);
    push(bySize, `${c}|${q(r[size])}`, r);
  }

  let kept = 0;
  let stretched = 0;
  let moved = 0;
  let dropped = 0;
  for (const r of small) {
    const c = `${q(r[cross[0]])},${q(r[cross[1]])}`;
    // Order matters: an exact match is not a stretch, and a stretch is not
    // a move. Claiming the strongest available correspondence first stops
    // one mark being counted as two different behaviours.
    let hit = take(exact, `${c}|${q(r[pos])},${q(r[size])}`);
    if (hit) {
      kept++;
    } else if ((hit = take(byStart, `${c}|${q(r[pos])}`))) {
      stretched++;
    } else if ((hit = take(bySize, `${c}|${q(r[size])}`))) {
      moved++;
    } else {
      dropped++;
    }
    if (hit) claimed.add(hit);
  }

  let beyond = 0;
  let inside = 0;
  for (const r of large) {
    if (claimed.has(r)) continue;
    // "Beyond" means the clip window genuinely uncovers it: the mark
    // begins at or after the edge the smaller box stopped at. A mark that
    // merely overhangs that edge still has ink inside, so it counts as
    // inside - occlusion cannot produce it.
    if (r[pos] >= bound - 0.5) beyond++;
    else inside++;
  }
  return { n0: small.length, n1: large.length, kept, stretched, moved, dropped, beyond, inside };
}

type Sweep = {
  name: string;
  slug: string;
  columns: number[];
  rows: number[];
  /** Held fixed while the other axis is swept. */
  atColumns: number;
  atRows: number;
  props: (columnSpan: number, rowSpan: number) => Record<string, unknown>;
};

const dayLabels = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: ["Mon", "Tue", "Wed", "Thu"][i] ?? "Fri",
    date: i + 1,
  }));

// dayCount is a function of width, not a free parameter: six columns is one
// day unit. Sweeping columns without moving it would measure a module the
// editor never produces.
const days = (columnSpan: number) => Math.max(1, Math.round(columnSpan / 6));

const HOURLY = (columnSpan: number) => ({
  dayCount: days(columnSpan),
  dayLabels: dayLabels(days(columnSpan)),
  startTime: "06:00",
  endTime: "18:00",
  intervalMinutes: 30,
  hourLineStyle: "full" as const,
  dayBorder: true,
  events: [],
});

const SWEEPS: Sweep[] = [
  {
    name: "hourly grid",
    slug: "hourly-grid-core",
    columns: [6, 12, 18, 24],
    rows: [10, 14, 18, 22],
    atColumns: 18,
    atRows: 18,
    props: (c) => HOURLY(c),
  },
  {
    name: "to-do checklist",
    slug: "todo-checklist",
    columns: [6, 12, 18, 24],
    rows: [6, 10, 14, 18],
    atColumns: 18,
    atRows: 15,
    props: (c) => ({ dayCount: days(c) }),
  },
  {
    name: "habit tracker",
    slug: "habit-tracker",
    columns: [6, 12, 18, 24],
    rows: [8, 11, 14, 17],
    atColumns: 18,
    atRows: 13,
    props: () => ({}),
  },
  {
    name: "labeled box (ruled)",
    slug: "labeled-box",
    columns: [6, 12, 18, 24],
    rows: [4, 8, 12, 16],
    atColumns: 6,
    atRows: 12,
    props: () => ({ heading: "Notes", ruled: true }),
  },
  {
    name: "labeled box (plain)",
    slug: "labeled-box",
    columns: [6, 12, 18, 24],
    rows: [4, 8, 12, 16],
    atColumns: 6,
    atRows: 12,
    props: () => ({ heading: "Notes", ruled: false }),
  },
  {
    name: "week title",
    slug: "week-title",
    columns: [12, 18, 24],
    rows: [2, 3, 4],
    atColumns: 24,
    atRows: 3,
    props: () => ({}),
  },
];

/** One axis of one module: every consecutive step of the sweep, and the
 *  verdict that follows from them. */
function runAxis(sweep: Sweep, axis: Axis): { steps: StepResult[]; error?: string } {
  const sizes = axis === "x" ? sweep.columns : sweep.rows;
  const steps: StepResult[] = [];
  for (let i = 0; i + 1 < sizes.length; i++) {
    const smallSpan = sizes[i];
    const largeSpan = sizes[i + 1];
    const dims = (span: number): [number, number] =>
      axis === "x" ? [span, sweep.atRows] : [sweep.atColumns, span];
    const [sc, sr] = dims(smallSpan);
    const [lc, lr] = dims(largeSpan);
    let small: Rect[];
    let large: Rect[];
    try {
      small = rectsOf(sweep.slug, sc, sr, sweep.props(sc, sr));
      large = rectsOf(sweep.slug, lc, lr, sweep.props(lc, lr));
    } catch (e) {
      return { steps, error: e instanceof Error ? e.message : String(e) };
    }
    const smallBox = gridCellToPixels(PAGE, {
      columnStart: 0,
      rowStart: 0,
      columnSpan: sc,
      rowSpan: sr,
    });
    const bound = axis === "x" ? smallBox.x + smallBox.width : smallBox.y + smallBox.height;
    steps.push({ from: smallSpan, to: largeSpan, ...compare(small, large, axis, bound) });
  }
  return { steps };
}

/** The behaviour name a transition engine would route on. Ordered by how
 *  much machinery each demands: anchoring needs only the clip window,
 *  stretch and respread need a morph, a structural break needs a swap. */
function verdict(steps: StepResult[]): { label: string; occlusion: boolean } {
  if (steps.length === 0) return { label: "no data", occlusion: false };
  const sum = (f: (s: StepResult) => number) => steps.reduce((a, s) => a + f(s), 0);
  // A module that draws no rects at any size has not passed the property,
  // it has escaped it. Text-only modules (the titles) need their own
  // measurement and must not sit in the table looking compliant.
  if (sum((s) => s.n0) === 0 && sum((s) => s.n1) === 0)
    return { label: "text only - unmeasured", occlusion: false };
  const dropped = sum((s) => s.dropped);
  const stretched = sum((s) => s.stretched);
  const moved = sum((s) => s.moved);
  const inside = sum((s) => s.inside);
  const beyond = sum((s) => s.beyond);
  const n0 = sum((s) => s.n0);

  const occlusion = dropped === 0 && stretched === 0 && moved === 0 && inside === 0;
  if (occlusion) return { label: beyond > 0 ? "anchored + gains" : "anchored", occlusion };
  // A drawing that keeps almost nothing across a step is not a resize of
  // one picture, it is a different picture. That is the swap case, and it
  // has to be tested before the gentler ones or a mode switch reads as a
  // very messy respread.
  if (n0 > 0 && dropped / n0 > 0.5) return { label: "MODE SWITCH", occlusion };
  // A handful of moving marks against a large stable majority is not a
  // respread — it is a module pinning one mark to its own edge, such as a
  // final rule kept flush with the bottom border. Occlusion still fails,
  // but what fails is a single travelling mark rather than the whole
  // drawing, and the remedy is correspondingly smaller. Worth its own name
  // because any module with an edge-flush mark will land here.
  if (moved > 0 && dropped === 0 && moved <= n0 * 0.15)
    return { label: "anchored + edge", occlusion };
  if (moved > 0) return { label: "respread", occlusion };
  if (stretched > 0) return { label: "stretch", occlusion };
  return { label: "mixed", occlusion };
}

const pad = (s: string, n: number) => s.padEnd(n);
console.log("Module behaviour under growth - measured, one axis at a time\n");
console.log(
  pad("module", 22) +
    pad("axis", 8) +
    pad("verdict", 26) +
    pad("occl?", 7) +
    pad("kept", 6) +
    pad("strch", 7) +
    pad("moved", 7) +
    pad("drop", 6) +
    pad("+beyond", 9) +
    "+inside"
);
console.log("-".repeat(96));

let violations = 0;
const rows: Array<{ name: string; axis: Axis; steps: StepResult[]; label: string }> = [];
for (const sweep of SWEEPS) {
  for (const axis of ["x", "y"] as Axis[]) {
    const { steps, error } = runAxis(sweep, axis);
    if (error) {
      console.log(pad(sweep.name, 22) + pad(axis === "x" ? "width" : "height", 8) + "render failed: " + error);
      continue;
    }
    const sum = (f: (s: StepResult) => number) => steps.reduce((a, s) => a + f(s), 0);
    const v = verdict(steps);
    if (!v.occlusion) violations++;
    rows.push({ name: sweep.name, axis, steps, label: v.label });
    console.log(
      pad(sweep.name, 22) +
        pad(axis === "x" ? "width" : "height", 8) +
        pad(v.label, 26) +
        pad(v.occlusion ? "yes" : "NO", 7) +
        pad(String(sum((s) => s.kept)), 6) +
        pad(String(sum((s) => s.stretched)), 7) +
        pad(String(sum((s) => s.moved)), 7) +
        pad(String(sum((s) => s.dropped)), 6) +
        pad(String(sum((s) => s.beyond)), 9) +
        String(sum((s) => s.inside))
    );
  }
}

console.log("-".repeat(96));
console.log(
  `${rows.length} module-axes measured. ${rows.length - violations} satisfy occlusion monotonicity, ` +
    `${violations} do not.\n`
);

// The per-axis verdicts ARE the contract, derived rather than declared. A
// module whose two axes disagree is the case a single holistic mode cannot
// describe, so it is worth calling out by name rather than leaving in the
// table to be noticed.
const byModule = new Map<string, string[]>();
for (const r of rows) {
  const list = byModule.get(r.name) ?? [];
  list.push(r.label);
  byModule.set(r.name, list);
}
const split = [...byModule.entries()].filter(([, labels]) => new Set(labels).size > 1);
if (split.length > 0) {
  console.log("Modules whose axes disagree - these cannot take one holistic mode:");
  for (const [name, labels] of split) console.log(`  ${pad(name, 22)} width: ${labels[0]}, height: ${labels[1]}`);
  console.log("");
}

console.log(
  "Where occl? is yes, the clip window alone is a correct transition and no\n" +
    "morph is needed. Where it is NO, the columns say why: stretched and moved\n" +
    "marks need a morph, dropped marks and a MODE SWITCH need a swap, and any\n" +
    "count under +inside is a mark occlusion provably cannot account for."
);

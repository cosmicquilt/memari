// Element ids must name one mark uniquely, at every size a module can be
// drawn at.
//
// Ids used to be positional — a counter incremented per element — which
// made them unique by construction but meaningless: inserting a row
// renumbered every mark after it, so the renderer could not tell a
// resized drawing from a new one. It compensated by folding the element
// COUNT into the React key, which remounted every node whenever the count
// changed and replayed the arrival fade. That is what made a resize
// flicker at each snap step.
//
// Semantic ids fix that, but they give up the free uniqueness: two marks
// can now collide if a name forgets an index. A collision is silent and
// nasty — React would reuse one node for two marks, so one of them simply
// would not draw. This is the check that they don't.
//
// Run as part of: npm test
import { renderModuleInstance } from "./renderModuleInstance";
import type { PageGrid } from "./grid";

const PAGE: PageGrid = {
  widthPx: 2175, heightPx: 3075, gridColumns: 24, gridRows: 36, boxInsetPx: 6, marginPx: 187.5,
};

const dayLabels = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: ["Mon", "Tue", "Wed", "Thu"][i] ?? "Fri", date: i + 1 }));

const hourly = (dayCount: number, intervalMode?: string) => ({
  dayCount,
  dayLabels: dayLabels(dayCount),
  startTime: "06:00",
  endTime: "18:00",
  intervalMinutes: 30,
  hourLineStyle: "full",
  dayBorder: true,
  events: [],
  ...(intervalMode ? { intervalMode } : {}),
});

const monthCells = (weeks: number, days: number) =>
  Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: days }, (_, d) => ({ date: w * days + d + 1, inMonth: true }))
  );

type Probe = { name: string; slug: string; props: Record<string, unknown> };

const PROBES: Probe[] = [
  { name: "hourly 3-day", slug: "hourly-grid-core", props: hourly(3) },
  { name: "hourly 4-day", slug: "hourly-grid-core", props: hourly(4) },
  // The dot field is the densest element set any module produces, and its
  // ids are derived from lattice position rather than an index, so it is
  // the likeliest place for a collision to hide.
  { name: "hourly dots", slug: "hourly-grid-core", props: hourly(3, "off") },
  { name: "todo", slug: "todo-checklist", props: { dayCount: 3 } },
  { name: "habit", slug: "habit-tracker", props: {} },
  { name: "habit named", slug: "habit-tracker", props: { habits: ["Water", "Walk", "Read"] } },
  { name: "labeled box ruled", slug: "labeled-box", props: { heading: "Notes", ruled: true } },
  { name: "labeled box plain", slug: "labeled-box", props: { heading: "Notes", ruled: false } },
  { name: "week title", slug: "week-title", props: {} },
  { name: "month title", slug: "month-title", props: { title: "January" } },
  {
    name: "month grid",
    slug: "month-grid-core",
    props: { dayCount: 7, weekCount: 5, dayLabels: ["S", "M", "T", "W", "T", "F", "S"], cells: monthCells(5, 7) },
  },
];

// Every size each probe is swept at. Wide enough to cross the habit
// tracker's compact/wide switch and to give the month grid room.
const SIZES: Array<[number, number]> = [
  [6, 4], [6, 10], [6, 18], [12, 6], [12, 14], [18, 4], [18, 9], [18, 15], [24, 8], [24, 20], [24, 30],
];

function idsOf(slug: string, columnSpan: number, rowSpan: number, propValues: Record<string, unknown>) {
  const flatten = (list: unknown[]): Record<string, unknown>[] =>
    list.flatMap((e) => {
      const el = e as Record<string, unknown>;
      return el.children ? [el, ...flatten(el.children as unknown[])] : [el];
    });
  const elements = renderModuleInstance(
    { id: "probe", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues,
      moduleType: { slug } } as Parameters<typeof renderModuleInstance>[0],
    PAGE,
    "Newsreader"
  );
  // The group wrapper carries the instance id itself and is not a mark;
  // only the leaves it wraps are checked.
  return flatten(elements as unknown[])
    .filter((e) => e.type !== "group")
    .map((e) => String(e.id));
}

let failures = 0;
let checked = 0;
for (const probe of PROBES) {
  for (const [columnSpan, rowSpan] of SIZES) {
    let ids: string[];
    try {
      ids = idsOf(probe.slug, columnSpan, rowSpan, probe.props);
    } catch (e) {
      console.error(`FAIL ${probe.name} at ${columnSpan}x${rowSpan}: threw ${e instanceof Error ? e.message : e}`);
      failures++;
      continue;
    }
    if (ids.length === 0) continue;
    checked++;
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    if (duplicates.size > 0) {
      const sample = [...duplicates].slice(0, 5).join(", ");
      console.error(
        `FAIL ${probe.name} at ${columnSpan}x${rowSpan}: ${duplicates.size} duplicate id(s) ` +
          `across ${ids.length} elements — ${sample}`
      );
      failures++;
    }
  }
}

process.on("exit", () => {
  if (failures > 0) {
    console.error(`\nmoduleIds: ${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log(`All module id checks passed (${checked} module/size combinations, no duplicates).`);
  }
});

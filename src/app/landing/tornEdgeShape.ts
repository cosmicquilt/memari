// The cream's torn top edge under the hero (Andrew, 2026-10-06: "replace the
// flatline of the hero and rest of body with a border that looks like the
// cream side is a ripped piece of paper, as well as a drop shadow onto the
// hero"; the deckle of three mockups, handoff/mockups/torn-edge).
//
// LEVEL ("i want it to be generally flat"): it lies just above the hero's
// edge, and its lowest points touch the line the post-it's otter peeks over
// ("the rips on either side should meet the postit note at where the
// horizontal line is drawn"). Each side starts at the note on that line, as
// one of the edge's own low points - a ramp down to the note read as the
// rip bowing to it, which is what the first mockups were turned down for.
//
// Half an edge, from the note's side outward: x is the distance from the
// note, y is up from the line (negative). Seeded, so the page draws the same
// rip every time, on the server and in the browser alike. TornEdge.tsx lays
// one half each side of the note, the left one mirrored.
//
// Drawn, not photographed: a Flow-generated edge (flow-prompt.md there) may
// replace it, which is why nothing else depends on how it is made.

/** How far each half runs from the note: past the side of a 4K screen. */
export const TORN_LENGTH = 2000;
/** How far above the line its drawing reaches, shadow included. */
export const TORN_HEIGHT = 46;

const BAND = 8; // how high the level rip's rises go
const JAG = 2.6; // the teeth on top of them
const PERIOD = 70; // how far apart its rises are, on average
const LOWS = 0.25; // how often it comes back down to the line
const STEP: [number, number] = [1.6, 4.2]; // px between points of the edge
const CORE: [number, number] = [0.8, 2.6]; // the white core's width
/** Over how many px from the note the teeth settle, so the rip lands on
 *  the line exactly at the note's side. */
const SETTLE = 14;

export type TornHalf = {
  /** The cream top layer, closed below the line. */
  edge: string;
  /** The torn white core where the sheet split, a little beyond the cream -
   *  also what the shadows are cast from. */
  core: string;
  /** Loose fibres feathering out from the core: faint and bright. */
  fibres: [string, string];
};

const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const f2 = (n: number) => (Math.round(n * 100) / 100).toString();

export function tornHalf(seed: number): TornHalf {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

  /** A level, random profile 0..1: its first knot a low at the note, the
   *  rest spaced irregularly round PERIOD and smoothly joined, coming back
   *  down to the line now and then so the note's low is one of many. */
  const knots: Array<[number, number]> = [[0, 0]];
  for (let d = 0; d < TORN_LENGTH + PERIOD * 2; ) {
    d += PERIOD * (0.6 + rand() * 0.8);
    knots.push([d, rand() < LOWS ? rand() * 0.15 : 0.3 + rand() * 0.7]);
  }
  const profile = (d: number) => {
    let i = 0;
    while (knots[i + 1][0] < d) i++;
    const [d0, v0] = knots[i];
    const [d1, v1] = knots[i + 1];
    const t = (d - d0) / (d1 - d0);
    const e = t * t * (3 - 2 * t);
    return v0 * (1 - e) + v1 * e;
  };
  const settle = (x: number) => Math.min(1, x / SETTLE);

  const edge: Array<[number, number]> = [];
  for (let x = 0; x <= TORN_LENGTH; x += STEP[0] + rand() * (STEP[1] - STEP[0])) {
    edge.push([x, x === 0 ? 0 : Math.min(0, -(BAND * profile(x) + JAG * rand() * settle(x)))]);
  }
  edge.push([TORN_LENGTH, edge[edge.length - 1][1]]);

  // The core's width wanders on its own, slower than the teeth.
  const coreKnots = Array.from({ length: Math.ceil(TORN_LENGTH / 37) + 2 }, () => rand());
  const coreWidth = (x: number) => {
    const t = x / 37;
    const i = Math.floor(t);
    const e = (t - i) * (t - i) * (3 - 2 * (t - i));
    return CORE[0] + (CORE[1] - CORE[0]) * (coreKnots[i] * (1 - e) + coreKnots[i + 1] * e);
  };
  const core = edge.map(([x, y]): [number, number] => [x, y - coreWidth(x) * settle(x)]);

  // Loose fibres off the core: a few short ones here and there, and now and
  // then a long one, mostly outward. The fine fuzz between them is the
  // core's own filter (TornEdge.tsx).
  let faint = "";
  let bright = "";
  for (const [x, y] of core) {
    if (settle(x) < 1) continue;
    const roll = rand();
    if (roll > 0.3) continue;
    const long = roll < 0.035;
    const length = long ? 3 + rand() * 4 : 0.8 + rand() * 1.8;
    const angle = -Math.PI / 2 + (rand() - 0.5) * 2.6;
    const x0 = x + (rand() - 0.5) * 3;
    const y0 = y + 0.5;
    const bend = (rand() - 0.5) * length * 0.35;
    const x2 = x0 + Math.cos(angle) * length;
    const y2 = y0 + Math.sin(angle) * length;
    const seg = `M${f1(x0)},${f2(y0)}Q${f1((x0 + x2) / 2 + bend * Math.sin(angle))},${f2((y0 + y2) / 2 - bend * Math.cos(angle))} ${f1(x2)},${f2(y2)}`;
    if (long) bright += seg;
    else faint += seg;
  }

  const closed = (pts: Array<[number, number]>) =>
    `M0,40L${TORN_LENGTH},40` + [...pts].reverse().map(([x, y]) => `L${f1(x)},${f2(y)}`).join("") + "Z";
  return { edge: closed(edge), core: closed(core), fibres: [faint, bright] };
}

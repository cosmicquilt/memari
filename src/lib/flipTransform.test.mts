// A hairline's thin dimension is its WEIGHT, not its geometry.
//
// The previous attempt at animating these interpolated x/y/width/height
// directly, and the legibility floor is recomputed from those values on
// every render, so the browser walked a rule's thickness through a range
// the floor never intended. Rules visibly thickened and thinned in flight.
// That single artefact is what sank the attempt.
//
// The replacement animates a transform instead, and scales a hairline
// along its long axis only. This is the check that it does — the property
// is one line, and it is the one that matters.
//
// Run as part of: npm test
import { flipTransform, type MarkGeometry } from "@/app/planner/PolotnoJsonRenderer";

const box = (x: number, y: number, width: number, height: number): MarkGeometry => ({ x, y, width, height });

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (!condition) {
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

/** scale(a, b) → [a, b]. A transform with no scale reads as [1, 1]. */
function scaleOf(transform: string | null): [number, number] {
  if (!transform) return [1, 1];
  const m = transform.match(/scale\(([-\d.]+), ([-\d.]+)\)/);
  if (!m) return [1, 1];
  return [Number(m[1]), Number(m[2])];
}
function translateOf(transform: string | null): [number, number] {
  if (!transform) return [0, 0];
  const m = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
  if (!m) return [0, 0];
  return [Number(m[1]), Number(m[2])];
}

// A ruled line: 500 long, 0.9 thick. Stretching it must not touch the 0.9.
{
  const t = flipTransform(box(10, 40, 500, 0.9), box(10, 40, 900, 0.9));
  const [sx, sy] = scaleOf(t);
  check("horizontal hairline stretches on x only", Math.abs(sy - 1) < 1e-9, `scaleY was ${sy}`);
  check("horizontal hairline scales x toward its old length", Math.abs(sx - 500 / 900) < 1e-9, `scaleX was ${sx}`);
}

// The same rule, but the floor has grown it at one size and not the other.
// This is the exact shape of the original bug: two different thicknesses
// for what is the same line. It must still refuse to scale the thin axis.
{
  const t = flipTransform(box(10, 40, 500, 1.0), box(10, 40, 900, 0.42));
  const [, sy] = scaleOf(t);
  check("floored hairline never scales its weight", Math.abs(sy - 1) < 1e-9, `scaleY was ${sy}`);
}

// A day divider: tall and thin. Mirror image of the above.
{
  const t = flipTransform(box(80, 10, 0.9, 300), box(140, 10, 0.9, 460));
  const [sx, sy] = scaleOf(t);
  check("vertical hairline stretches on y only", Math.abs(sx - 1) < 1e-9, `scaleX was ${sx}`);
  check("vertical hairline scales y toward its old length", Math.abs(sy - 300 / 460) < 1e-9, `scaleY was ${sy}`);
}

// A mark that only slides — the habit tracker's dividers respreading.
{
  const t = flipTransform(box(80, 10, 0.9, 300), box(140, 10, 0.9, 300));
  const [sx, sy] = scaleOf(t);
  const [dx, dy] = translateOf(t);
  check("a pure move does not scale at all", Math.abs(sx - 1) < 1e-9 && Math.abs(sy - 1) < 1e-9);
  check("a pure move translates by the difference", Math.abs(dx - -60) < 1e-9 && Math.abs(dy) < 1e-9, `d was ${dx},${dy}`);
}

// Something genuinely two-dimensional — a date box, a dot. Both of its
// dimensions are real geometry, so both may scale.
{
  const t = flipTransform(box(0, 0, 40, 30), box(0, 0, 80, 60));
  const [sx, sy] = scaleOf(t);
  check("a solid box scales on both axes", Math.abs(sx - 0.5) < 1e-9 && Math.abs(sy - 0.5) < 1e-9, `scale was ${sx},${sy}`);
}

// A mark that did not change has nothing to animate, and returning null is
// what stops it being given a pointless animation on every render.
{
  check("an unchanged mark yields no transform", flipTransform(box(5, 5, 100, 1), box(5, 5, 100, 1)) === null);
}

// Degenerate geometry must not produce NaN or Infinity in a transform
// string — the browser would drop the whole declaration silently.
{
  const t = flipTransform(box(0, 0, 100, 1), box(10, 10, 0, 0));
  check("zero-sized destination yields a finite transform", t === null || !/(NaN|Infinity)/.test(t), `got ${t}`);
}

process.on("exit", () => {
  if (failures > 0) {
    console.error(`\nflipTransform: ${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All flipTransform checks passed.");
  }
});

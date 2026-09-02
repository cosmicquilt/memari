// Checks for morphPairing.ts, in the same plain-assertion style as
// grid.test.mts. Run with: npx tsx src/lib/morphPairing.test.mts
//
// The cases that matter are the real ones: a habit-tracker crossing from
// its wide layout into the sidebar's compact one, which is where "the
// horizontal lines jump to their final position" was reported.
import { pairRectsForMorph, rectRole, type PairableRect } from "./morphPairing";

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) return;
  failures++;
  console.error(`FAIL: ${message}`);
}

const rule = (y: number, width = 400): PairableRect => ({ x: 0, y, width, height: 1, fill: "#231F20" });
const vrule = (x: number, height = 400): PairableRect => ({ x, y: 0, width: 1, height, fill: "#231F20" });
const box = (x: number, y: number, w: number, h: number): PairableRect => ({
  x, y, width: w, height: h, stroke: "#231F20", strokeWidth: 1, fill: "transparent",
});

// --- roles -----------------------------------------------------------------
assert(rectRole(rule(10)) === "hrule", "a long thin horizontal rect is an hrule");
assert(rectRole(vrule(10)) === "vrule", "a tall thin vertical rect is a vrule");
assert(rectRole(box(0, 0, 100, 100)) === "box", "a square is a box");

// --- the point of the whole exercise ---------------------------------------
// The same rules in a box half the height still morph: position is
// compared relatively, so "halfway down" matches "halfway down".
{
  const from = [rule(100), rule(200), rule(300)];
  const to = [rule(50), rule(100), rule(150)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 200 });
  assert(r.pairs.length === 3, `all three rules morph across a 2:1 shrink (got ${r.pairs.length})`);
  assert(r.fadeIn.length === 0 && r.fadeOut.length === 0, "nothing fades when everything pairs");
  assert(r.pairs[0].to.y === 50 && r.pairs[2].to.y === 150, "rules pair in order, not crosswise");
}

// Absolute distance would have refused every one of those.
{
  const from = [rule(100), rule(200), rule(300)];
  const to = [rule(50), rule(100), rule(150)];
  const same = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(same.pairs.length < 3, "with no size change those y values are genuinely different rules");
}

// --- wide -> compact: morph what exists, fade in only the surplus ----------
{
  const from = [rule(0), rule(200), rule(400)];
  const to = [rule(0), rule(50), rule(100), rule(150), rule(200), rule(250), rule(300), rule(350), rule(400)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length === 3, `every outgoing rule finds a counterpart (got ${r.pairs.length})`);
  assert(r.fadeOut.length === 0, "nothing fades OUT when the incoming render is denser");
  assert(r.fadeIn.length === 6, `only the surplus rules fade in (got ${r.fadeIn.length})`);
}

// --- ink has to match ------------------------------------------------------
{
  const from = [rule(100)];
  const to = [{ x: 0, y: 100, width: 400, height: 1, stroke: "#231F20", strokeWidth: 1 } as PairableRect];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length === 0, "a filled hairline does not morph into a stroked one");
  assert(r.fadeOut.length === 1 && r.fadeIn.length === 1, "they cross-fade instead");
}

// --- roles do not cross ----------------------------------------------------
{
  const r = pairRectsForMorph([rule(100)], [vrule(100)], { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length === 0, "a horizontal rule never morphs into a vertical one");
}

// --- a to-rect is claimed once ---------------------------------------------
{
  const from = [rule(100), rule(105)];
  const to = [rule(100)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length === 1, "two outgoing rules cannot both claim one incoming rule");
  assert(r.fadeOut.length === 1, "the loser fades out");
}

// --- every element is accounted for exactly once ---------------------------
{
  const from = [rule(0), rule(100), vrule(50), box(0, 0, 400, 400)];
  const to = [rule(0), rule(200), vrule(300), rule(400)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length + r.fadeOut.length === from.length, "every outgoing rect either pairs or fades out");
  assert(r.pairs.length + r.fadeIn.length === to.length, "every incoming rect either pairs or fades in");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All morphPairing.ts checks passed.");

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
// COLUMNS respread when the box is resized, so vertical rules pair by
// their fraction of the width: a separator a third of the way across is
// the same separator whatever the width becomes.
{
  const from = [vrule(100), vrule(200), vrule(300)];
  const to = [vrule(50), vrule(100), vrule(150)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 200, height: 400 });
  assert(r.pairs.length === 3, `all three separators morph across a 2:1 shrink (got ${r.pairs.length})`);
  assert(r.fadeIn.length === 0 && r.fadeOut.length === 0, "nothing fades when everything pairs");
  assert(r.pairs[0].to.x === 50 && r.pairs[2].to.x === 150, "separators pair in order, not crosswise");
}

// RULES do not respread: a ruled box has a fixed pitch, so a rule 100px
// down stays 100px down and the box simply holds more or fewer of them.
// Pairing these proportionally would slide rows that should sit still.
{
  const from = [rule(100), rule(200), rule(300)];
  const to = [rule(100), rule(200)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 250 });
  assert(r.pairs.length === 2, `the rules that still exist stay put (got ${r.pairs.length})`);
  assert(r.pairs.every((p) => p.from.y === p.to.y), "and they do not move at all");
  assert(r.sweepOut.length === 1, "the one past the new bottom edge is swept away");
}

// --- wide -> compact: morph what exists, fade in only the surplus ----------
{
  const from = [rule(0), rule(200), rule(400)];
  const to = [rule(0), rule(50), rule(100), rule(150), rule(200), rule(250), rule(300), rule(350), rule(400)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length === 3, `every outgoing rule finds a counterpart (got ${r.pairs.length})`);
  assert(r.fadeOut.length === 0, "nothing fades OUT when the incoming render is denser");
  assert(r.fadeIn.length === 6, `the surplus rules fade in when the box does not grow (got ${r.fadeIn.length})`);
}

// --- the clip window comes first -------------------------------------------
// Shrinking away: everything past the final right edge is wiped by the
// closing box, not faded. "with something like a todo bottom to sidebar it
// should just overflow hidden sweep everything away."
{
  const from = [rule(100, 400), vrule(150), vrule(300), box(140, 0, 260, 400)];
  const to = [rule(50, 120)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 120, height: 200 });
  assert(r.fadeOut.length === 0, `nothing fades out; the box wipes it (got ${r.fadeOut.length})`);
  assert(r.sweepOut.length === 3, `everything past the new right edge sweeps (got ${r.sweepOut.length})`);
}

// Growing into: rows below the old bottom edge are revealed by the opening
// box, not faded. "it should expand and reveal rows from where they weren't."
{
  const from = [rule(10), rule(90)];
  const to = [rule(10), rule(90), rule(210), rule(310)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 100 }, { width: 400, height: 400 });
  assert(r.fadeIn.length === 0, `nothing fades in; the box uncovers it (got ${r.fadeIn.length})`);
  assert(r.revealIn.length === 2, `the rows past the old bottom edge are revealed (got ${r.revealIn.length})`);
}

// Fading is only for what is stranded inside the box at both ends.
{
  const from = [rule(10)];
  const to = [rule(10), vrule(200, 90)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 100 }, { width: 400, height: 100 });
  assert(r.pairs.length === 1, "the shared rule morphs");
  assert(r.revealIn.length === 0 && r.fadeIn.length === 1,
    `a new mark inside unchanged bounds has to fade (got reveal ${r.revealIn.length}, fade ${r.fadeIn.length})`);
}

// --- ink has to match ------------------------------------------------------
{
  const from = [rule(100)];
  const to = [{ x: 0, y: 100, width: 400, height: 1, stroke: "#231F20", strokeWidth: 1 } as PairableRect];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length === 0, "a filled hairline does not morph into a stroked one");
  assert(r.fadeOut.length + r.sweepOut.length === 1, "the outgoing one leaves");
  assert(r.fadeIn.length + r.revealIn.length === 1, "the incoming one arrives");
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
  assert(r.fadeOut.length + r.sweepOut.length === 1, "the loser leaves by one route or the other");
}

// --- every element is accounted for exactly once ---------------------------
{
  const from = [rule(0), rule(100), vrule(50), box(0, 0, 400, 400)];
  const to = [rule(0), rule(200), vrule(300), rule(400)];
  const r = pairRectsForMorph(from, to, { width: 400, height: 400 }, { width: 400, height: 400 });
  assert(r.pairs.length + r.fadeOut.length + r.sweepOut.length === from.length,
    "every outgoing rect pairs, sweeps, or fades - exactly once");
  assert(r.pairs.length + r.fadeIn.length + r.revealIn.length === to.length,
    "every incoming rect pairs, is revealed, or fades - exactly once");
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All morphPairing.ts checks passed.");

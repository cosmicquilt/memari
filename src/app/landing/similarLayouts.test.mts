// Similar layouts (similarLayouts.ts): every variation is a real layout -
// it passes the hero's own check - is found again by its key, and is the
// same one every time; and a layout's family never lists itself.

import assert from "node:assert/strict";
import { STARTERS } from "./starterLayouts";
import { resolveLayout, similarTo, variationsOf } from "./similarLayouts";
import { spreadProblems } from "./spreads";

let variations = 0;
for (const starter of STARTERS) {
  const list = variationsOf(starter.key);
  assert.ok(list.length >= 3, `${starter.key}: only ${list.length} variations`);
  for (const v of list) {
    variations++;
    assert.deepEqual(spreadProblems(v.def), [], `${v.key} is not a valid layout`);
    assert.ok(v.changes.length > 0, `${v.key} says nothing about what changed`);
    assert.equal(resolveLayout(v.key)?.key, v.key, `${v.key} does not resolve`);
    // No module brought twice by one variation.
    const brought = v.changes.filter((c) => c.includes(" in place of ")).map((c) => c.split(" in place of ")[0]);
    assert.equal(new Set(brought).size, brought.length, `${v.key} brings a module twice`);
  }
  const family = similarTo(`${starter.key}~1`);
  assert.ok(family.some((e) => e.key === starter.key), `${starter.key}~1's family leaves out the original`);
  assert.ok(!family.some((e) => e.key === `${starter.key}~1`), `${starter.key}~1 lists itself`);
  assert.ok(!similarTo(starter.key).some((e) => e.key === starter.key), `${starter.key} lists itself`);
}
// The same key, the same layout.
assert.equal(JSON.stringify(resolveLayout("student~2")?.def.layout), JSON.stringify(resolveLayout("student~2")?.def.layout));
assert.equal(resolveLayout("no-such~1"), null);
assert.equal(resolveLayout("student~99"), null);

console.log(`All similar layout checks passed (${STARTERS.length} layouts, ${variations} variations, each a valid layout).`);

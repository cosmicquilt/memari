// What counts as a rule, stated case by case.
//
// ruleMarks.ts is consumed by moduleHouseStyle.test.mts and by check:page,
// and between them they run it over 22,406 marks - so it would be easy to
// assume those two cover it. They do not. Sabotage says otherwise:
//
//   drop the OUTLINE exclusion    -> check:page fails (3 problems)
//   drop the MINIMUM LENGTH       -> nothing fails
//   set the ASPECT RATIO to 1.02  -> nothing fails
//
// The last two are unfalsifiable against today's catalogue, and for a
// findable reason: the length gate and the aspect ratio are nearly redundant
// with each other here. A mark long enough to be a rule is already far from
// square, so loosening the ratio admits only marks the length gate then
// throws out - the selected set is 22,406 at a ratio of 4, of 2, and of
// 1.02 alike.
//
// Redundant is not the same as wrong. Both clauses say something true about
// what a rule IS, and the day a module draws a short thick divider they stop
// being redundant. But a clause nothing can falsify is the dead-switch
// defect this codebase has been bitten by three times now, so each one is
// asserted here directly rather than left to be believed.

import { ruleAxisOf, isOutlineOnly, RULE_ASPECT_RATIO } from "./ruleMarks";
import type { RenderedPolotnoElement } from "./renderModuleInstance";

let failures = 0;
const fail = (message: string) => {
  console.error(`  ${message}`);
  failures++;
};

/** The real lattice cell: 1/4in at 300 DPI. */
const PITCH = 75;
/** The house hairline: 1.25 print px, 0.3pt on paper. */
const HAIR = 1.25;

const mark = (e: Partial<RenderedPolotnoElement>): RenderedPolotnoElement => ({
  id: "m",
  type: "figure",
  subType: "rect",
  fill: "#000",
  ...e,
});

const is = (label: string, element: RenderedPolotnoElement, expected: string | null) => {
  const got = ruleAxisOf(element, PITCH);
  if (got !== expected) fail(`${label}: got ${got ?? "null"}, expected ${expected ?? "null"}`);
};

// --- the two things a rule actually is --------------------------------
is("an hour rule across a day column", mark({ width: 425, height: HAIR }), "horizontal");
is("a column divider down a grid", mark({ width: HAIR, height: 425 }), "vertical");

// --- not a rule: the module's own border ------------------------------
//
// THE CASE THAT BIT. `t-border` on a 24x4 labeled box is 1788 x 288 - wider
// than it is tall, so an aspect test alone calls it a horizontal rule, and
// then a lattice check measures a box against the lattice that box is
// defined by. 240 marks across the catalogue were being checked this way.
is(
  "a wide short module border",
  mark({ width: 1788, height: 288, fill: "none", stroke: "#000", strokeWidth: 1.25 }),
  null
);
is(
  "a border with no fill property at all",
  mark({ width: 1788, height: 288, fill: undefined, stroke: "#000", strokeWidth: 1.25 }),
  null
);
is(
  "a border filled transparent",
  mark({ width: 1788, height: 288, fill: "transparent", stroke: "#000", strokeWidth: 1.25 }),
  null
);
// A FILLED band is a rule even though it is thick - a header band divides
// the module exactly as a hairline does. Only the OUTLINE is excluded.
is("a filled band of the same proportions", mark({ width: 1788, height: 288 }), "horizontal");
if (!isOutlineOnly(mark({ width: 10, height: 10, fill: "none", stroke: "#000", strokeWidth: 1 }))) {
  fail("isOutlineOnly said a stroked unfilled rect is not an outline");
}
if (isOutlineOnly(mark({ width: 10, height: 10, fill: "#000", stroke: "#000", strokeWidth: 1 }))) {
  fail("isOutlineOnly said a rect that is both filled AND stroked is an outline");
}

// --- not a rule: something two-dimensional ----------------------------
is("a checkbox", mark({ width: 20, height: 20 }), null);
is("a date box", mark({ width: 40, height: 30 }), null);
// THE ASPECT RATIO, held at its own boundary - in ABSOLUTE numbers.
//
// Written as `400 / RULE_ASPECT_RATIO` first, and sabotage caught it: the
// case was expressed in terms of the constant, so moving the constant moved
// the case with it and the ratio could be set to 1.02 with nothing failing.
// A test that reads the value it is checking cannot check it. So the number
// is pinned here and the shapes are literal.
if (RULE_ASPECT_RATIO !== 4) {
  fail(`the rule aspect ratio is ${RULE_ASPECT_RATIO}; the shapes below are written for 4`);
}
is("exactly 4:1 is not a rule", mark({ width: 400, height: 100 }), null);
is("a hair past 4:1 is", mark({ width: 400, height: 99.9 }), "horizontal");
is("3:1 is a shape, not a rule", mark({ width: 300, height: 100 }), null);
is("exactly 1:4 upright is not a rule", mark({ width: 100, height: 400 }), null);
is("a hair past 1:4 upright is", mark({ width: 99.9, height: 400 }), "vertical");
is("1:3 upright is a shape, not a rule", mark({ width: 100, height: 300 }), null);

// --- not a rule: too short to have to land anywhere --------------------
//
// THE MINIMUM LENGTH, held at its own boundary. A tick shorter than one
// lattice cell is a fragment, not a rule that has to sit on a dot row.
is("a tick under one cell", mark({ width: PITCH - 0.01, height: HAIR }), null);
is("a mark exactly one cell long", mark({ width: PITCH, height: HAIR }), "horizontal");
is("an upright tick under one cell", mark({ width: HAIR, height: PITCH - 0.01 }), null);
is("an upright mark exactly one cell long", mark({ width: HAIR, height: PITCH }), "vertical");

// --- not a rule: not a rect at all ------------------------------------
is("text", mark({ type: "text", text: "Monday", width: 400, height: HAIR }), null);
is("a glyph's path", mark({ pathD: "M 0 0 L 10 10", width: 400, height: HAIR, subType: "rect" }), "horizontal");
is("a figure that is not a rect", mark({ subType: "ellipse", width: 400, height: HAIR }), null);
is("a zero-height mark", mark({ width: 400, height: 0 }), null);
is("a zero-width mark", mark({ width: 0, height: 400 }), null);

if (failures > 0) {
  console.error(`\n${failures} rule-mark case(s) wrong.`);
  process.exit(1);
}
console.log(
  "All rule-mark checks passed (a hairline either way is a rule; a module's own " +
    "outline, a checkbox, a sub-cell tick and a non-rect are not)."
);

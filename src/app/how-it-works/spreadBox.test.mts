// The editor mock's highlight (How it works, step 2) sits exactly on the
// habit tracker as the student spread draws it: moduleBox read from the
// spread's placements must match the module's outline among the marks the
// Layouts gallery draws (layoutPreview). Run: npx tsx src/app/how-it-works/spreadBox.test.mts

import assert from "node:assert/strict";
import { HERO_BY_KEY } from "../landing/heroSpreads";
import { layoutPreview } from "../landing/spreads";
import { moduleBox, moduleOnSpread } from "./spreadBox";

let checks = 0;
const near = (a: number, b: number, what: string) => {
  assert.ok(Math.abs(a - b) < 0.01, `${what}: ${a} vs ${b}`);
  checks++;
};

const box = moduleBox("student", "habit-tracker");
assert.equal(box.page, 1, "the habit tracker is on the right-hand page");
const drawn = layoutPreview(HERO_BY_KEY.student).pages[box.page].marks;
// the module's outline: a stroked rect, its heading "THIS WEEK" inside its top
const outline = drawn.find(
  (m) => m.k === "r" && !!m.s && Math.abs(m.x - box.x) < 1 && Math.abs(m.y - box.y) < 1 && m.w > 300 && m.h > 300
);
assert.ok(outline && outline.k === "r", `no outline drawn at ${box.x}, ${box.y}`);
near(outline.x, box.x, "left");
near(outline.y, box.y, "top");
near(outline.w, box.width, "width");
near(outline.h, box.height, "height");
const heading = drawn.find((m) => m.k === "t" && m.t === "THIS WEEK");
assert.ok(heading && heading.k === "t" && heading.y > box.y && heading.y < box.y + 100, "its heading is inside its top");
checks++;

// the CSS covers the right page from its left edge plus 1px gap
const style = moduleOnSpread("student", "habit-tracker");
assert.match(String(style.left), /\+ 1px\)$/);
assert.match(String(style.top), /%$/);
checks += 2;

assert.throws(() => moduleBox("student", "no-such-module"));
assert.throws(() => moduleBox("no-such-spread", "habit-tracker"));
checks += 2;

console.log(`spreadBox: ${checks} checks passed`);

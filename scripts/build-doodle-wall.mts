// The start dialog's backdrop: a wall of little drawings in blue pen on the
// cream paper, baked once into public/landing/doodle-wall.webp.
//
//   npm run build:doodle-wall
//
// Asked for 2026-09-27: the cream paper behind the start dialog "sketched in
// blue pen in the background cute characters and animals", crowded like a
// Mr. Doodle wall - "i want it to be sketched though". Which drawings is the
// `wall` list in src/app/landing/doodleChoices.json (its defaults: the doodle
// library's pencil sketches); how they are packed and inked is
// src/app/landing/doodleWall.ts, which the control panel at /dev/doodles
// uses too - the panel can save a wall itself, and this rebuilds the same
// one from the command line.
//
// Drawn in a real browser (the installed Chrome, as the check scripts do)
// because it needs a canvas: drawings turned, tinted and packed by their
// actual ink, not their boxes.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { packWall, wallClassOf, WALL_CLASSES, WALL_INK, WALL_PAPER, WALL_TILE } from "../src/app/landing/doodleWall";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOODLES = path.join(ROOT, "public/landing/doodles");
const OUT = path.join(ROOT, "public/landing/doodle-wall.webp");
const choices = JSON.parse(readFileSync(path.join(ROOT, "src/app/landing/doodleChoices.json"), "utf8")) as { wall: string[] };

// Each chosen drawing as a data URL (a page given file:// images could not
// read its own canvas back), with the size it is drawn at.
const drawings = choices.wall.map((full) => {
  const [style, id] = full.split("/");
  return {
    src: `data:image/webp;base64,${readFileSync(path.join(DOODLES, style, `${id}.webp`)).toString("base64")}`,
    cls: wallClassOf(id.replace(/-\d+$/, "")),
  };
});

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch({ channel: "msedge" });
}
const page = await browser.newPage();
// tsx compiles with esbuild's keepNames, which wraps every named function in
// packWall in a `__name()` helper; Playwright ships the function's source to
// the page, where the helper does not exist (see check-browser.mts). So the
// page gets a do-nothing one - as a string, which nothing compiles.
await page.evaluate("window.__name = (f) => f");
const result = await page.evaluate(packWall, {
  drawings,
  classes: WALL_CLASSES,
  tile: WALL_TILE,
  ink: WALL_INK,
  paper: WALL_PAPER,
  seed: 20260927,
});
await browser.close();

const bytes = Buffer.from(result.url.split(",")[1], "base64");
writeFileSync(OUT, bytes);
console.log(
  `doodle-wall.webp: ${WALL_TILE.w * WALL_TILE.scale}x${WALL_TILE.h * WALL_TILE.scale}, ${(bytes.length / 1024).toFixed(0)} KB; ` +
    `${drawings.length} drawings chosen; placed ${result.counts.join(" + ")} (big, middle, small); ` +
    `${(result.covered * 100).toFixed(0)}% of the tile inked or reserved`
);

// The start dialog's backdrops with doodles: walls of little drawings in
// blue pen, baked into public/landing/doodle-walls/ - WALL_VARIANTS walls for
// each theme (light-0.webp ... dark-5.webp), one of which each load shows.
// And the hero's two loose sheets, each a small wall of its own laid into the
// film (public/landing/sheets/left.webp, right.webp - see doodleSheets.ts).
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

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { packWall, wallClassOf, wallPath, wallSeed, WALL_CLASSES, WALL_THEMES, WALL_TILE, WALL_VARIANTS, type WallTheme } from "../src/app/landing/doodleWall";
import { bakeSheet, shareSheets, sheetBakeInput, SHEET_CLASSES, SHEET_INK, SHEET_SEEDS, SHEET_TILE } from "../src/app/landing/doodleSheets";
import { SHEET_IDS, sheetPath } from "../src/app/landing/video/sheets";

const ROOT = path.resolve(import.meta.dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const choices = JSON.parse(readFileSync(path.join(ROOT, "src/app/landing/doodleChoices.json"), "utf8")) as { wall: string[]; sheets: string[] };

// A site file as a data URL: the baking page is blank, and a page given
// file:// images could not read its own canvas back.
const MIME: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg" };
const dataUrl = (sitePath: string) =>
  `data:${MIME[path.extname(sitePath)]};base64,${readFileSync(path.join(PUBLIC, sitePath)).toString("base64")}`;
const classOf = (full: string) => wallClassOf(full.split("/")[1].replace(/-\d+$/, ""));
// Each chosen drawing, with the size it is drawn at.
const drawingsOf = (ids: string[]) => ids.map((full) => ({ src: dataUrl(`/landing/doodles/${full}.webp`), cls: classOf(full) }));
const drawings = drawingsOf(choices.wall);

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
mkdirSync(path.join(PUBLIC, "landing/doodle-walls"), { recursive: true });
// The one wall there was before the themes.
rmSync(path.join(PUBLIC, "landing/doodle-wall.webp"), { force: true });
for (const theme of Object.keys(WALL_THEMES) as WallTheme[]) {
  const sizes: number[] = [];
  for (let variant = 0; variant < WALL_VARIANTS; variant++) {
    const result = await page.evaluate(packWall, {
      drawings,
      classes: WALL_CLASSES,
      tile: WALL_TILE,
      ink: WALL_THEMES[theme].ink,
      paper: WALL_THEMES[theme].paper,
      seed: wallSeed(variant),
    });
    const bytes = Buffer.from(result.url.split(",")[1], "base64");
    writeFileSync(path.join(PUBLIC, wallPath(theme, variant)), bytes);
    sizes.push(Math.round(bytes.length / 1024));
    if (theme === "light") console.log(`  ${theme}-${variant}: placed ${result.counts.join(" + ")} (big, middle, small), ${(result.covered * 100).toFixed(0)}% of the tile`);
  }
  console.log(`${theme}: ${WALL_VARIANTS} walls, ${sizes.join(", ")} KB`);
}
// The loose sheets: the sheets' drawings shared between the two, each packed
// whole inside its paper and laid into the film.
mkdirSync(path.join(PUBLIC, "landing/sheets"), { recursive: true });
const shared = shareSheets(choices.sheets ?? [], classOf);
for (const id of SHEET_IDS) {
  const packed = await page.evaluate(packWall, {
    drawings: drawingsOf(shared[id]),
    classes: SHEET_CLASSES,
    tile: SHEET_TILE,
    ink: SHEET_INK,
    paper: "#ffffff",
    seed: SHEET_SEEDS[id],
    wrap: false,
  });
  const baked = await page.evaluate(bakeSheet, sheetBakeInput(id, packed.url, dataUrl));
  const bytes = Buffer.from(baked.split(",")[1], "base64");
  writeFileSync(path.join(PUBLIC, sheetPath(id)), bytes);
  console.log(`sheet ${id}: ${shared[id].length} drawings, placed ${packed.counts.join(" + ")}, ${Math.round(bytes.length / 1024)} KB`);
}
await browser.close();
console.log(`${drawings.length} drawings chosen for the wall, ${(choices.sheets ?? []).length} for the sheets`);

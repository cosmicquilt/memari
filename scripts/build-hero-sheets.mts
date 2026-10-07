// The hero's two loose sheets: the base week (heroExtras.ts, BASE_SPREAD),
// printed, written in and laid into the film by the page /dev/sheets, saved
// into public/landing/sheets/ (left.webp, right.webp - see looseSheets.ts).
//
//   npm run dev                  (in another terminal)
//   npm run build:hero-sheets
//
// Drawn by the app's own page rather than a blank one, as the doodle walls
// are: the printing and the handwriting need the app's fonts, the doodle
// library and its glyph sprites - all of which the dev server serves.
// SHEETS_URL overrides where it is (default http://localhost:3000).

import { writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { SHEET_IDS, sheetPath, type SheetId } from "../src/app/landing/video/sheets";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASE = process.env.SHEETS_URL ?? "http://localhost:3000";

let browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch({ channel: "msedge" });
}
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error(`  page: ${m.text()}`));
await page.goto(`${BASE}/dev/sheets`, { waitUntil: "load", timeout: 120_000 });
await page.waitForFunction(() => (window as unknown as { __heroSheets?: unknown }).__heroSheets, null, { timeout: 180_000 });
const sheets = (await page.evaluate("window.__heroSheets")) as Record<SheetId, string>;
await browser.close();
for (const id of SHEET_IDS) {
  const [head, data] = sheets[id].split(",");
  const bytes = Buffer.from(data, "base64");
  if (head !== "data:image/webp;base64" || bytes.subarray(8, 12).toString() !== "WEBP") throw new Error(`The ${id} sheet is not a WebP`);
  writeFileSync(path.join(ROOT, "public", sheetPath(id)), bytes);
  console.log(`sheet ${id}: ${Math.round(bytes.length / 1024)} KB`);
}

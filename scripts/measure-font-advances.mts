// How wide each character of the planner's two faces really is - written to
// src/lib/modules/fontAdvances.ts for the code that has to decide, with no
// browser to ask, whether a heading fits.
//
//   npm run measure:fonts
//
// Re-run whenever a face, its weight or its source changes.
//
// TWO MEASUREMENTS, AND THE WIDER WINS. A heading has to fit on paper and on
// screen, and the two are not the same Newsreader: the PDF embeds the
// variable font from assets/fonts and prints its default optical size (18),
// while the browser picks an optical size from the type's size. Measured on
// "THINGS I'M GRATEFUL FOR": 13.07em in the PDF's font, 13.35em on screen.
// So each character's advance is the larger of:
//   - PRINT: read from the font file's own advance-width table (hmtx), at
//     the default instance jsPDF sets it in;
//   - SCREEN: measured in Chrome with canvas measureText, at 29px - a 7pt
//     heading, in the middle of the 8/7/6/5pt ladder, since the screen's
//     optical size moves with the size and a 100px measurement picked the
//     narrow display cut (the 0.55 labeledBox used, measured true at 100px
//     and 5% narrow at a heading's size).
// Hanken Grotesk has no print file - the PDF sets every planner in
// Newsreader - so it is the screen measurement alone.
//
// Summing per-character advances ignores kerning, which only ever tightens a
// pair, so a width worked out from this table is never narrower than the
// set line.

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import { ensureServer } from "./appUnderTest.mjs";

const CHARACTERS = [
  ...Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)),
  "‘", "’", "“", "”", "–", "—", "…", "·", "•",
  "é", "è", "à", "á", "ñ", "ö", "ü", "ç",
  "É", "È", "À", "Á", "Ñ", "Ö", "Ü", "Ç",
];
const SCREEN_SIZE_PX = 29;

/** Advance widths, in em, from a TrueType file's hmtx table. */
function printAdvances(path: string): Record<string, number> {
  const buf = readFileSync(path);
  const u16 = (o: number) => buf.readUInt16BE(o);
  const i16 = (o: number) => buf.readInt16BE(o);
  const u32 = (o: number) => buf.readUInt32BE(o);
  const tables: Record<string, number> = {};
  for (let i = 0; i < u16(4); i++) {
    const r = 12 + i * 16;
    tables[buf.toString("latin1", r, r + 4)] = u32(r + 8);
  }
  const unitsPerEm = u16(tables.head + 18);
  const numHMetrics = u16(tables.hhea + 34);
  let sub = 0;
  for (let i = 0; i < u16(tables.cmap + 2); i++) {
    const r = tables.cmap + 4 + i * 8;
    if (u16(r) === 3 && u16(r + 2) === 1) sub = tables.cmap + u32(r + 4);
  }
  if (!sub) throw new Error(`${path} has no Windows Unicode BMP cmap`);
  const glyphOf = (code: number) => {
    const segX2 = u16(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      if (code > u16(ends + s * 2)) continue;
      const start = u16(starts + s * 2);
      if (code < start) return 0;
      const delta = i16(deltas + s * 2);
      const rangeOffset = u16(ranges + s * 2);
      if (rangeOffset === 0) return (code + delta) & 0xffff;
      const g = u16(ranges + s * 2 + rangeOffset + (code - start) * 2);
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
  const out: Record<string, number> = {};
  for (const ch of CHARACTERS) {
    const glyph = glyphOf(ch.codePointAt(0)!);
    if (glyph === 0) continue;
    out[ch] = u16(tables.hmtx + Math.min(glyph, numHMetrics - 1) * 4) / unitsPerEm;
  }
  return out;
}

const server = await ensureServer();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  // Any page of the app declares both faces - the root layout loads them.
  await page.goto(`${server.base}/privacy`, { waitUntil: "networkidle" });
  const screen = (await page.evaluate(
    `(async () => {
      const faces = { Newsreader: '"Newsreader"', "Hanken Grotesk": '"Hanken Grotesk"' };
      const sizes = ${SCREEN_SIZE_PX};
      const out = {};
      for (const [name, family] of Object.entries(faces)) {
        await document.fonts.load(sizes + "px " + family);
        if (!document.fonts.check(sizes + "px " + family)) throw new Error(name + " did not load");
        const context = document.createElement("canvas").getContext("2d");
        context.font = sizes + "px " + family;
        // Against a generic fallback: if the face were not really in use the
        // two would measure alike.
        const fallback = document.createElement("canvas").getContext("2d");
        fallback.font = sizes + "px monospace";
        if (context.measureText("THINGS I'M GRATEFUL FOR").width === fallback.measureText("THINGS I'M GRATEFUL FOR").width) {
          throw new Error(name + " measured as the fallback face");
        }
        out[name] = {};
        for (const ch of ${JSON.stringify(CHARACTERS)}) out[name][ch] = context.measureText(ch).width / sizes;
      }
      return out;
    })()`
  )) as Record<string, Record<string, number>>;

  const print = printAdvances("assets/fonts/Newsreader.ttf");
  const round = (value: number) => Math.ceil(value * 10000) / 10000;
  const table: Record<string, Record<string, number>> = {
    Newsreader: Object.fromEntries(
      CHARACTERS.map((ch) => [ch, round(Math.max(print[ch] ?? 0, screen.Newsreader[ch] ?? 0))])
    ),
    "Hanken Grotesk": Object.fromEntries(CHARACTERS.map((ch) => [ch, round(screen["Hanken Grotesk"][ch] ?? 0)])),
  };
  const sample = "THINGS I'M GRATEFUL FOR";
  const em = (face: string) => [...sample].reduce((sum, ch) => sum + (table[face][ch] ?? 0), 0);
  const source =
    `// GENERATED by scripts/measure-font-advances.mts - run \`npm run measure:fonts\`\n` +
    `// rather than editing. Each value is a character's advance in em: for\n` +
    `// Newsreader the wider of the PDF's embedded font and the screen at ${SCREEN_SIZE_PX}px,\n` +
    `// for Hanken Grotesk the screen. See that script for why.\n` +
    `//\n` +
    `// "${sample}": Newsreader ${em("Newsreader").toFixed(3)}em, Hanken Grotesk ${em("Hanken Grotesk").toFixed(3)}em.\n\n` +
    `export const FONT_ADVANCES_EM: Record<"Newsreader" | "Hanken Grotesk", Record<string, number>> = ${JSON.stringify(table, null, 2)};\n`;
  writeFileSync("src/lib/modules/fontAdvances.ts", source);
  console.log(`Wrote src/lib/modules/fontAdvances.ts - "${sample}": Newsreader ${em("Newsreader").toFixed(3)}em (print ${[...sample].reduce((s, c) => s + (print[c] ?? 0), 0).toFixed(3)}, screen ${[...sample].reduce((s, c) => s + (screen.Newsreader[c] ?? 0), 0).toFixed(3)}), Hanken Grotesk ${em("Hanken Grotesk").toFixed(3)}em`);
} finally {
  await browser.close();
  server.stop();
}

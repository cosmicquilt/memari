// SVG single-line fonts -> the stroke data the landing page writes with.
//
// Each glyph of an SVG font is one path of pen strokes: M starts a stroke,
// L and C continue it. The page wants those as polylines it can draw a bit
// of at a time, so curves are sampled into points here, once, rather than in
// the browser on every frame. Coordinates stay in font units (1000 to the
// em, y up from the baseline), rounded to whole units - a unit is a
// thousandth of a letter's height, far finer than any pen.
//
// Only the characters the page writes are kept: printable ASCII.
//
//   npm run build:handwriting
import { readFileSync, writeFileSync } from "node:fs";

// Only the joined script: a pen drawing it along its real path is what makes
// cursive look written. Print hands come from handwriting fonts instead -
// single-line print faces read as a plotter, not a person (see
// handwriting/glyphs.ts).
const FONTS = [["script", "EMSAllure"]] as const;

type Glyph = [advance: number, strokes: number[][]];
type Font = { name: string; ascent: number; descent: number; glyphs: Record<string, Glyph> };

const decode = (value: string) =>
  value.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function strokesOf(d: string): number[][] {
  const tokens = d.match(/[MLC]|-?\d*\.?\d+(?:e-?\d+)?/gi) ?? [];
  const strokes: number[][] = [];
  let current: number[] = [];
  let i = 0;
  let command = "";
  const num = () => Number(tokens[i++]);
  const push = (x: number, y: number) => current.push(Math.round(x), Math.round(y));
  while (i < tokens.length) {
    if (/^[MLC]$/i.test(tokens[i])) command = tokens[i++].toUpperCase();
    if (command === "M") {
      if (current.length >= 4) strokes.push(current);
      current = [];
      push(num(), num());
      command = "L"; // further pairs after M are lines
    } else if (command === "L") {
      push(num(), num());
    } else if (command === "C") {
      const x0 = current[current.length - 2];
      const y0 = current[current.length - 1];
      const [x1, y1, x2, y2, x3, y3] = [num(), num(), num(), num(), num(), num()];
      for (let s = 1; s <= 8; s++) {
        const t = s / 8;
        const u = 1 - t;
        push(
          u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3
        );
      }
    } else {
      i++;
    }
  }
  if (current.length >= 4) strokes.push(current);
  return strokes;
}

const out: Record<string, Font> = {};
for (const [key, file] of FONTS) {
  const svg = readFileSync(`assets/single-line-fonts/${file}.svg`, "utf8");
  const face = /<font-face[^>]*>/.exec(svg)?.[0] ?? "";
  const attr = (tag: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1];
  const glyphs: Record<string, Glyph> = {};
  for (const tag of svg.match(/<glyph\b[^>]*>/g) ?? []) {
    const unicode = attr(tag, "unicode");
    if (unicode === undefined) continue;
    const char = decode(unicode);
    if (char.length !== 1 || char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126) continue;
    glyphs[char] = [Math.round(Number(attr(tag, "horiz-adv-x") ?? 500)), strokesOf(attr(tag, "d") ?? "")];
  }
  out[key] = {
    name: /Font name:\s*(.+)/.exec(svg)?.[1].trim() ?? file,
    ascent: Number(attr(face, "ascent") ?? 800),
    descent: Number(attr(face, "descent") ?? -200),
    glyphs,
  };
  console.log(`${key.padEnd(8)} ${out[key].name}: ${Object.keys(glyphs).length} glyphs`);
}
const json = JSON.stringify(out);
writeFileSync("src/app/landing/handwriting/strokeFonts.json", json);
console.log(`wrote strokeFonts.json, ${(json.length / 1024).toFixed(1)} KB`);

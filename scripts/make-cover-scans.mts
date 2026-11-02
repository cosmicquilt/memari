// THE PRINT SCANS (2026-11-01): one image per cover on /covers, made from
// the 4K texture it was pictured with, ready to print.
//
//   npm run covers:scans            (reads handoff/textures, writes
//                                    handoff/print-scans and the manifest)
//
// Each scan is the texture's lit version (bake_light.py: relief baked in
// from its surface maps, the look every carousel picture and swatch was
// made from), stood upright, kept at no more than 3600 pixels on its narrow
// side - 351 ppi down a hardcover's 10.25in board, more than the 300 the
// print rule asks - and saved as a plain JPEG at quality 85, which the PDF
// carries as it is. Smaller scans are kept at their own size.
//
// The scans are CC0 (handoff/textures/CREDITS.md) and too large for the
// repository: they live on a file host (COVER_SCANS_URL) or, here, in a
// folder (COVER_SCANS_DIR). What the repository keeps is the manifest,
// src/lib/print/coverScans.json - each scan's size and fingerprint, so the
// server knows a scan before it fetches it and refuses one that is not the
// file this made.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import covers from "../src/app/landing/coverCarousel.json" with { type: "json" };

const TEXTURES = "handoff/textures";
const OUT = process.env.COVER_SCANS_DIR || "handoff/print-scans";
const MANIFEST = "src/lib/print/coverScans.json";
const NARROW_MAX = 3600;

/** The texture a cover was pictured with: its lit version, or the night
 *  sky's two camera views (nightsky.py), which have no surface maps. */
function sourceOf(id: string): string {
  if (id.startsWith("NightSkyHDRI008")) return path.join(TEXTURES, "sky/NightSkyHDRI008", id.endsWith("-stars") ? "view-stars.jpg" : "view-milkyway.jpg");
  for (const group of readdirSync(TEXTURES)) {
    const dir = path.join(TEXTURES, group, id);
    if (group.startsWith("_") || !existsSync(dir) || !statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir);
    const file = files.find((f) => /_Lit\.jpg$/.test(f)) ?? files.find((f) => /_Color\.(jpg|png)$/.test(f));
    if (file) return path.join(dir, file);
  }
  throw new Error(`No texture for ${id} under ${TEXTURES}.`);
}

mkdirSync(OUT, { recursive: true });
const manifest: Record<string, { w: number; h: number; bytes: number; sha256: string }> = {};
for (const { id } of [...(covers as Array<{ id: string }>)].sort((a, b) => a.id.localeCompare(b.id))) {
  const source = sourceOf(id);
  const meta = await sharp(source).metadata();
  // stood upright: the 2:1 scans are wider than tall
  const turn = (meta.width ?? 0) > (meta.height ?? 0) * 1.2;
  const [w0, h0] = turn ? [meta.height!, meta.width!] : [meta.width!, meta.height!];
  const scale = Math.min(1, NARROW_MAX / Math.min(w0, h0));
  const [w, h] = [Math.round(w0 * scale), Math.round(h0 * scale)];
  const bytes = await sharp(source)
    .rotate(turn ? 90 : 0)
    .resize(w, h, { kernel: "lanczos3" })
    .toColourspace("srgb")
    .jpeg({ quality: 85, chromaSubsampling: "4:2:0", progressive: false, mozjpeg: false })
    .toBuffer();
  writeFileSync(path.join(OUT, `${id}.jpg`), bytes);
  manifest[id] = { w, h, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  console.log(`${id.padEnd(24)} ${w}x${h} ${(bytes.length / 1e6).toFixed(2)} MB  <- ${path.basename(source)}`);
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
const total = Object.values(manifest).reduce((sum, s) => sum + s.bytes, 0);
console.log(`\n${Object.keys(manifest).length} scans, ${(total / 1e6).toFixed(0)} MB, in ${OUT}; manifest ${MANIFEST}`);

// The photographed covers (coverTexture.ts, 2026-11-01): what each of the 85
// prints, how its scan is laid across the boards and how sharp it comes
// out, where the mark and the words go, and the PDF it makes.
//
// Expected values are stated here, worked out by hand from the sizes
// (a 3600-pixel scan down a 10.25in sheet is 351 ppi), not asked of the
// code. Each guard was broken once to see it fail - placeScan's cover-fit
// made a contain-fit (Math.min): "A SCAN COVERS ITS STRETCH" and the
// sharpness counts fail; markBox's safety clamp removed: "THE CORNER MARK
// KEEPS INSIDE A HARDCOVER'S 0.75IN" fails; the back drawn from a second copy of
// the scan: "THE SCAN IS CARRIED ONCE" fails; the soft-scan refusal
// removed: "A SCAN TOO SMALL IS REFUSED" fails.
//
// Run as part of: npm test

import sharp from "sharp";
import { COVERS, describeBrand } from "@/app/covers/catalogue";
import manifest from "./coverScans.json";
import { COVER_MARKS } from "./coverMarks.generated";
import { CoverTooSoftError, estimatedScanPpi, MARK_PLACES, markBox, markKey, MIN_COVER_PPI, placeScan, scanPlacements, type TextureCover } from "./coverTexture";
import { buildCoverPdf, coverLayout } from "./cover";
import { coverDatesWords } from "./orderBook";

let failures = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
};
const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;
const SCANS: Record<string, { w: number; h: number; bytes: number; sha256: string }> = manifest;

// ---- what each cover prints
{
  const a = describeBrand("m-centre+dates blind");
  check(a.kind === "m-centre" && a.face === "sans" && a.finish === "imprint" && a.tone === null && a.dated, "an m. in the centre with dates, imprinted: sans, no gold");
  const b = describeBrand("wordmark serif foil");
  check(b.kind === "wordmark" && b.face === "serif" && b.finish === "gold" && b.tone === "gold" && !b.dated, "a serif wordmark in gold");
  const c = describeBrand("wordmark+dates sans foil dark");
  check(c.kind === "wordmark" && c.face === "sans" && c.tone === "dark" && c.dated && c.finishName === "Dark gold", "a sans wordmark in dark gold, dated");
  const d = describeBrand("m-corner foil deep");
  check(d.kind === "m-corner" && d.face === "sans" && d.tone === "deep", "an m. in the corner in deep gold");
  check(COVERS.length === 85, `85 covers (${COVERS.length})`);
  const noScan = COVERS.filter((cover) => !SCANS[cover.id]).map((cover) => cover.id);
  check(noScan.length === 0, `EVERY COVER HAS A PRINT SCAN in the manifest (${noScan.join(", ") || "none missing"})`);
  const noMark = COVERS.filter((cover) => !COVER_MARKS[markKey(cover)]).map((cover) => `${cover.id} ${markKey(cover)}`);
  check(noMark.length === 0, `every cover's mark, in its finish, has a picture (${noMark.join(", ") || "none missing"})`);
}

// ---- how a scan is laid on a sheet
{
  // a wire-o page, 7.24 x 10.24in: a 3600 square scan is held by its height
  const page = { w: (184 / 25.4) * 72, h: (260 / 25.4) * 72 };
  const front = placeScan({ width: 3600, height: 3600 }, 0, page.w, page.h, "right");
  check(near(front.ppi, 3600 / (260 / 25.4)) && near(front.h, page.h) && near(front.x + front.w, page.w) && front.x <= 0, `A SCAN COVERS ITS STRETCH: full height, held to the right edge, ${front.ppi.toFixed(0)} ppi (351 expected)`);
  // a 2:1 scan stood upright is held by its width
  const tall = placeScan({ width: 2048, height: 4096 }, 0, page.w, page.h, "left");
  check(near(tall.ppi, 2048 / (184 / 25.4), 1) && near(tall.w, page.w) && tall.h >= page.h && near(tall.x, 0), `a 2:1 scan, upright, held by its width: ${tall.ppi.toFixed(0)} ppi (283 expected)`);

  // a paperback wrap: the fold is the back's edge at the spine
  const sheet = { widthPt: 2 * (504 + 9) + 32, heightPt: 738, trimWidthIn: 7, trimHeightIn: 10 };
  const layout = coverLayout(sheet);
  const placed = scanPlacements({ width: 3600, height: 3600 }, sheet, layout, "wrap");
  check(near(placed.fold, 9 + 504), `a wrap's seam on the fold between the back and the spine (${placed.fold.toFixed(1)}pt, 513 expected)`);
  check(near(placed.front.x + placed.front.w, sheet.widthPt) && placed.front.x <= placed.fold && near(placed.back.x, 0) && placed.back.x + placed.back.w >= placed.fold, "the front's picture reaches the fold from the right edge, the back's from the left");
  // panels: two pages side by side, the seam between them
  const panels = { widthPt: page.w * 2, heightPt: page.h, trimWidthIn: 7, trimHeightIn: 10 };
  const pl = scanPlacements({ width: 3600, height: 3600 }, panels, coverLayout(panels), "panels");
  check(near(pl.fold, page.w), `wire-o's seam between its two pages (${pl.fold.toFixed(1)}pt)`);
}

// ---- how sharp every cover prints, binding by binding (estimated sheets)
{
  const trim = { widthIn: 7, heightIn: 10 };
  const ppis = Object.entries(SCANS).map(([id, s]) => ({
    id,
    wireo: estimatedScanPpi({ width: s.w, height: s.h }, { form: "panels", hardcover: false }, trim, 200),
    paperback: estimatedScanPpi({ width: s.w, height: s.h }, { form: "wrap", hardcover: false }, trim, 200),
    hardcover: estimatedScanPpi({ width: s.w, height: s.h }, { form: "wrap", hardcover: true }, trim, 200),
  }));
  const under300 = ppis.filter((p) => p.wireo < 300).map((p) => p.id).sort();
  check(JSON.stringify(under300) === JSON.stringify(["Bricks075A", "Concrete034", "Wood047"]), `on wire-o every scan prints at 300 ppi or more but the three 2:1 scans (${under300.join(", ")})`);
  check(ppis.every((p) => p.wireo >= 280 && p.paperback >= 260), `none under 280 on wire-o, 260 on a paperback (lowest ${Math.min(...ppis.map((p) => p.wireo)).toFixed(0)}, ${Math.min(...ppis.map((p) => p.paperback)).toFixed(0)})`);
  const refused = ppis.filter((p) => p.hardcover < MIN_COVER_PPI).map((p) => p.id).sort();
  check(JSON.stringify(refused) === JSON.stringify(["Bricks075A", "Concrete034", "Wood047"]), `a hardcover's wider boards rule out only the 2:1 scans (${refused.join(", ")})`);
}

// ---- where the mark goes
{
  const front = { left: 0, top: 0, width: 504, height: 720 };
  const cover = (kind: TextureCover["kind"], face: TextureCover["face"] = "sans"): TextureCover => ({ id: "x", kind, face, finish: "imprint", tone: null, dated: false });
  const centre = markBox(cover("m-centre"), front, 15 / 25.4 * 72);
  check(near(centre.w, MARK_PLACES["m-centre"].width * 504) && near(centre.x + centre.w / 2, 252) && near(centre.y + centre.h / 2, 0.34 * 720), `the m. a third of the way down the middle, 0.132 of the width (${centre.w.toFixed(1)}pt wide at ${((centre.y + centre.h / 2) / 720).toFixed(3)})`);
  const word = markBox(cover("wordmark", "serif"), front, 36);
  check(near(word.x + word.w / 2, 252) && near(word.y + word.h / 2, 0.32 * 720) && near(word.w, 0.257 * 504), "the wordmark 0.32 down the middle, 0.257 of the width");
  // where it was measured it sits 46pt from the foot: inside wire-o's 15mm
  // (42.5pt), but not a hardcover's 0.75in, so there it moves up
  const safe = 0.75 * 72;
  const corner = markBox(cover("m-corner"), front, safe);
  check(corner.x + corner.w <= 504 - safe + 0.01 && corner.y + corner.h <= 720 - safe + 0.01, `THE CORNER MARK KEEPS INSIDE A HARDCOVER'S 0.75IN (its foot ${(720 - corner.y - corner.h).toFixed(1)}pt from the edge, ${safe.toFixed(1)} needed)`);
  const wire = markBox(cover("m-corner"), front, (15 / 25.4) * 72);
  check(near(wire.y + wire.h / 2, 0.922 * 720), "and stays where it was measured inside wire-o's 15mm");
}

// ---- the dates in words
{
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const cases: Array<[string, string, string]> = [
    ["2027-01-01", "2027-03-31", "January to March 2027"],
    ["2027-02-01", "2027-02-28", "February 2027"],
    ["2026-12-01", "2027-02-28", "December 2026 to February 2027"],
    ["2027-01-04", "2027-04-03", "4 January to 3 April 2027"],
    ["2026-12-28", "2027-03-27", "28 December 2026 to 27 March 2027"],
  ];
  for (const [start, end, words] of cases) {
    const got = coverDatesWords({ start: d(start), end: d(end) });
    check(got === words, `${start}..${end} reads "${got}" ("${words}")`);
  }
}

// ---- the PDF
{
  const scanOf = async (w: number, h: number) => ({
    data: new Uint8Array(await sharp({ create: { width: w, height: h, channels: 3, background: { r: 140, g: 120, b: 100 } } }).jpeg({ quality: 80 }).toBuffer()),
    width: w,
    height: h,
  });
  const scan = await scanOf(3600, 3600);
  const cover: TextureCover = { id: "Onyx010", kind: "wordmark", face: "serif", finish: "gold", tone: "gold", dated: true };
  const page = { widthPt: (184 / 25.4) * 72, heightPt: (260 / 25.4) * 72 };
  const panels = buildCoverPdf({ ...page, form: "panels", trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "1 Jan – 31 Mar 2027", datesWords: "January to March 2027", texture: { cover, scan } });
  const text = Buffer.from(panels.bytes).toString("latin1");
  const jpegs = (text.match(/\/Filter \/DCTDecode/g) ?? []).length;
  check(panels.pages === 2 && jpegs === 1, `THE SCAN IS CARRIED ONCE, drawn on both of wire-o's pages (${panels.pages} pages, ${jpegs} JPEG)`);
  check(/\/SMask/.test(text), "the mark's picture is in it, with its see-through edges");
  check(panels.ppi !== null && near(panels.ppi, 351, 1), `and the sheet says how sharp (${panels.ppi?.toFixed(0)} ppi)`);
  const wrap = buildCoverPdf({ widthPt: 1058, heightPt: 738, trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "", texture: { cover, scan } });
  check(wrap.pages === 1 && wrap.ppi !== null && wrap.bytes.byteLength < scan.data.length + 400_000, `a wrap: one page, the scan and little else (${(wrap.bytes.byteLength / 1e6).toFixed(2)} MB for a ${(scan.data.length / 1e6).toFixed(2)} MB scan)`);
  const drawn = buildCoverPdf({ widthPt: 1058, heightPt: 738, trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "" });
  check(drawn.ppi === null && !/DCTDecode/.test(Buffer.from(drawn.bytes).toString("latin1")), "without a photographed cover, the drawn one, no picture");
  let refused = false;
  try {
    buildCoverPdf({ ...page, form: "panels", trimWidthIn: 7, trimHeightIn: 10, title: "My Journal", dates: "", texture: { cover, scan: await scanOf(1200, 1200) } });
  } catch (error) {
    refused = error instanceof CoverTooSoftError;
  }
  check(refused, "A SCAN TOO SMALL IS REFUSED: 1200 pixels down a wire-o page is 117 ppi");
}

if (failures > 0) {
  console.error(`\n${failures} cover check(s) failed.`);
  process.exitCode = 1;
} else console.log("\nAll photographed-cover checks passed.");

"use client";

// The base week on the hero's loose sheets: each page printed and written
// in as the journal's are (PageSurface, bare; the handwriting, finished),
// centred on its sheet like a printout, and baked into the film by
// bakeSheet - then shown on the film's resting frame, clipped to the book as
// the hero clips it. The baked pictures are left on `window.__heroSheets`
// for scripts/build-hero-sheets.mts to save.

import { useEffect, useState } from "react";
import type { LandingSpread } from "@/app/landing/spreads";
import { PageSurface } from "@/app/landing/desk/pageSurface";
import { familiesFor, planSpread } from "@/app/landing/handwriting/plan";
import { inkTimeline, paintInk, prepareInk } from "@/app/landing/handwriting/ink";
import { loadArtIndex } from "@/app/landing/handwriting/art";
import { HAND_FONT_CLASSES } from "@/app/landing/handFonts";
import { BASE_SHEET, bakeSheet, sheetBakeInput, SHEET_TILE } from "@/app/landing/looseSheets";
import { BOOK_ON_SHEETS, SHEET_IDS, SHEETS, sheetShows, type SheetId } from "@/app/landing/video/sheets";
import { HERO_VIDEO } from "@/app/landing/video/heroVideo";

type Baked = { tiles: Record<SheetId, string>; sheets: Record<SheetId, string>; film: string };

const load = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src.slice(0, 60)}`));
    img.src = src;
  });

async function bake(spread: LandingSpread, seed: number): Promise<Baked> {
  const tileW = SHEET_TILE.w * SHEET_TILE.scale;
  const tileH = SHEET_TILE.h * SHEET_TILE.scale;
  const height = Math.round(tileH * BASE_SHEET.fill);
  const pages = [new PageSurface(height, { bare: true }), new PageSurface(height, { bare: true })] as const;
  for (const [i, page] of spread.pages.entries()) await pages[i].print(page, spread.fontFamily, i === 0 ? "left" : "right");

  // Written in, all of it: the journal's writing at its end.
  await Promise.all([...familiesFor(spread.key).map((family) => document.fonts.load(`40px ${family}`).catch(() => [])), loadArtIndex()]);
  const { strokes } = inkTimeline(planSpread(spread, seed), 14, seed);
  await prepareInk(strokes, pages[0].scale);
  paintInk(strokes, Infinity, [pages[0].layers, pages[1].layers], pages[0].scale);
  for (const page of pages) page.compose();

  const tiles = {} as Record<SheetId, string>;
  const sheets = {} as Record<SheetId, string>;
  for (const [i, id] of SHEET_IDS.entries()) {
    const page = pages[i].canvas;
    const tile = document.createElement("canvas");
    tile.width = tileW;
    tile.height = tileH;
    const g = tile.getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, tileW, tileH);
    g.drawImage(page, Math.round((tileW - page.width) / 2), Math.round((tileH - page.height) / 2));
    tiles[id] = tile.toDataURL("image/png");
    sheets[id] = await bakeSheet(sheetBakeInput(id, tiles[id], (p) => p));
  }

  // On the film's resting frame (1920 across: half the 4K frame the sheets
  // are measured in), multiplied and clipped to the book as the hero does.
  const frame = await load(HERO_VIDEO.last);
  const c = document.createElement("canvas");
  c.width = frame.width;
  c.height = frame.height;
  const g = c.getContext("2d")!;
  g.drawImage(frame, 0, 0);
  g.globalCompositeOperation = "multiply";
  const k = frame.width / HERO_VIDEO.width;
  const rest = BOOK_ON_SHEETS.right.length - 1;
  for (const id of SHEET_IDS) {
    const [x, y, w, h] = SHEETS[id].box;
    const shows = sheetShows(id, rest);
    g.save();
    if (shows) {
      g.beginPath();
      shows.forEach(([X, Y], i) => (i ? g.lineTo(X * k, Y * k) : g.moveTo(X * k, Y * k)));
      g.closePath();
      g.clip();
    }
    g.drawImage(await load(sheets[id]), x * k, y * k, w * k, h * k);
    g.restore();
  }
  return { tiles, sheets, film: c.toDataURL("image/jpeg", 0.9) };
}

export function SheetsBake({ spread, seed }: { spread: LandingSpread; seed: number }) {
  const [baked, setBaked] = useState<Baked | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    bake(spread, seed).then(
      (out) => {
        if (!live) return;
        setBaked(out);
        (window as unknown as { __heroSheets?: Record<SheetId, string> }).__heroSheets = out.sheets;
      },
      (e) => live && setError(e instanceof Error ? e.message : String(e))
    );
    return () => {
      live = false;
    };
  }, [spread, seed]);

  return (
    <main className={HAND_FONT_CLASSES.join(" ")} style={{ minHeight: "100vh", background: "#f5ead5", color: "#1c1917", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <p style={{ margin: "0 0 12px" }}>
        {error
          ? `Not baked: ${error}`
          : baked
            ? `The base week on the loose sheets (seed ${seed}), on the film's resting frame. Save it with: npm run build:hero-sheets${seed === BASE_SHEET.seed ? "" : ` (after setting BASE_SHEET.seed to ${seed})`}`
            : "Printing and writing the base week..."}
      </p>
      {baked && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={baked.film} alt="The loose sheets on the film's resting frame" style={{ width: "100%", maxWidth: 1600, display: "block" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12, maxWidth: 1600 }}>
            {SHEET_IDS.map((id) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} src={baked.tiles[id]} alt={`The ${id} sheet, flat`} style={{ width: "100%", background: "#fff" }} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

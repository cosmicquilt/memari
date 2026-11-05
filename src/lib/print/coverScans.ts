// THE SCANS A PHOTOGRAPHED COVER PRINTS FROM (2026-11-01), and the journal's
// choice of cover.
//
// A journal's cover is Planner.theme.cover, a scan id from /covers' list
// ("Onyx004"), or nothing for the drawn cover. It belongs to the journal,
// not to an order, so the next book, a renewal, and a coach's clients (whose
// journals take the template's theme) print it too.
//
// The scans themselves are too large for the repository (85 of them, 318 MB:
// make-cover-scans.mts) and live on a file host, COVER_SCANS_URL - any
// address that serves <id>.jpg, such as a public Vercel Blob store - or in a
// folder, COVER_SCANS_DIR (on a computer that made them, handoff/print-scans
// unless set). Each is checked against the manifest's fingerprint before it
// is printed, so a host serving another file prints nothing. Without either,
// photographed covers are not offered: the order screen shows the drawn
// cover only, and a journal that chose one is told so before anything is
// charged.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { coverById } from "@/app/covers/catalogue";
import type { PlannerTheme } from "@/lib/theme";
import { BINDING_SPECS, type Binding } from "./products";
import { estimatedScanPpi, MIN_COVER_PPI, type CoverScan, type TextureCover } from "./coverTexture";
import { scanSource } from "./coverSource";
import { frontOf } from "./coverFront";
import manifest from "./coverScans.json";
import { OrderError } from "./orderBook";

export { photographedCoversOffered } from "./coverSource";

const SCANS: Record<string, { w: number; h: number; bytes: number; sha256: string }> = manifest;

/** The journal's photographed cover, or null for the drawn one: only a
 *  cover that is on /covers and has a scan counts. */
export function journalCover(theme: unknown): TextureCover | null {
  const id = (theme as PlannerTheme | null)?.cover;
  if (typeof id !== "string" || !SCANS[id]) return null;
  const cover = coverById(id);
  if (!cover) return null;
  // the journal's own front, or the cover as pictured (every journal before
  // 2026-11-05: it prints just as it did)
  const front = frontOf(theme, cover);
  const kind = front.mark === "none" ? "none" : front.mark === "m-corner" ? "m-corner" : front.mark === "m-centre" ? "m-centre" : "wordmark";
  return {
    id: cover.id,
    kind,
    face: front.mark === "wordmark-serif" ? "serif" : "sans",
    finish: front.finish,
    // a light cover's gold is the deeper gold its picture has
    tone: front.finish === "gold" ? cover.goldTone : null,
    dated: front.dates,
    name: front.name,
  };
}

/** Is this a cover a journal may choose? */
export function choosableCover(id: string): boolean {
  return !!SCANS[id] && !!coverById(id);
}

/** A scan's size, before it is fetched. */
export function scanSize(id: string): { width: number; height: number } | null {
  const scan = SCANS[id];
  return scan ? { width: scan.w, height: scan.h } : null;
}

// The last few scans fetched, kept: a quote and the order after it, or a
// group's books, print the same one.
const kept = new Map<string, CoverScan>();
const KEEP = 4;

/** A cover's scan, checked against the manifest. */
export async function loadCoverScan(id: string): Promise<CoverScan> {
  const known = SCANS[id];
  if (!known) throw new OrderError("That cover isn't one we print. Choose another.");
  const hit = kept.get(id);
  if (hit) return hit;
  const source = scanSource();
  if (!source) throw new OrderError("Photographed covers can't be printed yet. Choose the plain cover for now.");
  let bytes: Uint8Array;
  try {
    if ("dir" in source) bytes = new Uint8Array(await readFile(path.join(source.dir, `${id}.jpg`)));
    else {
      const response = await fetch(`${source.url}/${id}.jpg`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
  } catch (error) {
    console.error(`[covers] ${id}: the scan could not be fetched`, error);
    throw new OrderError("That cover can't be fetched right now. Try again in a minute, or choose another.");
  }
  if (createHash("sha256").update(bytes).digest("hex") !== known.sha256) {
    console.error(`[covers] ${id}: the scan is not the one in the manifest`);
    throw new OrderError("That cover can't be printed right now. Choose another, or the plain cover.");
  }
  const scan = { data: bytes, width: known.w, height: known.h };
  kept.set(id, scan);
  while (kept.size > KEEP) kept.delete(kept.keys().next().value!);
  return scan;
}

/** What a cover sheet is drawn from for this journal: its photographed
 *  cover and the scan, or null for the drawn cover. */
export async function coverTextureFor(theme: unknown): Promise<{ cover: TextureCover; scan: CoverScan } | null> {
  const cover = journalCover(theme);
  return cover ? { cover, scan: await loadCoverScan(cover.id) } : null;
}

/** Why a binding can't carry this cover, or null where it can: a scan that
 *  would print under 250 ppi on its sheet (a hardcover's boards are wider
 *  than a 2:1 scan holds). */
export function coverMisfit(theme: unknown, binding: Binding, form: "wrap" | "panels", trim: { widthIn: number; heightIn: number }, pageCount: number): string | null {
  const cover = journalCover(theme);
  if (!cover) return null;
  const size = scanSize(cover.id)!;
  const ppi = estimatedScanPpi(size, { form, hardcover: binding === "hardcover" }, trim, pageCount);
  return ppi < MIN_COVER_PPI ? `This cover's scan isn't large enough for a ${BINDING_SPECS[binding].short.toLowerCase()}. Choose another cover or binding.` : null;
}

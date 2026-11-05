// A cover's whole scan, for the covers page's close look at a front
// (2026-11-05: "when clicked, cover pops up in full detail zoomable") - the
// 4K texture the printed cover is made from (make-cover-scans.mts), at up to
// 3600 pixels.
//
// Where the scans are on a file host (COVER_SCANS_URL, a public Vercel Blob
// store in production) this sends the browser there, so the 2-4 MB picture
// never passes through a function; on a computer that made them (dev:
// handoff/print-scans) it reads the file. Nowhere to get them: 404, and the
// page keeps its own smaller front.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { coverBySlug } from "../../catalogue";
import { scanSource } from "@/lib/print/coverSource";

export const runtime = "nodejs";

// a scan's address names its version (covers/v1), so a day's caching is safe
const CACHE = "public, max-age=86400, stale-while-revalidate=604800";
const none = () => new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const cover = coverBySlug((await params).slug);
  const source = scanSource();
  if (!cover || !source) return none();
  if ("url" in source) return new Response(null, { status: 307, headers: { Location: `${source.url}/${cover.id}.jpg`, "Cache-Control": CACHE } });
  try {
    const bytes = await readFile(path.join(source.dir, `${cover.id}.jpg`));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/jpeg", "Content-Length": String(bytes.byteLength), "Cache-Control": CACHE } });
  } catch {
    return none();
  }
}

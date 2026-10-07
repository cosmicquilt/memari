// Saves the body doodle wall's settings from the sliders on the landing page
// (BodyWallTuner.tsx) into src/app/landing/bodyWallSettings.json.
//
// DEVELOPMENT ONLY, and only from this machine - see ../save/route.ts.

import { writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const FILE = path.join(process.cwd(), "src/app/landing/bodyWallSettings.json");
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
/** Each number's allowed range - the sliders' own. */
const RANGES: Record<string, [number, number]> = {
  peekDesktop: [0, 40],
  peekMobile: [0, 40],
  bandDesktop: [0, 150],
  bandMobile: [0, 150],
  gap: [0, 48],
  clearance: [0, 96],
  size: [0.4, 1.8],
  density: [0.05, 2],
  ink: [0.05, 1],
  seed: [0, 1e9],
  sideBlur: [0, 16],
  sideBlurWidth: [0, 40],
  openSeconds: [1, 6],
  tornScale: [0.2, 1],
  tornShadow: [0, 2],
  vignetteTop: [0, 1],
  vignetteTopReach: [0, 60],
  vignetteBottom: [0, 1],
  vignetteBottomReach: [0, 60],
  vignetteSides: [0, 1],
  vignetteSidesReach: [0, 50],
  vignetteCorners: [0, 1],
  youSeconds: [0.6, 6],
};
/** The torn edges there are (TornEdge.tsx). */
const TORN_EDGES = new Set(["drawn", "flow-fine", "flow-bold", "none"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!LOCAL.has(url.hostname) || (origin && !LOCAL.has(new URL(origin).hostname))) {
    return new Response("Only from this machine", { status: 403 });
  }
  const body = (await request.json()) as Record<string, unknown>;
  const out: Record<string, number | boolean | string> = {};
  for (const [key, [lo, hi]] of Object.entries(RANGES)) {
    const v = body[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      return Response.json({ error: `${key} must be a number from ${lo} to ${hi}` }, { status: 400 });
    }
    out[key] = v;
  }
  if (typeof body.newEachLoad !== "boolean") return Response.json({ error: "newEachLoad must be true or false" }, { status: 400 });
  out.newEachLoad = body.newEachLoad;
  if (typeof body.tornEdge !== "string" || !TORN_EDGES.has(body.tornEdge)) return Response.json({ error: `tornEdge must be one of ${[...TORN_EDGES].join(", ")}` }, { status: 400 });
  out.tornEdge = body.tornEdge;
  await writeFile(FILE, `${JSON.stringify(out, null, 2)}\n`);
  return Response.json({ ok: true });
}

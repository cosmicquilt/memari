// Saves the doodle control panel's choices (/dev/doodles): which drawings
// the start dialog's wall and the hero's sketch boxes use, into
// src/app/landing/doodleChoices.json - and, when the wall changed, the wall
// the panel drew, into public/landing/doodle-wall.webp.
//
// DEVELOPMENT ONLY, and only from this machine. It writes files in the
// working tree - which is how a choice reaches production: saved here,
// committed, pushed. In production it does not exist (404), and it refuses
// any request not addressed to localhost, so a dev server reachable on the
// network cannot be written to by anything else on it.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

const ROOT = process.cwd();
const CHOICES = path.join(ROOT, "src/app/landing/doodleChoices.json");
const WALL = path.join(ROOT, "public/landing/doodle-wall.webp");
const INDEX = path.join(ROOT, "public/landing/doodles/index.json");
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!LOCAL.has(url.hostname) || (origin && !LOCAL.has(new URL(origin).hostname))) {
    return new Response("Only from this machine", { status: 403 });
  }

  const body = (await request.json()) as { wall?: unknown; sketchBox?: unknown; wallImage?: unknown };
  // Every id must be a drawing the library has: "style/subject-n".
  const index = JSON.parse(await readFile(INDEX, "utf8")) as Record<string, Record<string, Array<[string, number, number]>>>;
  const known = new Set(Object.entries(index).flatMap(([style, subjects]) => Object.values(subjects).flat().map(([id]) => `${style}/${id}`)));
  const list = (value: unknown) =>
    Array.isArray(value) && value.every((v) => typeof v === "string" && known.has(v)) ? [...new Set(value as string[])].sort() : null;
  const wall = list(body.wall);
  const sketchBox = list(body.sketchBox);
  if (!wall || !sketchBox) return Response.json({ error: "Unknown drawing in the choices" }, { status: 400 });

  await writeFile(CHOICES, `${JSON.stringify({ wall, sketchBox }, null, 2)}\n`);

  let wallBytes = 0;
  if (typeof body.wallImage === "string") {
    const [head, data] = body.wallImage.split(",");
    const bytes = Buffer.from(data ?? "", "base64");
    // A WebP: "RIFF", a size, "WEBP".
    if (head !== "data:image/webp;base64" || bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") {
      return Response.json({ error: "The wall is not a WebP" }, { status: 400 });
    }
    await writeFile(WALL, bytes);
    wallBytes = bytes.length;
  }
  return Response.json({ ok: true, wall: wall.length, sketchBox: sketchBox.length, wallBytes });
}

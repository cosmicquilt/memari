// Saves the doodle control panel's choices (/dev/doodles): which drawings
// the start dialog's wall and the hero's sketch boxes use, into
// src/app/landing/doodleChoices.json - and, when the wall changed, the walls
// the panel drew, into public/landing/doodle-walls/ (light-0.webp...).
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
const WALLS = path.join(ROOT, "public/landing/doodle-walls");
/** A wall's name: its ground and which arrangement - see doodleWall.ts. */
const WALL_NAME = /^(light|dark)-\d$/;
const INDEX = path.join(ROOT, "public/landing/doodles/index.json");
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!LOCAL.has(url.hostname) || (origin && !LOCAL.has(new URL(origin).hostname))) {
    return new Response("Only from this machine", { status: 403 });
  }

  const body = (await request.json()) as { wall?: unknown; sketchBox?: unknown; walls?: unknown };
  // Every id must be a drawing the library has: "style/subject-n".
  const index = JSON.parse(await readFile(INDEX, "utf8")) as Record<string, Record<string, Array<[string, number, number]>>>;
  const known = new Set(Object.entries(index).flatMap(([style, subjects]) => Object.values(subjects).flat().map(([id]) => `${style}/${id}`)));
  const list = (value: unknown) =>
    Array.isArray(value) && value.every((v) => typeof v === "string" && known.has(v)) ? [...new Set(value as string[])].sort() : null;
  const wall = list(body.wall);
  const sketchBox = list(body.sketchBox);
  if (!wall || !sketchBox) return Response.json({ error: "Unknown drawing in the choices" }, { status: 400 });

  // Every wall checked before anything is written, so a bad one cannot
  // leave a half-replaced set.
  const walls: Array<{ name: string; bytes: Buffer }> = [];
  for (const wall of Array.isArray(body.walls) ? body.walls : []) {
    const { name, image } = (wall ?? {}) as { name?: unknown; image?: unknown };
    if (typeof name !== "string" || !WALL_NAME.test(name) || typeof image !== "string") {
      return Response.json({ error: "A wall with no proper name" }, { status: 400 });
    }
    const [head, data] = image.split(",");
    const bytes = Buffer.from(data ?? "", "base64");
    // A WebP: "RIFF", a size, "WEBP".
    if (head !== "data:image/webp;base64" || bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") {
      return Response.json({ error: `Wall ${name} is not a WebP` }, { status: 400 });
    }
    walls.push({ name, bytes });
  }

  await writeFile(CHOICES, `${JSON.stringify({ wall, sketchBox }, null, 2)}\n`);
  let wallBytes = 0;
  for (const { name, bytes } of walls) {
    await writeFile(path.join(WALLS, `${name}.webp`), bytes);
    wallBytes += bytes.length;
  }
  return Response.json({ ok: true, wall: wall.length, sketchBox: sketchBox.length, walls: walls.length, wallBytes });
}

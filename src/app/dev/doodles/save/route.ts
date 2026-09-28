// Saves the doodle control panel's choices (/dev/doodles): which drawings
// the start dialog's wall and the hero's sketch boxes use, into
// src/app/landing/doodleChoices.json - and, when they changed, the walls the
// panel drew, into public/landing/doodle-walls/ (light-0.webp...), and the
// loose sheets, into public/landing/sheets/ (left.webp, right.webp).
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
const SHEETS = path.join(ROOT, "public/landing/sheets");
/** A loose sheet's name - see video/sheets.ts. */
const SHEET_NAME = /^(left|right)$/;
const INDEX = path.join(ROOT, "public/landing/doodles/index.json");
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!LOCAL.has(url.hostname) || (origin && !LOCAL.has(new URL(origin).hostname))) {
    return new Response("Only from this machine", { status: 403 });
  }

  const body = (await request.json()) as { wall?: unknown; sketchBox?: unknown; sheets?: unknown; walls?: unknown; sheetImages?: unknown };
  // Every id must be a drawing the library has: "style/subject-n".
  const index = JSON.parse(await readFile(INDEX, "utf8")) as Record<string, Record<string, Array<[string, number, number]>>>;
  const known = new Set(Object.entries(index).flatMap(([style, subjects]) => Object.values(subjects).flat().map(([id]) => `${style}/${id}`)));
  const list = (value: unknown) =>
    Array.isArray(value) && value.every((v) => typeof v === "string" && known.has(v)) ? [...new Set(value as string[])].sort() : null;
  const wall = list(body.wall);
  const sketchBox = list(body.sketchBox);
  const sheets = list(body.sheets ?? []);
  if (!wall || !sketchBox || !sheets) return Response.json({ error: "Unknown drawing in the choices" }, { status: 400 });

  // Every picture checked before anything is written, so a bad one cannot
  // leave a half-replaced set.
  const pictures = (value: unknown, pattern: RegExp, what: string) => {
    const out: Array<{ name: string; bytes: Buffer }> = [];
    for (const item of Array.isArray(value) ? value : []) {
      const { name, image } = (item ?? {}) as { name?: unknown; image?: unknown };
      if (typeof name !== "string" || !pattern.test(name) || typeof image !== "string") throw new Error(`A ${what} with no proper name`);
      const [head, data] = image.split(",");
      const bytes = Buffer.from(data ?? "", "base64");
      // A WebP: "RIFF", a size, "WEBP".
      if (head !== "data:image/webp;base64" || bytes.subarray(0, 4).toString() !== "RIFF" || bytes.subarray(8, 12).toString() !== "WEBP") {
        throw new Error(`The ${what} ${name} is not a WebP`);
      }
      out.push({ name, bytes });
    }
    return out;
  };
  let walls: Array<{ name: string; bytes: Buffer }>;
  let sheetImages: Array<{ name: string; bytes: Buffer }>;
  try {
    walls = pictures(body.walls, WALL_NAME, "wall");
    sheetImages = pictures(body.sheetImages, SHEET_NAME, "sheet");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }

  await writeFile(CHOICES, `${JSON.stringify({ wall, sketchBox, sheets }, null, 2)}\n`);
  let wallBytes = 0;
  for (const { name, bytes } of walls) {
    await writeFile(path.join(WALLS, `${name}.webp`), bytes);
    wallBytes += bytes.length;
  }
  for (const { name, bytes } of sheetImages) await writeFile(path.join(SHEETS, `${name}.webp`), bytes);
  return Response.json({ ok: true, wall: wall.length, sketchBox: sketchBox.length, sheets: sheets.length, walls: walls.length, wallBytes, sheetImages: sheetImages.length });
}

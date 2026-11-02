// Where the photographed covers' scans are (coverScans.ts), kept apart from
// the printing so a page can ask whether the covers can be ordered without
// bringing the print code with it.
//
// COVER_SCANS_URL: any address serving <id>.jpg (a public Vercel Blob store,
// say). COVER_SCANS_DIR: a folder of them - on a computer that made them
// (make-cover-scans.mts), handoff/print-scans unless set. Neither: none.

import { existsSync } from "node:fs";
import path from "node:path";

const DEV_DIR = "handoff/print-scans";

/** Where the scans are, or null where none can be printed. */
export function scanSource(): { dir: string } | { url: string } | null {
  const url = process.env.COVER_SCANS_URL?.trim();
  if (url) return { url: url.replace(/\/+$/, "") };
  const dir = process.env.COVER_SCANS_DIR?.trim() || (process.env.NODE_ENV !== "production" ? DEV_DIR : "");
  if (dir && existsSync(path.join(process.cwd(), dir))) return { dir: path.join(process.cwd(), dir) };
  return null;
}

/** Can a photographed cover be printed here? */
export function photographedCoversOffered(): boolean {
  return scanSource() !== null;
}

// The doodle control panel (Andrew, 2026-09-27: "a control panel for me to
// switch which drawing show up in this background as well as in the
// journal in the hero large within the sketch modules").
//
// Development only: it edits files in the working tree (see save/route.ts),
// and a choice reaches memari.studio the way code does - committed and
// pushed. In production this page is a 404.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DoodlePanel } from "./DoodlePanel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Drawings - Memari", robots: { index: false } };

export default async function DoodlesPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const root = process.cwd();
  // Read fresh each time, not imported: the panel must show what is on disk
  // now, including what it saved a moment ago.
  const [index, choices] = await Promise.all([
    readFile(path.join(root, "public/landing/doodles/index.json"), "utf8").then((t) => JSON.parse(t)),
    readFile(path.join(root, "src/app/landing/doodleChoices.json"), "utf8").then((t) => JSON.parse(t)),
  ]);
  return <DoodlePanel index={index} initial={choices} />;
}

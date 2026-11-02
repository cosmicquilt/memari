// THE PRINT SCANS, PUT WHERE PRODUCTION CAN FETCH THEM (2026-11-01, his
// "Yes, Vercel Blob").
//
//   npm run covers:upload                      with BLOB_READ_WRITE_TOKEN set
//   npm run covers:upload -- --check <address> checks a host, uploads nothing
//
// Uploads the 85 scans make-cover-scans.mts made (handoff/print-scans) to the
// public Vercel Blob store whose token is set, at covers/v1/<id>.jpg - the
// folder named by version, so scans made again go to v2 and nothing cached
// for a year is ever the wrong file. A scan already there at its size is
// skipped, so a run that stopped can simply be run again. Then every scan is
// fetched back from its public address and checked against the manifest's
// fingerprint, and the address to give production is printed:
// COVER_SCANS_URL, set in Vercel (Production), then a redeploy.
//
// The token is the store's own (Vercel: Storage > the store > .env.local);
// it is set in the shell for the run and never written to a file.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { head, put } from "@vercel/blob";
import manifest from "../src/lib/print/coverScans.json" with { type: "json" };

const SCANS: Record<string, { w: number; h: number; bytes: number; sha256: string }> = manifest;
const DIR = process.env.COVER_SCANS_DIR || "handoff/print-scans";
const FOLDER = "covers/v1";
const AT_ONCE = 4;

/** Runs `work` on every item, `AT_ONCE` at a time. */
async function each<T>(items: T[], work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      while (next < items.length) await work(items[next++]);
    })
  );
}

/** Every scan fetched from `base` and checked; the ids that failed. */
async function check(base: string): Promise<string[]> {
  const failed: string[] = [];
  let done = 0;
  await each(Object.keys(SCANS), async (id) => {
    try {
      const response = await fetch(`${base}/${id}.jpg`, { cache: "no-store" });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (createHash("sha256").update(bytes).digest("hex") !== SCANS[id].sha256) throw new Error("is not the file the manifest knows");
    } catch (error) {
      failed.push(id);
      console.error(`  ${id}: ${(error as Error).message}`);
    }
    if (++done % 17 === 0) console.log(`  checked ${done} of ${Object.keys(SCANS).length}`);
  });
  return failed;
}

const asked = process.argv.indexOf("--check");
if (asked >= 0) {
  const base = (process.argv[asked + 1] ?? "").replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base)) throw new Error("Give the address to check: --check https://<store>.public.blob.vercel-storage.com/covers/v1");
  const failed = await check(base);
  console.log(failed.length ? `\n${failed.length} scan(s) not right at ${base}.` : `\nAll ${Object.keys(SCANS).length} scans are right at ${base}.`);
  process.exit(failed.length ? 1 : 0);
}

const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
if (!token) {
  console.error("Set BLOB_READ_WRITE_TOKEN to the store's token first (Vercel: Storage > the store > .env.local).");
  process.exit(1);
}

let base = "";
let uploaded = 0;
let skipped = 0;
const failed: string[] = [];
await each(Object.keys(SCANS).sort(), async (id) => {
  const pathname = `${FOLDER}/${id}.jpg`;
  try {
    const there = await head(pathname, { token }).catch(() => null);
    if (there && there.size === SCANS[id].bytes) {
      base ||= there.url.slice(0, -`/${id}.jpg`.length);
      skipped++;
      return;
    }
    const bytes = readFileSync(path.join(DIR, `${id}.jpg`));
    if (bytes.length !== SCANS[id].bytes) throw new Error(`the file here is ${bytes.length} bytes, the manifest says ${SCANS[id].bytes}: run npm run covers:scans again`);
    const blob = await put(pathname, bytes, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "image/jpeg",
      cacheControlMaxAge: 365 * 24 * 60 * 60,
      multipart: bytes.length > 4_000_000,
      token,
    });
    base ||= blob.url.slice(0, -`/${id}.jpg`.length);
    uploaded++;
    console.log(`  ${id} (${(bytes.length / 1e6).toFixed(2)} MB)`);
  } catch (error) {
    failed.push(id);
    console.error(`  ${id}: ${(error as Error).message}`);
  }
});
console.log(`\n${uploaded} uploaded, ${skipped} already there${failed.length ? `, ${failed.length} FAILED (run it again)` : ""}.`);
if (!base || failed.length) process.exit(1);

console.log(`\nChecking every scan at ${base} ...`);
const wrong = await check(base);
if (wrong.length) {
  console.error(`\n${wrong.length} scan(s) not right there. Run it again.`);
  process.exit(1);
}
console.log(`\nAll ${Object.keys(SCANS).length} scans are right. In Vercel (Production), set:\n\n  COVER_SCANS_URL=${base}\n`);

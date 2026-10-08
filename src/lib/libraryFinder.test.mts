// The library finder against the real data (src/app/print/*.json): known
// places find the libraries that are really there, distances are sane, and
// the fallbacks and errors say what they should.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findLibraries, milesBetween, parseZips, type LibraryRow } from "./libraryFinder";

const dir = join(import.meta.dirname, "../app/print");
const libraries = (JSON.parse(readFileSync(join(dir, "libraries.json"), "utf8")) as { libraries: LibraryRow[] }).libraries;
const zips = parseZips((JSON.parse(readFileSync(join(dir, "zips.json"), "utf8")) as { zips: string }).zips);

assert.ok(libraries.length > 15000, `expected the survey's ~16,800 libraries, have ${libraries.length}`);
assert.ok(zips.size > 30000, `expected ~33,000 ZIP areas, have ${zips.size}`);

// New York to Los Angeles is about 2,450 miles.
const nyla = milesBetween(40.7128, -74.006, 34.0522, -118.2437);
assert.ok(nyla > 2400 && nyla < 2500, `NY-LA ${nyla}`);

// Midtown Manhattan: the nearest libraries are New York Public Library branches, close by.
const nyc = findLibraries("10001", zips, libraries);
assert.ok(nyc.ok);
assert.equal(nyc.found.length, 8);
assert.ok(nyc.found[0].miles < 1, `nearest to 10001 is ${nyc.found[0].miles} mi`);
assert.ok(nyc.found.every((f) => f.library.state === "NY"));
assert.ok(nyc.found.every((f, i, all) => i === 0 || all[i - 1].miles <= f.miles), "nearest first");

// ZIP+4 is accepted.
const plus4 = findLibraries("10001-1234", zips, libraries);
assert.ok(plus4.ok && plus4.near === "10001");

// A town and state.
const dayton = findLibraries("Dayton, OH", zips, libraries);
assert.ok(dayton.ok, JSON.stringify(dayton));
assert.ok(dayton.found[0].library.state === "OH" && dayton.found[0].miles < 10);
const noComma = findLibraries("dayton oh", zips, libraries);
assert.ok(noComma.ok);

// A ZIP code with no Census area (a PO box's) falls back to a neighbour.
const po = findLibraries("10101", zips, libraries);
assert.ok(po.ok && !po.exact && po.near.startsWith("101"), JSON.stringify(po.ok ? po.near : po));

// Errors say what to do.
for (const [query, says] of [
  ["", "Type a ZIP code"],
  ["123", "five digits"],
  ["00000", "could not find ZIP code"],
  ["Nowhereville, ZZ", "could not find"],
] as const) {
  const r = findLibraries(query, zips, libraries);
  assert.ok(!r.ok && r.error.includes(says), `${JSON.stringify(query)} -> ${JSON.stringify(r)}`);
}

console.log(`All library finder checks passed (${libraries.length} libraries, ${zips.size} ZIP areas; nearest to 10001: ${nyc.found[0].library.name}, ${nyc.found[0].miles.toFixed(2)} mi).`);

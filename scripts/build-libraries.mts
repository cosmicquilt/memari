// Builds the library finder's data (memari.studio/print) from two public-
// domain US government files, downloaded by hand into handoff/data/ (which
// is not committed):
//
//   IMLS Public Libraries Survey, FY 2024 - the outlet file
//     https://www.imls.gov/sites/default/files/2026-06/pls_fy2024_csv.zip
//     -> CSV/pls_fy24_outlet_pud24i.csv  (Windows-1252, 17,615 outlets)
//   U.S. Census Bureau, 2020 Gazetteer - ZIP Code Tabulation Areas
//     https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_zcta_national.zip
//     -> 2020_Gaz_zcta_national.txt  (tab-separated, 33,144 areas)
//
// Writes src/app/print/libraries.json and src/app/print/zips.json. Run it
// again when IMLS publishes a new year (each June), with the new file's path:
//
//   npx tsx scripts/build-libraries.mts [outlet.csv] [zcta.txt]
//
// KEPT: central libraries and branches (C_OUT_TY CE, BR) - a building you
// can walk into and print at. LEFT OUT: bookmobiles (BS), books-by-mail
// (BM), and outlets reported temporarily closed (STATSTRU 23). Nothing in
// the survey says whether a library prints or what it charges, so the page
// never claims to know.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const outletPath = process.argv[2] ?? join(ROOT, "handoff/data/imls-pls-fy2024/CSV/pls_fy24_outlet_pud24i.csv");
const zctaPath = process.argv[3] ?? join(ROOT, "handoff/data/census-zcta-2020/2020_Gaz_zcta_national.txt");

/** One CSV line, quotes respected. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

// The survey writes everything in capitals. Words that stay capitals:
const KEEP_UPPER = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "PO", "US", "USA", "II", "III", "IV", "MLK", "JFK", "LBJ", "FDR", "YMCA", "ID"]);
// Words that go lower case inside a name. Not "la", "de": in US library
// names those are mostly place names (La Crosse, Bayou La Batre, De Soto).
const SMALL = new Set(["of", "the", "and", "at", "in", "on", "for"]);

/** "ANCHOR POINT PUBLIC LIBRARY" -> "Anchor Point Public Library". */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/(\s+|-|\/|\()/)
    .map((word, i, all) => {
      if (!/[a-zà-ÿ]/.test(word)) return word;
      const bare = word.replace(/[^a-zà-ÿ0-9']/g, "");
      if (KEEP_UPPER.has(bare.toUpperCase()) && bare.length <= 4 && !/^(a|an|in|on|of|at|id)$/.test(bare)) return word.toUpperCase();
      // Ordinals: 1st, 22nd.
      if (/^\d+(st|nd|rd|th)$/.test(bare)) return word;
      const first = all.slice(0, i).every((w) => !/[a-zà-ÿ]/.test(w));
      if (!first && SMALL.has(bare)) return word;
      let cased = word.replace(/[a-zà-ÿ]/, (c) => c.toUpperCase());
      // McAllen, O'Neill.
      cased = cased.replace(/^(Mc)([a-z])/, (_, mc, c) => mc + c.toUpperCase()).replace(/^(O')([a-z])/, (_, o, c) => o + c.toUpperCase());
      return cased;
    })
    .join("");
}

function phone(digits: string): string {
  return /^\d{10}$/.test(digits) ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : "";
}

const round = (n: number) => Math.round(n * 10000) / 10000;

// ---------------------------------------------------------------- libraries
const text = new TextDecoder("windows-1252").decode(readFileSync(outletPath));
const lines = text.split(/\r?\n/).filter(Boolean);
const head = cells(lines[0]);
const col = (name: string) => {
  const at = head.indexOf(name);
  if (at < 0) throw new Error(`build-libraries: no column ${name} in ${outletPath}`);
  return at;
};
const C = {
  type: col("C_OUT_TY"),
  status: col("STATSTRU"),
  name: col("LIBNAME"),
  address: col("ADDRESS"),
  city: col("CITY"),
  state: col("STABR"),
  zip: col("ZIP"),
  phone: col("PHONE"),
  lat: col("LATITUDE"),
  lon: col("LONGITUD"),
};

/** [name, address, city, state, zip, phone, lat, lon] - an array, not an
 *  object, so 17,000 of them stay small. */
type Row = [string, string, string, string, string, string, number, number];
const libraries: Row[] = [];
const skipped: Record<string, number> = {};
for (const line of lines.slice(1)) {
  const r = cells(line);
  const why =
    r[C.type] !== "CE" && r[C.type] !== "BR"
      ? `type ${r[C.type]}`
      : r[C.status] === "23"
        ? "temporarily closed"
        : !(Number(r[C.lat]) && Number(r[C.lon]))
          ? "no location"
          : // An office filed as a branch ("Outreach Services", Dayton): not a
            // place to walk in and print. Two in FY 2024.
            /outreach services$/i.test(r[C.name].trim()) && !/library|branch/i.test(r[C.name])
            ? "an office"
            : null;
  if (why) {
    skipped[why] = (skipped[why] ?? 0) + 1;
    continue;
  }
  libraries.push([
    titleCase(r[C.name].trim()),
    titleCase(r[C.address].trim()),
    titleCase(r[C.city].trim()),
    r[C.state],
    r[C.zip].padStart(5, "0"),
    phone(r[C.phone]),
    round(Number(r[C.lat])),
    round(Number(r[C.lon])),
  ]);
}

// --------------------------------------------------------------------- zips
const zipLines = readFileSync(zctaPath, "utf8").split(/\r?\n/).filter(Boolean);
const zh = zipLines[0].split("\t").map((s) => s.trim());
const zi = { id: zh.indexOf("GEOID"), lat: zh.indexOf("INTPTLAT"), lon: zh.indexOf("INTPTLONG") };
/** "zip lat lon" joined by newlines: parsed once, on the first search. */
const zips = zipLines
  .slice(1)
  .map((l) => l.split("\t").map((s) => s.trim()))
  .map((c) => `${c[zi.id]} ${round(Number(c[zi.lat]))} ${round(Number(c[zi.lon]))}`)
  .join("\n");

const out = join(ROOT, "src/app/print");
writeFileSync(join(out, "libraries.json"), JSON.stringify({ source: "IMLS Public Libraries Survey FY 2024, outlet file", libraries }));
writeFileSync(join(out, "zips.json"), JSON.stringify({ source: "U.S. Census Bureau 2020 Gazetteer, ZIP Code Tabulation Areas", zips }));
console.log(`libraries: ${libraries.length} kept; skipped`, skipped);
console.log(`zips: ${zipLines.length - 1}`);
console.log("samples:", libraries.slice(100, 104).map((l) => `${l[0]} | ${l[1]}, ${l[2]}, ${l[3]} ${l[4]} | ${l[5]}`));

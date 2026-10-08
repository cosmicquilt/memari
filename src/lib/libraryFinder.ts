// THE LIBRARY FINDER (memari.studio/print, 2026-10-08): the public libraries
// nearest a US ZIP code or town, for printing a planner without a printer.
//
// Everything is local: the libraries are the IMLS Public Libraries Survey's
// outlets and a ZIP code's place is the Census's centroid for it, both
// built into the app by scripts/build-libraries.mts. No map or places API
// is called, so a search costs nothing and tells nobody else anything -
// and what was searched is not stored.
//
// Pure apart from the data it is handed, so libraryFinder.test.mts can run
// it against the real files.

export type Library = {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** "(907) 235-5692", or "" where the survey has none. */
  phone: string;
  lat: number;
  lon: number;
};

export type LibraryRow = [string, string, string, string, string, string, number, number];

export type Found = { library: Library; miles: number };

export type FinderResult =
  | { ok: true; near: string; exact: boolean; found: Found[] }
  | { ok: false; error: string };

export function toLibrary(row: LibraryRow): Library {
  const [name, address, city, state, zip, phone, lat, lon] = row;
  return { name, address, city, state, zip, phone, lat, lon };
}

/** "zip lat lon" lines -> a lookup. */
export function parseZips(text: string): Map<string, [number, number]> {
  const map = new Map<string, [number, number]>();
  for (const line of text.split("\n")) {
    const [zip, lat, lon] = line.split(" ");
    if (zip && lat && lon) map.set(zip, [Number(lat), Number(lon)]);
  }
  return map;
}

const EARTH_MILES = 3958.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Miles between two points on the earth, as the crow flies. */
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The `count` libraries nearest a point, nearest first. */
export function nearest(libraries: LibraryRow[], lat: number, lon: number, count: number): Found[] {
  const best: Array<{ row: LibraryRow; miles: number }> = [];
  for (const row of libraries) {
    const miles = milesBetween(lat, lon, row[6], row[7]);
    if (best.length < count || miles < best[best.length - 1].miles) {
      best.push({ row, miles });
      best.sort((a, b) => a.miles - b.miles);
      if (best.length > count) best.pop();
    }
  }
  return best.map(({ row, miles }) => ({ library: toLibrary(row), miles }));
}

/**
 * Where a search means. A ZIP code is looked up; one the Census has no area
 * for (a PO box's, a single building's) falls back to the nearest code
 * above or below it with the same first three digits, which is the same
 * post office's area. "Town, ST" is the middle of that town's libraries.
 */
export function locate(
  query: string,
  zips: Map<string, [number, number]>,
  libraries: LibraryRow[]
): { lat: number; lon: number; near: string; exact: boolean } | { error: string } {
  const q = query.trim();
  if (!q) return { error: "Type a ZIP code, or a town and state such as Dayton, OH." };

  const zip = q.match(/^(\d{5})(?:-\d{4})?$/)?.[1];
  if (zip) {
    const hit = zips.get(zip);
    if (hit) return { lat: hit[0], lon: hit[1], near: zip, exact: true };
    const prefix = zip.slice(0, 3);
    const n = Number(zip);
    let closest: string | null = null;
    for (const code of zips.keys()) {
      if (code.startsWith(prefix) && (closest === null || Math.abs(Number(code) - n) < Math.abs(Number(closest) - n))) closest = code;
    }
    if (closest) {
      const [lat, lon] = zips.get(closest)!;
      return { lat, lon, near: closest, exact: false };
    }
    return { error: `We could not find ZIP code ${zip}. Check it, or try a town and state.` };
  }
  if (/^\d+$/.test(q)) return { error: "A ZIP code has five digits." };

  const town = q.match(/^(.+?),?\s+([A-Za-z]{2})$/);
  if (town) {
    const city = town[1].replace(/,$/, "").trim().toLowerCase();
    const state = town[2].toUpperCase();
    const here = libraries.filter((r) => r[3] === state && r[2].toLowerCase() === city);
    if (here.length) {
      const lat = here.reduce((s, r) => s + r[6], 0) / here.length;
      const lon = here.reduce((s, r) => s + r[7], 0) / here.length;
      return { lat, lon, near: `${here[0][2]}, ${state}`, exact: true };
    }
    return { error: `We could not find ${town[1].trim()}, ${state}. Try its ZIP code instead.` };
  }
  return { error: "Type a ZIP code, or a town and state such as Dayton, OH." };
}

/** One search, start to end. */
export function findLibraries(query: string, zips: Map<string, [number, number]>, libraries: LibraryRow[], count = 8): FinderResult {
  const place = locate(query, zips, libraries);
  if ("error" in place) return { ok: false, error: place.error };
  return { ok: true, near: place.near, exact: place.exact, found: nearest(libraries, place.lat, place.lon, count) };
}

/** A maps search for the library's address - no key, no API. */
export function directionsUrl(l: Library): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.address}, ${l.city}, ${l.state} ${l.zip}`)}`;
}

/** The survey has no websites: a search for this library's printing page. */
export function printingSearchUrl(l: Library): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${l.name} ${l.city} ${l.state} printing`)}`;
}

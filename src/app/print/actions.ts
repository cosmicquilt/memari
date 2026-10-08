"use server";

// The library search, on the server: the data stays here (2.6 MB the
// browser never downloads), and the place searched for is used for this one
// answer and not kept - not logged, not stored, not in the address bar.

import librariesFile from "./libraries.json";
import zipsFile from "./zips.json";
import { findLibraries, parseZips, type FinderResult, type LibraryRow } from "@/lib/libraryFinder";

const libraries = librariesFile.libraries as unknown as LibraryRow[];
let zips: Map<string, [number, number]> | null = null;

export async function searchLibraries(_previous: FinderResult | null, form: FormData): Promise<FinderResult & { query: string }> {
  const query = String(form.get("place") ?? "").slice(0, 80);
  zips ??= parseZips(zipsFile.zips);
  return { ...findLibraries(query, zips, libraries), query };
}

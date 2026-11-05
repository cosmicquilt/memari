// THE COVERS (2026-10-26): the landing carousel's covers, as a catalogue for
// /covers - Andrew: "it should be the covers in the carousel on the landing".
// One list (landing/coverCarousel.json, written by handoff wrap/carousel.py
// with the pictures in public/landing/covers/<id>.webp), so the carousel and
// the page can never show different covers.
//
// Each cover gets a name people can say - its material and a number, "Onyx
// 4", never the scan's code (Onyx004) - and an address of its own,
// /covers/onyx-4, so the carousel, layouts, emails and the quiz can open one.
//
// THE ADDRESSES ARE FROZEN (review, 2026-10-26) in coverSlugs.json, scan id
// to address, written once from the numbering they were first published
// with. Counting each material's scans afresh would re-point every later
// address the day a scan is added or dropped - a shared /covers/onyx-7
// would quietly open another cover. A scan not in the file yet gets its
// material's next unused number, and siteMap.test fails until that address
// is written into the file. The order covers are SHOWN in can change freely.
//
// The finishes are described as what they are in print: the book's cover is
// printed on matte stock with no foil (Lulu's SKU, products.ts), so "gold" is
// gold-coloured ink and "imprint" a printed shadow. The pictures draw them on
// photographs of other notebooks (the page's "A preview" line came off,
// 2026-10-26: his call).
//
// Client-safe: the gallery imports it.

import covers from "@/app/landing/coverCarousel.json";
import frozenSlugs from "./coverSlugs.json";
import goldTones from "./coverGoldTones.json";

export const COVER_GROUPS = ["Stone", "Wood", "Cloth & leather", "Nature", "Board & more"] as const;
export type CoverGroup = (typeof COVER_GROUPS)[number];

/** Each material's group, in the order the page shows them: the stones
 *  people pick for a cover first (onyx, marble, travertine), asphalt last.
 *  A material missing here fails siteMap.test. */
export const MATERIAL_GROUP: Record<string, CoverGroup> = {
  onyx: "Stone",
  marble: "Stone",
  travertine: "Stone",
  concrete: "Stone",
  plaster: "Stone",
  tiles: "Stone",
  brick: "Stone",
  asphalt: "Stone",
  wood: "Wood",
  bark: "Wood",
  planks: "Wood",
  cloth: "Cloth & leather",
  leather: "Cloth & leather",
  carpet: "Cloth & leather",
  grass: "Nature",
  moss: "Nature",
  sand: "Nature",
  snow: "Nature",
  "night sky": "Nature",
  kraft: "Board & more",
  steel: "Board & more",
  plastic: "Board & more",
  rubber: "Board & more",
};

const MATERIALS = Object.keys(MATERIAL_GROUP);

export type CoverFinish = "imprint" | "gold";

/** Where the mark sits: "m." a third of the way down the middle, "m." in
 *  the bottom corner, or "memari." in full a third of the way down. */
export type CoverMarkKind = "m-centre" | "m-corner" | "wordmark";

/** The ink a gold mark is printed in: gold, a deeper gold where bright gold
 *  faded into a light cover, and a dark leaf where gold matched the cover
 *  (kraft). Null for an imprint. */
export type CoverGoldTone = "gold" | "deep" | "dark";

export type Cover = {
  /** the scan's id, and the picture's file name */
  id: string;
  /** "onyx-4" */
  slug: string;
  /** "Onyx 4" */
  name: string;
  /** its number within the material, 4 - shown "004" on the covers page */
  number: number;
  /** "Onyx" */
  material: string;
  group: CoverGroup;
  /** what is on the front, in words: "m. in the centre", "memari." in serif */
  mark: string;
  dated: boolean;
  finish: CoverFinish;
  /** in words, as printed: "Imprint", "Gold", "Deep gold", "Dark gold" */
  finishName: string;
  /** what the printed cover draws (lib/print/coverTexture.ts) */
  kind: CoverMarkKind;
  face: "sans" | "serif";
  tone: CoverGoldTone | null;
  photo: string;
  image: string;
  /** the front alone, flat, as it prints: the scan fitted to the 7 x 10
   *  board (public/landing/covers/front, from handoff/print-scans) */
  front: string;
  /** the gold this cover prints when gold is chosen (2026-11-05: any cover
   *  takes either finish): its pictured gold, else deep gold where the
   *  cover is bright behind the mark and dark gold on kraft - the rule that
   *  gives 24 of the 25 pictured golds the tone they were given
   *  (coverGoldTones.json) */
  goldTone: CoverGoldTone;
};

type Raw = { id: string; name: string; photo: string; brand?: string };

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The carousel's "brand" ("m-centre+dates blind", "wordmark serif foil
 *  deep") in the page's words, and what the printed cover draws.
 *
 *  The "m." is always the sans (Inter Bold): the brand string names a face
 *  only for the wordmark, and every m. on the 73 carousel pictures, read
 *  off them one by one (2026-11-01), is the sans. */
export function describeBrand(brand: string): {
  mark: string;
  dated: boolean;
  finish: CoverFinish;
  finishName: string;
  kind: CoverMarkKind;
  face: "sans" | "serif";
  tone: CoverGoldTone | null;
} {
  const [head = "", ...rest] = brand.split(/\s+/);
  const dated = head.includes("+dates");
  const kind: CoverMarkKind = head.startsWith("m-corner") ? "m-corner" : head.startsWith("wordmark") ? "wordmark" : "m-centre";
  const face = kind === "wordmark" && !rest.includes("sans") ? "serif" : "sans";
  const mark = kind === "m-corner" ? "m. in the corner" : kind === "wordmark" ? `"memari." in ${face}` : "m. in the centre";
  if (rest.includes("foil")) {
    const tone: CoverGoldTone = rest.includes("deep") ? "deep" : rest.includes("dark") ? "dark" : "gold";
    const finishName = tone === "deep" ? "Deep gold" : tone === "dark" ? "Dark gold" : "Gold";
    return { mark, dated, finish: "gold", finishName, kind, face, tone };
  }
  return { mark, dated, finish: "imprint", finishName: "Imprint", kind, face, tone: null };
}

/** The published addresses, scan id -> "onyx-4". */
export const FROZEN_SLUGS: Readonly<Record<string, string>> = frozenSlugs;

const slugBase = (material: string) => material.replace(/\s+/g, "-");
const slugNumber = (slug: string) => Number(slug.slice(slug.lastIndexOf("-") + 1));

function build(list: Raw[]): Cover[] {
  const sorted = list.slice().sort((a, b) => {
    const g = COVER_GROUPS.indexOf(MATERIAL_GROUP[a.name]) - COVER_GROUPS.indexOf(MATERIAL_GROUP[b.name]);
    return g || MATERIALS.indexOf(a.name) - MATERIALS.indexOf(b.name) || a.id.localeCompare(b.id);
  });
  // a material's numbers already published, so a new scan takes the next
  const highest = new Map<string, number>();
  for (const raw of sorted) {
    const frozen = FROZEN_SLUGS[raw.id];
    if (frozen) highest.set(raw.name, Math.max(highest.get(raw.name) ?? 0, slugNumber(frozen)));
  }
  return sorted.map((raw) => {
    let slug = FROZEN_SLUGS[raw.id];
    if (!slug) {
      const n = (highest.get(raw.name) ?? 0) + 1;
      highest.set(raw.name, n);
      slug = `${slugBase(raw.name)}-${n}`;
    }
    const material = capital(raw.name);
    return {
      id: raw.id,
      slug,
      name: `${material} ${slugNumber(slug)}`,
      number: slugNumber(slug),
      material,
      group: MATERIAL_GROUP[raw.name],
      ...describeBrand(raw.brand ?? ""),
      photo: raw.photo,
      image: `/landing/covers/${raw.id}.webp`,
      front: `/landing/covers/front/${raw.id}.webp`,
      goldTone: ((goldTones as Record<string, CoverGoldTone>)[raw.id] ?? "gold") as CoverGoldTone,
    };
  });
}

export const COVERS: Cover[] = build(covers as Raw[]);

const BY_SLUG = new Map(COVERS.map((c) => [c.slug, c]));
const BY_ID = new Map(COVERS.map((c) => [c.id, c]));

export function coverBySlug(slug: string): Cover | null {
  return BY_SLUG.get(slug) ?? null;
}

/** For the carousel: its tiles open the cover's page. */
export function coverSlugOf(id: string): string | null {
  return BY_ID.get(id)?.slug ?? null;
}

/** For the carousel's tiles: each link named by its own cover. */
export function coverById(id: string): Cover | null {
  return BY_ID.get(id) ?? null;
}

/** "004": a cover's number as the covers page shows it, three digits
 *  (2026-11-05: "make the texture numbers to be 3 digits ex 003 or 021"). */
export const coverNumber = (cover: Pick<Cover, "number">) => String(cover.number).padStart(3, "0");

/** How many materials there are, for the page's words. */
export const MATERIAL_COUNT = new Set(COVERS.map((c) => c.material)).size;

/** Each group's materials in words, as the page lists them: "Onyx,
 *  marble, travertine, concrete, plaster, tiles, brick and asphalt". */
export function groupMaterialsWords(group: CoverGroup): string {
  const names = MATERIALS.filter((m) => MATERIAL_GROUP[m] === group && COVERS.some((c) => c.group === group && c.material.toLowerCase() === m));
  const words = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : (names[0] ?? "");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// WHAT IS ON A COVER'S FRONT (2026-11-05): the person's own choices, on any
// of the 85 photographed covers - Andrew: "all covers will be able to have
// either imprint or gold", then "all of those are optional option as well as
// the persons name", then "also add an option for no mark".
//
//   mark    m. in the centre, m. in the corner, memari. in serif or in sans,
//           or no mark at all
//   finish  imprint (a printed shadow) or gold - a cover's own gold, deeper
//           on a light cover and dark on kraft (catalogue.ts goldTone)
//   dates   the book's dates at the foot on the right, where the journal is
//           a dated one
//   name    a name in spaced capitals under the mark, or in the mark's place
//           a third of the way down when the mark is in the corner or off
//
// Kept on the journal beside its cover (Planner.theme.coverFront), so the
// next book and a renewal print it too. A journal with none prints its cover
// as the cover is pictured - every journal before this did - so nothing
// already chosen changes.
//
// Pure, so the covers page draws the very places the printed cover uses.

import type { Cover } from "@/app/covers/catalogue";

export type FrontMark = "m-centre" | "m-corner" | "wordmark-serif" | "wordmark-sans" | "none";
export type FrontFinish = "imprint" | "gold";

/** A journal's front, as kept: a name of "" is none. */
export type CoverFront = { mark: FrontMark; finish: FrontFinish; dates: boolean; name: string };

export const FRONT_MARKS: readonly FrontMark[] = ["m-centre", "m-corner", "wordmark-serif", "wordmark-sans", "none"];

export const MARK_WORDS: Record<FrontMark, string> = {
  "m-centre": "m. centre",
  "m-corner": "m. corner",
  "wordmark-serif": "memari. serif",
  "wordmark-sans": "memari. sans",
  none: "No mark",
};

/** Where a mark sits, measured off the carousel's pictures (2026-11-01,
 *  coverTexture.ts): its width and its middle, as fractions of the front. */
export const MARK_PLACES = {
  "m-centre": { width: 0.132, x: 0.5, y: 0.34 },
  "m-corner": { width: 0.076, x: 0.876, y: 0.922 },
  wordmark: { width: 0.257, x: 0.5, y: 0.32 },
} as const;

/** The dates: "January to March 2027" is 0.26 of the front's width, its
 *  right end 0.08 in from the edge, its baseline 0.935 down. */
export const DATES_REF = "January to March 2027";
export const DATES_REF_WIDTH = 0.26;
export const DATES_RIGHT = 0.08;
export const DATES_BASELINE = 0.935;

/** The picture a mark prints from (scripts/make-cover-marks.py): its shape
 *  and ink - "m-sans/deep" - for coverMarks.generated.ts, and the same
 *  picture on the covers page (public/landing/covers/marks). */
export function markPicture(mark: Exclude<FrontMark, "none">, ink: "imprint" | "gold" | "deep" | "dark"): string {
  const shape = mark === "wordmark-serif" ? "memari-serif" : mark === "wordmark-sans" ? "memari-sans" : "m-sans";
  return `${shape}/${ink}`;
}

/** Where a front mark is placed: the corner one, or one a third down. */
export const placeOf = (mark: Exclude<FrontMark, "none">) => (mark === "m-corner" ? MARK_PLACES["m-corner"] : mark === "m-centre" ? MARK_PLACES["m-centre"] : MARK_PLACES.wordmark);

/** The longest name a front takes. */
export const NAME_MAX = 40;

/** The name's middle, down the front (a fraction of its height): under the
 *  mark, or in the mark's own place when the mark is in the corner or off. */
export const NAME_PLACES: Record<FrontMark, number> = {
  "m-centre": 0.42,
  "m-corner": 0.34,
  "wordmark-serif": 0.385,
  "wordmark-sans": 0.385,
  none: 0.34,
};
/** The name's size, its letter spacing (of its size) and the most of the
 *  front's width it may take before it is made smaller. */
export const NAME_SIZE = 0.031;
export const NAME_TRACK = 0.18;
export const NAME_ROOM = 0.78;

/** The front as a cover is pictured on its notebook: where a journal with
 *  no choices of its own stands, and where the covers page starts. */
export function picturedFront(cover: Pick<Cover, "kind" | "face" | "finish" | "dated">): CoverFront {
  const mark: FrontMark = cover.kind === "m-corner" ? "m-corner" : cover.kind === "wordmark" ? (cover.face === "serif" ? "wordmark-serif" : "wordmark-sans") : "m-centre";
  return { mark, finish: cover.finish === "gold" ? "gold" : "imprint", dates: cover.dated, name: "" };
}

/** A front as sent or kept, made safe: a known mark and finish, a yes or no
 *  for the dates, and a name of printable characters, trimmed to NAME_MAX.
 *  Null for anything that is not a front. */
export function cleanCoverFront(value: unknown): CoverFront | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.mark !== "string" || !(FRONT_MARKS as readonly string[]).includes(v.mark)) return null;
  if (v.finish !== "imprint" && v.finish !== "gold") return null;
  if (typeof v.dates !== "boolean") return null;
  const name = typeof v.name === "string" ? v.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
  return { mark: v.mark as FrontMark, finish: v.finish, dates: v.dates, name };
}

/** The journal's front for this cover: its own choices, or as pictured. */
export function frontOf(theme: unknown, cover: Pick<Cover, "kind" | "face" | "finish" | "dated">): CoverFront {
  return cleanCoverFront((theme as { coverFront?: unknown } | null)?.coverFront) ?? picturedFront(cover);
}

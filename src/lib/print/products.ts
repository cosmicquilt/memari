// WHAT AN ORDER PRINTS: the physical book, and what each printer calls it.
//
// Ordering was asked for 2026-10-04 ("start on checkout"), with three
// bindings - "option of coil, paperback, and hardcover" - shipped worldwide
// and any length of days. A fourth came 2026-10-08: "this season i want
// wire-o and rename to plastic as budget". Metal wire-o is printed by
// BookVault in the UK (bookvault.ts) and comes first, the order screen's
// default; Lulu prints the rest. The same day, plastic coil left the order
// screen ("it looks so bad ... might tarnish the view of the quality of the
// brand", and priced as tax at cost it is no cheaper than wire-o), and
// wire-o came on two papers: thick 170 gsm, and standard 80 gsm for any
// book ("not everyone wants thick card paper") and for every book past
// the 350 pages thick paper allows. Coil stays a Binding only so an
// earlier coil order can still renew. Everything here is pure, so the order screen, the
// server that prices it and the job that sends it to the printer all read
// one description of the book.
//
// LULU'S SKU, the "pod_package_id": six fields joined by dots -
//
//   0700X1000 . BW . STD . CO . 060UW444 . MXX
//   trim        ink  qual  bind paper       finish, linen, foil
//
// DOTTED since 2026-10-08. Lulu's API docs (api.lulu.com/docs) made the
// dotted form live on 2026-03-31 and stop accepting the old undotted 27
// characters (0700X1000BWSTDCO060UW444MXX) on 2027-02-01 - the same fields
// with the dots taken out. Orders saved before then keep the old form, so
// whatever goes to Lulu passes through dottedPodPackageId first (lulu.ts).
// Andrew's Gemini report found this; my first search had not. Black ink at standard quality on 60# uncoated white paper, a matte
// cover: the planner is drawn in near-black hairlines on white - the app's
// cream is the screen's, never the print's (see memory: memari-cream).
// VERIFY each code against the sandbox's cost calculation before the first
// real order; Lulu answers an unknown SKU with an error, not a guess.

import type { PlannerTrimKey } from "@/lib/planner-trims";

export type Binding = "wireo" | "wireoStandard" | "coil" | "paperback" | "hardcover";
/** The bindings a new order can have, in the order screen's order: metal
 *  wire-o on thick paper first, and chosen to start with. */
export const BINDINGS: readonly Binding[] = ["wireo", "wireoStandard", "paperback", "hardcover"];

type BindingSpec = {
  /** Its whole name, wherever it stands alone - an email, a receipt, a
   *  reason it cannot be had: "Metal wire-o, thick paper". */
  label: string;
  /** Its name on the order screen's button, above the note. */
  short: string;
  /** What tells it apart on the order screen. */
  note: string;
  /** Where its printer posts from: an address in another country is
   *  "abroad" for how long the post takes (orderRange.ts, leadDays). Lulu
   *  prints near the customer in many countries, but its times were set
   *  from the US; BookVault prints one-off books in the UK only. */
  shipsFrom: "US" | "GB";
  /** How far inside the trim the cover's type and marks must stay, inches -
   *  the printer's safety margin for this binding (Andrew, 2026-10-14: "use
   *  15mm for wire-o and 19mm for hardcover"). BookVault's PDF guide asks
   *  15 mm on covers; Lulu asks 0.75 in on a casewrap (it folds round the
   *  boards) and recommends 0.5 in on a paperback or coil cover. The ground
   *  still runs out through the bleed: only what must stay whole keeps in. */
  coverSafeIn: number;
};

export const BINDING_SPECS: Record<Binding, BindingSpec> = {
  wireo: { label: "Metal wire-o, thick paper", short: "Metal wire-o", note: "Thick 170 gsm paper", shipsFrom: "GB", coverSafeIn: 15 / 25.4 },
  wireoStandard: { label: "Metal wire-o, standard paper", short: "Metal wire-o", note: "Standard 80 gsm paper", shipsFrom: "GB", coverSafeIn: 15 / 25.4 },
  coil: { label: "Plastic coil", short: "Plastic coil", note: "Lies flat when open", shipsFrom: "US", coverSafeIn: 0.5 },
  paperback: { label: "Paperback", short: "Paperback", note: "Slim, like a book", shipsFrom: "US", coverSafeIn: 0.5 },
  hardcover: { label: "Hardcover", short: "Hardcover", note: "Rigid boards", shipsFrom: "US", coverSafeIn: 0.75 },
};

/** Is this address in another country from the one the binding's printer
 *  posts from? */
export function shippedAbroad(binding: Binding, countryCode: string): boolean {
  return countryCode !== BINDING_SPECS[binding].shipsFrom;
}

/** The bindings Lulu prints, with its binding field and its page limits
 *  (help.lulu.com, 2026): coil 2-470, perfect bound 32-800, casewrap 24-800.
 *  Counted as printed pages, after padding - see printedPageCount. */
export type LuluBinding = Exclude<Binding, "wireo" | "wireoStandard">;
export const LULU_BINDINGS: Record<LuluBinding, { code: "CO" | "PB" | "CW"; minPages: number; maxPages: number }> = {
  coil: { code: "CO", minPages: 2, maxPages: 470 },
  paperback: { code: "PB", minPages: 32, maxPages: 800 },
  hardcover: { code: "CW", minPages: 24, maxPages: 800 },
};

export function isLuluBinding(binding: Binding): binding is LuluBinding {
  return binding in LULU_BINDINGS;
}

/** PAPER COLOUR (2026-10-08): "I would like default to be cream with option
 *  of white" - for paperback and hardcover, where Lulu has both at the same
 *  price (60# uncoated cream 060UC444, white 060UW444; checked in its
 *  sandbox). Wire-o's papers at BookVault are white: its 170 gsm comes in
 *  no other colour. An order keeps its colour in its SKU, so a renewal
 *  reads it back from there (paperOfSku) - nothing else to store. */
export type PaperColour = "cream" | "white";
export const DEFAULT_PAPER: PaperColour = "cream";
export const PAPER_LABELS: Record<PaperColour, string> = { cream: "Cream", white: "White" };

/** The colours a binding can be had in, the first its default. */
export function paperChoices(binding: Binding): PaperColour[] {
  return isLuluBinding(binding) ? ["cream", "white"] : ["white"];
}

/** A colour the binding can have: the one asked for, else its default. */
export function paperFor(binding: Binding, paper: PaperColour | undefined): PaperColour {
  const choices = paperChoices(binding);
  return paper && choices.includes(paper) ? paper : choices[0];
}

/** The colour an order's SKU was printed on - "UC" uncoated cream in Lulu's
 *  and BookVault's codes alike, anything else white (every SKU before
 *  2026-10-08 was white). */
export function paperOfSku(sku: string): PaperColour {
  return /\d{3}UC/.test(sku) ? "cream" : "white";
}

/** An order's binding and paper in words, for a receipt, an email or the
 *  Orders page: "Paperback, cream paper", "Metal wire-o, thick paper". */
export function bindingDescription(binding: Binding, sku: string): string {
  const label = BINDING_SPECS[binding].label;
  return paperChoices(binding).length > 1 ? `${label}, ${paperOfSku(sku)} paper` : label;
}

/** Lulu's trim field for each page size an order can be printed at. Letter
 *  is the printed-at-home size, without bleed, so it is not ordered. */
const TRIM_CODES: Partial<Record<PlannerTrimKey, string>> = {
  bound7x10: "0700X1000",
};

const INK = "BW";
const QUALITY = "STD";
const PAPER: Record<PaperColour, string> = { cream: "060UC444", white: "060UW444" };
const FINISH = "M";

/** Lulu's SKU for a binding at a page size on a paper colour (cream unless
 *  asked), or null where Lulu does not make it: a size that cannot be
 *  ordered, or a binding it does not print. */
export function podPackageId(binding: Binding, trim: PlannerTrimKey, paper: PaperColour = DEFAULT_PAPER): string | null {
  const trimCode = TRIM_CODES[trim];
  if (!trimCode || !isLuluBinding(binding)) return null;
  return `${trimCode}.${INK}.${QUALITY}.${LULU_BINDINGS[binding].code}.${PAPER[paper]}.${FINISH}XX`;
}

/** Field widths of the old undotted SKU: trim, ink, quality, binding,
 *  paper, and finish-linen-foil. */
const LEGACY_FIELDS = [9, 2, 3, 2, 8, 3];

/**
 * A SKU in the dotted form Lulu requires from 2027-02-01: one already
 * dotted is returned as it is, an old undotted one has its dots put in
 * (0500X0800FCPRESS060UW444GXX -> 0500X0800.FC.PRE.SS.060UW444.GXX, Lulu's
 * own example), and anything else is left for Lulu to refuse rather than
 * guessed at.
 */
export function dottedPodPackageId(sku: string): string {
  if (sku.includes(".") || sku.length !== 27) return sku;
  const parts: string[] = [];
  let at = 0;
  for (const width of LEGACY_FIELDS) {
    parts.push(sku.slice(at, at + width));
    at += width;
  }
  return parts.join(".");
}

/**
 * The pages actually printed: the book's own, padded with blanks at the end
 * to a multiple of four. A printer pads an odd count anyway (see memory:
 * memari-print-requirements, "the printer adds 2 blanks after the back
 * matter"); padding here makes the count - and so the spine the cover is
 * drawn for - the one that is printed, not one the printer changes after.
 */
export function printedPageCount(bookPages: number): number {
  return Math.max(4, Math.ceil(bookPages / 4) * 4);
}

export type BindingAvailability = { binding: Binding; ok: true } | { binding: Binding; ok: false; reason: string };

/* Which bindings a book can be printed in is each binding's PRINTER's to
   say - see printer.ts, availability. */

/** Can a journal at this page size be ordered at all? */
export function orderableTrim(trim: PlannerTrimKey): boolean {
  return TRIM_CODES[trim] !== undefined;
}

/** The binding as the database names it, and back. */
export const BINDING_ENUM = { wireo: "WIRE_O", wireoStandard: "WIRE_O_STANDARD", coil: "COIL", paperback: "PAPERBACK", hardcover: "HARDCOVER" } as const satisfies Record<Binding, string>;
export function bindingFromEnum(value: string): Binding {
  return value === "WIRE_O"
    ? "wireo"
    : value === "WIRE_O_STANDARD"
      ? "wireoStandard"
      : value === "PAPERBACK"
        ? "paperback"
        : value === "HARDCOVER"
          ? "hardcover"
          : "coil";
}

/**
 * ROOM FOR THE BINDING at Lulu, in inches, added to the inside margin: its
 * gutter table for a paperback or hardcover by printed pages (help.lulu.com,
 * "Interior Formatting"): up to 60, none; 61-150, 1/8in; 151-400, 1/2in;
 * 401-600, 5/8in; over 600, 3/4in. A coil book opens flat and needs none.
 * The PDF makes the room by drawing each page a little smaller and away from
 * the spine - see plannerPdf.ts, gutterTransform.
 */
export function gutterInches(binding: Binding, printedPages: number): number {
  if (!isLuluBinding(binding) || binding === "coil" || printedPages <= 60) return 0;
  if (printedPages <= 150) return 0.125;
  if (printedPages <= 400) return 0.5;
  if (printedPages <= 600) return 0.625;
  return 0.75;
}

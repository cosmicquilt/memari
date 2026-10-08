// WHAT AN ORDER PRINTS: the physical book, as Lulu names it.
//
// Ordering was asked for 2026-10-04 ("start on checkout"), with three
// bindings - "option of coil, paperback, and hardcover" - shipped worldwide
// and any length of days. Everything here is pure, so the order screen, the
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

export type Binding = "coil" | "paperback" | "hardcover";
export const BINDINGS: readonly Binding[] = ["coil", "paperback", "hardcover"];

type BindingSpec = {
  label: string;
  /** What the binding is like to use, for the order screen. */
  note: string;
  /** Lulu's binding field. */
  code: "CO" | "PB" | "CW";
  /** Lulu's page limits for the binding (help.lulu.com, 2026): coil 2-470,
   *  perfect bound 32-800, casewrap 24-800. Counted as printed pages, after
   *  padding - see printedPageCount. */
  minPages: number;
  maxPages: number;
};

export const BINDING_SPECS: Record<Binding, BindingSpec> = {
  coil: { label: "Coil-bound", note: "Lies flat when open", code: "CO", minPages: 2, maxPages: 470 },
  paperback: { label: "Paperback", note: "Slim, like a book", code: "PB", minPages: 32, maxPages: 800 },
  hardcover: { label: "Hardcover", note: "Rigid boards", code: "CW", minPages: 24, maxPages: 800 },
};

/** Lulu's trim field for each page size an order can be printed at. Letter
 *  is the printed-at-home size, without bleed, so it is not ordered. */
const TRIM_CODES: Partial<Record<PlannerTrimKey, string>> = {
  bound7x10: "0700X1000",
};

const INK = "BW";
const QUALITY = "STD";
const PAPER = "060UW444";
const FINISH = "M";

/** The SKU for a binding at a page size, or null where the size cannot be
 *  ordered. */
export function podPackageId(binding: Binding, trim: PlannerTrimKey): string | null {
  const trimCode = TRIM_CODES[trim];
  if (!trimCode) return null;
  return `${trimCode}.${INK}.${QUALITY}.${BINDING_SPECS[binding].code}.${PAPER}.${FINISH}XX`;
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

/* Which bindings a book can be printed in is the PRINTER's to say - see
   printer.ts, availabilityAt. BINDING_SPECS' limits are Lulu's, read there. */

/** Can a journal at this page size be ordered at all? */
export function orderableTrim(trim: PlannerTrimKey): boolean {
  return TRIM_CODES[trim] !== undefined;
}

/** The binding as the database names it, and back. */
export const BINDING_ENUM = { coil: "COIL", paperback: "PAPERBACK", hardcover: "HARDCOVER" } as const satisfies Record<Binding, string>;
export function bindingFromEnum(value: string): Binding {
  return value === "PAPERBACK" ? "paperback" : value === "HARDCOVER" ? "hardcover" : "coil";
}

/**
 * ROOM FOR THE BINDING, in inches, added to the inside margin: Lulu's
 * gutter table for a paperback or hardcover by printed pages (help.lulu.com,
 * "Interior Formatting"): up to 60, none; 61-150, 1/8in; 151-400, 1/2in;
 * 401-600, 5/8in; over 600, 3/4in. A coil book opens flat and needs none.
 * The PDF makes the room by drawing each page a little smaller and away from
 * the spine - see plannerPdf.ts, gutterTransform.
 */
export function gutterInches(binding: Binding, printedPages: number): number {
  if (binding === "coil" || printedPages <= 60) return 0;
  if (printedPages <= 150) return 0.125;
  if (printedPages <= 400) return 0.5;
  if (printedPages <= 600) return 0.625;
  return 0.75;
}

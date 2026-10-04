// WHAT AN ORDER PRINTS: the physical book, as Lulu names it.
//
// Ordering was asked for 2026-10-04 ("start on checkout"), with three
// bindings - "option of coil, paperback, and hardcover" - shipped worldwide
// and any length of days. Everything here is pure, so the order screen, the
// server that prices it and the job that sends it to the printer all read
// one description of the book.
//
// LULU'S SKU, the "pod_package_id": 27 characters in fixed fields -
//
//   0700X1000  BW  STD  CO  060UW444  M  X  X
//   trim       ink qual bind paper    finish linen foil
//
// From Lulu's own examples (0700X1000FCPRECO060UC444MXX is a 7x10 coil
// book). Black ink at standard quality on 60# uncoated white paper, a matte
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
  return `${trimCode}${INK}${QUALITY}${BINDING_SPECS[binding].code}${PAPER}${FINISH}XX`;
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

/** Which bindings a book of `bookPages` pages can be printed in, and why
 *  not where it cannot - a year of daily pages is too thick to coil. */
export function bindingAvailability(bookPages: number): BindingAvailability[] {
  const pages = printedPageCount(bookPages);
  return BINDINGS.map((binding) => {
    const spec = BINDING_SPECS[binding];
    if (pages < spec.minPages) {
      return { binding, ok: false, reason: `${spec.label} needs at least ${spec.minPages} pages; this book has ${pages}.` };
    }
    if (pages > spec.maxPages) {
      return { binding, ok: false, reason: `${spec.label} holds at most ${spec.maxPages} pages; this book has ${pages}. Choose a shorter length, or another binding.` };
    }
    return { binding, ok: true };
  });
}

/** Can a journal at this page size be ordered at all? */
export function orderableTrim(trim: PlannerTrimKey): boolean {
  return TRIM_CODES[trim] !== undefined;
}

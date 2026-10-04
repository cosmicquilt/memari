// THE PRINTER, as orders see it: one shape, whichever company prints.
//
// Lulu is the only printer today. A second - Mixam's heavier paper and wire
// binding was the step up discussed 2026-10-04 - would be a second object of
// this shape, and an order remembers which printer it went to
// (PrintOrder.printer), so renewals and refunds reach the right one. What
// differs between printers lives behind this: their product codes, their
// page limits and binding margins, how they price, size a cover, take and
// cancel a job. What is the same - the book, the price rule, the order, the
// payment - lives in orders.ts and does not know which printer it is.
//
// Each printer has its own webhook route for status news (Lulu's is
// src/app/api/lulu/webhook), since every company signs it differently.

import type { PlannerTrimKey } from "@/lib/planner-trims";
import type { ShippingLevel } from "./orderRange";
import { BINDING_SPECS, gutterInches, podPackageId, printedPageCount, BINDINGS, type Binding, type BindingAvailability } from "./products";
import {
  cancelPrintJob,
  coverDimensions,
  createPrintJob,
  luluConfigured,
  printCost,
  quoteShipping,
  type PrintCost,
  type ShippingAddress,
} from "./lulu";

export type PrinterId = "lulu";

export type Printer = {
  id: PrinterId;
  /** For people: "Lulu". */
  label: string;
  configured(): boolean;
  /** The printer's product code for a binding at a page size, or null where
   *  it does not offer it. */
  sku(binding: Binding, trim: PlannerTrimKey): string | null;
  /** The pages a binding can hold, counted as printed. */
  pageLimits(binding: Binding): { min: number; max: number };
  /** Inches added to the inside margin for the binding - see
   *  plannerPdf.ts, gutterTransform. */
  gutterInches(binding: Binding, printedPages: number): number;
  /** What printing and posting one book costs us, one shipping level. */
  printCost(sku: string, pages: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintCost>;
  /** Every level that serves the address, priced. */
  quoteShipping(sku: string, pages: number, address: ShippingAddress, levels: readonly ShippingLevel[]): Promise<Array<{ level: ShippingLevel; cost: PrintCost }>>;
  /** The cover sheet's size, bleed and any board wrap included. */
  coverSize(sku: string, pages: number): Promise<{ widthPt: number; heightPt: number }>;
  /** Send a paid order to print; the printer charges our account for it. */
  submit(input: {
    externalId: string;
    title: string;
    sku: string;
    interiorUrl: string;
    coverUrl: string;
    address: ShippingAddress;
    level: ShippingLevel;
    contactEmail: string;
  }): Promise<{ jobId: string; status: string | null }>;
  /** Stop a job the printer has not started. */
  cancel(jobId: string): Promise<void>;
};

export const LULU: Printer = {
  id: "lulu",
  label: "Lulu",
  configured: luluConfigured,
  sku: podPackageId,
  pageLimits: (binding) => ({ min: BINDING_SPECS[binding].minPages, max: BINDING_SPECS[binding].maxPages }),
  gutterInches,
  printCost,
  quoteShipping,
  coverSize: coverDimensions,
  submit: async (input) => {
    const job = await createPrintJob({
      externalId: input.externalId,
      title: input.title,
      podPackageId: input.sku,
      interiorUrl: input.interiorUrl,
      coverUrl: input.coverUrl,
      address: input.address,
      level: input.level,
      contactEmail: input.contactEmail,
    });
    return { jobId: String(job.id), status: job.status?.name ?? null };
  },
  cancel: async (jobId) => {
    await cancelPrintJob(jobId);
  },
};

const PRINTERS: Record<PrinterId, Printer> = { lulu: LULU };

/** The printer new orders go to. */
export const DEFAULT_PRINTER: Printer = LULU;

/** The printer an order went to. An order from before printers were
 *  recorded went to Lulu; a name this code does not know is an error, never
 *  quietly another company. */
export function printerFor(id: string | null | undefined): Printer {
  if (!id) return DEFAULT_PRINTER;
  const printer = PRINTERS[id as PrinterId];
  if (!printer) throw new Error(`Unknown printer "${id}".`);
  return printer;
}

/** Which bindings a book can be printed in at this printer, and why not. */
export function availabilityAt(printer: Printer, bookPages: number): BindingAvailability[] {
  const pages = printedPageCount(bookPages);
  return BINDINGS.map((binding) => {
    const { min, max } = printer.pageLimits(binding);
    const label = BINDING_SPECS[binding].label;
    if (pages < min) return { binding, ok: false, reason: `${label} needs at least ${min} pages; this book has ${pages}.` };
    if (pages > max) return { binding, ok: false, reason: `${label} holds at most ${max} pages; this book has ${pages}. Choose a shorter length, or another binding.` };
    return { binding, ok: true };
  });
}

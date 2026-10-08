// THE PRINTERS, as orders see them: one shape, whichever company prints.
//
// Two since 2026-10-08. Lulu prints plastic coil, paperback and hardcover;
// BookVault prints metal wire-o, in the UK ("this season i want wire-o").
// Each BINDING has one printer (printerForBinding), never chosen order by
// order: a binding is then the same book every time, and the customer picks
// a binding, never a printer. An order remembers which printer it went to
// (PrintOrder.printer), so renewals and refunds reach the right one.
//
// What differs between printers lives behind this shape: their product
// codes, page limits and binding margins, how they price, post, size a
// cover, take and cancel a job, and the statuses in which a job can still be
// stopped. What is the same - the book, the price rule, the order, the
// payment - lives in orders.ts and does not know which printer it is.
//
// Each printer has its own webhook route for status news (Lulu's is
// src/app/api/lulu/webhook, BookVault's src/app/api/bookvault/webhook),
// since every company sends it differently.

import type { PlannerTrimKey } from "@/lib/planner-trims";
import { SHIPPING_LABELS, SHIPPING_LEVELS, type ShippingLevel } from "./orderRange";
import { BINDING_SPECS, BINDINGS, LULU_BINDINGS, gutterInches, isLuluBinding, podPackageId, printedPageCount, type Binding, type BindingAvailability } from "./products";
import {
  cancelPrintJob,
  coverDimensions,
  createPrintJob,
  LULU_STOPPABLE,
  luluConfigured,
  printCost,
  quoteShipping,
  type PrintCost,
  type ShippingAddress,
} from "./lulu";
import {
  BOOKVAULT_GUTTER_IN,
  BOOKVAULT_LEVEL_LABELS,
  BOOKVAULT_LEVELS,
  BOOKVAULT_PAPER,
  BOOKVAULT_STOPPABLE,
  BookVaultError,
  bookVaultAddressProblem,
  bookVaultConfigured,
  bookVaultCoverPage,
  bookVaultQuotes,
  bookVaultSku,
  cancelBookVaultOrder,
  getBookVaultOrder,
  placeBookVaultOrder,
} from "./bookvault";

export type PrinterId = "lulu" | "bookvault";

/** One way of posting a book, priced as our cost. */
export type ShippingQuote = {
  level: ShippingLevel;
  cost: PrintCost;
  /** The printer's own name for it, where it has one. */
  label?: string;
  /** When it should arrive, where the printer says (ISO days). */
  arrives?: { earliest: string; latest: string };
};

export type Printer = {
  id: PrinterId;
  /** For people: "Lulu". */
  label: string;
  /** The bindings it prints for us. */
  bindings: readonly Binding[];
  configured(): boolean;
  /** The printer's product code for a binding at a page size, or null where
   *  it does not offer it. */
  sku(binding: Binding, trim: PlannerTrimKey): string | null;
  /** The pages a binding can hold, counted as printed. */
  pageLimits(binding: Binding): { min: number; max: number };
  /** Inches added to the inside margin for the binding - see
   *  plannerPdf.ts, gutterTransform. */
  gutterInches(binding: Binding, printedPages: number): number;
  /** "wrap": back, spine and front on one sheet. "panels": the front and the
   *  back as pages of their own (a wire-o book at BookVault). */
  coverForm: "wrap" | "panels";
  /** The shipping levels it offers, cheapest first. */
  levels: readonly ShippingLevel[];
  /** The levels to try for its lowest price - the cheapest it might offer an
   *  address, and the next where that one is not. */
  cheapestLevels: readonly ShippingLevel[];
  levelLabel(level: ShippingLevel): string;
  /** What printing and posting one book costs us, one shipping level. */
  printCost(sku: string, pages: number, address: ShippingAddress, level: ShippingLevel): Promise<PrintCost>;
  /** Every level that serves the address, priced. */
  quoteShipping(sku: string, pages: number, address: ShippingAddress, levels: readonly ShippingLevel[]): Promise<ShippingQuote[]>;
  /** The cover's size, bleed and any board wrap included - for "panels", one
   *  page of it. */
  coverSize(sku: string, pages: number): Promise<{ widthPt: number; heightPt: number }>;
  /** What about an address this printer cannot take, said so it can be
   *  fixed, or null. */
  addressProblem(address: ShippingAddress): string | null;
  /** Its own status names in which a job can still be stopped. */
  stoppable: ReadonlySet<string>;
  /** Who prints the book and how long it takes, for the order screen. */
  note(address: ShippingAddress): string;
  /** Send a paid order to print; the printer charges our account for it.
   *  `attention` is something we must do for it to go ahead - said to us,
   *  not the customer. */
  submit(input: {
    externalId: string;
    title: string;
    sku: string;
    pages: number;
    interiorUrl: string;
    coverUrl: string;
    address: ShippingAddress;
    level: ShippingLevel;
    contactEmail: string;
  }): Promise<{ jobId: string; status: string | null; attention?: string }>;
  /** Stop a job the printer has not started. */
  cancel(jobId: string): Promise<void>;
};

export const LULU: Printer = {
  id: "lulu",
  label: "Lulu",
  bindings: ["coil", "paperback", "hardcover"],
  configured: luluConfigured,
  sku: podPackageId,
  pageLimits: (binding) => (isLuluBinding(binding) ? { min: LULU_BINDINGS[binding].minPages, max: LULU_BINDINGS[binding].maxPages } : { min: 1, max: 0 }),
  gutterInches,
  coverForm: "wrap",
  levels: SHIPPING_LEVELS,
  cheapestLevels: ["MAIL", "GROUND"],
  levelLabel: (level) => SHIPPING_LABELS[level],
  printCost,
  quoteShipping: async (sku, pages, address, levels) => (await quoteShipping(sku, pages, address, levels)).map((quote) => ({ ...quote, label: SHIPPING_LABELS[quote.level] })),
  coverSize: coverDimensions,
  addressProblem: () => null,
  stoppable: LULU_STOPPABLE,
  note: () => "Lulu prints and posts it. Printing takes 3 to 5 business days, then the post.",
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

export const BOOKVAULT: Printer = {
  id: "bookvault",
  label: "BookVault",
  bindings: ["wireo"],
  configured: bookVaultConfigured,
  sku: bookVaultSku,
  // The least is BookVault's to say, at pricing (bookVaultSpec
  // refuses with its reason); the most is the wire's on this paper.
  pageLimits: (binding) => (binding === "wireo" ? { min: 4, max: BOOKVAULT_PAPER.wireoMaxPages } : { min: 1, max: 0 }),
  gutterInches: (binding) => (binding === "wireo" ? BOOKVAULT_GUTTER_IN : 0),
  coverForm: "panels",
  levels: BOOKVAULT_LEVELS,
  cheapestLevels: ["MAIL"],
  levelLabel: (level) => BOOKVAULT_LEVEL_LABELS[level] ?? SHIPPING_LABELS[level],
  printCost: async (sku, pages, address, level) => {
    const quote = (await bookVaultQuotes(sku, pages, address, [level]))[0];
    if (!quote) throw new BookVaultError("BookVault offers no way to post it to that address.", 0, "");
    return quote.cost;
  },
  quoteShipping: (sku, pages, address, levels) => bookVaultQuotes(sku, pages, address, levels),
  coverSize: async (sku) => bookVaultCoverPage(sku),
  addressProblem: bookVaultAddressProblem,
  stoppable: BOOKVAULT_STOPPABLE,
  note: (address) =>
    address.countryCode === "US"
      ? "BookVault prints it in the UK and posts it with duties paid, so there's nothing to pay at the door."
      : address.countryCode === "GB"
        ? "BookVault prints it in the UK and posts it."
        : "BookVault prints it in the UK and posts it. Any import charges are paid on delivery.",
  submit: async (input) => {
    const placed = await placeBookVaultOrder(input);
    // Placed is not yet paid for: BookVault bills the account, and says so
    // with a payment link when it cannot. Read straight back, so we hear.
    let attention: string | undefined;
    try {
      const order = await getBookVaultOrder(placed.podRef);
      const link = order.financials?.orderCost?.paymentLink;
      if (link) attention = `BookVault is waiting for payment on order ${placed.podRef}: ${link}`;
    } catch {
      // The order stands; its status will come by webhook or the daily read.
    }
    return { jobId: placed.podRef, status: "Created", attention };
  },
  cancel: cancelBookVaultOrder,
};

const PRINTERS: Record<PrinterId, Printer> = { lulu: LULU, bookvault: BOOKVAULT };

/** The printer an order without one went to, and the one ordering needs
 *  keys for: Lulu prints most bindings. */
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

/** The printer a binding is made by. */
export function printerForBinding(binding: Binding): Printer {
  return BOOKVAULT.bindings.includes(binding) ? BOOKVAULT : LULU;
}

/** The bindings that can be ordered here: their printer's keys are set. */
export function orderableBindings(): Binding[] {
  return BINDINGS.filter((binding) => printerForBinding(binding).configured());
}

/** Can a book of this many pages be bound this way - the binding's page
 *  limits only. A renewal asks this: its printer is the order's own. */
export function fitsBinding(binding: Binding, bookPages: number): BindingAvailability {
  const printer = printerForBinding(binding);
  const label = BINDING_SPECS[binding].label;
  const pages = printedPageCount(bookPages);
  const { min, max } = printer.pageLimits(binding);
  if (pages < min) return { binding, ok: false, reason: `${label} needs at least ${min} pages; this book has ${pages}.` };
  if (pages > max) return { binding, ok: false, reason: `${label} holds at most ${max} pages; this book has ${pages}. Choose a shorter length, or another binding.` };
  return { binding, ok: true };
}

/** Every binding, and whether a book of this many pages can be ORDERED in
 *  it here: its printer's keys set, and the pages within its limits. */
export function availability(bookPages: number): BindingAvailability[] {
  return BINDINGS.map((binding) =>
    printerForBinding(binding).configured() ? fitsBinding(binding, bookPages) : { binding, ok: false, reason: `${BINDING_SPECS[binding].label} can't be ordered yet.` }
  );
}

/** The levels' names as the order's printer calls them. */
export function shippingLabel(printerId: string | null | undefined, level: string): string {
  try {
    return printerFor(printerId).levelLabel(level as ShippingLevel) ?? level;
  } catch {
    return level;
  }
}

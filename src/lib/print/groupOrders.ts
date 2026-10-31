// A GROUP'S BOOKS IN ONE PAYMENT (memari. for businesses v2, 2026-10-31).
// The coach orders every book of a group (businessGroups.ts) at once: the
// same days, binding, paper and post for all, each to its client's own
// address or all to the group's place, paid for on one Stripe page.
//
// Each book is still an ordinary order (orders.ts) - priced, its files made,
// sent to the printer, followed, cancelled and refunded on its own - so
// everything already true of one book stays true of each. What is the
// group's is held by a PrintBatch: the payment page, whose id each of its
// books carries too, so the checks that keep one payable page for any days of
// a journal (closeOverlappingPages) see a group's page like any other.
//
//   quoteGroupOrder   who can have a book for these days and who not (no
//                     journal, no address, a book for those days already,
//                     too many pages for the binding, the printer refusing
//                     the address), and every post level all of them can
//                     have, priced in all - from each book's page count
//                     alone, as drawing a 90-day book takes seconds
//                     (countInterior)
//   startGroupBatch   a batch for this group's order
//   prepareGroupBook  one book priced again and made, its files kept: the
//                     page asks for them one at a time, showing how far it
//                     has got, so no one request draws them all
//   openGroupPayment  the one Stripe page for every book made, at the total
//                     the coach was shown
//   fulfilPaidBatch   paid: each book to the printer, then one email
//
// A coach signed in, never a guest: a payment of many books belongs to an
// account, and a guest's business lives in a cookie. No auto-renew: the next
// round is ordered the same way, when the coach is ready. Each book is posted
// on its own, so the post is each book's, also to one place - one parcel
// for all would cost less, and is a later step (it needs one print job of
// many books at the printer).
//
// SERVER-ONLY (groupSessionParams and groupOptions are pure, and tested:
// groupOrders.test.mts).

import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { BOOK_DAYS, GROUP_PLACE, bookAddressOf, clientOrderDefaultsFor } from "@/lib/business";
import { clientBookStart } from "./clientPays";
import { GROUP_MAX_MEMBERS } from "@/lib/businessGroups";
import { sendEmail, type EmailSender } from "@/lib/email";
import { HOLDS_DAYS } from "./holdsDays";
import { countInterior, loadJournal, OrderError, rangeLabel } from "./orderBook";
import { orderRange, type ShippingLevel } from "./orderRange";
import {
  asOrderError,
  cleanAddress,
  closeOverlappingPages,
  failClearingPayment,
  fulfilPaidOrder,
  makeQuotedOrder,
  orderingConfigured,
  parseStart,
  PriceMovedError,
  recordClearingPayment,
  stripeCustomer,
} from "./orders";
import { availability, printerFor, printerForBinding, type ShippingQuote } from "./printer";
import { BINDINGS, bindingDescription, bindingFromEnum, orderableTrim, paperFor, type Binding, type PaperColour } from "./products";
import { priceFromCost } from "./pricing";
import { stripe } from "./stripe";
import { groupBankFailedEmail, groupPlacedEmail, notify } from "./emails";
import type { ShippingAddress } from "./lulu";

/** Group payment pages one coach may start in an hour: each makes every
 *  book's files. */
export const GROUP_BATCHES_PER_HOUR = 6;
/** How long a batch's books may take to make before its page is opened. */
const BATCH_OPEN_MS = 60 * 60 * 1000;

export type GroupMember = { clientId: string; name: string } & ({ ok: true; pageCount: number; place: string } | { ok: false; why: string });

export type GroupOption = {
  level: ShippingLevel;
  label: string;
  totalCents: number;
  bookCents: number;
  shippingCents: number;
  /** Each book's total at this level, by client. */
  perBook: Record<string, number>;
  /** The widest arrival of all of them, where the printer says. */
  arrives?: { earliest: string; latest: string };
};

export type GroupQuote = {
  range: { startISO: string; endISO: string; days: number; label: string };
  binding: Binding;
  paper: PaperColour;
  members: GroupMember[];
  options: GroupOption[];
  note: string;
};

/** The post levels every ready book can have, each priced in all: a level
 *  any one of them cannot have is not offered, and none when none is shared. */
export function groupOptions(levels: readonly ShippingLevel[], quotes: Array<{ clientId: string; quotes: ShippingQuote[] }>, labelOf: (level: ShippingLevel) => string): GroupOption[] {
  if (quotes.length === 0) return [];
  return levels.flatMap((level) => {
    const each = quotes.map((q) => ({ clientId: q.clientId, quote: q.quotes.find((x) => x.level === level) }));
    if (each.some((e) => !e.quote)) return [];
    const priced = each.map((e) => ({ clientId: e.clientId, price: priceFromCost(e.quote!.cost), arrives: e.quote!.arrives }));
    const arrivals = priced.flatMap((p) => (p.arrives ? [p.arrives] : []));
    return [
      {
        level,
        label: each[0].quote!.label ?? labelOf(level),
        totalCents: priced.reduce((s, p) => s + p.price.totalCents, 0),
        bookCents: priced.reduce((s, p) => s + p.price.bookCents, 0),
        shippingCents: priced.reduce((s, p) => s + p.price.shippingCents, 0),
        perBook: Object.fromEntries(priced.map((p) => [p.clientId, p.price.totalCents])),
        ...(arrivals.length === priced.length
          ? { arrives: { earliest: arrivals.map((a) => a.earliest).sort()[0], latest: arrivals.map((a) => a.latest).sort().at(-1)! } }
          : {}),
      },
    ];
  });
}

/** A few at a time: the printer is asked for each address, and each journal
 *  is read from the database. */
async function eachLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await run(items[i]);
      }
    })
  );
  return out;
}

const isoToday = () => new Date().toISOString().slice(0, 10);

/** The group, its current people, and where each one's books go. */
async function groupOf(ownerId: string, groupId: string) {
  const group = await prisma.businessGroup.findFirst({
    where: { id: groupId, business: { ownerId } },
    include: { clients: { where: { archivedAt: null }, orderBy: { name: "asc" }, include: { group: GROUP_PLACE } } },
  });
  if (!group) throw new OrderError("That group is not one of yours.");
  return group;
}

/** A book for these days already: paid and on its way, clearing, or paid
 *  and waiting on the printer (holdsDays.ts). */
const holdingBook = (plannerId: string, range: { start: Date; end: Date }) =>
  prisma.printOrder.findFirst({ where: { plannerId, startDate: { lte: range.end }, endDate: { gte: range.start }, OR: HOLDS_DAYS }, select: { id: true } });

/** "Hotel Lumen, Austin" or "Maya's address, Jersey City": what the list says
 *  of where a book goes. */
const placeWords = (address: ShippingAddress, venue: boolean) => (venue ? `${address.name}, ${address.city}` : `Home, ${address.city}`);

/** Who can have a book for these days, and what all of theirs cost. */
export async function quoteGroupOrder(ownerId: string, groupId: string, o: { startISO: string; binding: Binding; paper?: PaperColour }): Promise<GroupQuote> {
  const configured = orderingConfigured();
  if (!configured.ok) throw new OrderError(`Ordering is not switched on yet: the ${configured.missing.join(" and ")} keys are not set.`);
  if (!BINDINGS.includes(o.binding)) throw new OrderError("Choose a binding.");
  const start = parseStart(o.startISO);
  if (o.startISO < isoToday()) throw new OrderError("Choose a start of today or later: a book is printed for days still to come.");
  const group = await groupOf(ownerId, groupId);
  const days = BOOK_DAYS[group.bookMonths] ?? group.bookMonths * 30;
  const range = orderRange(start, days);
  const printer = printerForBinding(o.binding);
  const paper = paperFor(o.binding, o.paper);

  type Ready = { clientId: string; name: string; sku: string; pageCount: number; address: ShippingAddress; venue: boolean };
  const looked = await eachLimited(group.clients, 4, async (c): Promise<GroupMember | Ready> => {
    const no = (why: string): GroupMember => ({ clientId: c.id, name: c.name, ok: false, why });
    if (!c.plannerId) return no(c.templateId ? "Their journal isn't built yet." : "No template, so no journal yet.");
    const raw = bookAddressOf(c);
    if (!raw) return no(group.shipToVenue ? "The group's place has no full address." : "No address to send it to.");
    if (await holdingBook(c.plannerId, range)) return no("Has a book for these days already.");
    const journal = await loadJournal(ownerId, c.plannerId);
    if (!journal) return no("Their journal could not be found.");
    let count;
    try {
      count = countInterior(journal, range);
    } catch (error) {
      if (error instanceof OrderError) return no(error.message);
      throw error;
    }
    if (!orderableTrim(count.trim)) return no("Their journal is laid out at US Letter, the print-at-home size.");
    const fit = availability(count.bookPages).find((a) => a.binding === o.binding);
    if (!fit?.ok) return no(fit && !fit.ok ? fit.reason : "This binding can't hold their book.");
    const sku = printer.sku(o.binding, count.trim, paper);
    if (!sku) return no("This binding isn't made at their journal's size.");
    let address: ShippingAddress;
    try {
      address = cleanAddress(raw);
    } catch (error) {
      return no(error instanceof Error ? error.message : "Their address is missing something.");
    }
    const problem = printer.addressProblem(address);
    if (problem) return no(problem);
    return { clientId: c.id, name: c.name, sku, pageCount: count.pageCount, address, venue: group.shipToVenue };
  });

  // The printer asked once for each different book and address: a group
  // sent to one place asks once for all its books of one length.
  const ready = looked.filter((m): m is Ready => "sku" in m);
  const asked = new Map<string, Promise<ShippingQuote[]>>();
  const quotes = await eachLimited(ready, 4, async (m) => {
    const key = `${m.sku}|${m.pageCount}|${JSON.stringify(m.address)}`;
    if (!asked.has(key)) asked.set(key, printer.quoteShipping(m.sku, m.pageCount, m.address, printer.levels));
    try {
      return { m, quotes: await asked.get(key)! };
    } catch (error) {
      const said = asOrderError(error);
      return { m, why: said instanceof OrderError ? said.message : `${printer.label} could not price the post to them just now.` };
    }
  });
  const priced = quotes.flatMap((q) => ("quotes" in q && q.quotes!.length > 0 ? [{ clientId: q.m.clientId, quotes: q.quotes! }] : []));
  const why = new Map(quotes.flatMap((q) => ("why" in q ? [[q.m.clientId, q.why!]] : "quotes" in q && q.quotes!.length === 0 ? [[q.m.clientId, `${printer.label} can't post to their address.`]] : [])));

  const members: GroupMember[] = looked.map((m) => {
    if (!("sku" in m)) return m;
    const refused = why.get(m.clientId);
    return refused ? { clientId: m.clientId, name: m.name, ok: false, why: refused } : { clientId: m.clientId, name: m.name, ok: true, pageCount: m.pageCount, place: placeWords(m.address, m.venue) };
  });
  return {
    range: { startISO: o.startISO, endISO: range.end.toISOString().slice(0, 10), days: range.days, label: rangeLabel(range) },
    binding: o.binding,
    paper,
    members,
    options: groupOptions(printer.levels, priced, (level) => printer.levelLabel(level)),
    note: ready[0] ? printer.note(ready[0].address) : "",
  };
}

/** The day the group's next books start, for the order form: the start most
 *  of them are due next (the day after their last book, or the group's first
 *  start - clientOrderDefaultsFor), or, when that has gone, the first day a
 *  book can reach them, on the template's week start (clientBookStart). */
export async function groupOrderStart(ownerId: string, groupId: string): Promise<string | null> {
  const group = await groupOf(ownerId, groupId);
  const due = await eachLimited(
    group.clients.filter((c) => c.plannerId),
    4,
    async (c) => (await clientOrderDefaultsFor(ownerId, c.plannerId!))?.startISO ?? null
  );
  const counts = new Map<string, number>();
  for (const d of due) if (d) counts.set(d, (counts.get(d) ?? 0) + 1);
  const most = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? group.startDate?.toISOString().slice(0, 10) ?? null;
  if (!most) return null;
  const template = group.templateId ? await prisma.businessTemplate.findUnique({ where: { id: group.templateId }, select: { planner: { select: { theme: true } } } }) : null;
  const weekStartDay = Number((template?.planner.theme as { weekStartDay?: unknown } | null)?.weekStartDay ?? 0) || 0;
  return clientBookStart({ startISO: most, today: new Date(), weekStartDay });
}

/** A batch for one of the coach's groups: what its books are made into. */
export async function startGroupBatch(ownerId: string, groupId: string): Promise<string> {
  await groupOf(ownerId, groupId);
  const recent = await prisma.printBatch.count({ where: { ownerId, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= GROUP_BATCHES_PER_HOUR) throw new OrderError("That's a lot of group orders for one hour. Try again in a little while.");
  return (await prisma.printBatch.create({ data: { ownerId, groupId } })).id;
}

/** One book of the batch: priced again and made, its files kept - at the
 *  price the coach was shown, or nothing is made. Asked again for a book
 *  already made, it is that book. */
export async function prepareGroupBook(
  ownerId: string,
  batchId: string,
  clientId: string,
  o: { startISO: string; days: number; binding: Binding; paper?: PaperColour; level: ShippingLevel; expectCents: number; email?: string }
): Promise<{ orderId: string; totalCents: number }> {
  const batch = await prisma.printBatch.findFirst({ where: { id: batchId, ownerId }, include: { orders: { select: { id: true, plannerId: true, totalCents: true } } } });
  if (!batch?.groupId) throw new OrderError("That order could not be found. See prices again.");
  if (batch.stripeCheckoutSessionId) throw new OrderError("These books have gone to payment already. See prices again to order more.");
  if (Date.now() - batch.createdAt.getTime() > BATCH_OPEN_MS) throw new PriceMovedError("This order was started over an hour ago. See prices again.");
  const client = await prisma.businessClient.findFirst({ where: { id: clientId, groupId: batch.groupId, archivedAt: null, business: { ownerId } }, include: { group: true } });
  if (!client?.plannerId || !client.group) throw new OrderError("They are no longer in the group, or have no journal.");
  const made = batch.orders.find((x) => x.plannerId === client.plannerId);
  if (made) return { orderId: made.id, totalCents: made.totalCents };
  if (batch.orders.length >= GROUP_MAX_MEMBERS) throw new OrderError(`One payment holds up to ${GROUP_MAX_MEMBERS} books.`);
  if (o.days !== (BOOK_DAYS[client.group.bookMonths] ?? client.group.bookMonths * 30)) throw new PriceMovedError("The group's book length has changed since you saw the prices. See prices again.");
  const address = bookAddressOf(client);
  if (!address) throw new PriceMovedError(`${client.name} has no address to send to now. See prices again.`);
  const range = orderRange(parseStart(o.startISO), o.days);
  if (await holdingBook(client.plannerId, range)) throw new PriceMovedError(`${client.name} has a book for these days now. See prices again.`);
  try {
    const { order } = await makeQuotedOrder(
      ownerId,
      { journalId: client.plannerId, startISO: o.startISO, days: o.days, binding: o.binding, paper: o.paper, address, level: o.level, autoRenew: false, email: o.email },
      { batchId, expectTotalCents: o.expectCents }
    );
    return { orderId: order.id, totalCents: order.totalCents };
  } catch (error) {
    // said with whose book it was
    if (error instanceof OrderError) throw new (error instanceof PriceMovedError ? PriceMovedError : OrderError)(`${client.name}'s book: ${error.message}`);
    throw error;
  }
}

/** Stripe's page for a group's books: one line a book, and the post of all
 *  of them on one line. Each book's line is its own total less its post, so
 *  the page's total is the books' totals added up. */
export function groupSessionParams(o: {
  batchId: string;
  group: string;
  customer: string;
  books: Array<{ id: string; title: string; description: string; bookCents: number; shippingCents: number; totalCents: number }>;
  shippingName: string;
  successUrl: string;
  cancelUrl: string;
  /** When the page stops taking payment (seconds): under the 24 hours an
   *  open page counts as holding its days. */
  expiresAt: number;
}): Stripe.Checkout.SessionCreateParams {
  if (o.books.length === 0) throw new OrderError("There are no books to pay for.");
  if (o.books.length > 99) throw new OrderError("One payment holds up to 99 books.");
  for (const b of o.books) if (b.bookCents + b.shippingCents !== b.totalCents) throw new Error(`Book ${b.id}'s price does not add up.`);
  const shipping = o.books.reduce((s, b) => s + b.shippingCents, 0);
  return {
    mode: "payment",
    customer: o.customer,
    expires_at: o.expiresAt,
    client_reference_id: o.batchId,
    metadata: { batchId: o.batchId },
    line_items: [
      ...o.books.map((b) => ({ quantity: 1, price_data: { currency: "usd", unit_amount: b.bookCents, product_data: { name: `${b.title} - printed journal`, description: b.description } } })),
      { quantity: 1, price_data: { currency: "usd", unit_amount: shipping, product_data: { name: `Shipping - ${o.shippingName}, ${o.books.length} ${o.books.length === 1 ? "book" : "books"} posted one by one` } } },
    ],
    payment_intent_data: { metadata: { batchId: o.batchId }, description: `${o.group}: ${o.books.length} printed journals` },
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
  };
}

/** The one payment page for every book made, at the total shown. Only one
 *  page can be paid for any days of a journal: each book is checked as one
 *  book's page is (closeOverlappingPages), and if any one cannot be, the
 *  whole page closes and the coach is told whose. */
export async function openGroupPayment(ownerId: string, batchId: string, expectTotalCents: number, origin: string, email: string | undefined): Promise<string> {
  const batch = await prisma.printBatch.findFirst({
    where: { id: batchId, ownerId },
    include: { group: { select: { id: true, name: true } }, orders: { where: { status: "QUOTED", failureReason: null }, orderBy: { title: "asc" } } },
  });
  if (!batch?.group) throw new OrderError("That order could not be found. See prices again.");
  if (batch.stripeCheckoutSessionId) throw new OrderError("These books have gone to payment already.");
  const books = batch.orders;
  const total = books.reduce((s, b) => s + b.totalCents, 0);
  if (total !== expectTotalCents) throw new PriceMovedError("The price has changed since you saw it. See prices again.");
  const first = books[0];
  if (!first) throw new OrderError("There are no books to pay for.");
  // CLAIMED BEFORE STRIPE IS ASKED (review, 2026-10-31): two presses at once
  // each opened a page, and the books carried only the second's id - the
  // first, if paid, would have taken the money and sent no book. Only the
  // call that claims the batch opens a page; a page that fails to open lets
  // it go again.
  const claim = `claiming:${randomBytes(8).toString("hex")}`;
  const claimed = await prisma.printBatch.updateMany({ where: { id: batchId, stripeCheckoutSessionId: null }, data: { stripeCheckoutSessionId: claim } });
  if (claimed.count !== 1) throw new OrderError("These books have gone to payment already.");
  const release = () => prisma.printBatch.updateMany({ where: { id: batchId, stripeCheckoutSessionId: claim }, data: { stripeCheckoutSessionId: null } });
  let session: Stripe.Checkout.Session;
  try {
    const customer = await stripeCustomer(ownerId, email, (first.shippingAddress as unknown as ShippingAddress).name);
    session = await stripe().checkout.sessions.create(
    groupSessionParams({
      batchId,
      group: batch.group.name,
      customer,
      books: books.map((b) => ({
        id: b.id,
        title: b.title,
        description: `${bindingDescription(bindingFromEnum(b.binding), b.podPackageId)}, ${rangeLabel({ start: b.startDate, end: b.endDate, days: b.days })}, ${b.pageCount} pages`,
        bookCents: b.bookCents,
        shippingCents: b.shippingCents,
        totalCents: b.totalCents,
      })),
      shippingName: printerFor(first.printer).levelLabel(first.shippingLevel as ShippingLevel),
      successUrl: `${origin}/app/business/groups/${batch.group.id}?placed=${batchId}`,
      cancelUrl: `${origin}/app/business/groups/${batch.group.id}`,
      expiresAt: Math.floor(Date.now() / 1000) + 23 * 60 * 60,
    })
    );
  } catch (error) {
    await release();
    throw error;
  }
  if (!session.url) {
    await release();
    throw new OrderError("Stripe did not open a payment page. Try again.");
  }
  // the page's id on the batch and on each book, before any is checked: an
  // older page for one of their days then sees this one (orders.ts)
  await prisma.printBatch.update({ where: { id: batchId }, data: { stripeCheckoutSessionId: session.id } });
  await prisma.printOrder.updateMany({ where: { id: { in: books.map((b) => b.id) } }, data: { stripeCheckoutSessionId: session.id } });
  for (const book of books) {
    try {
      await closeOverlappingPages(book.id, batch.createdAt);
    } catch (error) {
      // the page closes for all of them, not only this book
      try {
        await stripe().checkout.sessions.expire(session.id);
      } catch (closing) {
        console.error(`[print] could not close group payment page ${batchId}:`, closing);
      }
      const told = error instanceof Error ? error.message : "Its payment page could not be opened.";
      await prisma.printOrder.updateMany({ where: { batchId, status: "QUOTED" }, data: { stripeCheckoutSessionId: null, failureReason: `The group's payment page closed: ${book.title}'s days were being paid on another page.` } });
      throw new OrderError(`${book.title}: ${told}`);
    }
  }
  return session.url;
}

/** The books a group's payment page is for (not those it was closed for). */
const booksOfPage = (batchId: string, sessionId: string) => prisma.printOrder.findMany({ where: { batchId, stripeCheckoutSessionId: sessionId }, orderBy: { title: "asc" } });

/** Paid: each book to the printer - a few at a time, each safe to repeat
 *  (fulfilPaidOrder) - then the one email, sent once however often Stripe
 *  says so. A book the printer refuses is FAILED with its reason, and the
 *  admin told, as for any book. */
export async function fulfilPaidBatch(batchId: string, sessionId: string, payment: { paymentIntentId?: string }, origin: string, email?: string | null, send: EmailSender = sendEmail): Promise<number> {
  if (email) await prisma.printOrder.updateMany({ where: { batchId, stripeCheckoutSessionId: sessionId, contactEmail: null }, data: { contactEmail: email } });
  const books = await booksOfPage(batchId, sessionId);
  const sent = await eachLimited(books, 4, async (book) => {
    try {
      return await fulfilPaidOrder(book.id, { paymentIntentId: payment.paymentIntentId }, origin);
    } catch (error) {
      console.error(`[print] group book ${book.id} paid but not sent to print:`, error);
      return false;
    }
  });
  const claimed = await prisma.printBatch.updateMany({ where: { id: batchId, placedEmailedAt: null }, data: { placedEmailedAt: new Date() } });
  if (claimed.count === 1) {
    const batch = await prisma.printBatch.findUnique({ where: { id: batchId }, include: { group: { select: { name: true } } } });
    await notify(groupPlacedEmail(batch?.group?.name ?? "Your group", await booksOfPage(batchId, sessionId)), send);
  }
  return sent.filter(Boolean).length;
}

/** Finished with a bank payment still clearing: every book's days held. */
export async function recordClearingBatch(batchId: string, sessionId: string, paymentIntentId: string, email?: string | null): Promise<void> {
  for (const book of await booksOfPage(batchId, sessionId)) await recordClearingPayment(book.id, paymentIntentId, email);
}

/** The bank said no: none of its books was ordered, and the coach is told
 *  once, of all of them. */
export async function failClearingBatch(batchId: string, sessionId: string, send: EmailSender = sendEmail): Promise<void> {
  const ended: string[] = [];
  // each book's own email held back: the group's one goes instead
  const held: EmailSender = async () => ({ sent: false, reason: "the group's one email goes instead" });
  for (const book of await booksOfPage(batchId, sessionId)) if (await failClearingPayment(book.id, held)) ended.push(book.id);
  if (ended.length === 0) return;
  const batch = await prisma.printBatch.findUnique({ where: { id: batchId }, include: { group: { select: { name: true } } } });
  const books = await prisma.printOrder.findMany({ where: { id: { in: ended } }, orderBy: { title: "asc" } });
  await notify(groupBankFailedEmail(batch?.group?.name ?? "your group", books), send);
}

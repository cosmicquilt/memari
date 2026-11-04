// WHAT A CONNECTED ASSISTANT'S CHANGE REACHES IN A COACHING BUSINESS
// (2026-11-04; Andrew: "Templates with no clients or they can even create new
// templates from existing ones claude then move the clients over on the
// website").
//
// A coach's template with no clients is theirs to change from a chat: no
// one's book follows it yet. One with any client is not, and a client's
// journal never is: a chat can't show whose books a change reaches, and a
// client's goals are not for it to read. tools.ts refuses those journals
// outright. This is the other way in, through a LINK: a change made somewhere
// allowed is copied out to every other use of a linked page or module
// (savedItems.ts), and one of those uses can be a template with clients, or a
// client's journal. A coach's own saved page used in their journal and in a
// template is enough.
//
// THE RULE IS syncLinkedPages'S OWN, read without writing: a client's journal
// takes a change only when its template does, so a client the coach moved off
// a template is not reached by it, and is not counted.
//
// A CLIENT IS ONE NOT ARCHIVED (review, 2026-11-04), as Templates and the
// Move card count them (templateReach). Counted here as well, a template whose
// clients had all been archived was shut to a chat for good while the website
// showed it with none, and no way to move them off. An archived client's book
// isn't printed; their journal follows the template as it does any edit made
// by hand while they're archived.
//
// A plain server module: it trusts the ids it is handed.

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** The clients that count: not archived. */
const ACTIVE = { archivedAt: null } as const;

const USE = {
  plannerId: true,
  planner: {
    select: {
      title: true,
      businessClient: { select: { archivedAt: true, template: { select: { plannerId: true } } } },
      businessTemplate: { select: { _count: { select: { clients: { where: ACTIVE } } } } },
    },
  },
} as const;

type Use = {
  plannerId: string;
  planner: {
    title: string;
    businessClient: { archivedAt: Date | null; template: { plannerId: string } | null } | null;
    businessTemplate: { _count: { clients: number } } | null;
  };
};

/** What a change copied out from `editedIn` would rewrite: how many other
 *  places, whether any is a client's journal or a template with clients, and
 *  those templates by name. */
export type Reach = { places: number; business: boolean; templates: string[] };

const NOWHERE: Reach = { places: 0, business: false, templates: [] };

/** The uses a change made in `editedIn` is copied to (syncLinkedPages). */
function reachedOf<T extends Use>(editedIn: string, others: T[]): T[] {
  const followed = new Set([editedIn, ...others.filter((use) => !use.planner.businessClient).map((use) => use.plannerId)]);
  return others.filter((use) => {
    const client = use.planner.businessClient;
    return !client || (!!client.template && followed.has(client.template.plannerId));
  });
}

function reachOf(reached: Use[]): Reach {
  const withClients = reached.filter((use) => (use.planner.businessTemplate?._count.clients ?? 0) > 0);
  return {
    places: reached.length,
    business: withClients.length > 0 || reached.some((use) => !!use.planner.businessClient && !use.planner.businessClient.archivedAt),
    templates: [...new Set(withClients.map((use) => use.planner.title))],
  };
}

const both = (a: Reach, b: Reach): Reach => ({ places: a.places, business: a.business || b.business, templates: [...new Set([...a.templates, ...b.templates])] });

/** A linked page's other uses that a change to it reaches. */
export async function pageReach(page: { id: string; plannerId: string; savedPageId: string | null; savedPageIndex: number | null }, ownerId: string): Promise<Reach> {
  if (!page.savedPageId) return NOWHERE;
  const others = await prisma.page.findMany({
    where: { savedPageId: page.savedPageId, savedPageIndex: page.savedPageIndex, id: { not: page.id }, planner: { ownerId } },
    select: USE,
  });
  return reachOf(reachedOf(page.plannerId, others));
}

/** A linked module's other uses that a change to its settings reaches.
 *
 *  AND THE PAGES THEY ARE ON (review, 2026-11-04). updateModuleConfig gives
 *  the settings to every use (spreadSavedModuleProps), then copies each page
 *  holding one out to that page's own other uses (syncLinkedPages). Most often
 *  those hold the module too and are counted already; a page whose other uses
 *  have gone out of step with it does not, and its copy out could reach a
 *  template with clients that the module's uses alone don't. So a reached
 *  use's page is read as a page is. Not a client's: syncLinkedPages copies
 *  nothing out of one. */
export async function moduleReach(instance: { id: string; savedModuleId: string | null }, plannerId: string, ownerId: string): Promise<Reach> {
  if (!instance.savedModuleId) return NOWHERE;
  const others = await prisma.moduleInstance.findMany({
    where: { savedModuleId: instance.savedModuleId, id: { not: instance.id }, page: { planner: { ownerId } } },
    select: { page: { select: { id: true, savedPageId: true, savedPageIndex: true, ...USE } } },
  });
  const reached = reachedOf(plannerId, others.map((use) => use.page));
  let reach = reachOf(reached);
  for (const page of new Map(reached.map((use) => [use.id, use])).values()) {
    if (page.savedPageId && !page.planner.businessClient) reach = both(reach, await pageReach(page, ownerId));
  }
  return reach;
}

/** How many clients a journal has as their template: any not archived, with
 *  a journal built or not (one waiting for theirs gets the template as it is
 *  when it's built). None for a journal that isn't one. */
export function clientsOfTemplate(plannerId: string, db: Db = prisma): Promise<number> {
  return db.businessClient.count({ where: { template: { plannerId }, ...ACTIVE } });
}

/** Hold a template still for the rest of a transaction, against clients
 *  arriving (review, 2026-11-04): a client is put on a template by writing
 *  its id on their row, and Postgres checks that key against the template's
 *  row with a lock this one excludes. So a client moved onto it waits until
 *  the transaction ends, and one moved just before is seen by a count made
 *  after this. Nothing to hold for a journal that isn't a template. */
export async function holdTemplate(tx: Prisma.TransactionClient, plannerId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "BusinessTemplate" WHERE "plannerId" = ${plannerId} FOR UPDATE`;
}

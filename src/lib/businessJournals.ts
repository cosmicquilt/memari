// memari. for businesses: a client's journal, built from their template
// and kept up to date with it (2026-10-22; handoff/research/
// B2B-findings-summary.md, "How templates should work").
//
// LINKED, so the coach's edits reach every client. Each of the template's
// pages is linked to a saved page (savedItems.ts) - one the coach made, or
// one made here and kept out of their Saved list (sourceKey
// "template:<journal id>") - and the client's copy of that page carries the
// same link. An edit to the template is then copied to every client's copy
// by syncLinkedPages, which every editing action already calls. An edit made
// in one client's journal stays there (2026-10-26): it is never copied back
// to the template or on to other clients, and the template's next change to
// that page replaces it. A printed book never changes: its PDF was stored when it was paid
// for (PrintFile).
//
// WHAT A LINK DOES NOT CARRY: pages added to or taken from the template, and
// the journal's own settings (its fonts, its week, its page size). Those
// reach a client's journal when the coach updates it (updateClientJournal),
// after being told how many clients' next books it changes - Templates shows
// which journals are behind (clientsBehind).
//
// A plain server module, like savedItems.ts: it trusts the ownerId it is
// handed. The business actions check who is asking and call in.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { savePagesAs } from "@/app/planner/savedItems";
import { BOOK_DAYS } from "@/lib/business";

type Tx = Prisma.TransactionClient;
const DAY = 24 * 60 * 60 * 1000;

const LEVEL_NAMES: Record<string, string> = {
  FRONT_MATTER: "front",
  MONTHLY: "month",
  WEEKLY: "week",
  DAILY: "day",
  BACK_MATTER: "back",
};

/** The saved pages a template's own pages are linked through, made here. */
export const templateSourceKey = (plannerId: string) => `template:${plannerId}`;

/** The template a client's journal was built from, read from its pages'
 *  links - for a client whose template the coach has since stopped using,
 *  and so no longer names (review, 2026-10-26). */
export async function formerTemplateOf(journalId: string): Promise<string | undefined> {
  const page = await prisma.page.findFirst({ where: { plannerId: journalId, savedPage: { sourceKey: { startsWith: "template:" } } }, select: { savedPage: { select: { sourceKey: true } } } });
  return page?.savedPage?.sourceKey?.slice("template:".length) || undefined;
}

const PAGE_ORDER = [{ level: "asc" as const }, { variantKey: "asc" as const }, { position: "asc" as const }];

/** Every page of a template linked, so an edit to it reaches its clients'
 *  journals - one page per link (a spread's two pages each have their own);
 *  then its pages with their modules. */
async function linkedTemplate(ownerId: string, plannerId: string) {
  const template = await prisma.planner.findFirst({
    where: { id: plannerId, ownerId },
    include: { pages: { where: { savedPageId: null }, select: { id: true, level: true, position: true } } },
  });
  if (!template) throw new Error("Their template's journal is gone.");
  for (const page of template.pages) {
    const saved = await savePagesAs(ownerId, [page.id], `${template.title}: ${LEVEL_NAMES[page.level] ?? "page"} ${page.position + 1}`);
    await prisma.savedPage.update({ where: { id: saved.id }, data: { sourceKey: templateSourceKey(template.id) } });
  }
  const pages = await prisma.page.findMany({ where: { plannerId: template.id }, include: { moduleInstances: true }, orderBy: PAGE_ORDER });
  return { template, pages };
}

type TemplatePage = Awaited<ReturnType<typeof linkedTemplate>>["pages"][number];

/** One of the template's pages copied into a client's journal, with its link
 *  and its modules. */
async function copyPage(tx: Tx, plannerId: string, page: TemplatePage) {
  const copy = await tx.page.create({
    data: {
      plannerId,
      level: page.level,
      variantKey: page.variantKey,
      position: page.position,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      gridColumns: page.gridColumns,
      gridRows: page.gridRows,
      gridGapPx: page.gridGapPx,
      marginPx: page.marginPx,
      savedPageId: page.savedPageId,
      savedPageIndex: page.savedPageIndex,
    },
  });
  if (page.moduleInstances.length)
    await tx.moduleInstance.createMany({
      data: page.moduleInstances.map((m) => ({
        moduleTypeId: m.moduleTypeId,
        placementMode: m.placementMode,
        locked: m.locked,
        x: m.x,
        y: m.y,
        width: m.width,
        height: m.height,
        columnStart: m.columnStart,
        rowStart: m.rowStart,
        columnSpan: m.columnSpan,
        rowSpan: m.rowSpan,
        zIndex: m.zIndex,
        propValues: (m.propValues ?? {}) as Prisma.InputJsonValue,
        savedModuleId: m.savedModuleId,
        pageId: copy.id,
      })),
    });
}

/** The template's own settings, as a client's journal takes them. */
const settingsOf = (template: { dated: boolean; timeZone: string | null; theme: Prisma.JsonValue | null }) => ({
  dated: template.dated,
  timeZone: template.timeZone,
  theme: template.theme === null ? Prisma.DbNull : (template.theme as Prisma.InputJsonValue),
});

/** Build a client's journal from their template; their journal's id. Does
 *  nothing more for a client who has one already. */
export async function buildClientJournal(ownerId: string, clientId: string): Promise<string> {
  const client = await prisma.businessClient.findFirst({
    where: { id: clientId, business: { ownerId } },
    include: { template: true },
  });
  if (!client) throw new Error("That client is not one of yours.");
  if (client.plannerId) return client.plannerId;
  if (!client.template) throw new Error("Choose a template for them first.");
  const { template, pages } = await linkedTemplate(ownerId, client.template.plannerId);

  // Their dates: from their first book's start, for as long as each book runs.
  const startDate = client.startDate;
  const days = BOOK_DAYS[client.bookMonths] ?? client.bookMonths * 30;
  const endDate = startDate ? new Date(startDate.getTime() + (days - 1) * DAY) : null;

  return prisma.$transaction(
    async (tx) => {
      const planner = await tx.planner.create({
        data: { ownerId, title: client.coverName || client.name, ...settingsOf(template), startDate, endDate },
      });
      for (const page of pages) await copyPage(tx, planner.id, page);
      await tx.businessClient.update({ where: { id: client.id }, data: { plannerId: planner.id } });
      return planner.id;
    },
    { timeout: 30_000 }
  );
}

/**
 * Bring a client's journal back in line with their template: its settings,
 * and its pages - every page the template links, in the template's order,
 * with a page the template has dropped taken out. A page of the client's
 * own (not one of the template's) is kept, after the template's in its set.
 * Their title and dates are theirs and stay. A client without a journal
 * gets one built.
 */
export async function updateClientJournal(ownerId: string, clientId: string, { reset = false, leaving }: { reset?: boolean; leaving?: string } = {}): Promise<string> {
  const client = await prisma.businessClient.findFirst({
    where: { id: clientId, business: { ownerId } },
    include: { template: true },
  });
  if (!client) throw new Error("That client is not one of yours.");
  if (!client.template) throw new Error("Choose a template for them first.");
  if (!client.plannerId) return buildClientJournal(ownerId, clientId);
  const plannerId = client.plannerId;
  const { template, pages } = await linkedTemplate(ownerId, client.template.plannerId);
  const links = pages.map((p) => p.savedPageId!);
  // MOVED TO ANOTHER TEMPLATE (`leaving`: the journal of the one they were on,
  // review 2026-10-26): its pages go as well. Kept, they were taken for the
  // client's own and the new template's were added beside them - every set
  // twice, at a higher price. The client's own pages still stay.
  const leftLinks = leaving
    ? (await prisma.page.findMany({ where: { plannerId: leaving, savedPageId: { not: null } }, select: { savedPageId: true } })).map((p) => p.savedPageId!)
    : [];

  await prisma.$transaction(
    async (tx) => {
      await tx.planner.update({ where: { id: plannerId }, data: settingsOf(template) });
      // KEPT, NOT COPIED AGAIN (review, 2026-10-26): their copy of a page the
      // template still has is kept as it is - the template's edits have
      // reached it through its link already, and what the coach wrote on it
      // for this client stays (an edit in a client's journal is theirs,
      // savedItems.ts). Copied again, every such edit was lost on Update.
      // Only its place is set again. Not on a reset, and not a copy of a
      // different size (a page size change links the template's pages anew).
      const keyOf = (p: { level: string; variantKey: string | null; savedPageId: string | null; savedPageIndex: number | null; widthPx: number; heightPx: number }) =>
        `${p.level}:${p.variantKey ?? ""}:${p.savedPageId}:${p.savedPageIndex ?? 0}:${p.widthPx}x${p.heightPx}`;
      const copies = new Map<string, string[]>();
      if (!reset)
        for (const copy of await tx.page.findMany({ where: { plannerId, savedPageId: { in: links } }, orderBy: PAGE_ORDER })) {
          const key = keyOf(copy);
          copies.set(key, [...(copies.get(key) ?? []), copy.id]);
        }
      const plan = pages.map((page) => ({ page, keep: copies.get(keyOf(page))?.shift() ?? null }));
      const kept = plan.flatMap((p) => (p.keep ? [p.keep] : []));
      // the template's pages, as they were and not kept: linked to one it
      // uses, to one it was given and has since dropped, or to the template
      // they are leaving
      await tx.page.deleteMany({
        where: {
          plannerId,
          id: { notIn: kept },
          OR: [
            { savedPageId: { in: [...links, ...leftLinks] } },
            { savedPage: { sourceKey: templateSourceKey(template.id) } },
            ...(leaving ? [{ savedPage: { sourceKey: templateSourceKey(leaving) } }] : []),
          ],
        },
      });
      // a reset (the editor's Reset to Template on a client's journal,
      // 2026-10-22): their own pages go too, so the journal is the template
      // again; otherwise they are kept, after the template's
      if (reset) await tx.page.deleteMany({ where: { plannerId } });
      // their own pages and the kept copies, out of the way of the template's
      // positions
      const rest = await tx.page.findMany({ where: { plannerId }, orderBy: PAGE_ORDER, select: { id: true, level: true, variantKey: true, position: true } });
      for (const page of rest) await tx.page.update({ where: { id: page.id }, data: { position: page.position + 100_000 } });
      for (const { page, keep } of plan) {
        if (keep) await tx.page.update({ where: { id: keep }, data: { position: page.position } });
        else await copyPage(tx, plannerId, page);
      }
      const keptIds = new Set(kept);
      const own = rest.filter((page) => !keptIds.has(page.id));
      // and back, after the template's pages in each set
      const filled = new Map<string, number>();
      for (const page of pages) {
        const set = `${page.level}:${page.variantKey ?? ""}`;
        filled.set(set, Math.max(filled.get(set) ?? 0, page.position + 1));
      }
      for (const page of own) {
        const set = `${page.level}:${page.variantKey ?? ""}`;
        const position = filled.get(set) ?? 0;
        filled.set(set, position + 1);
        await tx.page.update({ where: { id: page.id }, data: { position } });
      }
    },
    { timeout: 60_000 }
  );
  return plannerId;
}

/** Keys in order, so two copies of one theme compare equal. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

type ShapePage = { level: string; variantKey: string | null; position: number; savedPageId: string | null; savedPageIndex: number | null };

/** What a client's journal takes from its template: its settings, and which
 *  linked page is where. A page the template has not linked yet (one added
 *  since) has no link, so it differs from every client's. */
function shapeOf(planner: { dated: boolean; timeZone: string | null; theme: Prisma.JsonValue | null }, pages: ShapePage[]) {
  return stable({
    dated: planner.dated,
    timeZone: planner.timeZone,
    theme: planner.theme,
    pages: pages.map((p) => [p.level, p.variantKey, p.position, p.savedPageId, p.savedPageIndex]),
  });
}

const SHAPE_SELECT = { level: true, variantKey: true, position: true, savedPageId: true, savedPageIndex: true } as const;

/** The clients of a template whose journals are behind it: pages added or
 *  taken away, or its settings changed, since they were built or updated. */
export async function clientsBehind(templateId: string): Promise<Array<{ id: string; name: string }>> {
  const row = await prisma.businessTemplate.findUnique({
    where: { id: templateId },
    include: {
      planner: { include: { pages: { orderBy: PAGE_ORDER, select: SHAPE_SELECT } } },
      clients: {
        where: { archivedAt: null, plannerId: { not: null } },
        include: { planner: { include: { pages: { orderBy: PAGE_ORDER, select: { ...SHAPE_SELECT, savedPage: { select: { sourceKey: true } } } } } } },
      },
    },
  });
  if (!row) return [];
  const links = new Set(row.planner.pages.map((p) => p.savedPageId).filter(Boolean));
  const source = templateSourceKey(row.plannerId);
  const want = shapeOf(row.planner, row.planner.pages);
  return row.clients
    .filter((c) => {
      const theirs = c.planner!.pages.filter((p) => (p.savedPageId && links.has(p.savedPageId)) || p.savedPage?.sourceKey === source);
      return shapeOf(c.planner!, theirs) !== want;
    })
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Update every one of a template's clients' journals that is behind it;
 *  how many were. */
export async function updateClientsOf(ownerId: string, templateId: string): Promise<number> {
  const row = await prisma.businessTemplate.findFirst({ where: { id: templateId, business: { ownerId } }, select: { id: true } });
  if (!row) throw new Error("That template is not one of yours.");
  const behind = await clientsBehind(templateId);
  for (const client of behind) await updateClientJournal(ownerId, client.id);
  return behind.length;
}

/** How many clients' journals an edit to this template's pages reaches. */
export async function templateReach(plannerId: string): Promise<number> {
  return prisma.businessClient.count({ where: { template: { plannerId }, plannerId: { not: null }, archivedAt: null } });
}

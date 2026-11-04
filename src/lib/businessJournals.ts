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
import { journalSlugOf } from "@/app/planner/journalSlugs";
import { JOURNAL_TITLE_MAX } from "@/app/planner/bookSeeding";
import { BOOK_DAYS } from "@/lib/business";
import { ASK_KEY, applyClientAnswers, askIdOf, questionsOf } from "@/lib/clientAnswers";

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
      // answers they gave before, on another journal (clientAnswers.ts)
      await applyClientAnswers(tx, planner.id);
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
export async function updateClientJournal(
  ownerId: string,
  clientId: string,
  { reset = false, leaving, to }: { reset?: boolean; leaving?: string; to?: string } = {}
): Promise<string> {
  const client = await prisma.businessClient.findFirst({
    where: { id: clientId, business: { ownerId } },
    include: { template: true },
  });
  if (!client) throw new Error("That client is not one of yours.");
  // MOVED ONTO `to` (2026-11-04 review): the template is written on their row
  // in the same transaction as the rebuild, not before it. Written first, a
  // move cut off in between (a time limit, a deploy) left a row naming the
  // new template over a journal of the old one's pages, and nothing healed it.
  const target = to ? await prisma.businessTemplate.findFirst({ where: { id: to, businessId: client.businessId } }) : client.template;
  if (!target) throw new Error(to ? "That template is not one of yours." : "Choose a template for them first.");
  if (!client.plannerId) {
    if (to) await prisma.businessClient.update({ where: { id: client.id }, data: { templateId: to } });
    return buildClientJournal(ownerId, clientId);
  }
  const plannerId = client.plannerId;
  const { template, pages } = await linkedTemplate(ownerId, target.plannerId);
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
      if (to) await tx.businessClient.update({ where: { id: client.id }, data: { templateId: to } });
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
      // they are leaving. And ANY OTHER TEMPLATE'S (2026-11-04 review): its
      // own linking saved pages are kept out of the coach's Saved list, so a
      // page linked through one is never the client's own. One left behind is
      // a move that didn't finish, and kept, the next Update put this
      // template's pages beside it: every set twice, at a higher price.
      await tx.page.deleteMany({
        where: {
          plannerId,
          id: { notIn: kept },
          OR: [
            { savedPageId: { in: [...links, ...leftLinks] } },
            { savedPage: { sourceKey: templateSourceKey(template.id) } },
            ...(leaving ? [{ savedPage: { sourceKey: templateSourceKey(leaving) } }] : []),
            { savedPage: { sourceKey: { startsWith: templateSourceKey(""), not: templateSourceKey(template.id) } } },
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
      // the template's pages copied again: their answers back in
      // (clientAnswers.ts). Inside, so a failure here takes the move back with
      // it rather than leaving a rebuilt journal on a row put back.
      await applyClientAnswers(tx, plannerId);
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

// ---- A TEMPLATE MADE FROM ANOTHER, AND CLIENTS MOVED ONTO IT (2026-11-04) ---
//
// Andrew: "Templates with no clients or they can even create new templates
// from existing ones claude then move the clients over on the website". A
// template with clients is out of a connected assistant's reach, so it copies
// it (connector/tools.ts copy_template), changes the copy, and the coach moves
// clients across on Templates, told first whose next books change.

/** A new template of the coach's business: a copy of one of their templates
 *  (one with clients too) or of a journal of their own, with no clients.
 *
 *  NO LINK OF THE ORIGINAL'S COMES WITH IT. Its pages are linked to the saved
 *  pages that carry edits out to its clients' journals, and maybe to saved
 *  pages and modules of the coach's; a copy sharing one would carry an edit to
 *  the copy into the original and on to every client of it. So its pages and
 *  modules are its own, and the copy is linked afresh, under its own source
 *  key, when its first client's journal is built (linkedTemplate).
 *
 *  A template's questions come with it, under the same ids, so a client moved
 *  onto the copy finds their answers printed again where it asks the same
 *  thing. A question id the copy doesn't ask is taken off its module. */
export async function copyAsTemplate(ownerId: string, sourceId: string, title: string): Promise<{ plannerId: string; templateId: string; slug: string }> {
  const business = await prisma.business.findUnique({ where: { ownerId }, select: { id: true } });
  if (!business) throw new Error("Start your business first.");
  const source = await prisma.planner.findFirst({
    where: { id: sourceId, ownerId, isTemplate: false, businessClient: { is: null } },
    include: { businessTemplate: { select: { questions: true } }, pages: { include: { moduleInstances: true }, orderBy: PAGE_ORDER } },
  });
  if (!source) throw new Error("That journal is not one of yours.");
  const taken = await prisma.businessTemplate.findMany({ where: { businessId: business.id }, select: { planner: { select: { title: true } } } });
  const name = freeTitle(title, source.title, new Set(taken.map((t) => titleKey(t.planner.title))));
  const questions = questionsOf(source.businessTemplate?.questions);
  const asked = new Set(questions.map((q) => q.id));
  const ownAsk = (props: Prisma.JsonValue): Prisma.JsonValue => {
    const id = askIdOf(props);
    if (!id || asked.has(id)) return props;
    const rest = { ...(props as Record<string, unknown>) };
    delete rest[ASK_KEY];
    return rest as Prisma.JsonValue;
  };
  const made = await prisma.$transaction(
    async (tx) => {
      const planner = await tx.planner.create({ data: { ownerId, title: name, ...settingsOf(source), startDate: source.startDate, endDate: source.endDate } });
      for (const page of source.pages) {
        await copyPage(tx, planner.id, {
          ...page,
          savedPageId: null,
          savedPageIndex: null,
          moduleInstances: page.moduleInstances.map((m) => ({ ...m, savedModuleId: null, propValues: ownAsk(m.propValues) })),
        });
      }
      const template = await tx.businessTemplate.create({ data: { businessId: business.id, plannerId: planner.id, questions: questions.length ? (questions as Prisma.InputJsonValue) : undefined } });
      return { plannerId: planner.id, templateId: template.id };
    },
    { timeout: 30_000 }
  );
  return { ...made, slug: await journalSlugOf(made.plannerId) };
}

/** How the intake matches a template by its title (clientIntake.ts). */
const titleKey = (title: string) => title.trim().toLowerCase();

/** A title no other template of the business has (review, 2026-11-04): two
 *  "Reset (copy)"s can't be told apart on Templates, in the Move card's list,
 *  or by the intake, which finds a template by its title, and a move rebuilds
 *  journals with no undo. The next copy is "Reset (copy 2)", and a copy of a
 *  copy is numbered too rather than "(copy) (copy)". A title asked for that is
 *  taken has a number put after it. */
function freeTitle(asked: string, sourceTitle: string, taken: Set<string>): string {
  const within = (stem: string, tail: string) => `${stem.slice(0, JOURNAL_TITLE_MAX - tail.length).trimEnd()}${tail}`;
  const wanted = asked.replace(/\s+/g, " ").trim();
  const stem = wanted || sourceTitle.replace(/ \(copy(?: \d+)?\)$/, "");
  for (let n = 1; ; n++) {
    const name = wanted ? within(stem, n === 1 ? "" : ` (${n})`) : within(stem, n === 1 ? " (copy)" : ` (copy ${n})`);
    if (!taken.has(titleKey(name))) return name;
  }
}

/** A client's journal onto the template `to`, `was` being their row as it
 *  stood: rebuilt from it, the old template's pages taken away and their own
 *  kept, and `to` written on their row in the same transaction
 *  (updateClientJournal). One client on the client page (actions.ts
 *  saveClient), several from Templates (moveClientsTo), a group's people
 *  (businessGroups.ts): one way of moving. A client with no journal yet has
 *  nothing to rebuild: theirs is built from the new template when it is.
 *
 *  On a failure nothing of the move is kept, so a caller that wrote `to` on
 *  their row first (a group's save) gets the template they were on back:
 *  left naming the new one, a later Update would add its pages beside the old
 *  one's (review, 2026-10-26). The error goes on to the caller. */
export async function moveClientJournal(
  ownerId: string,
  was: { id: string; plannerId: string | null; templateId: string | null; template: { plannerId: string } | null },
  to: string
): Promise<void> {
  if (!was.plannerId) {
    await prisma.businessClient.update({ where: { id: was.id }, data: { templateId: to } });
    return;
  }
  try {
    await updateClientJournal(ownerId, was.id, { to, leaving: was.template?.plannerId ?? (await formerTemplateOf(was.plannerId)) });
  } catch (error) {
    await prisma.businessClient.update({ where: { id: was.id }, data: { templateId: was.templateId } });
    throw error;
  }
}

/** Several clients onto one template, from Templates once it has said whose
 *  next books change. Each moves as one client does (moveClientJournal); one
 *  already on it, archived, or not this coach's is passed over. Who moved, and
 *  in words who didn't and why. A printed book never changes: its PDF was
 *  stored when it was paid for. */
export async function moveClientsTo(ownerId: string, templateId: string, clientIds: string[]): Promise<{ moved: string[]; problems: string[] }> {
  const template = await prisma.businessTemplate.findFirst({ where: { id: templateId, business: { ownerId } }, select: { id: true, businessId: true } });
  if (!template) throw new Error("That template is not one of yours.");
  // filtered here, not with a NOT in the query: one on no template has a null
  // there, which a NOT in SQL leaves out too
  const clients = (
    await prisma.businessClient.findMany({
      where: { id: { in: clientIds }, businessId: template.businessId, archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, plannerId: true, templateId: true, template: { select: { plannerId: true } } },
    })
  ).filter((c) => c.templateId !== template.id);
  const moved: string[] = [];
  const problems: string[] = [];
  for (const client of clients) {
    try {
      await moveClientJournal(ownerId, client, template.id);
      moved.push(client.name);
    } catch (error) {
      problems.push(`${client.name}'s journal stayed on its template: ${error instanceof Error ? error.message : "it could not be moved"}`);
    }
  }
  return { moved, problems };
}

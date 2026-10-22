// memari. for businesses: a client's journal, built from their template
// (2026-10-22; handoff/research/B2B-findings-summary.md, "How templates
// should work").
//
// LINKED, so the coach's edits reach every client. Each of the template's
// pages is linked to a saved page (savedItems.ts) - one the coach made, or
// one made here and kept out of their Saved list (sourceKey
// "template:<journal id>") - and the client's copy of that page carries the
// same link. An edit to the template, or to any client's copy, is then copied
// to every other use by syncLinkedPages, which every editing action already
// calls. A printed book never changes: its PDF was stored when it was paid
// for (PrintFile).
//
// What a link does not carry: pages added to or taken from the template
// after a client's journal was built, and the journal's own settings (its
// fonts, its week). Those come with a rebuild, not yet built.
//
// A plain server module, like savedItems.ts: it trusts the ownerId it is
// handed. The business actions check who is asking and call in.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { savePagesAs } from "@/app/planner/savedItems";
import { BOOK_DAYS } from "@/lib/business";

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
  const template = await prisma.planner.findFirst({
    where: { id: client.template.plannerId, ownerId },
    include: { pages: { where: { savedPageId: null }, select: { id: true, level: true, position: true } } },
  });
  if (!template) throw new Error("Their template's journal is gone.");

  // Every page of the template linked, so an edit to it reaches this
  // journal. One page per link: a spread's two pages each have their own.
  for (const page of template.pages) {
    const saved = await savePagesAs(ownerId, [page.id], `${template.title}: ${LEVEL_NAMES[page.level] ?? "page"} ${page.position + 1}`);
    await prisma.savedPage.update({ where: { id: saved.id }, data: { sourceKey: templateSourceKey(template.id) } });
  }
  const pages = await prisma.page.findMany({
    where: { plannerId: template.id },
    include: { moduleInstances: true },
    orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }],
  });

  // Their dates: from their first book's start, for as long as each book runs.
  const startDate = client.startDate;
  const days = BOOK_DAYS[client.bookMonths] ?? client.bookMonths * 30;
  const endDate = startDate ? new Date(startDate.getTime() + (days - 1) * DAY) : null;

  return prisma.$transaction(
    async (tx) => {
      const planner = await tx.planner.create({
        data: {
          ownerId,
          title: client.coverName || client.name,
          dated: template.dated,
          timeZone: template.timeZone,
          theme: template.theme === null ? Prisma.DbNull : (template.theme as Prisma.InputJsonValue),
          startDate,
          endDate,
        },
      });
      for (const page of pages) {
        const copy = await tx.page.create({
          data: {
            plannerId: planner.id,
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
      await tx.businessClient.update({ where: { id: client.id }, data: { plannerId: planner.id } });
      return planner.id;
    },
    { timeout: 30_000 }
  );
}

/** How many clients' journals an edit to this template's pages reaches. */
export async function templateReach(plannerId: string): Promise<number> {
  return prisma.businessClient.count({ where: { template: { plannerId }, plannerId: { not: null }, archivedAt: null } });
}

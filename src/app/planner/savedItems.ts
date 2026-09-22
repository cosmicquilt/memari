// Saved > Pages and Saved > Modules: things somebody made once and uses again.
//
// LINKED, not copied - Andrew, 2026-09-21: "for now it can just change all of
// them". Forking one use into a journal of its own ("save as") comes later.
//
// HOW A LINK WORKS. A use of a saved page is an ORDINARY PAGE carrying
// savedPageId, with real module rows on it; a use of a saved module is an
// ordinary ModuleInstance carrying savedModuleId. So the canvas, the timeline,
// the PDF export and every server action read and write them exactly as they
// do any other page - nothing downstream knows links exist. What keeps the
// uses the same is COPYING AFTER EACH EDIT: an action that changes a linked
// page calls syncLinkedPages, which copies that page's modules into the saved
// item and into every other use of it. An edit to a linked module's settings
// goes to the saved module and every instance of it (spreadSavedModuleProps).
//
// The other design was one shared copy that every use points at, resolved on
// every read. It keeps one description of the content, but every reader of
// pages - loading, the timeline, sequence generation, export, each action's
// ownership check - would have had to learn to follow the pointer, and one
// that did not would show or edit the wrong page. Copy-on-write touches only
// the writers, and a source check (savedItems.test.mts) holds every writer
// in actions.ts to calling it.
//
// TWO USES OF ONE SAVED PAGE MAY NOT SHARE A SET (a level's default pages, or
// one occurrence's). A set is drawn on the canvas all at once, and the copy
// made after an edit to one use would replace the other's modules - rows the
// canvas beside it is still holding. Across sets, levels and journals they
// are never on screen together, and whichever is opened next loads fresh.
//
// A plain server module, like bookSeeding.ts: nothing here checks who is
// asking beyond the ownerId it is handed, so it must never be a "use server"
// file. The actions check the owner and call in; scripts/check-saved.mts
// calls in directly against a throwaway owner.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { ModulePlacementMode } from "@/generated/prisma/enums";
import type { PageLevel } from "@/lib/pageLevels";
import { moduleDefinition } from "@/lib/moduleRegistry";
import { resolveFontFamily } from "@/lib/theme";
import type { PreviewMark } from "@/lib/previewMarks";
import { pageThumbnail } from "./loadPlannerPages";

type Db = Prisma.TransactionClient | typeof prisma;

export const SAVED_NAME_MAX = 60;

/** One module of a saved page, as stored in its content: everything a
 *  ModuleInstance row holds except which page it is on. By SLUG rather than
 *  moduleTypeId, so the content means the same thing in any database. */
export type ModuleSlot = {
  slug: string;
  placementMode: "GRID" | "FREE";
  locked: boolean;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  columnStart: number | null;
  rowStart: number | null;
  columnSpan: number;
  rowSpan: number;
  zIndex: number;
  propValues: unknown;
  savedModuleId: string | null;
};

/** A saved page's content: one list of module slots per page - one for a
 *  page, two for a spread. */
export type SavedPageContent = { pages: ModuleSlot[][] };

/** A page's size - what decides which journals a saved page fits. */
export type PageSize = {
  widthPx: number;
  heightPx: number;
  gridColumns: number;
  gridRows: number;
  gridGapPx: number;
  marginPx: number;
};

const sizeOf = (page: PageSize): PageSize => ({
  widthPx: page.widthPx,
  heightPx: page.heightPx,
  gridColumns: page.gridColumns,
  gridRows: page.gridRows,
  gridGapPx: page.gridGapPx,
  marginPx: page.marginPx,
});

const PAGE_SIZE_SELECT = {
  widthPx: true,
  heightPx: true,
  gridColumns: true,
  gridRows: true,
  gridGapPx: true,
  marginPx: true,
} as const;

export function sameSize(a: PageSize, b: PageSize): boolean {
  return (
    a.widthPx === b.widthPx &&
    a.heightPx === b.heightPx &&
    a.gridColumns === b.gridColumns &&
    a.gridRows === b.gridRows &&
    a.gridGapPx === b.gridGapPx &&
    a.marginPx === b.marginPx
  );
}

/** A name somebody typed, trimmed and bounded, or the fallback for none. */
export function cleanSavedName(raw: unknown, fallback: string): string {
  const name = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, SAVED_NAME_MAX) : "";
  return name || fallback;
}

const MODULES_WITH_TYPE = { moduleInstances: { include: { moduleType: { select: { slug: true } } } } } as const;

type InstanceWithSlug = Prisma.ModuleInstanceGetPayload<{ include: { moduleType: { select: { slug: true } } } }>;

function slotOf(instance: InstanceWithSlug): ModuleSlot {
  return {
    slug: instance.moduleType.slug,
    placementMode: instance.placementMode,
    locked: instance.locked,
    x: instance.x,
    y: instance.y,
    width: instance.width,
    height: instance.height,
    columnStart: instance.columnStart,
    rowStart: instance.rowStart,
    columnSpan: instance.columnSpan,
    rowSpan: instance.rowSpan,
    zIndex: instance.zIndex,
    propValues: instance.propValues,
    savedModuleId: instance.savedModuleId,
  };
}

/** A page's modules as slots, in a stable order - so two copies compare
 *  equal when they hold the same thing, whatever order the rows came in. */
function slotsOf(instances: InstanceWithSlug[]): ModuleSlot[] {
  return instances
    .map(slotOf)
    .sort(
      (a, b) =>
        a.zIndex - b.zIndex ||
        (a.rowStart ?? 0) - (b.rowStart ?? 0) ||
        (a.columnStart ?? 0) - (b.columnStart ?? 0) ||
        a.slug.localeCompare(b.slug)
    );
}

function contentOf(json: Prisma.JsonValue): SavedPageContent {
  const pages = (json as { pages?: unknown } | null)?.pages;
  return { pages: Array.isArray(pages) ? (pages as ModuleSlot[][]) : [] };
}

/**
 * Replace a page's modules with `slots`.
 *
 * A saved module a slot names is kept only if it still exists and is the
 * same owner's - content written before a saved module was deleted still
 * names it, and the link must not outlive the thing it links to.
 */
async function writeSlots(db: Db, pageId: string, ownerId: string, slots: ModuleSlot[]): Promise<void> {
  const slugs = [...new Set(slots.map((slot) => slot.slug))];
  const types = await db.moduleType.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const typeId = new Map(types.map((type) => [type.slug, type.id]));
  const linked = [...new Set(slots.map((slot) => slot.savedModuleId).filter((id): id is string => !!id))];
  const liveSaved = new Set(
    linked.length
      ? (await db.savedModule.findMany({ where: { id: { in: linked }, ownerId }, select: { id: true } })).map((m) => m.id)
      : []
  );
  await db.moduleInstance.deleteMany({ where: { pageId } });
  const rows = slots
    .filter((slot) => typeId.has(slot.slug))
    .map((slot) => ({
      pageId,
      moduleTypeId: typeId.get(slot.slug)!,
      placementMode: slot.placementMode === "FREE" ? ModulePlacementMode.FREE : ModulePlacementMode.GRID,
      locked: slot.locked,
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      columnStart: slot.columnStart,
      rowStart: slot.rowStart,
      columnSpan: slot.columnSpan,
      rowSpan: slot.rowSpan,
      zIndex: slot.zIndex,
      propValues: (slot.propValues ?? {}) as Prisma.InputJsonValue,
      savedModuleId: slot.savedModuleId && liveSaved.has(slot.savedModuleId) ? slot.savedModuleId : null,
    }));
  if (rows.length) await db.moduleInstance.createMany({ data: rows });
}

/**
 * AFTER AN EDIT: copy each linked page's modules to its saved page and to
 * every other use of it. Pages that are not linked cost one indexed query
 * for the lot, so every action can call this unconditionally.
 *
 * Returns the ids of the OTHER pages it rewrote, so a caller can tell
 * whether anything outside the edited page changed.
 */
export async function syncLinkedPages(pageIds: Iterable<string | null | undefined>): Promise<string[]> {
  const ids = [...new Set([...pageIds].filter((id): id is string => !!id))];
  if (ids.length === 0) return [];
  const linked = await prisma.page.findMany({
    where: { id: { in: ids }, savedPageId: { not: null } },
    include: { ...MODULES_WITH_TYPE, planner: { select: { ownerId: true } }, savedPage: true },
  });
  const rewritten: string[] = [];
  for (const page of linked) {
    const saved = page.savedPage;
    const index = page.savedPageIndex ?? 0;
    // A link to another owner's saved page cannot be made through any action
    // here; refusing to follow one keeps a bad row from spreading.
    if (!saved || saved.ownerId !== page.planner.ownerId) continue;
    const slots = slotsOf(page.moduleInstances);
    await prisma.$transaction(async (tx) => {
      const content = contentOf((await tx.savedPage.findUniqueOrThrow({ where: { id: saved.id } })).content);
      content.pages[index] = slots;
      await tx.savedPage.update({
        where: { id: saved.id },
        data: { content: content as unknown as Prisma.InputJsonValue },
      });
      const others = await tx.page.findMany({
        where: {
          savedPageId: saved.id,
          savedPageIndex: page.savedPageIndex,
          id: { not: page.id },
          planner: { ownerId: saved.ownerId },
        },
        select: { id: true },
      });
      for (const other of others) {
        await writeSlots(tx, other.id, saved.ownerId, slots);
        rewritten.push(other.id);
      }
    });
  }
  return rewritten;
}

/** The pages of one card - a page, or a spread - checked to be the owner's,
 *  one set's, consecutive and the same size. */
async function cardPages(ownerId: string, pageIds: unknown) {
  if (!Array.isArray(pageIds) || pageIds.length < 1 || pageIds.length > 2 || pageIds.some((id) => typeof id !== "string")) {
    throw new Error("Choose a page or a spread.");
  }
  const pages = await prisma.page.findMany({
    where: { id: { in: pageIds as string[] }, planner: { ownerId, isTemplate: false } },
    include: MODULES_WITH_TYPE,
    orderBy: { position: "asc" },
  });
  if (pages.length !== pageIds.length) throw new Error("Page not found");
  const [first, second] = pages;
  if (
    second &&
    (second.plannerId !== first.plannerId ||
      second.level !== first.level ||
      (second.variantKey ?? null) !== (first.variantKey ?? null) ||
      second.position !== first.position + 1 ||
      !sameSize(first, second))
  ) {
    throw new Error("A spread is two pages side by side in one set.");
  }
  return pages;
}

/** The pages of one set: a level's default pages, or one occurrence's. */
function setWhere(page: { plannerId: string; level: PageLevel; variantKey: string | null }) {
  return { plannerId: page.plannerId, level: page.level, variantKey: page.variantKey };
}

/**
 * Save a page or spread, and link it: the pages it was saved from become
 * its first use, so an edit there keeps the saved item current.
 */
export async function savePagesAs(ownerId: string, pageIds: unknown, rawName: unknown) {
  const pages = await cardPages(ownerId, pageIds);
  const already = pages.find((page) => page.savedPageId);
  if (already) throw new Error("This is already a saved page. Edit it here and every use changes.");
  const name = cleanSavedName(rawName, pages.length === 2 ? "Saved spread" : "Saved page");
  return prisma.$transaction(async (tx) => {
    const saved = await tx.savedPage.create({
      data: {
        ownerId,
        name,
        pageCount: pages.length,
        ...sizeOf(pages[0]),
        content: { pages: pages.map((page) => slotsOf(page.moduleInstances)) } as unknown as Prisma.InputJsonValue,
      },
    });
    for (const [index, page] of pages.entries()) {
      await tx.page.update({ where: { id: page.id }, data: { savedPageId: saved.id, savedPageIndex: index } });
    }
    return saved;
  });
}

async function ownedSavedPage(db: Db, ownerId: string, savedPageId: unknown) {
  if (typeof savedPageId !== "string") throw new Error("Saved page not found");
  const saved = await db.savedPage.findFirst({ where: { id: savedPageId, ownerId } });
  if (!saved) throw new Error("Saved page not found");
  return saved;
}

/** Refuse a second use of one saved page in one set - see the header. */
async function refuseTwinInSet(
  db: Db,
  savedPageId: string,
  set: { plannerId: string; level: PageLevel; variantKey: string | null },
  except: string[] = []
) {
  const twin = await db.page.findFirst({
    where: { ...setWhere(set), savedPageId, id: { notIn: except } },
    select: { id: true },
  });
  if (twin) throw new Error("That saved page is already in this set. Each set can use it once.");
}

/**
 * A saved page (or spread) added to the END of one set of a journal - where
 * the timeline's "+" adds a blank page. Returns the new pages' ids.
 */
export async function addSavedPageToSet(
  ownerId: string,
  journalId: string,
  level: PageLevel,
  variantKey: string | null,
  savedPageId: unknown
): Promise<string[]> {
  const planner = await prisma.planner.findFirst({
    where: { id: journalId, ownerId, isTemplate: false },
    include: { pages: { select: { id: true, level: true, variantKey: true, position: true, ...PAGE_SIZE_SELECT } } },
  });
  if (!planner) throw new Error("Journal not found");
  const saved = await ownedSavedPage(prisma, ownerId, savedPageId);
  const model = planner.pages[0];
  if (model && !sameSize(model, saved)) {
    throw new Error("That saved page is a different page size from this journal.");
  }
  const set = { plannerId: planner.id, level, variantKey };
  await refuseTwinInSet(prisma, saved.id, set);
  const content = contentOf(saved.content);
  const start = planner.pages.filter((page) => page.level === level && (page.variantKey ?? null) === variantKey).length;
  return prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (let index = 0; index < saved.pageCount; index++) {
      const page = await tx.page.create({
        data: { ...set, position: start + index, ...sizeOf(saved), savedPageId: saved.id, savedPageIndex: index },
      });
      await writeSlots(tx, page.id, ownerId, content.pages[index] ?? []);
      ids.push(page.id);
    }
    return ids;
  });
}

/**
 * Put a saved page (or spread) in place of a card's pages: they keep their
 * place in the book and take the saved item's modules, linked. How a saved
 * weekly spread becomes a new journal's weekly spread.
 */
export async function replacePagesWithSaved(ownerId: string, pageIds: unknown, savedPageId: unknown): Promise<void> {
  const pages = await cardPages(ownerId, pageIds);
  const saved = await ownedSavedPage(prisma, ownerId, savedPageId);
  if (saved.pageCount !== pages.length) {
    throw new Error(saved.pageCount === 2 ? "A saved spread replaces a spread." : "A saved page replaces one page.");
  }
  if (!sameSize(pages[0], saved)) throw new Error("That saved page is a different page size from this journal.");
  await refuseTwinInSet(prisma, saved.id, pages[0], pages.map((page) => page.id));
  const content = contentOf(saved.content);
  await prisma.$transaction(async (tx) => {
    for (const [index, page] of pages.entries()) {
      await writeSlots(tx, page.id, ownerId, content.pages[index] ?? []);
      await tx.page.update({ where: { id: page.id }, data: { savedPageId: saved.id, savedPageIndex: index } });
    }
  });
}

export async function renameSavedPage(ownerId: string, savedPageId: unknown, rawName: unknown) {
  const saved = await ownedSavedPage(prisma, ownerId, savedPageId);
  return prisma.savedPage.update({ where: { id: saved.id }, data: { name: cleanSavedName(rawName, saved.name) } });
}

/** Delete a saved page. Every page using it KEEPS ITS MODULES and becomes
 *  its journal's own - deleting from Saved never takes a page out of a book. */
export async function deleteSavedPage(ownerId: string, savedPageId: unknown): Promise<void> {
  const saved = await ownedSavedPage(prisma, ownerId, savedPageId);
  await prisma.$transaction([
    prisma.page.updateMany({ where: { savedPageId: saved.id }, data: { savedPageId: null, savedPageIndex: null } }),
    prisma.savedPage.delete({ where: { id: saved.id } }),
  ]);
}

// ---------------------------------------------------------------- modules

async function ownedSavedModule(db: Db, ownerId: string, savedModuleId: unknown) {
  if (typeof savedModuleId !== "string") throw new Error("Saved module not found");
  const saved = await db.savedModule.findFirst({ where: { id: savedModuleId, ownerId }, include: { moduleType: true } });
  if (!saved) throw new Error("Saved module not found");
  return saved;
}

/** A saved module, for an add: its type and settings. */
export async function savedModuleForAdd(db: Db, ownerId: string, savedModuleId: unknown) {
  const saved = await ownedSavedModule(db, ownerId, savedModuleId);
  return { id: saved.id, slug: saved.moduleType.slug, propValues: saved.propValues };
}

/**
 * Save a placed module with its settings, and link it: the module it was
 * saved from becomes its first use.
 */
export async function saveModuleAs(ownerId: string, instanceId: unknown, rawName: unknown) {
  if (typeof instanceId !== "string") throw new Error("Module not found");
  const instance = await prisma.moduleInstance.findFirst({
    where: { id: instanceId, page: { planner: { ownerId, isTemplate: false } } },
    include: { moduleType: true },
  });
  if (!instance) throw new Error("Module not found");
  if (instance.locked) throw new Error("A page's fixed parts cannot be saved on their own. Save the page instead.");
  if (instance.savedModuleId) throw new Error("This is already a saved module.");
  const fallback = moduleDefinition(instance.moduleType.slug)?.label ?? instance.moduleType.name;
  const saved = await prisma.$transaction(async (tx) => {
    const saved = await tx.savedModule.create({
      data: {
        ownerId,
        name: cleanSavedName(rawName, fallback),
        moduleTypeId: instance.moduleTypeId,
        propValues: instance.propValues as Prisma.InputJsonValue,
        columnSpan: instance.columnSpan,
        rowSpan: instance.rowSpan,
      },
    });
    await tx.moduleInstance.update({ where: { id: instance.id }, data: { savedModuleId: saved.id } });
    return saved;
  });
  // The link is part of the page's content: a saved PAGE this module sits on
  // has to carry it to its other uses.
  await syncLinkedPages([instance.pageId]);
  return saved;
}

/**
 * A linked module's new settings, given to the saved module and to every use
 * of it. Returns every page that holds a use, for the caller to sync - and to
 * tell whether anything besides the edited module changed.
 */
export async function spreadSavedModuleProps(
  ownerId: string,
  savedModuleId: string,
  propValues: Prisma.InputJsonValue
): Promise<string[]> {
  const saved = await ownedSavedModule(prisma, ownerId, savedModuleId);
  const uses = await prisma.moduleInstance.findMany({
    where: { savedModuleId: saved.id, page: { planner: { ownerId } } },
    select: { id: true, pageId: true },
  });
  await prisma.$transaction([
    prisma.savedModule.update({ where: { id: saved.id }, data: { propValues } }),
    prisma.moduleInstance.updateMany({ where: { id: { in: uses.map((use) => use.id) } }, data: { propValues } }),
  ]);
  return [...new Set(uses.map((use) => use.pageId))];
}

export async function renameSavedModule(ownerId: string, savedModuleId: unknown, rawName: unknown) {
  const saved = await ownedSavedModule(prisma, ownerId, savedModuleId);
  return prisma.savedModule.update({ where: { id: saved.id }, data: { name: cleanSavedName(rawName, saved.name) } });
}

/** Delete a saved module. Its uses KEEP THEIR SETTINGS and stop being linked
 *  (the foreign key sets them null). Saved pages that name it are left as
 *  they are: a link that no longer exists is dropped when one is used. */
export async function deleteSavedModule(ownerId: string, savedModuleId: unknown): Promise<void> {
  const saved = await ownedSavedModule(prisma, ownerId, savedModuleId);
  const pages = await prisma.moduleInstance.findMany({
    where: { savedModuleId: saved.id },
    select: { pageId: true },
  });
  await prisma.savedModule.delete({ where: { id: saved.id } });
  // The unlinked modules sit on pages that may themselves be linked.
  await syncLinkedPages(pages.map((page) => page.pageId));
}

// ------------------------------------------------------------------ lists

export type SavedPageCard = {
  id: string;
  name: string;
  pageCount: number;
  size: PageSize;
  /** One drawing per page. */
  previews: PreviewMark[][];
  /** How many journals use it. */
  usedIn: number;
};

export type SavedModuleCard = {
  id: string;
  name: string;
  slug: string;
  /** What kind of module it is: "Habit tracker". */
  kind: string;
  propValues: Record<string, unknown>;
  columnSpan: number;
  rowSpan: number;
  /** Its drawing at the size it was saved at, for Saved > Modules. */
  preview: { marks: PreviewMark[]; widthPx: number; heightPx: number };
  usedIn: number;
};

/** A cell of the lattice, in print px - see the Page model. */
const CELL_PX = 75;

/**
 * A module drawn on its own, at the size it was saved at: on a "page" exactly
 * its size with no margin, so the drawing's coordinates are the module's own.
 * Cells are the real 75px, so it draws as it does on a page.
 */
function modulePreview(slug: string, propValues: unknown, columnSpan: number, rowSpan: number, fontFamily: string) {
  const size = { widthPx: columnSpan * CELL_PX, heightPx: rowSpan * CELL_PX };
  const marks = pageThumbnail(
    {
      ...size,
      gridColumns: columnSpan,
      gridRows: rowSpan,
      gridGapPx: 12,
      marginPx: 0,
      moduleInstances: [
        { id: "saved-module", locked: false, columnStart: 0, rowStart: 0, columnSpan, rowSpan, propValues, moduleType: { slug } },
      ],
    },
    fontFamily,
    // A saved module is not on a page, so there is no occurrence to date it
    // as. `dated: false` keeps a saved module's own dates out of its card,
    // which is what it drew before.
    { dated: false, occurrence: null, dayLabels: null }
  );
  return { marks, ...size };
}

/** Draw a saved page's content the way the timeline draws a page - the same
 *  function, so a saved page looks like the page it came from. */
function previewsOf(saved: { content: Prisma.JsonValue } & PageSize, fontFamily: string): PreviewMark[][] {
  return contentOf(saved.content).pages.map((slots, pageIndex) =>
    pageThumbnail(
      {
        ...sizeOf(saved),
        moduleInstances: slots.map((slot, index) => ({
          id: `saved-${pageIndex}-${index}`,
          locked: slot.locked,
          columnStart: slot.columnStart,
          rowStart: slot.rowStart,
          columnSpan: slot.columnSpan,
          rowSpan: slot.rowSpan,
          propValues: slot.propValues,
          moduleType: { slug: slot.slug },
        })),
      },
      fontFamily,
      // Undated: a saved page belongs to no term, so it is shown as the
      // template it is rather than filled in for some week.
      { dated: false, occurrence: null, dayLabels: null }
    )
  );
}

/** Every saved page of `ownerId`, newest first. `fontFamily` is the font to
 *  draw them in - the open journal's, or the serif outside one. */
export async function savedPagesOf(ownerId: string, fontFamily = resolveFontFamily("serif")): Promise<SavedPageCard[]> {
  const saved = await prisma.savedPage.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    include: { pages: { select: { plannerId: true } } },
  });
  return saved.map((item) => ({
    id: item.id,
    name: item.name,
    pageCount: item.pageCount,
    size: sizeOf(item),
    previews: previewsOf(item, fontFamily),
    usedIn: new Set(item.pages.map((page) => page.plannerId)).size,
  }));
}

export async function savedModulesOf(ownerId: string, fontFamily = resolveFontFamily("serif")): Promise<SavedModuleCard[]> {
  const saved = await prisma.savedModule.findMany({
    where: { ownerId },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    include: {
      moduleType: { select: { slug: true, name: true } },
      instances: { select: { page: { select: { plannerId: true } } } },
    },
  });
  return saved.map((item) => ({
    id: item.id,
    name: item.name,
    slug: item.moduleType.slug,
    kind: moduleDefinition(item.moduleType.slug)?.label ?? item.moduleType.name,
    propValues: (item.propValues ?? {}) as Record<string, unknown>,
    columnSpan: item.columnSpan,
    rowSpan: item.rowSpan,
    preview: modulePreview(item.moduleType.slug, item.propValues, item.columnSpan, item.rowSpan, fontFamily),
    usedIn: new Set(item.instances.map((instance) => instance.page.plannerId)).size,
  }));
}

/** Everything a guest saved, moved to the account they signed in to. */
export async function moveSavedItems(db: Db, fromOwner: string, toOwner: string) {
  const [pages, modules] = await Promise.all([
    db.savedPage.updateMany({ where: { ownerId: fromOwner }, data: { ownerId: toOwner } }),
    db.savedModule.updateMany({ where: { ownerId: fromOwner }, data: { ownerId: toOwner } }),
  ]);
  return pages.count + modules.count;
}

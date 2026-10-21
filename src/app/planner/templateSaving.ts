// SAVING WHAT WE MADE (2026-10-21): "a more comprehensive saving feature
// that appears with every module, page, and journal within both the side
// panel preview and mag pop up ... save any of the modules that look
// useful ... also added to previews on the landing, layout, and module
// explainer pages".
//
// Saved items were made only from inside a journal (savedItems.ts): a page
// or a module of yours, linked to its uses. This makes them from OUR things
// - a prebuilt planner, a layout, a module on a layout, a module from the
// list - so they land in the same Saved > Journals, Pages and Modules and
// are used from the editor the same way:
//
//   - a PLANNER is a bookmark (SavedPlanner): Saved > Journals lists it with
//     Use this planner. It is ours; using it is what makes a journal.
//   - a LAYOUT becomes a SavedPage of its spread (one page for a day, whose
//     spread is one day shown twice), laid out exactly as Use this would lay
//     a journal's level out: the level's own spine at the layout's settings
//     and height, and the layout's modules.
//   - a MODULE becomes a SavedModule with its settings, from the module list
//     (its preview's settings) or from a layout (that slot's).
//
// Each carries a source key ("planner:stoic-practice", "layout:student",
// "module:water-week", "layout:student#4"), so a Save button knows it is
// saved and a second press removes it rather than making a copy.
//
// Plain server code, like savedItems.ts: it trusts the ownerId it is given.
// The route (app/saved/template) decides who is asking.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { PageLevel } from "@/generated/prisma/enums";
import { gridCellToPixels } from "@/lib/grid";
import { moduleDefinition, moduleSchemaDefaults } from "@/lib/moduleRegistry";
import { PALETTE_INFO_BY_SLUG } from "@/lib/paletteGroups";
import { PLANNER_TRIMS } from "@/lib/planner-trims";
import { LANDING_PAGE_GRID, spreadPlacements } from "@/app/landing/spreads";
import { resolveLayout } from "@/app/landing/similarLayouts";
import { PLANNER_BY_KEY } from "@/app/landing/plannerTemplates";
import type { HeroSpread } from "@/app/landing/heroSpreads";
import type { StarterKind } from "@/app/landing/starterLayouts";
import { LEVEL_LAYOUT } from "./bookSeeding";
import { spineSettings } from "./archetypeWeek";
import { sourceKeyOf, type SavedWhere, type TemplateSave } from "@/lib/templateSave";
import { cleanSavedName, deleteSavedModule, deleteSavedPage, type ModuleSlot, type SavedPageContent } from "./savedItems";

type Db = Prisma.TransactionClient | typeof prisma;

export type { TemplateSave, SavedWhere } from "@/lib/templateSave";
export { sourceKeyOf, parseTemplateSave } from "@/lib/templateSave";

// ------------------------------------------------------------ a layout's modules

/** One module on a layout that can be saved on its own: where it is drawn
 *  (page, box in the page's print px) and what it is. A spread's spine (the
 *  hours, the calendar, the title) is not one: it goes with the page. */
export type LayoutModule = {
  /** Its place among the layout's placements - what a save names. A day's
   *  right page repeats its left, so its modules name the left's. */
  slot: number;
  page: 0 | 1;
  box: [number, number, number, number];
  name: string;
  slug: string;
};

function nameOf(slug: string, props: Record<string, unknown>): string {
  const heading = typeof props.heading === "string" ? props.heading.trim() : "";
  return heading || PALETTE_INFO_BY_SLUG.get(slug)?.name || moduleDefinition(slug)?.label || slug;
}

export function layoutModules(def: HeroSpread): LayoutModule[] {
  const placed = spreadPlacements(def);
  const twinOf = (i: number) => {
    const p = placed[i];
    if (def.layout.kind !== "day" || p.page === 0) return i;
    const twin = placed.findIndex((q) => q.page === 0 && !q.locked && q.slug === p.slug && q.columnStart === p.columnStart && q.rowStart === p.rowStart);
    return twin >= 0 ? twin : i;
  };
  return placed.flatMap((p, i) => {
    if (p.locked) return [];
    const r = gridCellToPixels(LANDING_PAGE_GRID, p);
    return [{ slot: twinOf(i), page: p.page, box: [r.x, r.y, r.width, r.height] as [number, number, number, number], name: nameOf(p.slug, p.props), slug: p.slug }];
  });
}

// ------------------------------------------------------------ saving

const LEVEL_OF: Record<StarterKind, PageLevel> = {
  week: PageLevel.WEEKLY,
  month: PageLevel.MONTHLY,
  day: PageLevel.DAILY,
  pages: PageLevel.FRONT_MATTER,
};

/** A new journal's page at the layouts' trim (archetypeWeek.ts makes every
 *  journal from a layout at 7x10). What decides which journals it fits. */
const TRIM = PLANNER_TRIMS.bound7x10;
const PAGE_SIZE = { widthPx: TRIM.widthPx, heightPx: TRIM.heightPx, gridColumns: 24, gridRows: TRIM.gridRows, gridGapPx: 12, marginPx: TRIM.marginPx };

/** A layout as a saved page's content: what Use this would leave on the
 *  level's pages (archetypeWeek.ts's layOutLevel) - the level's own spine,
 *  at the layout's settings and height, and the layout's modules. */
async function layoutContent(db: Db, def: HeroSpread, kind: StarterKind): Promise<SavedPageContent> {
  const pageCount = kind === "day" ? 1 : 2;
  const placed = spreadPlacements(def).filter((p) => p.page < pageCount);
  const level = LEVEL_LAYOUT[LEVEL_OF[kind]]?.(PAGE_SIZE.gridRows);
  const locked = (level?.groups ?? []).flatMap((group) => group.placements).filter((p) => p.locked && p.page < pageCount);
  // A level placement with no span takes its module type's.
  const types = await db.moduleType.findMany({
    where: { slug: { in: [...new Set(locked.map((p) => p.slug))] } },
    select: { slug: true, defaultColumnSpan: true, defaultRowSpan: true },
  });
  const typeOf = new Map(types.map((t) => [t.slug, t]));
  const slot = (s: Omit<ModuleSlot, "placementMode" | "x" | "y" | "width" | "height" | "zIndex" | "savedModuleId">): ModuleSlot => ({
    ...s,
    placementMode: "GRID",
    x: null,
    y: null,
    width: null,
    height: null,
    zIndex: 0,
    savedModuleId: null,
  });
  const pages: ModuleSlot[][] = Array.from({ length: pageCount }, () => []);
  for (const p of locked) {
    const spine = placed.find((q) => q.locked && q.slug === p.slug && q.page === p.page);
    const own = typeOf.get(p.slug);
    pages[p.page].push(
      slot({
        slug: p.slug,
        locked: true,
        columnStart: p.columnStart,
        rowStart: p.rowStart,
        columnSpan: p.columnSpan ?? own?.defaultColumnSpan ?? 1,
        rowSpan: spine?.slug.endsWith("-core") ? spine.rowSpan : (p.rowSpan ?? own?.defaultRowSpan ?? 1),
        propValues: { ...p.propValues, ...(spine && spine.slug.endsWith("-core") ? spineSettings(spine) : {}) },
      })
    );
  }
  for (const p of placed.filter((q) => !q.locked)) {
    pages[p.page].push(slot({ slug: p.slug, locked: false, columnStart: p.columnStart, rowStart: p.rowStart, columnSpan: p.columnSpan, rowSpan: p.rowSpan, propValues: p.props }));
  }
  return { pages };
}

async function moduleTypeId(db: Db, slug: string): Promise<string> {
  const type = await db.moduleType.findUnique({ where: { slug }, select: { id: true } });
  // A module registered since production's module types were last seeded.
  if (!type) throw new Error(`This module is not ready to save yet (${slug}).`);
  return type.id;
}

/** Save it for `ownerId`, or find it saved already. */
export async function saveTemplateItem(ownerId: string, save: TemplateSave): Promise<{ where: SavedWhere; name: string }> {
  const sourceKey = sourceKeyOf(save);
  if (save.kind === "planner") {
    const planner = PLANNER_BY_KEY[save.key];
    if (!planner) throw new Error("There is no such planner.");
    await prisma.savedPlanner.upsert({
      where: { ownerId_templateKey: { ownerId, templateKey: planner.key } },
      create: { ownerId, templateKey: planner.key },
      update: {},
    });
    return { where: "journals", name: planner.title };
  }
  if (save.kind === "layout") {
    const entry = resolveLayout(save.key);
    if (!entry) throw new Error("There is no such layout.");
    const have = await prisma.savedPage.findFirst({ where: { ownerId, sourceKey }, select: { name: true } });
    if (have) return { where: "pages", name: have.name };
    const content = await layoutContent(prisma, entry.def, entry.kind);
    const saved = await prisma.savedPage.create({
      data: {
        ownerId,
        name: cleanSavedName(entry.changes.length ? `${entry.title}, varied` : entry.title, "Saved spread"),
        pageCount: content.pages.length,
        ...PAGE_SIZE,
        content: content as unknown as Prisma.InputJsonValue,
        sourceKey,
      },
    });
    return { where: "pages", name: saved.name };
  }
  const have = await prisma.savedModule.findFirst({ where: { ownerId, sourceKey }, select: { name: true } });
  if (have) return { where: "modules", name: have.name };
  let slug: string;
  let props: Record<string, unknown>;
  let span: { columnSpan: number; rowSpan: number };
  if (save.kind === "module") {
    const info = PALETTE_INFO_BY_SLUG.get(save.slug);
    if (!info) throw new Error("There is no such module.");
    slug = info.slug;
    props = { ...moduleSchemaDefaults(slug), ...info.previewProps };
    const def = await prisma.moduleType.findUnique({ where: { slug }, select: { defaultColumnSpan: true, defaultRowSpan: true } });
    span = { columnSpan: def?.defaultColumnSpan ?? 6, rowSpan: def?.defaultRowSpan ?? 6 };
  } else {
    const entry = resolveLayout(save.key);
    const p = entry ? spreadPlacements(entry.def)[save.slot] : undefined;
    if (!p || p.locked) throw new Error("There is no such module on that layout.");
    slug = p.slug;
    props = p.props;
    span = { columnSpan: p.columnSpan, rowSpan: p.rowSpan };
  }
  const saved = await prisma.savedModule.create({
    data: {
      ownerId,
      name: cleanSavedName(nameOf(slug, props), "Saved module"),
      moduleTypeId: await moduleTypeId(prisma, slug),
      propValues: props as Prisma.InputJsonValue,
      ...span,
      sourceKey,
    },
  });
  return { where: "modules", name: saved.name };
}

/** Un-save it: the bookmark gone, or the saved page or module deleted -
 *  which, as from Saved, unlinks any use and never removes a page. */
export async function unsaveTemplateItem(ownerId: string, save: TemplateSave): Promise<void> {
  const sourceKey = sourceKeyOf(save);
  if (save.kind === "planner") {
    await prisma.savedPlanner.deleteMany({ where: { ownerId, templateKey: save.key } });
    return;
  }
  if (save.kind === "layout") {
    for (const page of await prisma.savedPage.findMany({ where: { ownerId, sourceKey }, select: { id: true } })) await deleteSavedPage(ownerId, page.id);
    return;
  }
  for (const saved of await prisma.savedModule.findMany({ where: { ownerId, sourceKey }, select: { id: true } })) await deleteSavedModule(ownerId, saved.id);
}

/** Every source key `ownerId` has saved - what lights the Save buttons. */
export async function templateSavedKeys(ownerId: string): Promise<string[]> {
  const [planners, pages, modules] = await Promise.all([
    prisma.savedPlanner.findMany({ where: { ownerId }, select: { templateKey: true } }),
    prisma.savedPage.findMany({ where: { ownerId, sourceKey: { not: null } }, select: { sourceKey: true } }),
    prisma.savedModule.findMany({ where: { ownerId, sourceKey: { not: null } }, select: { sourceKey: true } }),
  ]);
  return [...planners.map((p) => `planner:${p.templateKey}`), ...pages.map((p) => p.sourceKey!), ...modules.map((m) => m.sourceKey!)];
}

/** Saved > Journals' saved planners, newest first. */
export async function savedPlannerKeys(ownerId: string): Promise<string[]> {
  const rows = await prisma.savedPlanner.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, select: { templateKey: true } });
  return rows.map((r) => r.templateKey).filter((key) => PLANNER_BY_KEY[key]);
}

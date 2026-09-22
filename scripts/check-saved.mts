// Saved pages and saved modules, LINKED: exercised on throwaway journals and
// deleted again.
//
// The actions need a signed-in session, so this drives savedItems.ts - what
// they call after checking who is asking - and then does what each editing
// action does after a write: syncLinkedPages. That every editing action DOES
// call it is savedItems.test.mts's job, not this one's.
//
// What it pins:
//   - saving a page links it, and its saved content is exactly its modules;
//   - a use added to another journal starts as that content;
//   - an edit to any use reaches every other use AND the saved item, and
//     nothing else - another set, another owner's page;
//   - a set may hold one use of a saved page; a different page size is
//     refused; a spread replaces a spread, not a page;
//   - a saved module's settings reach every use, including one that arrived
//     inside a saved page; a fixed (locked) part cannot be saved alone;
//   - deleting a saved item leaves every page and module that used it as
//     they were, unlinked; deleting the journal it came from leaves it.
//
//   npm run check:saved
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../src/lib/prisma.js");
const { createBookFor, validateNewJournal } = await import("../src/app/planner/bookSeeding.js");
const saved = await import("../src/app/planner/savedItems.js");

const OWNER = "saved-check-throwaway";
const STRANGER = "saved-check-stranger";
let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${message}`);
  if (!ok) failures++;
};
const refuses = async (run: () => Promise<unknown>, message: string) => {
  try {
    await run();
    check(false, `${message} - it was allowed`);
  } catch (error) {
    check(true, `${message} ("${(error as Error).message}")`);
  }
};

async function cleanUp() {
  for (const owner of [OWNER, STRANGER]) {
    await prisma.planner.deleteMany({ where: { ownerId: owner } });
    await prisma.savedPage.deleteMany({ where: { ownerId: owner } });
    await prisma.savedModule.deleteMany({ where: { ownerId: owner } });
  }
}
await cleanUp();

const journal = (title: string, trim: "bound7x10" | "letter", owner = OWNER) =>
  createBookFor(
    owner,
    validateNewJournal({ title, trim, startISO: "2026-01-01", endISO: "2026-01-31", levels: ["WEEKLY", "BACK_MATTER"] })
  );

/** A page's modules as comparable text: what, where and with what settings -
 *  not ids, which differ between copies by design. */
async function contentOf(pageId: string) {
  const rows = await prisma.moduleInstance.findMany({ where: { pageId }, include: { moduleType: true } });
  return rows
    .map((mi) =>
      JSON.stringify([mi.moduleType.slug, mi.locked, mi.columnStart, mi.rowStart, mi.columnSpan, mi.rowSpan, mi.propValues, mi.savedModuleId])
    )
    .sort()
    .join("\n");
}
const savedContentOf = async (id: string, index: number) => {
  const row = await prisma.savedPage.findUniqueOrThrow({ where: { id } });
  const slots = (row.content as { pages: Array<Array<Record<string, unknown>>> }).pages[index] ?? [];
  return slots
    .map((s) => JSON.stringify([s.slug, s.locked, s.columnStart, s.rowStart, s.columnSpan, s.rowSpan, s.propValues, s.savedModuleId]))
    .sort()
    .join("\n");
};
const pagesOf = (plannerId: string, level: "WEEKLY" | "BACK_MATTER") =>
  prisma.page.findMany({ where: { plannerId, level, variantKey: null }, orderBy: { position: "asc" } });

try {
  const a = await journal("Saved check A", "bound7x10");
  const b = await journal("Saved check B", "bound7x10");
  const letter = await journal("Saved check Letter", "letter");
  const strangers = await journal("Saved check stranger", "bound7x10", STRANGER);

  // --- Save a page -------------------------------------------------------
  const [aBack] = await pagesOf(a.id, "BACK_MATTER");
  const backPage = await saved.savePagesAs(OWNER, [aBack.id], "  Notes   page ");
  check(backPage.name === "Notes page", `the name is tidied (got "${backPage.name}")`);
  check(backPage.pageCount === 1, "one page");
  const aBackAfter = await prisma.page.findUniqueOrThrow({ where: { id: aBack.id } });
  check(aBackAfter.savedPageId === backPage.id && aBackAfter.savedPageIndex === 0, "the page it was saved from is now linked to it");
  check((await savedContentOf(backPage.id, 0)) === (await contentOf(aBack.id)), "its saved content is exactly that page's modules");
  await refuses(() => saved.savePagesAs(OWNER, [aBack.id], "again"), "saving a linked page a second time is refused");
  await refuses(() => saved.savePagesAs(STRANGER, [aBack.id], "mine now"), "another owner cannot save my page");

  // --- Use it elsewhere --------------------------------------------------
  const added = await saved.addSavedPageToSet(OWNER, b.id, "BACK_MATTER", null, backPage.id);
  check(added.length === 1, "adding a saved page adds one page");
  const bBack = await pagesOf(b.id, "BACK_MATTER");
  check(bBack.length === 2 && bBack[1].id === added[0], "at the END of the set");
  check((await contentOf(added[0])) === (await contentOf(aBack.id)), "starting as the saved content");
  await refuses(
    () => saved.addSavedPageToSet(OWNER, b.id, "BACK_MATTER", null, backPage.id),
    "a second use in the same set is refused"
  );
  await refuses(
    () => saved.addSavedPageToSet(OWNER, letter.id, "BACK_MATTER", null, backPage.id),
    "a Letter journal cannot use a 7x10 saved page"
  );
  await refuses(
    () => saved.addSavedPageToSet(STRANGER, strangers.id, "BACK_MATTER", null, backPage.id),
    "another owner cannot use my saved page"
  );

  // --- An edit reaches every use ------------------------------------------
  const box = await prisma.moduleInstance.findFirstOrThrow({ where: { pageId: added[0], locked: false } });
  await prisma.moduleInstance.update({
    where: { id: box.id },
    data: { rowSpan: box.rowSpan - 4, propValues: { ...(box.propValues as object), heading: "Edited in B" } },
  });
  // A stranger's page pointing at my saved page - no action can make one,
  // so it is forged here, to prove a sync would not write into it anyway.
  const [strangerBack] = await pagesOf(strangers.id, "BACK_MATTER");
  const strangerBefore = await contentOf(strangerBack.id);
  await prisma.page.update({ where: { id: strangerBack.id }, data: { savedPageId: backPage.id, savedPageIndex: 0 } });
  const rewritten = await saved.syncLinkedPages([added[0]]);
  check((await contentOf(aBack.id)) === (await contentOf(added[0])), "an edit to B's use reaches A's");
  check((await savedContentOf(backPage.id, 0)) === (await contentOf(added[0])), "and the saved item");
  check(rewritten.length === 1 && rewritten[0] === aBack.id, `and nothing else (rewrote ${rewritten.length} page)`);
  check((await contentOf(strangerBack.id)) === strangerBefore, "a stranger's page linked to it is not written");
  await prisma.page.update({ where: { id: strangerBack.id }, data: { savedPageId: null, savedPageIndex: null } });
  check((await saved.syncLinkedPages([bBack[0].id])).length === 0, "syncing a page of the journal's own does nothing");

  // --- A spread -----------------------------------------------------------
  const aWeek = await pagesOf(a.id, "WEEKLY");
  const bWeek = await pagesOf(b.id, "WEEKLY");
  await refuses(() => saved.savePagesAs(OWNER, [aWeek[0].id, bWeek[1].id], "mixed"), "a spread of two journals' pages is refused");
  const week = await saved.savePagesAs(OWNER, [aWeek[0].id, aWeek[1].id], "");
  check(week.pageCount === 2 && week.name === "Saved spread", `a spread, named by default ("${week.name}")`);
  await refuses(() => saved.replacePagesWithSaved(OWNER, [bBack[0].id], week.id), "a spread cannot replace one page");
  await saved.replacePagesWithSaved(OWNER, [bWeek[0].id, bWeek[1].id], week.id);
  check(
    (await contentOf(bWeek[0].id)) === (await contentOf(aWeek[0].id)) &&
      (await contentOf(bWeek[1].id)) === (await contentOf(aWeek[1].id)),
    "replacing B's weekly spread gives it A's, left to left and right to right"
  );
  const bWeekAfter = await pagesOf(b.id, "WEEKLY");
  check(
    bWeekAfter.every((p, i) => p.savedPageId === week.id && p.savedPageIndex === i),
    "and links both pages, in order"
  );

  // --- A saved module -----------------------------------------------------
  const spine = await prisma.moduleInstance.findFirstOrThrow({ where: { pageId: aWeek[0].id, locked: true } });
  await refuses(() => saved.saveModuleAs(OWNER, spine.id, "hours"), "a fixed part of a page cannot be saved on its own");
  const sidebarBox = await prisma.moduleInstance.findFirstOrThrow({
    where: { pageId: aWeek[0].id, locked: false },
    include: { moduleType: true },
    orderBy: { rowStart: "asc" },
  });
  const tracker = await saved.saveModuleAs(OWNER, sidebarBox.id, "");
  check(tracker.name.length > 0, `named after its kind by default ("${tracker.name}")`);
  const bCopy = await prisma.moduleInstance.findMany({ where: { pageId: bWeek[0].id, savedModuleId: tracker.id } });
  check(bCopy.length === 1, "the link reaches B's weekly spread with the rest of the page");
  // And a use placed on its own, in the letter journal.
  const [letterBack] = await pagesOf(letter.id, "BACK_MATTER");
  const loose = await prisma.moduleInstance.create({
    data: {
      pageId: letterBack.id,
      moduleTypeId: sidebarBox.moduleTypeId,
      columnStart: 0,
      rowStart: 0,
      columnSpan: 6,
      rowSpan: 4,
      propValues: (await saved.savedModuleForAdd(prisma, OWNER, tracker.id)).propValues as object,
      savedModuleId: tracker.id,
    },
  });
  const heading = { ...(sidebarBox.propValues as object), heading: "One heading everywhere" };
  const touched = await saved.spreadSavedModuleProps(OWNER, tracker.id, heading);
  await saved.syncLinkedPages(touched);
  const uses = await prisma.moduleInstance.findMany({ where: { savedModuleId: tracker.id } });
  check(uses.length === 3, `three uses: A, B's copy of the spread, the Letter page (got ${uses.length})`);
  check(
    uses.every((mi) => (mi.propValues as { heading?: string }).heading === "One heading everywhere"),
    "a change of settings reaches every use"
  );
  check(
    (await savedContentOf(week.id, 0)).includes("One heading everywhere"),
    "and the saved spread it sits in"
  );
  await refuses(() => saved.spreadSavedModuleProps(STRANGER, tracker.id, {}), "a stranger cannot change my saved module");
  await refuses(() => saved.savedModuleForAdd(prisma, STRANGER, tracker.id), "or place it");

  // --- Deleting -----------------------------------------------------------
  const lists = await saved.savedPagesOf(OWNER);
  check(lists.length === 2 && lists.every((card) => card.previews.length === card.pageCount), "Saved > Pages lists both, drawn");
  check(lists.find((card) => card.id === backPage.id)?.usedIn === 2, "the notes page is used in two journals");
  const modules = await saved.savedModulesOf(OWNER);
  check(modules.length === 1 && modules[0].usedIn === 3, `Saved > Modules: one, used in three journals (got ${modules[0]?.usedIn})`);

  await saved.deleteSavedModule(OWNER, tracker.id);
  const afterModule = await prisma.moduleInstance.findMany({ where: { id: { in: uses.map((u) => u.id) } } });
  check(
    afterModule.length === 1 && afterModule[0].id === loose.id && !afterModule[0].savedModuleId,
    "deleting a saved module keeps the use placed on its own, unlinked"
  );
  const aWeekModules = await contentOf(aWeek[0].id);
  check(
    !aWeekModules.includes(tracker.id) && aWeekModules.includes("One heading everywhere"),
    "and the uses in the saved spread keep their settings, unlinked"
  );
  check(
    (await contentOf(bWeek[0].id)) === aWeekModules,
    "with B's copy of the spread brought along"
  );
  check(!(await savedContentOf(week.id, 0)).includes(tracker.id), "and the saved spread no longer names it");

  const aBackContent = await contentOf(aBack.id);
  await prisma.planner.delete({ where: { id: a.id } });
  check((await savedContentOf(backPage.id, 0)) === aBackContent, "deleting the journal a page was saved from leaves the saved page");
  const again = await saved.addSavedPageToSet(OWNER, letter.id, "WEEKLY", null, week.id).catch((e: Error) => e);
  check(again instanceof Error, "(and a Letter journal still cannot use the spread)");
  await saved.deleteSavedPage(OWNER, backPage.id);
  const bBackAfter = await prisma.page.findUniqueOrThrow({ where: { id: added[0] } });
  check(!bBackAfter.savedPageId && bBackAfter.savedPageIndex === null, "deleting a saved page unlinks its uses");
  check((await contentOf(added[0])) === aBackContent, "which keep everything on them");
} finally {
  await cleanUp();
  console.log("  throwaway journals deleted");
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`\n${failures} saved-item check(s) failed.`);
  process.exit(1);
}
console.log("\nSaved pages and modules link, spread every edit to every use and nowhere else, and let go cleanly.");

// Saving our things (templateSaving.ts, app/saved/template): a planner, a
// layout, a module from the list and a module off a layout, saved for a
// throwaway owner and removed again.
//
// What it pins:
//   - each kind lands where it should - a bookmark, a saved spread or page,
//     a saved module - with its source key, and a second save makes no
//     second copy;
//   - a layout saved is exactly what Use this lays out: the journal's own
//     weekly pages, made from the same layout, hold the same modules and the
//     same spine at the same height and settings; a day saves one page;
//   - the saved spread can be added to a journal (the size fits) and its
//     pages come out with those modules;
//   - a module off a layout keeps that slot's settings; a spine cannot be
//     saved on its own; nonsense is refused;
//   - un-saving removes it, and only it;
//   - the route: GET says nothing for nobody, POST makes a guest and saves,
//     GET then lights the key, DELETE removes it, another site's POST is
//     refused. Needs the dev server (BASE, default http://localhost:3000).
//
//   npm run check:template-saving
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"\r\n]*)"?\s*$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../src/lib/prisma.js");
const ts = await import("../src/app/planner/templateSaving.js");
const { createJournalFromSpread } = await import("../src/app/planner/archetypeWeek.js");
const { addSavedPageToSet } = await import("../src/app/planner/savedItems.js");
const { resolveLayout } = await import("../src/app/landing/similarLayouts.js");
const { spreadPlacements } = await import("../src/app/landing/spreads.js");

const OWNER = "template-save-check-throwaway";
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
async function cleanUp(owners: string[]) {
  for (const owner of owners) {
    await prisma.planner.deleteMany({ where: { ownerId: owner } });
    await prisma.savedPage.deleteMany({ where: { ownerId: owner } });
    await prisma.savedModule.deleteMany({ where: { ownerId: owner } });
    await prisma.savedPlanner.deleteMany({ where: { ownerId: owner } });
  }
}
await cleanUp([OWNER]);
const routeGuests: string[] = [];

try {
  console.log("A planner");
  await ts.saveTemplateItem(OWNER, { kind: "planner", key: "stoic-practice" });
  await ts.saveTemplateItem(OWNER, { kind: "planner", key: "stoic-practice" });
  check((await prisma.savedPlanner.count({ where: { ownerId: OWNER } })) === 1, "saved once, however often it is pressed");
  check((await ts.savedPlannerKeys(OWNER)).join() === "stoic-practice", "Saved > Journals lists it");
  await refuses(() => ts.saveTemplateItem(OWNER, { kind: "planner", key: "no-such-planner" }), "a planner that does not exist is refused");

  console.log("A layout");
  const week = await ts.saveTemplateItem(OWNER, { kind: "layout", key: "week-stoic-practice" });
  await ts.saveTemplateItem(OWNER, { kind: "layout", key: "week-stoic-practice" });
  const savedWeek = await prisma.savedPage.findMany({ where: { ownerId: OWNER, sourceKey: "layout:week-stoic-practice" } });
  check(week.where === "pages" && savedWeek.length === 1 && savedWeek[0].pageCount === 2, `a week is one saved spread (${savedWeek.length}, ${savedWeek[0]?.pageCount} pages), "${week.name}"`);
  // What Use this lays out, from the same layout, to compare with.
  const entry = resolveLayout("week-stoic-practice")!;
  const book = await createJournalFromSpread(OWNER, entry.def, "Comparison", null);
  const used = await prisma.page.findMany({
    where: { plannerId: book.id, level: "WEEKLY", variantKey: null },
    orderBy: { position: "asc" },
    include: { moduleInstances: { include: { moduleType: { select: { slug: true } } } } },
  });
  const sig = (m: { slug: string; locked: boolean; columnStart: number | null; rowStart: number | null; columnSpan: number; rowSpan: number }) =>
    `${m.slug}@${m.columnStart},${m.rowStart} ${m.columnSpan}x${m.rowSpan}${m.locked ? " locked" : ""}`;
  const content = savedWeek[0].content as { pages: Array<Array<{ slug: string; locked: boolean; columnStart: number | null; rowStart: number | null; columnSpan: number; rowSpan: number; propValues: Record<string, unknown> }>> };
  for (const page of [0, 1] as const) {
    const fromUse = used[page].moduleInstances.map((m) => sig({ ...m, slug: m.moduleType.slug })).sort();
    const fromSave = content.pages[page].map(sig).sort();
    check(fromUse.join("|") === fromSave.join("|"), `page ${page}: the saved spread holds what Use this lays out (${fromSave.length} modules)`);
    const hours = (list: typeof content.pages[number]) => list.find((m) => m.slug === "hourly-grid-core");
    const useHours = used[page].moduleInstances.find((m) => m.moduleType.slug === "hourly-grid-core");
    const settings = (p: Record<string, unknown> | undefined) => JSON.stringify({ s: p?.startTime, e: p?.endTime, i: p?.intervalMinutes });
    check(settings(hours(content.pages[page])?.propValues) === settings(useHours?.propValues as Record<string, unknown>), `page ${page}: its hours are set as Use this sets them ${settings(hours(content.pages[page])?.propValues)}`);
  }
  // A week whose hours are its own: 7 PM to 7 AM on 14 rows.
  await ts.saveTemplateItem(OWNER, { kind: "layout", key: "week-night-nurse" });
  const nurse = await prisma.savedPage.findFirst({ where: { ownerId: OWNER, sourceKey: "layout:week-night-nurse" } });
  const nurseBook = await createJournalFromSpread(OWNER, resolveLayout("week-night-nurse")!.def, "Nurse comparison", null);
  const nurseUse = await prisma.page.findMany({
    where: { plannerId: nurseBook.id, level: "WEEKLY", variantKey: null },
    orderBy: { position: "asc" },
    include: { moduleInstances: { include: { moduleType: { select: { slug: true } } } } },
  });
  const nurseContent = nurse!.content as typeof content;
  for (const page of [0, 1] as const) {
    const a = nurseContent.pages[page].find((m) => m.slug === "hourly-grid-core");
    const b = nurseUse[page].moduleInstances.find((m) => m.moduleType.slug === "hourly-grid-core");
    const pb = (b?.propValues ?? {}) as Record<string, unknown>;
    check(
      a?.rowSpan === b?.rowSpan && a?.propValues.startTime === "19:00" && a?.propValues.endTime === pb.endTime && a?.propValues.startTime === pb.startTime,
      `night nurse page ${page}: the hours saved as Use this sets them (${a?.propValues.startTime} to ${a?.propValues.endTime}, ${a?.rowSpan} rows; Use this ${pb.startTime} to ${pb.endTime}, ${b?.rowSpan})`
    );
  }
  const nurseSig = (list: Array<{ slug: string; locked: boolean; columnStart: number | null; rowStart: number | null; columnSpan: number; rowSpan: number }>) => list.map(sig).sort().join("|");
  check([0, 1].every((page) => nurseSig(nurseContent.pages[page]) === nurseSig(nurseUse[page].moduleInstances.map((m) => ({ ...m, slug: m.moduleType.slug })))), "night nurse: every module where Use this puts it");
  const day = await ts.saveTemplateItem(OWNER, { kind: "layout", key: "day-stoic-practice" });
  const savedDay = await prisma.savedPage.findFirst({ where: { ownerId: OWNER, sourceKey: "layout:day-stoic-practice" } });
  check(day.where === "pages" && savedDay?.pageCount === 1, `a day is one saved page (${savedDay?.pageCount})`);
  // Into a journal: the size fits, and the pages come out with its modules.
  const added = await addSavedPageToSet(OWNER, book.id, "WEEKLY", null, savedWeek[0].id);
  const addedRows = await prisma.moduleInstance.count({ where: { pageId: { in: added } } });
  check(added.length === 2 && addedRows === content.pages[0].length + content.pages[1].length, `added to a journal: 2 pages, ${addedRows} modules`);

  console.log("Modules");
  const listed = await ts.saveTemplateItem(OWNER, { kind: "module", slug: "water-week" });
  await ts.saveTemplateItem(OWNER, { kind: "module", slug: "water-week" });
  const water = await prisma.savedModule.findMany({ where: { ownerId: OWNER, sourceKey: "module:water-week" } });
  check(listed.where === "modules" && water.length === 1, `a module from the list, saved once ("${listed.name}")`);
  const placed = spreadPlacements(entry.def);
  const slot = placed.findIndex((p) => !p.locked && p.slug === "prompted-lines");
  const fromLayout = await ts.saveTemplateItem(OWNER, { kind: "layout-module", key: "week-stoic-practice", slot });
  const theme = await prisma.savedModule.findFirst({ where: { ownerId: OWNER, sourceKey: `layout:week-stoic-practice#${slot}` } });
  check(fromLayout.name === "This Week's Theme" && (theme?.propValues as { heading?: string })?.heading === "This Week's Theme", `a module off a layout keeps that slot's settings ("${fromLayout.name}")`);
  const spine = placed.findIndex((p) => p.locked);
  await refuses(() => ts.saveTemplateItem(OWNER, { kind: "layout-module", key: "week-stoic-practice", slot: spine }), "a spine on its own is refused");
  check(ts.parseTemplateSave({ kind: "module", slug: "" }) === null && ts.parseTemplateSave({ kind: "layout-module", key: "x", slot: -1 }) === null && ts.parseTemplateSave("nope") === null, "nonsense is not a save");

  console.log("The keys, and un-saving");
  const keys = new Set(await ts.templateSavedKeys(OWNER));
  check(["planner:stoic-practice", "layout:week-stoic-practice", "layout:week-night-nurse", "layout:day-stoic-practice", "module:water-week", `layout:week-stoic-practice#${slot}`].every((k) => keys.has(k)), `every save lights its key (${keys.size})`);
  await ts.unsaveTemplateItem(OWNER, { kind: "layout", key: "week-stoic-practice" });
  const after = new Set(await ts.templateSavedKeys(OWNER));
  check(!after.has("layout:week-stoic-practice") && after.has("layout:day-stoic-practice") && after.size === keys.size - 1, "un-saving removes that one and only that one");
  const stillThere = await prisma.page.count({ where: { id: { in: added } } });
  check(stillThere === 2, "the pages it was used on stay, unlinked");
  await ts.unsaveTemplateItem(OWNER, { kind: "planner", key: "stoic-practice" });
  check((await prisma.savedPlanner.count({ where: { ownerId: OWNER } })) === 0, "a planner un-saved is gone");

  console.log("The route");
  const base = process.env.BASE ?? "http://localhost:3000";
  const url = `${base}/app/saved/template`;
  const nobody = await fetch(url);
  check(nobody.ok && JSON.stringify(await nobody.json()) === '{"keys":[]}', "GET for nobody: nothing");
  const post = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ kind: "module", slug: "water-week" }) });
  const cookie = (post.headers.get("set-cookie") ?? "").split(";")[0];
  const posted = (await post.json()) as { keys?: string[]; where?: string };
  check(post.ok && !!cookie && posted.where === "modules" && posted.keys?.includes("module:water-week") === true, "POST from someone new makes a guest and saves");
  const guestRow = await prisma.savedModule.findFirst({ where: { sourceKey: "module:water-week", ownerId: { startsWith: "guest:" } }, orderBy: { createdAt: "desc" }, select: { ownerId: true } });
  if (guestRow) routeGuests.push(guestRow.ownerId);
  const lit = await fetch(url, { headers: { Cookie: cookie } });
  check(((await lit.json()) as { keys: string[] }).keys.includes("module:water-week"), "GET with that guest's cookie lights it");
  const del = await fetch(url, { method: "DELETE", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie }, body: JSON.stringify({ kind: "module", slug: "water-week" }) });
  check(del.ok && !((await del.json()) as { keys: string[] }).keys.includes("module:water-week"), "DELETE removes it");
  const foreign = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://elsewhere.example" }, body: JSON.stringify({ kind: "module", slug: "water-week" }) });
  check(foreign.status === 403, `another site's POST is refused (${foreign.status})`);
  const bad = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie }, body: JSON.stringify({ kind: "layout", key: "no-such-layout" }) });
  check(bad.status === 400, `a layout that does not exist is refused (${bad.status})`);
} finally {
  await cleanUp([OWNER, ...routeGuests]);
  await prisma.$disconnect();
}

if (failures > 0) {
  console.error(`${failures} template saving check(s) failed.`);
  process.exit(1);
}
console.log("All template saving checks passed.");

// npm run check:intake - intake that fills the book (2026-10-31), end to end
// as a guest coach in a real browser: a question asked of a template's
// module, the client answering on their own page, the answer in their
// journal and in the book that prints - and still there after the coach
// edits the template's page, and after their journal is rebuilt. The coach
// correcting it, the client emptying it (the template's text back), and the
// coach no longer asking (every copy back to the template's).
//
//   npm run check:intake -- <shots folder>

import "./appUnderTest.mjs";
import { chromium, type Page } from "playwright-core";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import { prisma } from "../src/lib/prisma";
import { makeClientLink } from "../src/lib/clientPortal";
import { buildClientJournal, updateClientJournal } from "../src/lib/businessJournals";
import { syncLinkedPages } from "../src/app/planner/savedItems";
import { ASK_KEY, askIdOf, questionsOf } from "../src/lib/clientAnswers";
import { loadJournal } from "../src/lib/print/orderBook";
import { orderRange } from "../src/lib/print/orderRange";
import { generateBook } from "../src/lib/generateBook";
import { resolveFontFamily, type PlannerTheme } from "../src/lib/theme";

const shots = process.argv[2];
const server = await ensureServer(process.env.BASE);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};
const HIDE_DEV = `addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); });`;
const shoot = async (tab: Page, name: string) => {
  if (shots) await tab.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
};

const guest = await makeGuestJournal("Clarity Quarterly");
const PROMPT = "What three things matter most to you each week?";
const ANSWERS = ["Run before work", "Call my sister", "Ship the portfolio"];
try {
  const business = await prisma.business.create({ data: { ownerId: guest.ownerId, name: "Northwind Coaching" } });
  const template = await prisma.businessTemplate.create({ data: { businessId: business.id, plannerId: guest.journalId } });
  const maya = await prisma.businessClient.create({ data: { businessId: business.id, name: "Maya Okafor", templateId: template.id, startDate: new Date("2027-01-04T00:00:00Z") } });
  const sam = await prisma.businessClient.create({ data: { businessId: business.id, name: "Sam Lee", templateId: template.id, startDate: new Date("2027-01-04T00:00:00Z") } });
  const mayaJournal = await buildClientJournal(guest.ownerId, maya.id);
  const samJournal = await buildClientJournal(guest.ownerId, sam.id);
  // the weekly to-do list: the module the coach will ask about
  const asked = await prisma.moduleInstance.findFirstOrThrow({ where: { page: { plannerId: guest.journalId, level: "WEEKLY", position: 0 }, moduleType: { slug: "todo-checklist" } } });
  const itemsOf = async (plannerId: string) =>
    (await prisma.moduleInstance.findMany({ where: { page: { plannerId, level: "WEEKLY", position: 0, variantKey: null }, moduleType: { slug: "todo-checklist" } } })).map((m) => m.propValues as Record<string, unknown>);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await context.addInitScript(HIDE_DEV);
  const tab = await context.newPage();

  // ---- the coach asks
  await tab.goto(`${server.base}/app/business/templates`, { waitUntil: "networkidle" });
  await tab.getByRole("link", { name: "Questions" }).click();
  await tab.getByRole("heading", { name: "Questions for clients" }).waitFor();
  const candidates = await tab.locator("[data-candidate]").count();
  say(candidates === 3, `THE TEMPLATE'S MODULES A CLIENT COULD FILL ARE LISTED: its three to-do lists (${candidates})`);
  await tab.locator(`[data-candidate="${asked.id}"]`).getByRole("button", { name: "Ask your clients" }).click();
  await tab.getByLabel("The question, as your client reads it").fill(PROMPT);
  await tab.getByLabel("Answers to ask for").fill("3");
  await shoot(tab, "intake-ask");
  await tab.getByRole("button", { name: "Ask it" }).click();
  await tab.locator(`[data-candidate="${asked.id}"]`).getByText("Asked", { exact: true }).waitFor();
  const t1 = await prisma.businessTemplate.findUniqueOrThrow({ where: { id: template.id } });
  const qs = questionsOf(t1.questions);
  const id = qs[0]?.id;
  const marked = await prisma.moduleInstance.findUniqueOrThrow({ where: { id: asked.id } });
  say(qs.length === 1 && qs[0].prompt === PROMPT && qs[0].max === 3 && askIdOf(marked.propValues) === id, "THE QUESTION IS ASKED: kept on the template, its id on the module");
  say((await itemsOf(mayaJournal)).some((p) => p[ASK_KEY] === id) && (await itemsOf(samJournal)).some((p) => p[ASK_KEY] === id), "and every client's copy of the page carries it");
  await shoot(tab, "intake-asked");

  // ---- the client answers on their own page
  const token = await makeClientLink(guest.ownerId, maya.id);
  await tab.goto(`${server.base}/c/${token}`, { waitUntil: "networkidle" });
  await tab.getByRole("heading", { name: "A few questions from Northwind Coaching" }).waitFor();
  say((await tab.locator(`[data-question="${id}"]`).innerText()).includes("On every week"), "her page asks it, and says where it prints");
  for (let i = 0; i < 3; i++) await tab.getByLabel(`${PROMPT}: ${i + 1} of 3`).fill(ANSWERS[i]);
  await tab.getByRole("button", { name: "Save answers" }).click();
  await tab.getByRole("status").filter({ hasText: "print in your next book" }).waitFor();
  await shoot(tab, "intake-portal");
  const answered = await prisma.businessClient.findUniqueOrThrow({ where: { id: maya.id } });
  say(JSON.stringify((answered.answers as Record<string, unknown>)?.[id!]) === JSON.stringify(ANSWERS) && !!answered.answersAt, "HER ANSWERS ARE KEPT");
  say((await itemsOf(mayaJournal)).some((p) => JSON.stringify(p.items) === JSON.stringify(ANSWERS)), "and written into her journal's module");
  say((await itemsOf(samJournal)).every((p) => JSON.stringify(p.items) !== JSON.stringify(ANSWERS)), "not into anyone else's");

  // in the book that prints, on every week
  const printed = async () => {
    const j = (await loadJournal(guest.ownerId, mayaJournal))!;
    const range = orderRange(new Date("2027-01-04T00:00:00Z"), 28);
    const book = generateBook({ ...j, startDate: range.start, endDate: range.end }, resolveFontFamily((j.theme as PlannerTheme | null)?.fontFamily));
    return book.pages.filter((p) => JSON.stringify(p.elements).includes(ANSWERS[2])).length;
  };
  const weeks = await printed();
  say(weeks >= 4, `HER ANSWERS PRINT IN HER BOOK, on every week (${weeks} pages in four weeks)`);

  // ---- the coach edits the template's page: her answers stay
  const page = await prisma.moduleInstance.findFirstOrThrow({ where: { pageId: asked.pageId, id: { not: asked.id } } });
  await prisma.moduleInstance.update({ where: { id: page.id }, data: { propValues: { ...(page.propValues as object), checkIntakeMark: "edited" } } });
  const rewritten = await syncLinkedPages([asked.pageId]);
  const after = await itemsOf(mayaJournal);
  say(rewritten.length >= 2 && after.some((p) => JSON.stringify(p.items) === JSON.stringify(ANSWERS)), `A TEMPLATE EDIT REWRITES HER PAGE BUT NEVER TAKES HER ANSWERS (${rewritten.length} pages rewritten)`);
  await updateClientJournal(guest.ownerId, maya.id, { reset: true });
  say((await itemsOf(mayaJournal)).some((p) => JSON.stringify(p.items) === JSON.stringify(ANSWERS)) && (await printed()) >= 4, "nor does rebuilding her journal from the template");

  // ---- the coach corrects them
  await tab.goto(`${server.base}/app/business/clients/${maya.id}`, { waitUntil: "networkidle" });
  await tab.getByRole("heading", { name: "Their answers" }).waitFor();
  say((await tab.getByLabel(`${PROMPT}: 2 of 3`).inputValue()) === ANSWERS[1], "the coach sees her answers on her screen");
  await tab.getByLabel(`${PROMPT}: 2 of 3`).fill("Call my sister on Sundays");
  await tab.getByRole("button", { name: "Save answers" }).click();
  await tab.getByRole("status").filter({ hasText: "next book" }).waitFor();
  await shoot(tab, "intake-coach");
  say((await itemsOf(mayaJournal)).some((p) => (p.items as string[] | undefined)?.[1] === "Call my sister on Sundays"), "THE COACH'S CORRECTION REACHES HER JOURNAL");

  // ---- THE EDITOR ITSELF (its save filters settings to the module's own
  // keys, which would drop the question): typed on the page, in the
  // template and in her journal
  const editor = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
  await editor.addCookies([
    { name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" },
    { name: "memari-open", value: "WEEKLY", domain: new URL(server.base).hostname, path: "/" },
  ]);
  await editor.addInitScript(HIDE_DEV);
  const ed = await editor.newPage();
  const typeOnPage = async (journalId: string, instanceId: string, slot: string, value: string): Promise<boolean> => {
    await ed.goto(`${server.base}/app/j/${journalId}`, { waitUntil: "networkidle" });
    await ed.waitForTimeout(3000);
    const target = ed.locator(`[data-module-instance-id="${instanceId}"]`);
    if ((await target.count()) === 0) return false;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) return false;
    await ed.mouse.move(box.x + box.width * 0.3, box.y + Math.min(box.height * 0.3, 60));
    await ed.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 120));
    await ed.waitForTimeout(300);
    const pencil = target.locator(':scope > button[title^="Edit "]');
    if ((await pencil.count()) === 0) return false;
    await pencil.click();
    await ed.getByRole("dialog").waitFor({ timeout: 5000 }).catch(() => undefined);
    await ed.waitForTimeout(1300);
    const field = ed.locator(`[data-canvas-slot="${slot}"]`);
    if ((await field.count()) === 0) return false;
    await field.click();
    await field.fill(value);
    await ed.getByRole("dialog").getByRole("button", { name: "Done" }).click();
    await ed.waitForTimeout(3500);
    return true;
  };
  const NEW_FIRST = "Plan the week on Sunday";
  const typedInTemplate = await typeOnPage(guest.journalId, asked.id, "items#0", NEW_FIRST);
  const tplNow = (await prisma.moduleInstance.findUniqueOrThrow({ where: { id: asked.id } })).propValues as Record<string, unknown>;
  say(typedInTemplate && askIdOf(tplNow) === id && (tplNow.items as string[] | undefined)?.[0] === NEW_FIRST, `TYPED IN THE TEMPLATE IN THE EDITOR: its text saved and its question kept (${JSON.stringify(tplNow.items)}, ${askIdOf(tplNow)})`);
  const samNow = await itemsOf(samJournal);
  const mayaNow = await itemsOf(mayaJournal);
  say(samNow.some((p) => (p.items as string[] | undefined)?.[0] === NEW_FIRST && p[ASK_KEY] === id), "and it reaches Sam, who hasn't answered, still asked");
  say(mayaNow.some((p) => (p.items as string[] | undefined)?.[1] === "Call my sister on Sundays" && p[ASK_KEY] === id), "but not over Maya's answers");
  const mayaModule = await prisma.moduleInstance.findFirstOrThrow({ where: { page: { plannerId: mayaJournal, level: "WEEKLY", position: 0, variantKey: null }, moduleType: { slug: "todo-checklist" }, propValues: { path: [ASK_KEY], equals: id } } });
  const typedInHers = await typeOnPage(mayaJournal, mayaModule.id, "items#2", "Ship the portfolio by Friday");
  const herAnswers = ((await prisma.businessClient.findUniqueOrThrow({ where: { id: maya.id } })).answers as Record<string, string[]>)?.[id!];
  const herModule = (await prisma.moduleInstance.findUniqueOrThrow({ where: { id: mayaModule.id } })).propValues as Record<string, unknown>;
  say(typedInHers && herAnswers?.[2] === "Ship the portfolio by Friday" && askIdOf(herModule) === id, `TYPED IN HER JOURNAL IN THE EDITOR: it becomes her answer, the question kept (${JSON.stringify(herAnswers)})`);
  await syncLinkedPages([asked.pageId]);
  say((await itemsOf(mayaJournal)).some((p) => (p.items as string[] | undefined)?.[2] === "Ship the portfolio by Friday"), "so the template's next change writes it back, not over it");
  await editor.close();

  // ---- she empties them: the template's text back
  await tab.goto(`${server.base}/c/${token}`, { waitUntil: "networkidle" });
  for (let i = 0; i < 3; i++) await tab.getByLabel(`${PROMPT}: ${i + 1} of 3`).fill("");
  await tab.getByRole("button", { name: "Save answers" }).click();
  await tab.getByRole("status").filter({ hasText: "print in your next book" }).waitFor();
  const template0 = (await prisma.moduleInstance.findUniqueOrThrow({ where: { id: asked.id } })).propValues as Record<string, unknown>;
  const emptied = await itemsOf(mayaJournal);
  const stored = await prisma.businessClient.findUniqueOrThrow({ where: { id: maya.id } });
  say(emptied.some((p) => p[ASK_KEY] === id && JSON.stringify(p.items ?? null) === JSON.stringify(template0.items ?? null)) && !((stored.answers as Record<string, unknown>) ?? {})[id!], "ANSWERS EMPTIED: HER MODULE PRINTS THE TEMPLATE'S TEXT AGAIN");

  // ---- the coach stops asking
  await tab.goto(`${server.base}/c/${token}`, { waitUntil: "networkidle" });
  for (let i = 0; i < 3; i++) await tab.getByLabel(`${PROMPT}: ${i + 1} of 3`).fill(ANSWERS[i]);
  await tab.getByRole("button", { name: "Save answers" }).click();
  await tab.getByRole("status").filter({ hasText: "print in your next book" }).waitFor();
  await tab.goto(`${server.base}/app/business/templates/${template.id}/questions`, { waitUntil: "networkidle" });
  await tab.locator(`[data-candidate="${asked.id}"]`).getByRole("button", { name: "Stop asking" }).click();
  await tab.locator(`[data-candidate="${asked.id}"]`).getByRole("button", { name: "Ask your clients" }).waitFor();
  const stopped = await itemsOf(mayaJournal);
  say(
    questionsOf((await prisma.businessTemplate.findUniqueOrThrow({ where: { id: template.id } })).questions).length === 0 && stopped.every((p) => !p[ASK_KEY] && JSON.stringify(p.items) !== JSON.stringify(ANSWERS)),
    "STOPPED ASKING: the question goes, and her copy prints the template's text again"
  );
  await tab.goto(`${server.base}/c/${token}`, { waitUntil: "networkidle" });
  say((await tab.getByRole("heading", { name: /A few questions/ }).count()) === 0, "and her page asks nothing");

  // a phone: no sideways scroll on her page with a question
  await tab.goto(`${server.base}/app/business/templates/${template.id}/questions`, { waitUntil: "networkidle" });
  await tab.locator(`[data-candidate="${asked.id}"]`).getByRole("button", { name: "Ask your clients" }).click();
  await tab.getByLabel("The question, as your client reads it").fill(PROMPT);
  await tab.getByRole("button", { name: "Ask it" }).click();
  await tab.locator(`[data-candidate="${asked.id}"]`).getByText("Asked", { exact: true }).waitFor();
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await phone.addInitScript(HIDE_DEV);
  const small = await phone.newPage();
  await small.goto(`${server.base}/c/${token}`, { waitUntil: "networkidle" });
  const overflow = await small.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  say((await small.getByRole("heading", { name: /A few questions/ }).count()) === 1 && overflow <= 0, `a phone: her questions, and no sideways scroll (${overflow}px)`);
  await shoot(small, "intake-phone");
  await phone.close();
  await context.close();
} finally {
  await prisma.planner.deleteMany({ where: { ownerId: guest.ownerId, id: { not: guest.journalId } } });
  await prisma.savedPage.deleteMany({ where: { ownerId: guest.ownerId } });
  await prisma.business.deleteMany({ where: { ownerId: guest.ownerId } });
  await guest.remove();
  await browser.close();
  await disconnect();
  server.stop();
}
console.log(failures ? `\n${failures} problem(s).` : "\nAll intake checks passed.");
process.exit(failures ? 1 : 0);

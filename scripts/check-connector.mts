// npm run check:connector - a person's own assistant, connected (2026-11-02).
//
// Drives the connector the way an assistant does: JSON-RPC requests through the
// real handler, in this process, with a stand-in for one thing only - the check
// that a token is Clerk's, which needs a person signing in, and is the route's
// one line. The route's own answers (no token, a wrong token, a guest's cookie,
// the sign-in metadata) are read from the running app.
//
//   THE PROTOCOL: every tool is listed with a title and the hints that decide
//     when Claude asks, and both protocol generations are served.
//   BUILDING: a planner from the quiz's answers, then modules placed in words:
//     they land where they were asked to, and no page ever has two modules on
//     one cell, whatever is asked.
//   CHANGING: settings merge, a bad setting is refused in words and changes
//     nothing, moves and sizes read back, hours reach every page.
//   LINKED: a saved item is never changed everywhere without asking; everywhere
//     reaches its other uses; just here unlinks. Undoing a use taken apart
//     brings it back as its saved item is now, over a hand edit elsewhere
//     since, and undoing a saved module copies out the linked pages that hold
//     its other uses (review, 2026-11-04).
//   UNDO: the journal comes back to the byte, ids and all, with its events and
//     its other uses of linked items; hand edits since are asked about; a quiet
//     spell starts a new run; old runs are pruned.
//   WALLS: another person's journal, page and module read as nothing at all.
//   A COACH'S TEMPLATES (2026-11-04): one with no clients can be changed; one
//     with a client is refused, pointing at copy_template; the copy is a template
//     with no clients and no link of the original's, and changing it reaches
//     neither; once clients are moved onto it, it and undoing what was done to
//     it are refused too. A client's journal is never reached, not even through
//     a saved page the coach also uses in their own journal. REVIEWED
//     2026-11-04: the refusals point at the editor, and undo's at the editor
//     alone; undo brings a page it took apart back as the template has it now;
//     a module whose other use sits on a page shared with a template with
//     clients isn't changed everywhere; a change that went out to a template
//     before clients came isn't undone after; a client moved on while undo is
//     under way is seen; archived clients don't count, as on Templates; a
//     second copy is numbered; clients' journals don't count toward a day's
//     new journals.
//   THE EDITOR: one open picks up what an assistant did and offers to undo it.
//
//   npm run check:connector -- <shots folder>

import "./appUnderTest.mjs";
import { chromium } from "playwright-core";
import { withMcpAuth } from "mcp-handler";
import { ensureServer, makeGuestJournal, disconnect } from "./appUnderTest.mjs";
import { prisma } from "../src/lib/prisma";
import { connectorHandler, sayFailure } from "../src/lib/connector/mcpServer";
import { CONNECTOR_TOOLS, ToolError } from "../src/lib/connector/tools";
import { RUN_IDLE_MS, aiRunStatus, fingerprintOf, readSnapshot, recordedChange, undoRun } from "../src/lib/connector/journalRuns";
import { asConnectedOwner, currentOwner } from "../src/lib/owner";
import { savePagesAs, saveModuleAs, addSavedPageToSet, syncLinkedPages } from "../src/app/planner/savedItems";
import { buildClientJournal, moveClientsTo, updateClientJournal } from "../src/lib/businessJournals";
import { undoJournalAiRun } from "../src/app/planner/aiRunActions";

const shots = process.argv[2];
let failures = 0;
const say = (ok: boolean, what: string) => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${what}`);
};

const stamp = Date.now();
const ME = `check-connector-${stamp}`;
const SOMEONE = `check-connector-other-${stamp}`;
const COACH = `check-connector-coach-${stamp}`;
const OWNERS = [ME, SOMEONE, COACH];

// The handler as the route mounts it; a bearer token here simply names its owner.
const mcp = withMcpAuth(
  connectorHandler(),
  async (_request, bearerToken) => (bearerToken ? { token: bearerToken, clientId: "check", scopes: [], extra: { userId: bearerToken } } : undefined),
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" }
);

let rpcId = 0;
async function rpc(owner: string | null, method: string, params: unknown = {}, version = "2025-06-18") {
  const response = await mcp(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": version,
        "mcp-method": method,
        ...(method === "tools/call" ? { "mcp-name": (params as { name: string }).name } : {}),
        ...(owner ? { authorization: `Bearer ${owner}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    })
  );
  const text = await response.text();
  const json = text.startsWith("{") ? text : (text.split("\n").find((line) => line.startsWith("data: "))?.slice(6) ?? "null");
  return { status: response.status, headers: response.headers, body: JSON.parse(json) as { result?: Record<string, unknown>; error?: { message: string } } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- whatever a tool answered; each check reads what it expects
type Loose = Record<string, any>;
type Called = { error: boolean; text: string; json: Loose };
async function tool(owner: string, name: string, args: Record<string, unknown> = {}): Promise<Called> {
  const { body } = await rpc(owner, "tools/call", { name, arguments: args });
  const result = (body.result ?? {}) as { isError?: boolean; content?: Array<{ text: string }> };
  const text = result.content?.[0]?.text ?? body.error?.message ?? "";
  let json: Loose = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* a refusal, in words */
  }
  return { error: !!result.isError || !!body.error, text, json };
}

type Rect = { columnStart: number | null; rowStart: number | null; columnSpan: number; rowSpan: number };
function overlapsOn(modules: Rect[]): number {
  let found = 0;
  const placed = modules.filter((m) => m.columnStart !== null && m.rowStart !== null);
  for (const [i, a] of placed.entries()) {
    for (const b of placed.slice(i + 1)) {
      if (a.columnStart! < b.columnStart! + b.columnSpan && b.columnStart! < a.columnStart! + a.columnSpan && a.rowStart! < b.rowStart! + b.rowSpan && b.rowStart! < a.rowStart! + a.rowSpan) found++;
    }
  }
  return found;
}
async function overlapsInJournal(journalId: string): Promise<number> {
  const pages = await prisma.page.findMany({ where: { plannerId: journalId }, include: { moduleInstances: true } });
  return pages.reduce((sum, page) => sum + overlapsOn(page.moduleInstances), 0);
}
const printOf = async (journalId: string) => fingerprintOf(await readSnapshot(prisma, journalId));
/** JSON with its keys sorted at every depth. */
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, sorted(v)]))
      : value;
/** What a journal prints, without the module ids a copy out writes afresh:
 *  a linked page copied over with the same modules prints the same. */
const contentOf = async (journalId: string) =>
  JSON.stringify(
    (await readSnapshot(prisma, journalId)).pages
      .map((p) => ({
        at: `${p.level}:${p.variantKey ?? ""}:${p.position}`,
        link: p.savedPageId,
        modules: p.moduleInstances.map((m) => JSON.stringify(sorted({ ...m, id: undefined }))).sort(),
      }))
      .sort((a, b) => (a.at < b.at ? -1 : 1))
  );
const headingOf = (m: { propValues: unknown }) => (m.propValues as { heading?: string } | null)?.heading;

const server = await ensureServer(process.env.BASE);
const guests: Array<{ remove: () => Promise<void> }> = [];
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  // ------------------------------------------------------------ THE PROTOCOL
  const listed = await rpc(ME, "tools/list");
  const tools = ((listed.body.result as { tools?: Array<{ name: string; title?: string; description?: string; annotations?: Record<string, unknown> }> })?.tools ?? []);
  say(tools.length === CONNECTOR_TOOLS.length && tools.length > 0, `every tool is listed (${tools.length})`);
  say(tools.every((t) => t.name.length <= 64 && t.title && t.description && t.annotations?.title), "each has a short name, a title and a description");
  const kindOf = new Map(CONNECTOR_TOOLS.map((t) => [t.name, t.kind]));
  say(
    tools.every((t) => {
      const kind = kindOf.get(t.name);
      return t.annotations?.readOnlyHint === (kind === "read") && t.annotations?.destructiveHint === (kind === "change") && t.annotations?.openWorldHint === false;
    }),
    "each says whether it reads, adds or changes: read tools don't ask, changing tools always do"
  );
  say((["list_journals", "read_journal"] as const).every((n) => kindOf.get(n) === "read") && kindOf.get("add_module") === "add" && kindOf.get("remove_module") === "change", "adding stays apart from overwriting");
  const started = await rpc(ME, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  say((started.body.result as { serverInfo?: { name?: string } })?.serverInfo?.name === "memari", "an older assistant can start up");
  const modern = await rpc(ME, "server/discover", { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "check", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } }, "2026-07-28");
  say(modern.status === 200 && !modern.body.error, "a current one can too");
  const modernCall = await rpc(ME, "tools/call", { name: "list_journals", arguments: {}, _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientInfo": { name: "check", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} } }, "2026-07-28");
  say(modernCall.status === 200 && !modernCall.body.error && !(modernCall.body.result as { isError?: boolean })?.isError, "and call a tool");
  const noToken = await rpc(null, "tools/list");
  say(noToken.status === 401 && /resource_metadata=.*oauth-protected-resource\/mcp/.test(noToken.headers.get("www-authenticate") ?? ""), "no token: 401, pointing at how to sign in");

  // -------------------------------------------------------------- BUILDING
  const questions = await tool(ME, "get_planner_questions");
  say(questions.json.questions?.[0]?.id === "fills", "the planner's questions can be read");
  const routed = await tool(ME, "get_planner_questions", { answers: { pages: ["month"] } });
  say(!routed.json.questions.some((q: { id: string }) => q.id === "hourly"), "and which come next follows the answers (no hours for a month-only book)");
  const made = await tool(ME, "create_planner", {
    title: "Check planner",
    answers: { fills: ["school"], follow: ["college"], pages: ["week"], hourly: ["hour"], rhythm: ["day"], weekStart: ["monday"], dated: ["dated"], start: ["next-month"], track: ["habits"], habitCount: ["few"], todo: ["list"], schedule: ["add"] },
    details: { schedule: [{ title: "Chemistry", days: [1, 3], from: "09:00", to: "10:00" }] },
    time_zone: "America/New_York",
  });
  say(!made.error && !!made.json.journal, `a planner is made from answers: ${made.json.made_for ?? made.text}`);
  const list = await tool(ME, "list_journals");
  const listedJournal = list.json.journals?.find((j: { title: string }) => j.title === "Check planner");
  say(!!listedJournal?.link?.includes("/app/j/") && listedJournal.pages.includes("week"), "it's listed, with its address and kinds of page");
  const journal: string = listedJournal.journal;
  const events = await prisma.calendarEvent.count({ where: { ownerId: ME, title: "Chemistry" } });
  say(events === 1, "its regular class went into the calendar, not onto a page");
  const read = async () => (await tool(ME, "read_journal", { journal })).json;
  const outline = await read();
  const weekPages = outline.pages.filter((p: { level: string }) => p.level === "week");
  say(weekPages.length === 2 && weekPages[0].where === "left" && weekPages[1].where === "right", "the outline names a spread's pages");
  say(outline.rules?.some((r: string) => /never change/.test(r)), "and says the rules: books printed never change");
  const firstPlain = weekPages.flatMap((p: { modules: Array<{ settings: object; locked?: boolean }> }) => p.modules).find((m: { locked?: boolean; settings: object }) => !m.locked && Object.keys(m.settings).length > 0);
  say(!!firstPlain && !("propValues" in firstPlain), "each module shows its reference, place and settings");
  const size = JSON.stringify(outline).length;
  say(size < 40_000, `an outline stays small enough to read (${size} characters)`);
  const water = await tool(ME, "find_modules", { words: "water" });
  say(water.json.modules?.some((m: { type: string }) => /water/.test(m.type)), "modules can be searched");
  const categories = await tool(ME, "find_modules");
  say(categories.json.categories?.length === 12, "or listed by category");
  const habitType = await tool(ME, "get_module_type", { type: "habit-tracker" });
  say(habitType.json.settings?.some((s: { key: string; kind: string }) => s.kind === "lines"), "a module type's settings can be read");

  // Placing in words, on a page with room.
  const blank = await tool(ME, "add_page", { journal, level: "front" });
  say(!blank.error && blank.json.pages?.length === 1, "a page can be added");
  const frontPage: string = blank.json.pages[0];
  const one = await tool(ME, "add_module", { page: frontPage, type: "labeled-box", settings: { heading: "First" } });
  say(!one.error && one.json.settings?.heading === "First", "a module goes on, with its settings");
  say(one.json.place?.row === 0, `on a blank page it starts at the top (row ${one.json.place?.row})`);
  const two = await tool(ME, "add_module", { page: frontPage, type: "labeled-box", position: { below: one.json.module }, settings: { heading: "Below first" } });
  say(two.json.place?.row === one.json.place.row + one.json.place.rows, "below a module lands directly below it");
  const between = await tool(ME, "add_module", { page: frontPage, type: "labeled-box", position: { above: two.json.module }, settings: { heading: "Between" } });
  const next = await tool(ME, "add_module", { page: frontPage, type: "labeled-box", settings: { heading: "Next" } });
  const lastEnd = Math.max(...(await prisma.moduleInstance.findMany({ where: { pageId: frontPage, id: { not: next.json.module } } })).map((m) => m.rowStart! + m.rowSpan));
  say(next.json.place?.row === lastEnd, `with nowhere named it goes straight under what's there (row ${next.json.place?.row}, ${lastEnd} rows used)`);
  await tool(ME, "remove_module", { module: next.json.module });
  const stack = async () =>
    (await prisma.moduleInstance.findMany({ where: { pageId: frontPage }, orderBy: { rowStart: "asc" } })).map((m) => (m.propValues as { heading?: string }).heading);
  const order = await stack();
  say(order.indexOf("First") < order.indexOf("Between") && order.indexOf("Between") < order.indexOf("Below first"), `above a module lands directly above it (${order.join(", ")})`);

  // On the week spread, which is full.
  const left = weekPages[0];
  const right = weekPages[1];
  const added = await tool(ME, "add_module", { page: right.page, type: "gratitude-three", position: { zone: "main" } });
  say(!added.error || /No room/.test(added.text), added.error ? `a full page says so: "${added.text}"` : "the main zone takes a module");
  const side = await tool(ME, "add_module", { page: left.page, type: "labeled-box", position: { zone: "side" }, settings: { heading: "Side note" } });
  const spineLeft = (await prisma.moduleInstance.findMany({ where: { pageId: left.page }, include: { moduleType: true } })).find((m) => m.moduleType.slug === "hourly-grid-core");
  say(side.error ? /No room/.test(side.text) : side.json.place.column + side.json.place.columns <= (spineLeft?.columnStart ?? 0), side.error ? `the side column is full and says so` : "on the side lands in the side column");
  const noSide = await tool(ME, "add_module", { page: right.page, type: "labeled-box", position: { zone: "side" } });
  say(noSide.error && /left page/.test(noSide.text), "a page with no side column says where one is");
  say((await overlapsInJournal(journal)) === 0, "no two modules share a cell after any of that");
  const spines = weekPages.flatMap((p: { modules: Array<{ zone: string; module: string }> }) => p.modules).filter((m: { zone: string }) => m.zone === "spine");
  const aboveSpine = await tool(ME, "add_module", { page: right.page, type: "labeled-box", position: { above: spines.find((m: { module: string }) => right.modules.some((r: { module: string }) => r.module === m.module))?.module } });
  say(aboveSpine.error && /above the schedule/.test(aboveSpine.text), "nothing goes above the schedule");
  const lockedOne = await tool(ME, "add_module", { page: frontPage, type: "hourly-grid-core" });
  say(lockedOne.error, "a schedule can't be added as a module");

  // -------------------------------------------------------------- CHANGING
  const refused = await printOf(journal);
  const badKey = await tool(ME, "update_module", { module: one.json.module, settings: { nonsense: 1 } });
  say(badKey.error && /has no setting called nonsense/.test(badKey.text) && /heading/.test(badKey.text), "a setting it doesn't have is refused, naming the ones it has");
  const badType = await tool(ME, "update_module", { module: one.json.module, settings: { heading: 12 } });
  say(badType.error && /heading must be text/.test(badType.text), "a wrong kind of value is refused in words");
  const longText = await tool(ME, "update_module", { module: one.json.module, settings: { heading: "x".repeat(501) } });
  say(longText.error && /500 characters/.test(longText.text), "text longer than a module keeps is refused, not quietly cut");
  say((await printOf(journal)) === refused, "and none of those changed anything");
  const changed = await tool(ME, "update_module", { module: one.json.module, settings: { heading: "Renamed" } });
  say(changed.json.settings?.heading === "Renamed", "settings change");
  say(/printed once/.test(changed.json.reach), `and the reach is said: "${changed.json.reach}"`);
  const weeklyModule = right.modules.find((m: { locked?: boolean }) => !m.locked);
  if (weeklyModule && "heading" in weeklyModule.settings) {
    const before = { ...weeklyModule.settings };
    const onWeek = await tool(ME, "update_module", { module: weeklyModule.module, settings: { heading: "Weekly thing" } });
    say(/every week/.test(onWeek.json.reach), `a weekly page's change says it reaches every week`);
    const differ = Object.keys(before).filter((key) => key !== "heading" && JSON.stringify(before[key]) !== JSON.stringify(onWeek.json.settings[key]));
    say(differ.length === 0, `and only the setting named changed${differ.length ? `: ${differ.map((key) => `${key} ${JSON.stringify(before[key])} to ${JSON.stringify(onWeek.json.settings[key])}`).join("; ")}` : ""}`);
  }
  const habitsAdded = await tool(ME, "add_module", { page: frontPage, type: "habit-tracker", settings: { habits: ["Walk", "Read"] } });
  const key = habitType.json.settings.find((s: { kind: string }) => s.kind === "lines").key;
  const many = await tool(ME, "update_module", { module: habitsAdded.json.module, settings: { [key]: Array.from({ length: 14 }, (_, i) => `Habit ${i + 1}`) } });
  const grown = await prisma.moduleInstance.findUniqueOrThrow({ where: { id: habitsAdded.json.module } });
  say(!many.error && grown.rowSpan > habitsAdded.json.place.rows, `more content makes the box bigger (${habitsAdded.json.place.rows} to ${grown.rowSpan} rows)`);
  say((await overlapsInJournal(journal)) === 0, "without running into anything");

  const taller = await tool(ME, "resize_module", { module: two.json.module, rows: 2 });
  say(!taller.error && taller.json.changed_by_rows === 2, `taller by two rows reads back as two (${taller.text.slice(0, 80)})`);
  const shorter = await tool(ME, "resize_module", { module: two.json.module, rows: -36 });
  say(!shorter.error && shorter.json.changed_by_rows < 0 && /as far as it could go/.test(shorter.json.note ?? ""), "asking for more than it can give says how far it went");
  say((await overlapsInJournal(journal)) === 0, "resizing leaves no two modules on one cell");

  const moved = await tool(ME, "move_module", { module: between.json.module, position: { below: habitsAdded.json.module } });
  say(!moved.error, `a module moves within its page (${moved.error ? moved.text : `row ${moved.json.place.row}`})`);
  const across = await tool(ME, "add_page", { journal, level: "front" });
  const movedAcross = await tool(ME, "move_module", { module: between.json.module, page: across.json.pages[0] });
  say(movedAcross.json.page === across.json.pages[0], "or to another page");
  const nowhere = await tool(ME, "move_module", { module: two.json.module });
  say(nowhere.error && /Say where/.test(nowhere.text), "a move with nowhere to go is refused");
  say((await overlapsInJournal(journal)) === 0, "moves leave no two modules on one cell");

  const hours = await tool(ME, "set_hours", { journal, start: "06:00", end: "22:00", increments: "60" });
  const hourlyRows = await prisma.moduleInstance.findMany({ where: { page: { plannerId: journal }, moduleType: { slug: "hourly-grid-core" } } });
  say(!hours.error && hourlyRows.length >= 2 && hourlyRows.every((m) => (m.propValues as { startTime?: string }).startTime === "06:00"), `the hours change on every page with them (${hourlyRows.length})${hours.error ? `: ${hours.text}` : ""}`);
  const directHours = await tool(ME, "update_module", { module: hourlyRows[0].id, settings: { startTime: "01:00" } });
  say(directHours.error && /set_hours/.test(directHours.text), "the schedule's own settings point at set_hours");
  const tooLong = await tool(ME, "set_hours", { journal, start: "00:00", end: "23:30", increments: "30" });
  say(tooLong.error ? /more rows/.test(tooLong.text) : true, tooLong.error ? `hours that don't fit are refused: "${tooLong.text.slice(0, 70)}..."` : "long hours fit this page");
  say((await overlapsInJournal(journal)) === 0, "hours leave no two modules on one cell");

  const renamed = await tool(ME, "update_journal", { journal, title: "Check planner renamed" });
  say(renamed.json.title === "Check planner renamed", "a journal can be renamed");
  const halfTerm = await tool(ME, "update_journal", { journal, start: "2027-01-01" });
  say(halfTerm.error, "half a term is refused");
  const event = await tool(ME, "add_event", { journal, title: "Dentist", date: "2027-01-05", start: "15:00", end: "16:00" });
  say(!event.error && (await prisma.calendarEvent.count({ where: { id: event.json.event, ownerId: ME } })) === 1, "an event goes in the calendar");

  const gone = await tool(ME, "remove_module", { module: two.json.module });
  say(!gone.error && (await prisma.moduleInstance.count({ where: { id: two.json.module } })) === 0, "a module can be removed");
  const notBlank = await tool(ME, "remove_page", { page: frontPage });
  say(notBlank.error && /blank/.test(notBlank.text), "a page with things on it can't be");
  const blankPage = await tool(ME, "add_page", { journal, level: "front" });
  const removedPage = await tool(ME, "remove_page", { page: blankPage.json.pages[0] });
  say(!removedPage.error, "a blank one can");

  // ------------------------------------------------------------------ UNDO
  const status = await aiRunStatus(journal);
  say(status.changes.length > 5 && status.changes.includes("Added \"Dentist\" to your calendar"), `what changed is listed in words (${status.changes.length})`);
  // The journal as the run started, from a fresh one, so nothing above muddies it.
  const fresh = await tool(ME, "create_planner", { title: "Undo check", answers: { fills: ["office"], pages: ["month", "week"], hourly: ["hour"], rhythm: ["day"], weekStart: ["sunday"], dated: ["dated"], start: ["next-month"], todo: ["three"] } });
  const undoList = await tool(ME, "list_journals");
  const undoJournal: string = undoList.json.journals.find((j: { title: string }) => j.title === "Undo check").journal;
  const startPrint = await printOf(undoJournal);
  const startPages = await prisma.page.findMany({ where: { plannerId: undoJournal }, select: { id: true } });
  const undoOutline = (await tool(ME, "read_journal", { journal: undoJournal })).json;
  const someModule = undoOutline.pages.flatMap((p: { modules: Array<{ locked?: boolean; module: string; settings: object }> }) => p.modules).find((m: { locked?: boolean; settings: object }) => !m.locked && "heading" in m.settings);
  const newPage = await tool(ME, "add_page", { journal: undoJournal, level: "front" });
  const addedForUndo = await tool(ME, "add_module", { page: newPage.json.pages[0], type: "labeled-box", settings: { heading: "Added by the chat" } });
  await tool(ME, "update_module", { module: someModule.module, settings: { heading: "Changed by the chat" } });
  await tool(ME, "remove_module", { module: someModule.module });
  await tool(ME, "update_journal", { journal: undoJournal, title: "Renamed by the chat", font: "sans" });
  const hoursForUndo = await tool(ME, "set_hours", { journal: undoJournal, start: "08:00", increments: "60" });
  const eventForUndo = await tool(ME, "add_event", { journal: undoJournal, title: "Made by the chat", date: "2027-02-01", start: "09:00", end: "10:00" });
  say((await printOf(undoJournal)) !== startPrint && !addedForUndo.error && !hoursForUndo.error, "a run of changes changes the journal");
  const undone = await tool(ME, "undo_changes", { journal: undoJournal });
  say(undone.json.undone?.length === 7, `undo says what it took back (${undone.json.undone?.length}${undone.error ? `: ${undone.text}` : ""})`);
  say((await printOf(undoJournal)) === startPrint, "and the journal is back to the byte: pages, modules, ids, settings, title, font");
  say((await prisma.page.count({ where: { id: { in: startPages.map((p) => p.id) } } })) === startPages.length && (await prisma.page.count({ where: { id: newPage.json.pages[0] } })) === 0, "its pages are the same pages, and the one added is gone");
  say((await prisma.calendarEvent.count({ where: { id: eventForUndo.json.event } })) === 0, "the event it made is gone");
  const second = await tool(ME, "undo_changes", { journal: undoJournal });
  say(!second.error && second.json.undone?.length === 0, "undoing again finds nothing to do");
  say((await aiRunStatus(undoJournal)).changes.length === 0, "and the editor is told there's nothing to undo");
  // Refused INSIDE a change, by the action, with no run open: the run begun for it goes.
  const fullPage = undoOutline.pages.find((p: { modules: unknown[] }) => p.modules.length > 0).page;
  const refusedInside = await tool(ME, "remove_page", { page: fullPage });
  say(refusedInside.error && /blank/.test(refusedInside.text), "(a change the action itself refuses)");
  say((await prisma.journalAiRun.count({ where: { plannerId: undoJournal, undoneAt: null } })) === 0, "leaves no run behind, so no undo is offered for nothing");
  say(!fresh.error, "(that journal was made by an assistant too)");

  // Edits by hand since.
  const edited = (await tool(ME, "read_journal", { journal: undoJournal })).json.pages.flatMap((p: { modules: Array<{ locked?: boolean; module: string; settings: object }> }) => p.modules).find((m: { locked?: boolean; settings: object }) => !m.locked && "heading" in m.settings);
  await tool(ME, "update_module", { module: edited.module, settings: { heading: "The chat's" } });
  await prisma.moduleInstance.update({ where: { id: edited.module }, data: { rowSpan: { increment: 0 }, zIndex: 3 } });
  const asked = await tool(ME, "undo_changes", { journal: undoJournal });
  say(asked.error && /edited by hand/.test(asked.text), "edits by hand since are asked about first");
  const anyway = await tool(ME, "undo_changes", { journal: undoJournal, even_edits_made_since: true });
  say(!anyway.error && (await printOf(undoJournal)) === startPrint, "and undone only when told to");

  // A hand edit BETWEEN two of the assistant's changes: the second moves the
  // fingerprint on, so only the moment before it can see the first.
  await tool(ME, "update_module", { module: edited.module, settings: { heading: "First change" } });
  await prisma.moduleInstance.update({ where: { id: edited.module }, data: { zIndex: 4 } });
  await prisma.journalAiRun.updateMany({ where: { plannerId: undoJournal, undoneAt: null }, data: { touchedAt: new Date(Date.now() - 20_000) } });
  await tool(ME, "update_module", { module: edited.module, settings: { heading: "Second change" } });
  const between2 = await tool(ME, "undo_changes", { journal: undoJournal });
  say(between2.error && /edited by hand/.test(between2.text), "a hand edit between two changes is asked about too");
  await tool(ME, "undo_changes", { journal: undoJournal, even_edits_made_since: true });
  say((await printOf(undoJournal)) === startPrint, "and undoing anyway still goes all the way back");
  // Calls that overlap are one assistant, not a hand: the second begins with the
  // first's change already landed and not yet recorded. A quiet spell first, or
  // nothing is being tested.
  await tool(ME, "update_module", { module: edited.module, settings: { heading: "One" } });
  await prisma.journalAiRun.updateMany({ where: { plannerId: undoJournal, undoneAt: null }, data: { touchedAt: new Date(Date.now() - 60_000) } });
  let finishFirst = () => {};
  let firstLanded = () => {};
  const landed = new Promise<void>((resolve) => (firstLanded = resolve));
  const first = recordedChange(undoJournal, "First at once", async () => {
    await prisma.moduleInstance.update({ where: { id: edited.module }, data: { zIndex: 7 } });
    firstLanded();
    await new Promise<void>((resolve) => (finishFirst = resolve));
  });
  await landed;
  await recordedChange(undoJournal, "Second at once", () => prisma.moduleInstance.update({ where: { id: edited.module }, data: { zIndex: 8 } }));
  finishFirst();
  await first;
  const overlapping = await tool(ME, "undo_changes", { journal: undoJournal });
  say(!overlapping.error && overlapping.json.undone?.length === 3, `changes that overlap aren't mistaken for a hand (${overlapping.error ? overlapping.text : overlapping.json.undone?.length})`);

  // A quiet spell starts a new run, and only that is undone.
  await tool(ME, "update_module", { module: edited.module, settings: { heading: "Old run" } });
  const afterOld = await printOf(undoJournal);
  await prisma.journalAiRun.updateMany({ where: { plannerId: undoJournal, undoneAt: null }, data: { lastChangeAt: new Date(Date.now() - RUN_IDLE_MS - 60_000) } });
  await tool(ME, "update_module", { module: edited.module, settings: { heading: "New run" } });
  await tool(ME, "undo_changes", { journal: undoJournal });
  say((await printOf(undoJournal)) === afterOld, "after a quiet spell, undo goes back only to where the new run began");
  for (let i = 0; i < 7; i++) {
    await tool(ME, "update_module", { module: edited.module, settings: { heading: `Run ${i}` } });
    await tool(ME, "undo_changes", { journal: undoJournal });
  }
  say((await prisma.journalAiRun.count({ where: { plannerId: undoJournal } })) <= 5, "old runs are pruned");

  // ---------------------------------------------------------------- LINKED
  const sharedPages = (await tool(ME, "read_journal", { journal: undoJournal })).json.pages.filter((p: { level: string }) => p.level === "front");
  const sourcePage: string = sharedPages[0].page;
  const boxOnSource = await tool(ME, "add_module", { page: sourcePage, type: "labeled-box", settings: { heading: "Shared" } });
  await savePagesAs(ME, [sourcePage], "Shared page");
  const savedRow = await prisma.savedPage.findFirstOrThrow({ where: { ownerId: ME, name: "Shared page" } });
  await asConnectedOwner(ME, () => addSavedPageToSet(ME, journal, "FRONT_MATTER", null, savedRow.id));
  // (saving it was by hand: what follows is a run of its own)
  await prisma.journalAiRun.updateMany({ where: { plannerId: undoJournal, undoneAt: null }, data: { lastChangeAt: new Date(Date.now() - RUN_IDLE_MS - 60_000) } });
  const otherUse = await prisma.page.findFirstOrThrow({ where: { plannerId: journal, savedPageId: savedRow.id }, include: { moduleInstances: true } });
  say(otherUse.moduleInstances.length > 0, "(a saved page used in two journals)");
  const beforeLinked = await printOf(journal);
  const unasked = await tool(ME, "update_module", { module: boxOnSource.json.module, settings: { heading: "Changed everywhere?" } });
  say(unasked.error && /everywhere or just here/.test(unasked.text), "a linked page isn't changed without asking");
  say((await printOf(journal)) === beforeLinked, "and nothing changed");
  const everywhere = await tool(ME, "update_module", { module: boxOnSource.json.module, settings: { heading: "Everywhere" }, linked: "everywhere" });
  const headingsElsewhere = async () => (await prisma.moduleInstance.findMany({ where: { pageId: otherUse.id } })).map((m) => (m.propValues as { heading?: string }).heading);
  say(!everywhere.error && (await headingsElsewhere()).includes("Everywhere"), "everywhere reaches its other use");
  say(/all 2 places/.test(everywhere.json.linked ?? ""), "and says so");
  await tool(ME, "undo_changes", { journal: undoJournal });
  say((await headingsElsewhere()).includes("Shared") && !(await headingsElsewhere()).includes("Everywhere"), "undo takes it back in its other use too");
  const relinked = await prisma.page.findUniqueOrThrow({ where: { id: sourcePage } });
  say(relinked.savedPageId === savedRow.id, "and the link stays");
  const boxNow = (await prisma.moduleInstance.findMany({ where: { pageId: sourcePage } })).find((m) => (m.propValues as { heading?: string }).heading === "Shared")!;
  const justHere = await tool(ME, "update_module", { module: boxNow.id, settings: { heading: "Only here" }, linked: "just_here" });
  const unlinkedPage = await prisma.page.findUniqueOrThrow({ where: { id: sourcePage } });
  say(!justHere.error && unlinkedPage.savedPageId === null && (await headingsElsewhere()).includes("Shared"), "just here unlinks it, and its other use keeps what it had");
  await tool(ME, "undo_changes", { journal: undoJournal });
  say((await prisma.page.findUniqueOrThrow({ where: { id: sourcePage } })).savedPageId === savedRow.id, "undoing that links it again");
  // A HAND EDIT TO ITS OTHER USE WHILE THE CHAT HAS THIS ONE TAKEN APART
  // (review, 2026-11-04): undo links it again as the saved page is now, and
  // copies nothing old out over the hand edit.
  const boxAgain = (await prisma.moduleInstance.findMany({ where: { pageId: sourcePage } })).find((m) => headingOf(m) === "Shared")!;
  const apartHere = await tool(ME, "update_module", { module: boxAgain.id, settings: { heading: "Only here again" }, linked: "just_here" });
  const handEditBox = (await prisma.moduleInstance.findMany({ where: { pageId: otherUse.id } })).find((m) => headingOf(m) === "Shared")!;
  await prisma.moduleInstance.update({ where: { id: handEditBox.id }, data: { propValues: { ...(handEditBox.propValues as object), heading: "Edited by hand elsewhere" } } });
  await syncLinkedPages([otherUse.id]);
  const handUndo = await tool(ME, "undo_changes", { journal: undoJournal });
  const sourceHeadings = (await prisma.moduleInstance.findMany({ where: { pageId: sourcePage } })).map(headingOf);
  say(
    !apartHere.error && !handUndo.error && (await headingsElsewhere()).includes("Edited by hand elsewhere") && sourceHeadings.includes("Edited by hand elsewhere") && !sourceHeadings.includes("Only here again") && (await prisma.page.findUniqueOrThrow({ where: { id: sourcePage } })).savedPageId === savedRow.id,
    `A HAND EDIT TO ITS OTHER USE, MADE SINCE THE CHAT TOOK THIS ONE APART, SURVIVES UNDO: this one comes back linked, showing it (${sourceHeadings.join(", ")})`
  );
  say(/Shared page/.test(handUndo.json.note ?? ""), `and undo says which came back as it is now: "${handUndo.json.note}"`);

  const savedBoxOwner = await tool(ME, "add_module", { page: frontPage, type: "labeled-box", settings: { heading: "Saved box" } });
  const savedModule = await saveModuleAs(ME, savedBoxOwner.json.module, "Saved box");
  const secondUse = await prisma.moduleInstance.create({
    data: { pageId: across.json.pages[0], moduleTypeId: (await prisma.moduleInstance.findUniqueOrThrow({ where: { id: savedBoxOwner.json.module } })).moduleTypeId, placementMode: "GRID", columnStart: 0, rowStart: 30, columnSpan: 6, rowSpan: 3, propValues: { heading: "Saved box" }, savedModuleId: savedModule.id },
  });
  const moduleAsked = await tool(ME, "update_module", { module: savedBoxOwner.json.module, settings: { heading: "Which?" } });
  say(moduleAsked.error && /saved module/.test(moduleAsked.text) && /everywhere or just here/.test(moduleAsked.text), "a saved module isn't changed without asking either");
  await tool(ME, "update_module", { module: savedBoxOwner.json.module, settings: { heading: "Both" }, linked: "everywhere" });
  const useAfter = await prisma.moduleInstance.findUniqueOrThrow({ where: { id: secondUse.id } });
  say((useAfter.propValues as { heading?: string }).heading === "Both", "everywhere reaches its other use");
  await tool(ME, "update_module", { module: savedBoxOwner.json.module, settings: { heading: "Mine alone" }, linked: "just_here" });
  const firstAfter = await prisma.moduleInstance.findUniqueOrThrow({ where: { id: savedBoxOwner.json.module } });
  const useAfter2 = await prisma.moduleInstance.findUniqueOrThrow({ where: { id: secondUse.id } });
  say(firstAfter.savedModuleId === null && (useAfter2.propValues as { heading?: string }).heading === "Both", "just here unlinks that one");
  // A SAVED MODULE'S OTHER USE ON A LINKED PAGE IN ANOTHER JOURNAL (review,
  // 2026-11-04): undo gives the module its settings back everywhere, and
  // copies that page out too, as the editor's own edit does, so its saved
  // page doesn't keep the chat's.
  const acrossSaved = await savePagesAs(ME, [across.json.pages[0]], "Across page");
  const plainPage = await prisma.page.findFirstOrThrow({ where: { plannerId: undoJournal, savedPageId: null } });
  const runUse = await prisma.moduleInstance.create({
    data: { pageId: plainPage.id, moduleTypeId: useAfter2.moduleTypeId, placementMode: "GRID", columnStart: 0, rowStart: 0, columnSpan: useAfter2.columnSpan, rowSpan: useAfter2.rowSpan, propValues: useAfter2.propValues as object, savedModuleId: savedModule.id },
  });
  await prisma.journalAiRun.updateMany({ where: { plannerId: undoJournal, undoneAt: null }, data: { lastChangeAt: new Date(Date.now() - RUN_IDLE_MS - 60_000) } });
  const acrossHeading = async () => {
    const content = (await prisma.savedPage.findUniqueOrThrow({ where: { id: acrossSaved.id } })).content as { pages: Array<Array<{ savedModuleId: string | null; propValues: { heading?: string } }>> };
    return content.pages[0].find((slot) => slot.savedModuleId === savedModule.id)?.propValues.heading;
  };
  const spreadOut = await tool(ME, "update_module", { module: runUse.id, settings: { heading: "Spread by the chat" }, linked: "everywhere" });
  const spreadTo = await acrossHeading();
  const spreadUndo = await tool(ME, "undo_changes", { journal: undoJournal });
  const backTo = await acrossHeading();
  say(
    !spreadOut.error && !spreadUndo.error && spreadTo === "Spread by the chat" && backTo === "Both",
    `UNDOING A SAVED MODULE'S CHANGE COPIES OUT THE LINKED PAGE HOLDING ITS OTHER USE: its saved page went to "${spreadTo}" and is back to "${backTo}"${spreadOut.error ? `: ${spreadOut.text}` : ""}`
  );

  // ----------------------------------------------------------------- WALLS
  const theirs = await tool(SOMEONE, "read_journal", { journal });
  say(theirs.error && /No journal of yours/.test(theirs.text), "another person can't read this journal");
  say(!JSON.stringify((await tool(SOMEONE, "list_journals")).json).includes(journal), "or see it listed");
  const wallTries = await Promise.all([
    tool(SOMEONE, "update_module", { module: one.json.module, settings: { heading: "Mine now" } }),
    tool(SOMEONE, "remove_module", { module: one.json.module }),
    tool(SOMEONE, "move_module", { module: one.json.module, position: { zone: "main" } }),
    tool(SOMEONE, "resize_module", { module: one.json.module, rows: 1 }),
  ]);
  say(wallTries.every((t) => t.error && t.text === "No module of yours matches that. read_journal gives each module's reference."), "or change a module of it, told only that it isn't theirs");
  const wallPage = await tool(SOMEONE, "add_module", { page: frontPage, type: "labeled-box" });
  say(wallPage.error && /No page of yours/.test(wallPage.text), "or add to a page of it");
  const wallUndo = await tool(SOMEONE, "undo_changes", { journal });
  say(wallUndo.error && /No journal of yours/.test(wallUndo.text), "or undo it");
  const missing = await tool(ME, "update_module", { module: "no-such-module", settings: {} });
  say(missing.text === wallTries[0].text, "and that reads the same as a module that doesn't exist");

  // ------------------------------------------- A COACH'S TEMPLATES (2026-11-04)
  // Andrew: "Templates with no clients or they can even create new templates
  // from existing ones claude then move the clients over on the website".
  const weekBook = { fills: ["office"], pages: ["week"], hourly: ["hour"], rhythm: ["day"], weekStart: ["sunday"], dated: ["undated"], todo: ["three"] };
  const coachMade = await tool(COACH, "create_planner", { title: "Coach template", answers: weekBook });
  const coachOwn = await tool(COACH, "create_planner", { title: "Coach's own", answers: weekBook });
  const ids = async (title: string) => (await prisma.planner.findFirstOrThrow({ where: { ownerId: COACH, title } })).id;
  const [templateId, ownId] = [await ids("Coach template"), await ids("Coach's own")];
  say(!coachMade.error && !coachOwn.error, "(a coach, with a template and a journal of their own)");
  const business = await prisma.business.create({ data: { ownerId: COACH, name: "Check coaching" } });
  const template = await prisma.businessTemplate.create({ data: { businessId: business.id, plannerId: templateId } });
  const noBusiness = await tool(ME, "copy_template", { journal });
  say(noBusiness.error && /no coaching business/.test(noBusiness.text), "copying needs a coaching business to make a template for");

  // With no clients, the template is the coach's to change from a chat.
  const listedEmpty = (await tool(COACH, "list_journals")).json.journals.find((j: Loose) => j.journal === templateId);
  say(listedEmpty?.coaching_template === true && listedEmpty.clients === 0 && !listedEmpty.note, "a template with no clients is listed, as a template with none");
  const readEmpty = await tool(COACH, "read_journal", { journal: templateId });
  say(!readEmpty.error && readEmpty.json.coaching_template?.clients === 0 && /nobody's book/.test(readEmpty.json.coaching_template?.note ?? ""), "and read, saying a change reaches nobody's book");
  const plainOf = (outline: Loose) => (outline.pages ?? []).flatMap((p: Loose) => p.modules.map((m: Loose) => ({ ...m, page: p.page }))).filter((m: Loose) => !m.locked && "heading" in m.settings);
  const templateBox = plainOf(readEmpty.json)[0] ?? {};
  const emptyEdit = await tool(COACH, "update_module", { module: templateBox.module, settings: { heading: "Changed by the chat" } });
  say(!emptyEdit.error && emptyEdit.json.settings?.heading === "Changed by the chat", `A TEMPLATE WITH NO CLIENTS CAN BE CHANGED${emptyEdit.error ? `: ${emptyEdit.text}` : ""}`);
  const emptyUndo = await tool(COACH, "undo_changes", { journal: templateId });
  say(!emptyUndo.error && emptyUndo.json.undone?.length === 1, `and the change undone${emptyUndo.error ? `: ${emptyUndo.text}` : ""}`);

  // A client arrives, with a journal built from it and linked to it; one of
  // its modules is a saved module of the coach's, linked too.
  const otherBox = plainOf(readEmpty.json).find((m: Loose) => m.module !== templateBox.module)!;
  const coachSaved = await saveModuleAs(COACH, otherBox.module, "Coach's box");
  const client = await prisma.businessClient.create({ data: { businessId: business.id, name: "Client", templateId: template.id } });
  const clientJournalId = await buildClientJournal(COACH, client.id);
  const clientPrint = () => printOf(clientJournalId);
  const clientAtStart = await clientPrint();
  const templateAtStart = await printOf(templateId);
  const coachList = (await tool(COACH, "list_journals")).json.journals as Loose[];
  const listedFull = coachList.find((j) => j.journal === templateId);
  say(!coachList.some((j) => j.journal === clientJournalId), "a client's journal is never listed");
  say(listedFull?.clients === 1 && /copy_template/.test(listedFull.note ?? ""), "a template with a client is listed, for copying, and says so");
  const fullTries = [
    await tool(COACH, "read_journal", { journal: templateId }),
    await tool(COACH, "update_module", { module: templateBox.module, settings: { heading: "Mine now" } }),
    await tool(COACH, "add_page", { journal: templateId, level: "front" }),
    await tool(COACH, "set_hours", { journal: templateId, start: "05:00" }),
  ];
  say(fullTries.every((t) => t.error && /has 1 client/.test(t.text) && /copy_template/.test(t.text)), `A TEMPLATE WITH A CLIENT IS REFUSED, read or changed, with the way on: "${fullTries[1].text.slice(0, 100)}..."`);
  say(fullTries.every((t) => /in Memari's editor/.test(t.text) && /rebuilds each client's journal/.test(t.text)), "and the editor is offered first, for a small change, and a move is said to rebuild their journals");
  const undoNone = await tool(COACH, "undo_changes", { journal: templateId });
  say(!undoNone.error && undoNone.json.undone?.length === 0 && !("pages" in undoNone.json), "with nothing of a chat's open on it, undo there finds nothing to do, and shows nothing of it");
  say((await printOf(templateId)) === templateAtStart && (await clientPrint()) === clientAtStart, "and nothing changed, in it or in its client's journal");
  const readClient = await tool(COACH, "read_journal", { journal: clientJournalId });
  say(readClient.error && /client's journal/.test(readClient.text), "a client's journal can't be read through a connector");
  const clientPage = await prisma.page.findFirstOrThrow({ where: { plannerId: clientJournalId } });
  const clientEdit = await tool(COACH, "add_module", { page: clientPage.id, type: "labeled-box" });
  const clientCopy = await tool(COACH, "copy_template", { journal: clientJournalId });
  say(clientEdit.error && /client's journal/.test(clientEdit.text) && clientCopy.error && /client's journal/.test(clientCopy.text), "or added to, or copied");

  // THE COPY: a template of the same business, with no clients and no link
  // of the original's.
  const copied = await tool(COACH, "copy_template", { journal: templateId });
  const copyId: string = copied.json.journal;
  say(!copied.error && copied.json.title === "Coach template (copy)" && copied.json.coaching_template?.clients === 0 && /templates\?move=/.test(copied.json.move_clients ?? ""), `copy_template makes "${copied.json.title}", with no clients, and says where clients are moved${copied.error ? `: ${copied.text}` : ""}`);
  const copyRow = await prisma.businessTemplate.findUnique({ where: { plannerId: copyId }, include: { _count: { select: { clients: true } } } });
  say(!!copyRow && copyRow.businessId === business.id && copyRow._count.clients === 0 && (await prisma.businessClient.count({ where: { templateId: template.id } })) === 1, "THE COPY IS A TEMPLATE OF THE SAME BUSINESS WITH NO CLIENTS, and the original keeps its client");
  const pagesOf = (id: string) => prisma.page.findMany({ where: { plannerId: id }, include: { moduleInstances: true }, orderBy: [{ level: "asc" }, { variantKey: "asc" }, { position: "asc" }] });
  const linksOf = (pages: Awaited<ReturnType<typeof pagesOf>>) => pages.flatMap((p) => [p.savedPageId, ...p.moduleInstances.map((m) => m.savedModuleId)]).filter((link): link is string => !!link);
  const [originalPages, copyPages] = [await pagesOf(templateId), await pagesOf(copyId)];
  const originalLinks = new Set(linksOf(originalPages));
  const sharedLinks = linksOf(copyPages).filter((link) => originalLinks.has(link));
  say(originalLinks.size > originalPages.length && originalLinks.has(coachSaved.id) && sharedLinks.length === 0, `THE COPY SHARES NO LINK WITH THE ORIGINAL: none of its ${originalLinks.size}, saved pages and the saved module alike (${sharedLinks.length} shared)`);
  say(copyPages.length === originalPages.length && copyPages.every((p, i) => p.moduleInstances.length === originalPages[i].moduleInstances.length), `and it has every page and module of it (${copyPages.length} pages)`);

  // Changing the copy reaches nobody: not the original, not its client.
  const copyOutline = await tool(COACH, "read_journal", { journal: copyId });
  say(!copyOutline.error && copyOutline.json.coaching_template?.clients === 0, "the copy can be read");
  const copyPlain = plainOf(copyOutline.json);
  const otherPage = originalPages.find((p) => p.moduleInstances.some((m) => m.id === otherBox.module))!;
  const otherRow = otherPage.moduleInstances.find((m) => m.id === otherBox.module)!;
  const copyOfSaved = copyPages[originalPages.indexOf(otherPage)].moduleInstances.find((m) => m.moduleTypeId === otherRow.moduleTypeId && m.columnStart === otherRow.columnStart && m.rowStart === otherRow.rowStart)!;
  const copyBox = copyPlain.find((m: Loose) => m.module !== copyOfSaved.id)!;
  const editCopy = await tool(COACH, "update_module", { module: copyBox.module, settings: { heading: "Only in the copy" } });
  const editCopySaved = await tool(COACH, "update_module", { module: copyOfSaved.id, settings: { heading: "The copy's own" }, linked: "everywhere" });
  const hoursCopy = await tool(COACH, "set_hours", { journal: copyId, start: "07:00", end: "21:00", increments: "60" });
  say(!editCopy.error && !editCopySaved.error && !hoursCopy.error, `(the copy changed: a module, the module linked in the original, its hours${[editCopy, editCopySaved, hoursCopy].find((t) => t.error)?.text ?? ""})`);
  say((await printOf(templateId)) === templateAtStart && (await clientPrint()) === clientAtStart, "AN EDIT TO THE COPY DOESN'T REACH THE ORIGINAL OR ITS CLIENT'S JOURNAL");

  // Clients moved onto the copy, as Templates moves them: then it is out of
  // reach too, and so is undoing what the chat did to it.
  const stillOpen = (await aiRunStatus(copyId)).changes.length;
  const onCopy = await moveClientsTo(COACH, copyRow!.id, [client.id]);
  say(onCopy.moved.length === 1 && (await prisma.businessClient.findUniqueOrThrow({ where: { id: client.id } })).templateId === copyRow!.id, `(the client moved onto the copy, with ${stillOpen} of the chat's changes still open)`);
  const [copyMoved, clientMoved] = [await printOf(copyId), await clientPrint()];
  const undoTool = await tool(COACH, "undo_changes", { journal: copyId, even_edits_made_since: true });
  say(
    undoTool.error && /1 client has been moved onto this template/.test(undoTool.text) && /by hand in the editor/.test(undoTool.text) && !/copy_template/.test(undoTool.text),
    `UNDO THROUGH THE CONNECTOR IS REFUSED ONCE THE COPY HAS A CLIENT, pointing at the editor, not at another copy: "${undoTool.text.slice(0, 90)}..."`
  );
  const undoDirect = await undoRun(COACH, copyId, { evenEditsSince: true });
  const undoEditor = await asConnectedOwner(COACH, () => undoJournalAiRun(copyId, true));
  say(undoDirect.status === "has-clients" && undoEditor.status === "has-clients", `UNDO IS REFUSED ONCE CLIENTS ARRIVE, even when told to, and from the editor (${undoDirect.status}, ${undoEditor.status})`);
  say((await printOf(copyId)) === copyMoved && (await clientPrint()) === clientMoved, "and nothing was put back: the copy and the client's journal are as they were");
  const copyStatus = await aiRunStatus(copyId);
  say(copyStatus.changes.length === stillOpen && copyStatus.clients === 1, "the editor still lists the changes, and is told the template has a client");
  const copyNow = await tool(COACH, "update_module", { module: copyBox.module, settings: { heading: "Again" } });
  say(copyNow.error && /copy_template/.test(copyNow.text), "and the copy, with a client now, is refused like any template with one");

  // THROUGH A LINK: a page of the coach's own journal, saved and used in the
  // copy, so in its client's journal. A change made in the coach's own journal
  // may not reach them that way either.
  const ownFront = (await tool(COACH, "read_journal", { journal: ownId })).json.pages.find((p: Loose) => p.level === "front");
  const sharedPage = await savePagesAs(COACH, [ownFront.page], "Coach's front page");
  await asConnectedOwner(COACH, () => addSavedPageToSet(COACH, copyId, "FRONT_MATTER", null, sharedPage.id));
  await updateClientJournal(COACH, client.id);
  const inClient = await prisma.page.findFirst({ where: { plannerId: clientJournalId, savedPageId: sharedPage.id }, include: { moduleInstances: true } });
  say(!!inClient && inClient.moduleInstances.length > 0, "(a saved page of the coach's own journal, used in the copy and so in its client's journal)");
  const ownShared = plainOf((await tool(COACH, "read_journal", { journal: ownId })).json).find((m: Loose) => m.page === ownFront.page);
  const clientBefore = await clientPrint();
  const sharedAsk = await tool(COACH, "update_module", { module: ownShared.module, settings: { heading: "Everywhere?" } });
  const sharedEverywhere = await tool(COACH, "update_module", { module: ownShared.module, settings: { heading: "Everywhere?" }, linked: "everywhere" });
  say(
    sharedAsk.error && sharedEverywhere.error && /coaching business/.test(sharedEverywhere.text) && /just_here/.test(sharedEverywhere.text),
    `A SAVED PAGE ALSO USED BY A TEMPLATE WITH CLIENTS CAN'T BE CHANGED EVERYWHERE: "${sharedEverywhere.text.slice(0, 90)}..."`
  );
  const sharedHours = await tool(COACH, "set_hours", { journal: ownId, start: "06:00" });
  say(sharedHours.error && /coaching business/.test(sharedHours.text), "NOR THE HOURS, which would change it everywhere too");
  say((await clientPrint()) === clientBefore, "and the client's journal didn't change");
  // what the coach wrote on the client's copy for them, which a copy back out would overwrite
  const clientBox = inClient!.moduleInstances.find((m) => m.columnStart === ownShared.place.column && m.rowStart === ownShared.place.row)!;
  await prisma.moduleInstance.update({ where: { id: clientBox.id }, data: { propValues: { ...(clientBox.propValues as object), heading: "Written for the client" } } });
  const clientMarked = await clientPrint();
  const sharedHere = await tool(COACH, "update_module", { module: ownShared.module, settings: { heading: "The coach's alone" }, linked: "just_here" });
  say(!sharedHere.error && (await clientPrint()) === clientMarked, "just here changes it in the coach's own journal alone");
  const sharedUndo = await tool(COACH, "undo_changes", { journal: ownId });
  const ownSharedAfter = await prisma.page.findUniqueOrThrow({ where: { id: ownFront.page } });
  say(!sharedUndo.error && ownSharedAfter.savedPageId === sharedPage.id && (await clientPrint()) === clientMarked, "UNDOING IT LINKS IT AGAIN AND COPIES NOTHING OUT INTO THE CLIENT'S JOURNAL: what was written for them stays");
  // AND THE TEMPLATE EDITED BY HAND WHILE THE CHAT HAD IT TAKEN APART (review,
  // 2026-11-04): undo links the coach's page again as the saved page is now,
  // so the next edit to it copies nothing old out over the template and its
  // client.
  const ownSharedNow = plainOf((await tool(COACH, "read_journal", { journal: ownId })).json).find((m: Loose) => m.page === ownFront.page);
  const apart = await tool(COACH, "update_module", { module: ownSharedNow.module, settings: { heading: "Taken apart again" }, linked: "just_here" });
  const copyFront = await prisma.page.findFirstOrThrow({ where: { plannerId: copyId, savedPageId: sharedPage.id }, include: { moduleInstances: true } });
  const copyFrontBox = copyFront.moduleInstances.find((m) => m.columnStart === ownSharedNow.place.column && m.rowStart === ownSharedNow.place.row)!;
  await prisma.moduleInstance.update({ where: { id: copyFrontBox.id }, data: { propValues: { ...(copyFrontBox.propValues as object), heading: "Week goals" } } });
  await syncLinkedPages([copyFront.id]);
  const clientWithGoals = await contentOf(clientJournalId);
  const apartUndo = await tool(COACH, "undo_changes", { journal: ownId });
  const ownFrontBack = await prisma.page.findUniqueOrThrow({ where: { id: ownFront.page }, include: { moduleInstances: true } });
  say(
    !apart.error && !apartUndo.error && ownFrontBack.savedPageId === sharedPage.id && ownFrontBack.moduleInstances.some((m) => headingOf(m) === "Week goals") && /Coach's front page/.test(apartUndo.json.note ?? ""),
    `UNDO PUTS A PAGE IT TOOK APART BACK AS THE TEMPLATE HAS IT NOW, the template's edit since and all, and says so${apartUndo.error ? `: ${apartUndo.text}` : ""}`
  );
  await syncLinkedPages([ownFront.page]);
  const copyFrontAfter = await prisma.moduleInstance.findMany({ where: { pageId: copyFront.id } });
  say((await contentOf(clientJournalId)) === clientWithGoals && copyFrontAfter.some((m) => headingOf(m) === "Week goals"), "and the next edit to it copies nothing old out: the template's edit and its client's journal stay as they were");

  // THROUGH A MODULE'S PAGE (review, 2026-11-04): a saved module whose other
  // use sits on the coach's own page linked to the saved page the copy uses,
  // and out of step with it (the copy's lacks the module). Changing the
  // module everywhere copies that page out, into the copy and its client.
  const ownOutline = (await tool(COACH, "read_journal", { journal: ownId })).json;
  const elsewhereBox = plainOf(ownOutline).find((m: Loose) => m.page !== ownFront.page)!;
  const coachWater = await saveModuleAs(COACH, elsewhereBox.module, "Coach's water");
  const elsewhereRow = await prisma.moduleInstance.findUniqueOrThrow({ where: { id: elsewhereBox.module } });
  const outOfStep = await prisma.moduleInstance.create({
    data: { pageId: ownFront.page, moduleTypeId: elsewhereRow.moduleTypeId, placementMode: "GRID", columnStart: 0, rowStart: 40, columnSpan: elsewhereRow.columnSpan, rowSpan: elsewhereRow.rowSpan, propValues: elsewhereRow.propValues as object, savedModuleId: coachWater.id },
  });
  const clientBeforeHop = await contentOf(clientJournalId);
  const hop = await tool(COACH, "update_module", { module: elsewhereBox.module, settings: { heading: "Spread from a chat" }, linked: "everywhere" });
  say(
    hop.error && /coaching business/.test(hop.text) && (await contentOf(clientJournalId)) === clientBeforeHop,
    `A SAVED MODULE WHOSE OTHER USE IS ON A PAGE SHARED WITH A TEMPLATE WITH CLIENTS ISN'T CHANGED EVERYWHERE: "${hop.text.slice(0, 80)}..."`
  );
  await prisma.moduleInstance.delete({ where: { id: outOfStep.id } });

  // A journal of the coach's own makes a template too, and keeps none of its links.
  const fromOwn = await tool(COACH, "copy_template", { journal: ownId, title: "From my own" });
  const fromOwnPages = await pagesOf(fromOwn.json.journal ?? "none");
  say(!fromOwn.error && fromOwn.json.title === "From my own" && fromOwnPages.length > 0 && linksOf(fromOwnPages).length === 0, `copy_template makes one from the coach's own journal too, unlinked${fromOwn.error ? `: ${fromOwn.text}` : ""}`);

  // EVERYWHERE WHILE IT HAD NO CLIENTS, AND THEN IT DID (review, 2026-11-04):
  // a page of the coach's own, saved and used in a template with no clients,
  // changed everywhere from a chat; then a client arrives on the template.
  // Undo would copy it back out into them, and kept apart, the coach's page
  // would stay linked to a saved page it no longer matched, for its next edit
  // to copy out: refused, naming the template.
  const fromOwnId: string = fromOwn.json.journal;
  const weekPage = ownOutline.pages.find((p: Loose) => p.level === "week" && p.modules.some((m: Loose) => !m.locked && "heading" in m.settings && m.module !== elsewhereBox.module));
  const weekBox = weekPage.modules.find((m: Loose) => !m.locked && "heading" in m.settings && m.module !== elsewhereBox.module);
  const ownWeek = await savePagesAs(COACH, [weekPage.page], "Coach's week");
  await asConnectedOwner(COACH, () => addSavedPageToSet(COACH, fromOwnId, "FRONT_MATTER", null, ownWeek.id));
  await prisma.journalAiRun.updateMany({ where: { plannerId: ownId, undoneAt: null }, data: { lastChangeAt: new Date(Date.now() - RUN_IDLE_MS - 60_000) } });
  const outThere = await tool(COACH, "update_module", { module: weekBox.module, settings: { heading: "Out to the template" }, linked: "everywhere" });
  const fromOwnRow = await prisma.businessTemplate.findUniqueOrThrow({ where: { plannerId: fromOwnId } });
  const laterClient = await prisma.businessClient.create({ data: { businessId: business.id, name: "Later client", templateId: fromOwnRow.id } });
  const laterJournal = await buildClientJournal(COACH, laterClient.id);
  const laterAtStart = await contentOf(laterJournal);
  const ownBeforeUndo = await printOf(ownId);
  const refusedOut = await tool(COACH, "undo_changes", { journal: ownId });
  const refusedDirect = await undoRun(COACH, ownId, { evenEditsSince: true });
  say(
    !outThere.error && refusedOut.error && /"From my own"/.test(refusedOut.text) && /has clients now/.test(refusedOut.text) && refusedDirect.status === "reached-clients",
    `A CHANGE THAT WENT OUT TO A TEMPLATE BEFORE IT HAD CLIENTS ISN'T UNDONE ONCE IT HAS, here or in the editor: "${(outThere.error ? outThere.text : refusedOut.text).slice(0, 110)}..."`
  );
  say((await printOf(ownId)) === ownBeforeUndo, "and nothing was put back");
  await syncLinkedPages([weekPage.page]);
  say((await contentOf(laterJournal)) === laterAtStart, "so the coach's page still matches the template, and its next edit changes nothing in the client's journal");

  // TWO COPIES OF ONE TEMPLATE ARE TOLD APART (review, 2026-11-04).
  const secondCopy = await tool(COACH, "copy_template", { journal: templateId });
  say(!secondCopy.error && secondCopy.json.title === "Coach template (copy 2)", `A SECOND COPY OF A TEMPLATE IS NUMBERED: "${secondCopy.json.title ?? secondCopy.text}"`);
  // A CLIENT MOVED ON WHILE UNDO IS UNDER WAY (review, 2026-11-04): the move
  // is held open here, past undo's first count, as a slow one would be.
  const raceId: string = secondCopy.json.journal;
  const raceBox = plainOf((await tool(COACH, "read_journal", { journal: raceId })).json)[0];
  await tool(COACH, "update_module", { module: raceBox.module, settings: { heading: "Changed by the chat" } });
  const raceRow = await prisma.businessTemplate.findUniqueOrThrow({ where: { plannerId: raceId } });
  const arriving = await prisma.businessClient.create({ data: { businessId: business.id, name: "Arriving" } });
  let letGo = () => {};
  let holding = () => {};
  const held = new Promise<void>((resolve) => (holding = resolve));
  const moving = prisma.$transaction(
    async (tx) => {
      await tx.businessClient.update({ where: { id: arriving.id }, data: { templateId: raceRow.id } });
      holding();
      await new Promise<void>((resolve) => (letGo = resolve));
    },
    { timeout: 30_000 }
  );
  await held;
  const raceBefore = await printOf(raceId);
  const racing = undoRun(COACH, raceId);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  letGo();
  await moving;
  const raced = await racing;
  say(raced.status === "has-clients" && (await printOf(raceId)) === raceBefore, `A CLIENT MOVED ON WHILE UNDO IS UNDER WAY IS SEEN, AND NOTHING IS PUT BACK (${raced.status})`);

  // ARCHIVED CLIENTS DON'T COUNT, as on Templates (review, 2026-11-04): the
  // original, its client moved to the copy, has only an archived one now.
  await prisma.businessClient.create({ data: { businessId: business.id, name: "Archived", templateId: template.id, archivedAt: new Date() } });
  const archivedRead = await tool(COACH, "read_journal", { journal: templateId });
  const archivedListed = (await tool(COACH, "list_journals")).json.journals.find((j: Loose) => j.journal === templateId);
  say(!archivedRead.error && archivedListed?.clients === 0, `A TEMPLATE WHOSE ONLY CLIENT IS ARCHIVED CAN BE READ, AND IS LISTED WITH NONE, as Templates shows it${archivedRead.error ? `: ${archivedRead.text}` : ""}`);

  // A runaway chat.
  await prisma.planner.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ ownerId: SOMEONE, title: `Filler ${i}` })) });
  const tooMany = await tool(SOMEONE, "create_planner", { title: "One too many", answers: {} });
  say(tooMany.error && /can't make more than 20 in a day/.test(tooMany.text), `an assistant can only make so many journals in a day: "${tooMany.text.slice(0, 90)}..."`);
  // and a cohort's journals, built by the coach today, aren't counted (review, 2026-11-04)
  for (let i = 0; i < 20; i++) {
    const built = await prisma.planner.create({ data: { ownerId: COACH, title: `Cohort ${i}` } });
    await prisma.businessClient.create({ data: { businessId: business.id, name: `Cohort ${i}`, plannerId: built.id } });
  }
  const afterCohort = await tool(COACH, "copy_template", { journal: templateId, title: "After the cohort" });
  say(!afterCohort.error, `CLIENTS' JOURNALS BUILT TODAY DON'T COUNT TOWARD AN ASSISTANT'S NEW JOURNALS: a copy is still made after 20${afterCohort.error ? `: ${afterCohort.text}` : ""}`);

  // Who is asking.
  const outside = await currentOwner().catch(() => null);
  const inside = await asConnectedOwner(ME, () => currentOwner());
  say(outside === null && inside?.id === ME && inside.guest === false, "a connected assistant is its account for one call and nobody outside it");
  class PrismaClientKnownRequestError extends Error {}
  say(!/secret/.test(sayFailure("t", new PrismaClientKnownRequestError("secret table name"))), "a database's own error is never passed on");
  say(sayFailure("t", new ToolError("in words")) === "in words", "a refusal is, in its own words");

  // ------------------------------------------------------- THE ROUTE ITSELF
  const route = `${server.base}/mcp`;
  const post = (headers: Record<string, string> = {}) =>
    fetch(route, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
  const bare = await post();
  const challenge = bare.headers.get("www-authenticate") ?? "";
  say(bare.status === 401 && challenge.includes("/.well-known/oauth-protected-resource/mcp"), "the running route: no token, 401, pointing at the sign-in details");
  say((await post({ authorization: "Bearer not-a-token" })).status === 401, "a made-up token: 401");
  const guest = await makeGuestJournal("Connector guest");
  guests.push(guest);
  say((await post({ cookie: guest.cookie })).status === 401, "a guest's cookie: 401, a guest can't connect");
  const metadata = await fetch(`${server.base}/.well-known/oauth-protected-resource/mcp`);
  const resource = (await metadata.json()) as { resource?: string; authorization_servers?: string[] };
  say(metadata.status === 200 && !!resource.resource?.endsWith("/mcp") && /^https:\/\/.+/.test(resource.authorization_servers?.[0] ?? ""), `the sign-in details name this address and ${resource.authorization_servers?.[0]}`);
  say(metadata.headers.get("access-control-allow-origin") === "*", "and can be read from anywhere");
  const issuer = await fetch(`${server.base}/.well-known/oauth-authorization-server`);
  say(issuer.status === 200 || issuer.status === 502, `Clerk's details are repeated here for older assistants (${issuer.status})`);

  // ------------------------------------------------------------- THE EDITOR
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addCookies([{ name: guest.cookieName, value: guest.cookieValue, domain: new URL(server.base).hostname, path: "/" }]);
  await context.addInitScript(`addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal { display: none !important; }"; document.head.append(s); });`);
  const tab = await context.newPage();
  await tab.goto(`${server.base}/app/j/${guest.journalId}`, { waitUntil: "networkidle", timeout: 120_000 });
  await tab.waitForSelector("header", { timeout: 60_000 });
  await tab.waitForTimeout(1500);
  const bar = tab.locator("[data-ai-changes]");
  say((await bar.count()) === 0, "the editor shows nothing when no assistant has been here");
  // The guest stands in for an account here: the tools ask only whose journal it is.
  const guestOutline = (await tool(guest.ownerId, "read_journal", { journal: guest.journalId })).json;
  const guestPage = guestOutline.pages.find((p: { level: string; where: string }) => p.level === "week" && p.where === "right");
  const guestAdded = await tool(guest.ownerId, "add_module", { page: guestPage.page, type: "labeled-box", position: { zone: "main" }, settings: { heading: "From the chat" } });
  say(!guestAdded.error, `(an assistant changes the open journal${guestAdded.error ? `: ${guestAdded.text}` : ""})`);
  await tab.evaluate(() => window.dispatchEvent(new Event("focus")));
  await bar.waitFor({ timeout: 15_000 });
  await tab.waitForTimeout(800);
  say((await bar.innerText()).includes("1 change"), `coming back to the editor, it says so: "${(await bar.innerText()).replace(/\s+/g, " ")}"`);
  const seesIt = () => tab.evaluate(() => /from the chat/i.test(document.documentElement.textContent ?? ""));
  await tab.waitForFunction(() => /from the chat/i.test(document.documentElement.textContent ?? ""), undefined, { timeout: 15_000 }).catch(() => {});
  say(await seesIt(), "and the module it added is drawn, with no reload");
  if (shots) await tab.screenshot({ path: `${shots}/connector-editor-bar.png` });
  await bar.getByRole("button", { name: /your assistant made/i }).click();
  await tab.waitForTimeout(200);
  say((await bar.innerText()).includes("Added"), "what changed can be read there");
  if (shots) await tab.screenshot({ path: `${shots}/connector-editor-list.png` });
  await bar.getByRole("button", { name: /^undo/i }).click();
  await tab.waitForFunction(() => !document.querySelector("[data-ai-changes]"), undefined, { timeout: 15_000 });
  say((await prisma.moduleInstance.count({ where: { id: guestAdded.json.module } })) === 0, "and undo there takes it back, and the bar goes");
  await tab.waitForFunction(() => !/from the chat/i.test(document.documentElement.textContent ?? ""), undefined, { timeout: 15_000 }).catch(() => {});
  say(!(await seesIt()), "and it comes off the page");
  await tool(guest.ownerId, "update_journal", { journal: guest.journalId, title: "Renamed by the chat" });
  await tab.evaluate(() => window.dispatchEvent(new Event("focus")));
  await bar.waitFor({ timeout: 15_000 });
  await tab.waitForTimeout(800);
  await prisma.planner.update({ where: { id: guest.journalId }, data: { title: "Connector guest" } });
  await bar.getByRole("button", { name: /your assistant made/i }).click();
  await bar.getByRole("button", { name: /^undo/i }).click();
  await tab.getByText(/also been edited/i).waitFor({ timeout: 15_000 });
  say(true, "a hand edit since is asked about in the editor too");
  if (shots) await tab.screenshot({ path: `${shots}/connector-editor-ask.png` });
  await context.close();
} finally {
  await browser.close();
  for (const guest of guests) await guest.remove().catch(() => {});
  await prisma.businessClient.deleteMany({ where: { business: { ownerId: { in: OWNERS } } } });
  await prisma.businessTemplate.deleteMany({ where: { business: { ownerId: { in: OWNERS } } } });
  await prisma.business.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.planner.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.savedPage.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.savedModule.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.calendarEvent.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.calendar.deleteMany({ where: { ownerId: { in: OWNERS } } });
  await prisma.ownerSettings.deleteMany({ where: { ownerId: { in: OWNERS } } });
  server.stop();
  await disconnect();
}

console.log(failures ? `\n${failures} FAILED` : "\nThe connector holds.");
process.exit(failures ? 1 : 0);

// WHAT A CONNECTED ASSISTANT CHANGED, AND THE WAY BACK (2026-11-02; the plan is
// handoff/research/ai-chat-plan-2026-10-28.md, "Editing existing planners").
//
// The editor's undo stack lives in the browser and never hears of a change an
// assistant made, so taking one back has to live on the server. Before an
// assistant's first change to a journal the whole journal is copied into a run
// (JournalAiRun); each change adds a line in plain words; "Undo this chat's
// changes", in the chat or in the editor, puts the copy back.
//
// A connector has NO SESSIONS to hang this on: the protocol's requests are
// stateless and name no chat. So a run is a stretch of time, ended by RUN_IDLE_MS
// of quiet or by being undone. Two chats on one journal inside that stretch
// share a run, and undoing takes back both, which the editor's bar says.
//
// SAME IDS COME BACK. A restored page and module keep their ids, so the
// references an assistant is still holding go on working, and so does anything
// else that names a page.
//
// LINKED ITEMS UNDO EVERYWHERE, because they changed everywhere: once the
// journal's own pages are back, syncLinkedPages copies them out over the other
// uses again (savedItems.ts), and a linked module's settings go back out through
// spreadSavedModuleProps, with the linked pages that hold it after them.
// Calendar events belong to a person rather than a journal, so the run lists
// the ones it made and undo removes those.
//
// ONLY WHAT WENT OUT COMES BACK OUT (review, 2026-11-04). A page or module the
// run changed while it was linked took that change everywhere, so the copy
// before it goes back everywhere. One it took apart ("just here") or removed
// sent nothing out, and its saved item may have been changed by hand in
// another use since, which this journal's fingerprint can't see: put back from
// the copy and linked again, it was stale, and either copied out over that
// hand edit at once or, left alone, copied out with the next edit made to it.
// So it comes back as its saved item is now, which is what it would show had
// the run never taken it apart, and undo says so. Nothing is copied out for it.
//
// NEVER INTO A COACH'S CLIENTS (2026-11-04). A run on a coach's template is
// allowed while it has no clients (tools.ts). Once clients are moved onto it,
// their journals follow it through links made since the run began, so putting
// the copy back would undo those links and copy the template out over their
// pages: undo is refused, in the editor too, and the coach changes it by hand
// as any edit to a template. The count is made again inside undo's own
// transaction, with the template held against clients arriving
// (businessReach.ts holdTemplate), so one moved on in the middle is seen.
// And where undoing would copy something back out to a template that has
// clients (a linked page or module the run changed everywhere while that
// template had none), undo is refused too, naming it: copied out, it would
// reach their journals, and kept apart, this journal would stay linked to a
// saved item it no longer matched, which its next edit would copy out over
// the template and every client.
//
// A plain server module, like savedItems.ts: it trusts the plannerId it is
// handed. The tools and the editor's actions check who is asking first.

import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { contentOf, slotsOf, spreadSavedModuleProps, syncLinkedPages, writeSlots, type ModuleSlot } from "@/app/planner/savedItems";
import { ASK_KEY, withAsk } from "@/lib/clientAnswers";
import { clientsOfTemplate, holdTemplate, moduleReach, pageReach } from "./businessReach";

/** How long an assistant can be quiet before its next change starts a new run:
 *  long enough to cover a chat left for lunch, short enough that next week's
 *  undo doesn't take back this week's work. */
export const RUN_IDLE_MS = 6 * 60 * 60 * 1000;
/** Runs kept per journal. A run holds a whole journal, so they are pruned
 *  whenever a new one starts, not by a job. */
const RUNS_KEPT = 5;
/** Changes this close together are one assistant's calls overlapping. */
const PARALLEL_MS = 15_000;

const SNAPSHOT_SELECT = {
  title: true,
  dated: true,
  startDate: true,
  endDate: true,
  timeZone: true,
  theme: true,
  pages: {
    select: {
      id: true,
      level: true,
      variantKey: true,
      position: true,
      widthPx: true,
      heightPx: true,
      gridColumns: true,
      gridRows: true,
      gridGapPx: true,
      marginPx: true,
      savedPageId: true,
      savedPageIndex: true,
      moduleInstances: {
        select: {
          id: true,
          moduleTypeId: true,
          placementMode: true,
          locked: true,
          x: true,
          y: true,
          width: true,
          height: true,
          columnStart: true,
          rowStart: true,
          columnSpan: true,
          rowSpan: true,
          zIndex: true,
          propValues: true,
          savedModuleId: true,
        },
      },
    },
  },
} satisfies Prisma.PlannerSelect;

type Db = Prisma.TransactionClient | typeof prisma;
type StoredPlanner = Prisma.PlannerGetPayload<{ select: typeof SNAPSHOT_SELECT }>;
/** A journal as it stood: what `before` holds. Its dates are strings, as JSON
 *  keeps them. */
export type JournalSnapshot = Omit<StoredPlanner, "startDate" | "endDate"> & { startDate: string | null; endDate: string | null };

/** The journal, in an order that does not depend on how it was read. */
export async function readSnapshot(db: Db, plannerId: string): Promise<JournalSnapshot> {
  const planner = await db.planner.findUniqueOrThrow({ where: { id: plannerId }, select: SNAPSHOT_SELECT });
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => (a.id < b.id ? -1 : 1));
  return {
    ...planner,
    startDate: planner.startDate?.toISOString() ?? null,
    endDate: planner.endDate?.toISOString() ?? null,
    pages: byId(planner.pages).map((page) => ({ ...page, moduleInstances: byId(page.moduleInstances) })),
  };
}

/** JSON with its keys sorted at every depth: Postgres keeps a JSONB object's
 *  keys in an order of its own, so the same settings can read back differently
 *  from how they were written. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, inner]) => [key, canonical(inner)])
    );
  }
  return value;
}

export function fingerprintOf(snapshot: JournalSnapshot): string {
  return createHash("sha256").update(JSON.stringify(canonical(snapshot))).digest("hex");
}

/** A journal's live runs, oldest first. More than one only when two first
 *  changes raced, each making its own; undo goes back to the oldest. */
function openRuns(db: Db, plannerId: string, now = Date.now()) {
  return db.journalAiRun.findMany({
    where: { plannerId, undoneAt: null, lastChangeAt: { gte: new Date(now - RUN_IDLE_MS) } },
    orderBy: { startedAt: "asc" },
    select: { id: true, changes: true, eventIds: true, afterHash: true, editedBetween: true, before: true, touchedAt: true },
  });
}

/** Start a run if none is open: the journal copied BEFORE the change it is
 *  for. Old runs go here too, since this is the only moment they grow.
 *
 *  A RUN ALREADY OPEN is checked for edits by hand since its last change. The
 *  next change moves the fingerprint on, so this is the last moment they can be
 *  seen, and undo would otherwise take them back without a word. Not within
 *  PARALLEL_MS of another change beginning: an assistant can send several at
 *  once, and one still landing would look like a hand. */
async function runForChange(plannerId: string): Promise<{ id: string; isNew: boolean }> {
  const open = await openRuns(prisma, plannerId);
  if (open.length > 0) {
    const run = open[open.length - 1];
    const quiet = Date.now() - run.touchedAt.getTime() > PARALLEL_MS;
    await prisma.journalAiRun.update({ where: { id: run.id }, data: { touchedAt: new Date() } });
    if (quiet && !run.editedBetween && run.afterHash && run.afterHash !== fingerprintOf(await readSnapshot(prisma, plannerId))) {
      await prisma.journalAiRun.update({ where: { id: run.id }, data: { editedBetween: true } });
    }
    return { id: run.id, isNew: false };
  }
  const before = await readSnapshot(prisma, plannerId);
  const run = await prisma.journalAiRun.create({
    data: { plannerId, before: before as unknown as Prisma.InputJsonValue },
    select: { id: true },
  });
  const old = await prisma.journalAiRun.findMany({
    where: { plannerId },
    orderBy: { startedAt: "desc" },
    skip: RUNS_KEPT,
    select: { id: true },
  });
  if (old.length > 0) await prisma.journalAiRun.deleteMany({ where: { id: { in: old.map((row) => row.id) } } });
  return { id: run.id, isNew: true };
}

/**
 * Do `work` as one change in the journal's run, recorded as `what`. A change
 * that throws records nothing, and takes back a run made only for it, so a
 * refused edit never leaves "Undo" offered with nothing to undo.
 */
export async function recordedChange<T>(
  plannerId: string,
  what: string | ((result: T) => string),
  work: () => Promise<T>,
  { eventId }: { eventId?: (result: T) => string } = {}
): Promise<T> {
  const run = await runForChange(plannerId);
  let result: T;
  try {
    result = await work();
  } catch (error) {
    if (run.isNew) await prisma.journalAiRun.deleteMany({ where: { id: run.id } });
    throw error;
  }
  const line = typeof what === "string" ? what : what(result);
  const after = fingerprintOf(await readSnapshot(prisma, plannerId));
  const event = eventId ? [eventId(result)] : [];
  // In one statement, not read-then-write: an assistant can send several
  // changes at once, and each one's line has to survive the others.
  await prisma.$executeRaw`
    UPDATE "JournalAiRun"
    SET "changes" = "changes" || ${JSON.stringify([line])}::jsonb,
        "eventIds" = "eventIds" || ${event}::text[],
        "afterHash" = ${after},
        "lastChangeAt" = ${new Date()}
    WHERE "id" = ${run.id}`;
  return result;
}

export type AiRunStatus = {
  /** When an assistant last changed or undid anything here: the editor reads
   *  this to know its pages are out of date. Null if it never has. */
  changedAt: string | null;
  /** What the open run changed, oldest first; empty when there's nothing left
   *  to undo. */
  changes: string[];
  /** Clients on this template now: more than none, and the changes can't be
   *  undone (undoRun). */
  clients: number;
};

export async function aiRunStatus(plannerId: string): Promise<AiRunStatus> {
  const latest = await prisma.journalAiRun.findFirst({
    where: { plannerId },
    orderBy: { lastChangeAt: "desc" },
    select: { lastChangeAt: true },
  });
  const open = await prisma.journalAiRun.findMany({
    where: { plannerId, undoneAt: null, lastChangeAt: { gte: new Date(Date.now() - RUN_IDLE_MS) } },
    orderBy: { startedAt: "asc" },
    select: { changes: true },
  });
  const changes = open.flatMap((run) => run.changes as string[]);
  return { changedAt: latest?.lastChangeAt.toISOString() ?? null, changes, clients: changes.length ? await clientsOfTemplate(plannerId) : 0 };
}

export type UndoResult =
  | { status: "nothing" }
  /** A coach's template that clients have been moved onto since: undoing
   *  would reach their journals, so it is never done, asked or not. */
  | { status: "has-clients"; changes: string[]; clients: number }
  /** Undoing would copy something back out to a template that has clients
   *  now, through a page or module saved and used in it too (the header). */
  | { status: "reached-clients"; changes: string[]; templates: string[] }
  /** Someone has edited it by hand since: undoing would lose that too. */
  | { status: "edited-since"; changes: string[] }
  /** `asSavedNow`: the saved items that came back as they are now, by name,
   *  having been changed elsewhere since the run took them apart here. */
  | { status: "undone"; changes: string[]; asSavedNow: string[] };

class ClientsArrived extends Error {
  constructor(readonly clients: number) {
    super("Clients were moved onto this template.");
  }
}
class EditedMeanwhile extends Error {}

/** Put the journal back as it was before the open run. */
export async function undoRun(ownerId: string, plannerId: string, { evenEditsSince = false }: { evenEditsSince?: boolean } = {}): Promise<UndoResult> {
  const runs = await openRuns(prisma, plannerId);
  if (runs.length === 0) return { status: "nothing" };
  const changes = runs.flatMap((run) => run.changes as string[]);
  const clients = await clientsOfTemplate(plannerId);
  if (clients > 0) return { status: "has-clients", changes, clients };
  const lastHash = runs[runs.length - 1].afterHash;
  const now = await readSnapshot(prisma, plannerId);
  if (!evenEditsSince && (runs.some((run) => run.editedBetween) || (lastHash && lastHash !== fingerprintOf(now)))) {
    return { status: "edited-since", changes };
  }
  const before = runs[0].before as unknown as JournalSnapshot;
  const plan = await planLinks(ownerId, plannerId, before, now);
  if (plan.reached) return { status: "reached-clients", changes, templates: [...plan.templates] };
  try {
    await prisma.$transaction(
      async (tx) => {
        await holdTemplate(tx, plannerId);
        const arrived = await clientsOfTemplate(plannerId, tx);
        if (arrived > 0) throw new ClientsArrived(arrived);
        // as the plan was made from it, still
        if (fingerprintOf(await readSnapshot(tx, plannerId)) !== fingerprintOf(now)) throw new EditedMeanwhile();
        await restore(tx, ownerId, plannerId, before, plan);
        const eventIds = runs.flatMap((run) => run.eventIds);
        if (eventIds.length > 0) await tx.calendarEvent.deleteMany({ where: { id: { in: eventIds }, ownerId } });
        await tx.journalAiRun.updateMany({ where: { id: { in: runs.map((run) => run.id) } }, data: { undoneAt: new Date(), lastChangeAt: new Date() } });
      },
      { timeout: 30_000 }
    );
  } catch (error) {
    if (error instanceof ClientsArrived) return { status: "has-clients", changes, clients: error.clients };
    if (error instanceof EditedMeanwhile) return { status: "edited-since", changes };
    throw error;
  }
  // Out to the other uses of what went out, now that this journal's are
  // right. Linked modules first, then every linked page elsewhere that holds a
  // use of one (review, 2026-11-04: the editor's own edit copies those out,
  // and undo didn't, so their saved page kept the run's settings), then this
  // journal's own.
  const restored = new Map(before.pages.flatMap((page) => page.moduleInstances.map((mi) => [mi.id, mi] as const)));
  const spreads = new Map(plan.modulesOut.map((id) => [restored.get(id)!.savedModuleId!, restored.get(id)!]));
  const outward = new Set(plan.pagesOut);
  const ownPages = new Set(before.pages.map((page) => page.id));
  for (const [savedModuleId, mi] of spreads) {
    const touched = await spreadSavedModuleProps(ownerId, savedModuleId, mi.propValues as Prisma.InputJsonValue, plannerId);
    const linked = await prisma.page.findMany({ where: { id: { in: touched }, savedPageId: { not: null } }, select: { id: true, plannerId: true, savedPageId: true, savedPageIndex: true } });
    for (const page of linked) {
      if (ownPages.has(page.id) || (await pageReach(page, ownerId)).business) continue;
      outward.add(page.id);
    }
  }
  await syncLinkedPages(outward);
  return { status: "undone", changes, asSavedNow: [...new Set(plan.asSavedNow)] };
}

/** What undo does with each linked page and module of `before` (the header):
 *  copy it out after, put it back as its saved item is now, or neither; and
 *  whether copying out would reach a template with clients, which stops it. */
type LinkPlan = {
  pagesOut: string[];
  modulesOut: string[];
  pagesFromSaved: Map<string, ModuleSlot[]>;
  propsFromSaved: Map<string, Prisma.InputJsonValue>;
  asSavedNow: string[];
  reached: boolean;
  templates: Set<string>;
};

/** One page's modules, in a form that doesn't depend on how they were read
 *  or stored. */
const slotsKey = (slots: ModuleSlot[]) =>
  slots
    .map((slot) => JSON.stringify(canonical(slot)))
    .sort()
    .join("\n");

/** A module's settings, without the question it carries: that is one use's,
 *  never the saved module's (spreadSavedModuleProps). */
function propsKey(props: unknown): string {
  const plain = { ...((props ?? {}) as Record<string, unknown>) };
  delete plain[ASK_KEY];
  return JSON.stringify(canonical(plain));
}

async function planLinks(ownerId: string, plannerId: string, before: JournalSnapshot, now: JournalSnapshot): Promise<LinkPlan> {
  const plan: LinkPlan = { pagesOut: [], modulesOut: [], pagesFromSaved: new Map(), propsFromSaved: new Map(), asSavedNow: [], reached: false, templates: new Set() };
  const savedPages = new Map(
    (await prisma.savedPage.findMany({ where: { id: { in: before.pages.flatMap((page) => page.savedPageId ?? []) } }, select: { id: true, name: true, content: true } })).map((row) => [row.id, row])
  );
  const savedModules = new Map(
    (
      await prisma.savedModule.findMany({
        where: { id: { in: before.pages.flatMap((page) => page.moduleInstances.flatMap((mi) => mi.savedModuleId ?? [])) } },
        select: { id: true, name: true, propValues: true },
      })
    ).map((row) => [row.id, row])
  );
  const typeIds = [...new Set([...before.pages, ...now.pages].flatMap((page) => page.moduleInstances.map((mi) => mi.moduleTypeId)))];
  const slugOf = new Map((await prisma.moduleType.findMany({ where: { id: { in: typeIds } }, select: { id: true, slug: true } })).map((type) => [type.id, type.slug]));
  const keyOf = (modules: JournalSnapshot["pages"][number]["moduleInstances"]) => slotsKey(slotsOf(modules.map((mi) => ({ ...mi, moduleType: { slug: slugOf.get(mi.moduleTypeId) ?? "" } }))));
  const nowPages = new Map(now.pages.map((page) => [page.id, page]));
  const nowModules = new Map(now.pages.flatMap((page) => page.moduleInstances.map((mi) => [mi.id, mi] as const)));
  const stop = (templates: string[]) => {
    plan.reached = true;
    for (const name of templates) plan.templates.add(name);
  };

  for (const page of before.pages) {
    const saved = page.savedPageId ? savedPages.get(page.savedPageId) : undefined;
    if (!saved) continue;
    const current = nowPages.get(page.id);
    const was = keyOf(page.moduleInstances);
    if (current && current.savedPageId === page.savedPageId && current.savedPageIndex === page.savedPageIndex) {
      // still linked: whatever changed on it went out with it
      if (keyOf(current.moduleInstances) === was) continue;
      const reach = await pageReach({ id: page.id, plannerId, savedPageId: page.savedPageId, savedPageIndex: page.savedPageIndex }, ownerId);
      if (reach.business) stop(reach.templates);
      else plan.pagesOut.push(page.id);
    } else {
      // taken apart here, or removed: nothing of the run's went out through it
      const theirs = contentOf(saved.content).pages[page.savedPageIndex ?? 0];
      if (!theirs || slotsKey(theirs) === was) continue;
      plan.pagesFromSaved.set(page.id, theirs);
      plan.asSavedNow.push(`the saved page "${saved.name}"`);
    }
  }
  for (const page of before.pages) {
    // a page put back as its saved page is now has that page's modules
    if (plan.pagesFromSaved.has(page.id)) continue;
    for (const mi of page.moduleInstances) {
      const saved = mi.savedModuleId ? savedModules.get(mi.savedModuleId) : undefined;
      if (!saved) continue;
      const current = nowModules.get(mi.id);
      const was = propsKey(mi.propValues);
      if (current && current.savedModuleId === mi.savedModuleId) {
        if (propsKey(current.propValues) === was) continue;
        const reach = await moduleReach(mi, plannerId, ownerId);
        if (reach.business) stop(reach.templates);
        else plan.modulesOut.push(mi.id);
      } else {
        if (propsKey(saved.propValues) === was) continue;
        plan.propsFromSaved.set(mi.id, withAsk(mi.propValues, (saved.propValues ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue);
        plan.asSavedNow.push(`the saved module "${saved.name}"`);
      }
    }
  }
  return plan;
}

/** Everything `before` holds, written back. Pages keep their ids, and modules
 *  are written afresh under theirs, but for what `plan` puts back as its saved
 *  item is now. A saved item deleted since cannot be linked to again; the page
 *  or module stays, as a deleted saved item leaves them. */
async function restore(tx: Prisma.TransactionClient, ownerId: string, plannerId: string, before: JournalSnapshot, plan: LinkPlan) {
  const savedPages = new Set(
    (await tx.savedPage.findMany({ where: { id: { in: before.pages.flatMap((page) => page.savedPageId ?? []) } }, select: { id: true } })).map((row) => row.id)
  );
  const savedModules = new Set(
    (
      await tx.savedModule.findMany({
        where: { id: { in: before.pages.flatMap((page) => page.moduleInstances.flatMap((mi) => mi.savedModuleId ?? [])) } },
        select: { id: true },
      })
    ).map((row) => row.id)
  );
  await tx.moduleInstance.deleteMany({ where: { page: { plannerId } } });
  await tx.page.deleteMany({ where: { plannerId, id: { notIn: before.pages.map((page) => page.id) } } });
  // Positions are unique within a set, so what stayed moves out of the way
  // first, as deletePageFromLevel does: negative positions are free.
  const stayed = await tx.page.findMany({ where: { plannerId }, select: { id: true } });
  for (const [index, page] of stayed.entries()) {
    await tx.page.update({ where: { id: page.id }, data: { position: -1 - index } });
  }
  for (const page of before.pages) {
    const linked = !!page.savedPageId && savedPages.has(page.savedPageId);
    const data = {
      level: page.level,
      variantKey: page.variantKey,
      position: page.position,
      widthPx: page.widthPx,
      heightPx: page.heightPx,
      gridColumns: page.gridColumns,
      gridRows: page.gridRows,
      gridGapPx: page.gridGapPx,
      marginPx: page.marginPx,
      savedPageId: linked ? page.savedPageId : null,
      savedPageIndex: linked ? page.savedPageIndex : null,
    };
    await tx.page.upsert({ where: { id: page.id }, update: data, create: { id: page.id, plannerId, ...data } });
  }
  const rows = before.pages
    .filter((page) => !plan.pagesFromSaved.has(page.id))
    .flatMap((page) =>
      page.moduleInstances.map((mi) => ({
        ...mi,
        pageId: page.id,
        propValues: plan.propsFromSaved.get(mi.id) ?? (mi.propValues as Prisma.InputJsonValue),
        savedModuleId: mi.savedModuleId && savedModules.has(mi.savedModuleId) ? mi.savedModuleId : null,
      }))
    );
  if (rows.length > 0) await tx.moduleInstance.createMany({ data: rows });
  for (const [pageId, slots] of plan.pagesFromSaved) await writeSlots(tx, pageId, ownerId, slots);
  await tx.planner.update({
    where: { id: plannerId },
    data: {
      title: before.title,
      dated: before.dated,
      startDate: before.startDate ? new Date(before.startDate) : null,
      endDate: before.endDate ? new Date(before.endDate) : null,
      timeZone: before.timeZone,
      theme: before.theme === null ? Prisma.DbNull : (before.theme as Prisma.InputJsonValue),
    },
  });
}

// memari. for businesses - INTAKE THAT FILLS THE BOOK (v2, 2026-10-31: his
// "all" for v2, after groups). The coach asks a few questions of each
// client; the client answers on their own page (/c/<token>), and each
// answer prints in the module of their template the coach chose - "My
// three goals" filled with their three goals.
//
// A QUESTION IS A MODULE. The coach marks one of the template's modules
// (templateQuestions.ts); it carries the question's id in its settings
// (propValues.askId), and every client's copy of the page carries it too,
// as a copy carries all its settings. The answer fills that module's own
// text - its body, or its list of items or habits (fillTargetOf) - what the
// client would otherwise write in by hand.
//
// THE ANSWERS ARE THE TRUTH, kept on the client (BusinessClient.answers),
// because a client's pages are rewritten from the template whenever the
// coach changes one (savedItems.ts syncLinkedPages): an answer kept only in
// the page would go with the coach's next edit. So answers are written into
// the journal's modules when given, and written again after every rewrite
// of a client's page (applyClientAnswers) - by the writers, so the canvas,
// the timeline, the PDF and the printed book read the pages as they always
// have. The editor never sets or clears the id (withAsk keeps the stored
// one); only the business screens do.
//
// SERVER-ONLY (fillTargetOf, cleanAnswer, withAsk and the readers of the
// stored JSON are pure, and tested: clientAnswers.test.mts). Must not import
// savedItems.ts, which calls in here.

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MODULE_REGISTRY } from "@/lib/moduleRegistry";

type Db = Prisma.TransactionClient | typeof prisma;

/** The setting that carries a question's id. */
export const ASK_KEY = "askId";
/** A template asks at most this many questions. */
export const QUESTIONS_MAX = 12;
/** A list answer has at most this many items. */
export const LIST_MAX = 10;
/** The editor's own caps on a module's text (actions.ts sanitizePropValues). */
const TEXT_MAX = 500;
const ITEM_MAX = 120;
const ID = /^q_[A-Za-z0-9]{8,24}$/;

export type Question = { id: string; prompt: string; max: number };
export type FillTarget = { key: string; kind: "text" | "list" };
export type Answer = string | string[];
export type Answers = Record<string, Answer>;

/** The field an answer fills: a module's written body, or its list of items
 *  or habits. Columns, chart levels, box names and prompts shape a module
 *  rather than fill it, so a module with only those asks nothing. */
export function fillTargetOf(slug: string): FillTarget | null {
  const fields = MODULE_REGISTRY[slug]?.fields ?? [];
  if (fields.some((f) => f.kind === "paragraph" && f.key === "body")) return { key: "body", kind: "text" };
  for (const key of ["items", "habits"]) if (fields.some((f) => f.kind === "lines" && f.key === key)) return { key, kind: "list" };
  return null;
}

/** A module's question id, if it carries one. */
export function askIdOf(props: unknown): string | null {
  const id = props && typeof props === "object" ? (props as Record<string, unknown>)[ASK_KEY] : undefined;
  return typeof id === "string" && ID.test(id) ? id : null;
}

/** New settings for a module, keeping the question id it carried: the
 *  editor's settings are filtered to the module's own keys, which would drop
 *  it (actions.ts). */
export function withAsk<T extends Record<string, unknown>>(stored: unknown, next: T): T {
  const id = askIdOf(stored);
  return id ? { ...next, [ASK_KEY]: id } : next;
}

/** A template's questions, as stored. */
export function questionsOf(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => {
    const o = q as Record<string, unknown>;
    return o && typeof o.id === "string" && ID.test(o.id) && typeof o.prompt === "string"
      ? [{ id: o.id, prompt: o.prompt.slice(0, 200), max: Math.min(LIST_MAX, Math.max(1, Number(o.max) || 1)) }]
      : [];
  });
}

/** A client's answers, as stored. */
export function answersOf(raw: unknown): Answers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Answers = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!ID.test(id)) continue;
    if (typeof value === "string") out[id] = value;
    else if (Array.isArray(value) && value.every((v) => typeof v === "string")) out[id] = value as string[];
  }
  return out;
}

/** An answer as typed, made fit to print: trimmed, within the module's own
 *  caps, a list without its empty lines and no longer than the question
 *  asks. Null when nothing is left: the module prints as the template has it. */
export function cleanAnswer(target: FillTarget, raw: unknown, max: number): Answer | null {
  if (target.kind === "text") {
    const text = typeof raw === "string" ? raw.replace(/\r\n?/g, "\n").trim().slice(0, TEXT_MAX) : "";
    return text || null;
  }
  const items = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/\r\n|\n|\r/) : [])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim().slice(0, ITEM_MAX))
    .filter(Boolean)
    .slice(0, Math.min(LIST_MAX, Math.max(1, max)));
  return items.length ? items : null;
}

/** The same answer, whichever way it was stored. */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The modules of a journal that carry a question, with their type. */
const askedModules = (db: Db, plannerId: string, pageIds?: string[]) =>
  db.moduleInstance.findMany({
    where: { page: { plannerId }, ...(pageIds ? { pageId: { in: pageIds } } : {}), propValues: { path: [ASK_KEY], string_starts_with: "q_" } },
    select: { id: true, propValues: true, moduleType: { select: { slug: true } }, page: { select: { level: true } } },
  });

/**
 * A client's answers written into their journal's modules - all of them, or
 * those on `pageIds` (pages just rewritten from the template). A question
 * without an answer leaves its module as the template has it. Does nothing
 * for a journal that is not a client's. Returns how many modules changed.
 */
export async function applyClientAnswers(db: Db, plannerId: string, pageIds?: string[]): Promise<number> {
  const client = await db.businessClient.findUnique({ where: { plannerId }, select: { answers: true } });
  const answers = answersOf(client?.answers);
  if (!client || Object.keys(answers).length === 0) return 0;
  let changed = 0;
  for (const m of await askedModules(db, plannerId, pageIds)) {
    const id = askIdOf(m.propValues);
    const target = fillTargetOf(m.moduleType.slug);
    if (!id || !target || !(id in answers)) continue;
    const props = (m.propValues ?? {}) as Record<string, unknown>;
    const value = target.kind === "list" ? [answers[id]].flat() : [answers[id]].flat().join("\n");
    if (same(props[target.key], value)) continue;
    await db.moduleInstance.update({ where: { id: m.id }, data: { propValues: { ...props, [target.key]: value } as Prisma.InputJsonValue } });
    changed += 1;
  }
  return changed;
}

/** What a page level's module is, to the client: where their answer prints. */
const WHERE: Record<string, string> = {
  FRONT_MATTER: "At the front of your book",
  MONTHLY: "On every month",
  WEEKLY: "On every week",
  DAILY: "On every day",
  BACK_MATTER: "At the back of your book",
};

export type AskedQuestion = Question & { kind: FillTarget["kind"]; where: string; answer: Answer | null; example: Answer | null };

/** A client's questions, in their template's order, with their answers:
 *  those their journal carries a module for. `example`: what the template's
 *  module holds, shown faintly as a placeholder. */
export async function questionsForClient(clientId: string): Promise<AskedQuestion[]> {
  const client = await prisma.businessClient.findUnique({ where: { id: clientId }, select: { plannerId: true, answers: true, template: { select: { questions: true, plannerId: true } } } });
  if (!client?.plannerId || !client.template) return [];
  const questions = questionsOf(client.template.questions);
  if (!questions.length) return [];
  const [mine, theirs] = await Promise.all([askedModules(prisma, client.plannerId), askedModules(prisma, client.template.plannerId)]);
  const answers = answersOf(client.answers);
  return questions.flatMap((q) => {
    const here = mine.find((m) => askIdOf(m.propValues) === q.id);
    const target = here ? fillTargetOf(here.moduleType.slug) : null;
    if (!here || !target) return [];
    const source = theirs.find((m) => askIdOf(m.propValues) === q.id);
    const raw = source ? ((source.propValues ?? {}) as Record<string, unknown>)[target.key] : null;
    return [{ ...q, kind: target.kind, where: WHERE[here.page.level] ?? "In your book", answer: answers[q.id] ?? null, example: cleanAnswer(target, raw, q.max) }];
  });
}

/**
 * A client's answers saved - from their own page, or the coach correcting
 * them - and written into their journal. Only questions their journal asks
 * are kept. An answer emptied gives its module back what the template has.
 * Returns how many answers they now have.
 */
export async function saveClientAnswers(clientId: string, raw: Record<string, unknown>): Promise<number> {
  const client = await prisma.businessClient.findUnique({ where: { id: clientId }, select: { plannerId: true, answers: true, template: { select: { plannerId: true } } } });
  if (!client?.plannerId) return 0;
  const asked = await questionsForClient(clientId);
  const before = answersOf(client.answers);
  const after: Answers = { ...before };
  const cleared: string[] = [];
  for (const q of asked) {
    if (!(q.id in raw)) continue;
    const answer = cleanAnswer({ key: "", kind: q.kind }, raw[q.id], q.max);
    if (answer === null) {
      if (q.id in after) cleared.push(q.id);
      delete after[q.id];
    } else after[q.id] = answer;
  }
  await prisma.businessClient.update({ where: { id: clientId }, data: { answers: after as Prisma.InputJsonValue, answersAt: new Date() } });
  // the template's own text back where an answer was taken away
  if (cleared.length && client.template) {
    const theirs = await askedModules(prisma, client.template.plannerId);
    for (const m of await askedModules(prisma, client.plannerId)) {
      const id = askIdOf(m.propValues);
      const target = fillTargetOf(m.moduleType.slug);
      const source = theirs.find((t) => askIdOf(t.propValues) === id);
      if (!id || !target || !cleared.includes(id) || !source) continue;
      // exactly the template's: a field it leaves unset (the module's own
      // default) is unset here too, not an empty one
      const props = { ...((m.propValues ?? {}) as Record<string, unknown>) };
      const original = ((source.propValues ?? {}) as Record<string, unknown>)[target.key];
      if (original === undefined) delete props[target.key];
      else props[target.key] = original;
      await prisma.moduleInstance.update({ where: { id: m.id }, data: { propValues: props as Prisma.InputJsonValue } });
    }
  }
  await applyClientAnswers(prisma, client.plannerId);
  return Object.keys(after).length;
}

/** The coach typed in an asked module of a client's journal: what they typed
 *  is that client's answer now, so the template's next change to the page
 *  writes it back rather than taking it away (actions.ts updateModuleConfig).
 *  Only when the answered text itself changed: another setting changed is
 *  not an answer, and would make the template's own text one. */
export async function answerFromJournalEdit(plannerId: string, slug: string, before: unknown, props: Record<string, unknown>): Promise<void> {
  const id = askIdOf(props);
  const target = fillTargetOf(slug);
  if (!id || !target) return;
  if (same(((before ?? {}) as Record<string, unknown>)[target.key], props[target.key])) return;
  const client = await prisma.businessClient.findUnique({ where: { plannerId }, select: { id: true, answers: true } });
  if (!client) return;
  const answers = answersOf(client.answers);
  const answer = cleanAnswer(target, props[target.key], LIST_MAX);
  if (same(answers[id] ?? null, answer)) return;
  if (answer === null) delete answers[id];
  else answers[id] = answer;
  await prisma.businessClient.update({ where: { id: client.id }, data: { answers: answers as Prisma.InputJsonValue, answersAt: new Date() } });
}

// memari. for businesses - a template's QUESTIONS for its clients (intake
// that fills the book, v2, 2026-10-31; clientAnswers.ts). The coach picks
// modules of the template to ask about - any module whose own text a client
// could fill: a written body, a list of items or habits - and words each
// question. Asking writes the question's id into the module; the template's
// page is then synced (savedItems.ts), so every client's copy carries it.
// Stopping clears it the same way, and each client's copy goes back to the
// template's own text.
//
// A plain server module: it trusts the ownerId it is handed. The business
// actions check who is asking and call in.

import { randomBytes } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { syncLinkedPages } from "@/app/planner/savedItems";
import { ASK_KEY, LIST_MAX, QUESTIONS_MAX, askIdOf, cleanAnswer, fillTargetOf, questionsOf, type FillTarget, type Question } from "@/lib/clientAnswers";

const LEVEL_ORDER = ["FRONT_MATTER", "MONTHLY", "WEEKLY", "DAILY", "BACK_MATTER"];
const LEVEL_WORDS: Record<string, string> = { FRONT_MATTER: "Front of the book", MONTHLY: "Every month", WEEKLY: "Every week", DAILY: "Every day", BACK_MATTER: "Back of the book" };

export type Candidate = {
  moduleId: string;
  /** "Text", "Habit Tracker": the module's own name. */
  name: string;
  heading: string;
  where: string;
  kind: FillTarget["kind"];
  /** What the template's module holds now: shown to the client faintly. */
  example: string;
  /** How many items the template's list holds, or 3: the default to ask for. */
  items: number;
  asked: Question | null;
};

async function templateOf(ownerId: string, templateId: string) {
  const template = await prisma.businessTemplate.findFirst({ where: { id: templateId, business: { ownerId } }, include: { planner: { select: { id: true, title: true } } } });
  if (!template) throw new Error("That template is not one of yours.");
  return template;
}

/** Every module of the template a client could fill, where it prints, and
 *  whether it is asked about. */
export async function questionCandidates(ownerId: string, templateId: string): Promise<{ title: string; questions: Question[]; candidates: Candidate[] }> {
  const template = await templateOf(ownerId, templateId);
  const questions = questionsOf(template.questions);
  const modules = await prisma.moduleInstance.findMany({
    where: { page: { plannerId: template.planner.id } },
    select: { id: true, propValues: true, moduleType: { select: { slug: true, name: true } }, page: { select: { level: true, position: true, variantKey: true } } },
  });
  const candidates = modules
    .flatMap((m) => {
      const target = fillTargetOf(m.moduleType.slug);
      if (!target) return [];
      const props = (m.propValues ?? {}) as Record<string, unknown>;
      const id = askIdOf(props);
      const example = cleanAnswer(target, props[target.key], LIST_MAX);
      return [
        {
          moduleId: m.id,
          name: m.moduleType.name,
          heading: typeof props.heading === "string" ? props.heading.trim() : "",
          // "Every week, page 2": a spread's two pages told apart
          where: `${LEVEL_WORDS[m.page.level] ?? "In the book"}, page ${m.page.position + 1}${m.page.variantKey ? " (one version)" : ""}`,
          kind: target.kind,
          example: [example ?? ""].flat().join(target.kind === "list" ? ", " : " "),
          items: Array.isArray(example) ? example.length : 3,
          asked: (id && questions.find((q) => q.id === id)) || null,
          order: [LEVEL_ORDER.indexOf(m.page.level), m.page.variantKey ? 1 : 0, m.page.position],
        },
      ];
    })
    .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1] || a.order[2] - b.order[2] || a.name.localeCompare(b.name))
    .map((c) => ({ moduleId: c.moduleId, name: c.name, heading: c.heading, where: c.where, kind: c.kind, example: c.example, items: c.items, asked: c.asked }));
  return { title: template.planner.title, questions, candidates };
}

/** The module's settings changed and its page synced, so every client's
 *  copy takes it (and their answers go back in, savedItems.ts). */
async function writeAsk(moduleId: string, props: Record<string, unknown>, pageId: string) {
  await prisma.moduleInstance.update({ where: { id: moduleId }, data: { propValues: props as Prisma.InputJsonValue } });
  await syncLinkedPages([pageId]);
}

/** Ask about one of the template's modules, or change how it is asked. */
export async function askQuestion(ownerId: string, templateId: string, moduleId: string, o: { prompt: string; max: number }): Promise<{ error?: string }> {
  const template = await templateOf(ownerId, templateId);
  const prompt = String(o.prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!prompt) return { error: "Write the question as your client will read it." };
  const found = await prisma.moduleInstance.findFirst({ where: { id: moduleId, page: { plannerId: template.planner.id } }, select: { id: true, pageId: true, propValues: true, moduleType: { select: { slug: true } } } });
  const target = found ? fillTargetOf(found.moduleType.slug) : null;
  if (!found || !target) return { error: "That module has nothing a client could fill in." };
  const questions = questionsOf(template.questions);
  const props = (found.propValues ?? {}) as Record<string, unknown>;
  const id = askIdOf(props) ?? `q_${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "x")}`;
  const max = target.kind === "text" ? 1 : Math.min(LIST_MAX, Math.max(1, Math.round(Number(o.max) || 3)));
  const known = questions.some((q) => q.id === id);
  if (!known && questions.length >= QUESTIONS_MAX) return { error: `A template asks up to ${QUESTIONS_MAX} questions.` };
  const next = known ? questions.map((q) => (q.id === id ? { id, prompt, max } : q)) : [...questions, { id, prompt, max }];
  await prisma.businessTemplate.update({ where: { id: template.id }, data: { questions: next as Prisma.InputJsonValue } });
  if (askIdOf(props) !== id) await writeAsk(found.id, { ...props, [ASK_KEY]: id }, found.pageId);
  return {};
}

/** Stop asking about a module: each client's copy goes back to the
 *  template's text. Their answers stay kept, should it be asked again. */
export async function stopAsking(ownerId: string, templateId: string, moduleId: string): Promise<void> {
  const template = await templateOf(ownerId, templateId);
  const found = await prisma.moduleInstance.findFirst({ where: { id: moduleId, page: { plannerId: template.planner.id } }, select: { id: true, pageId: true, propValues: true } });
  if (!found) return;
  const props = { ...((found.propValues ?? {}) as Record<string, unknown>) };
  const id = askIdOf(props);
  if (!id) return;
  delete props[ASK_KEY];
  await prisma.businessTemplate.update({ where: { id: template.id }, data: { questions: questionsOf(template.questions).filter((q) => q.id !== id) as Prisma.InputJsonValue } });
  await writeAsk(found.id, props, found.pageId);
}

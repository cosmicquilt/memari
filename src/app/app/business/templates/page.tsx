// memari. for businesses - Templates: the journals every client's journal
// starts from. A template is one of your own journals; you edit it in the
// editor as any other. Clients move onto another one here, several at once
// (2026-11-04, MoveClients.tsx): onto a copy a connected assistant made, say.

import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { requireBusiness } from "@/lib/business";
import { journalSlugOf } from "@/app/planner/journalSlugs";
import { clientsBehind } from "@/lib/businessJournals";
import { questionsOf } from "@/lib/clientAnswers";
import { aiRunStatus } from "@/lib/connector/journalRuns";
import { AddTemplateForm, RemoveTemplateButton, UpdateClientsButton } from "../forms";
import { MoveClients, type MoveClient } from "../MoveClients";
import css from "../business.module.css";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ move?: string }> }) {
  const { owner, business } = await requireBusiness();
  const { move } = await searchParams;
  const [templates, journals, everyone] = await Promise.all([
    prisma.businessTemplate.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "asc" },
      include: {
        planner: { select: { id: true, title: true, slug: true } },
        _count: { select: { clients: { where: { archivedAt: null } } } },
        clients: { where: { archivedAt: null, plannerId: { not: null } }, select: { id: true } },
      },
    }),
    // the journals that could become one: yours, not a client's, not one already
    prisma.planner.findMany({
      where: { ownerId: owner.id, isTemplate: false, businessClient: { is: null }, businessTemplate: { is: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true },
    }),
    // who could move onto another template
    prisma.businessClient.findMany({
      where: { businessId: business.id, archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        templateId: true,
        plannerId: true,
        template: { select: { planner: { select: { title: true } } } },
        group: { select: { name: true, templateId: true, template: { select: { planner: { select: { title: true } } } } } },
      },
    }),
  ]);
  const movers: MoveClient[] = everyone.map((c) => ({
    id: c.id,
    name: c.name,
    templateId: c.templateId,
    template: c.template?.planner.title ?? null,
    journal: !!c.plannerId,
    group: c.group ? { name: c.group.name, templateId: c.group.templateId, template: c.group.template?.planner.title ?? null } : null,
  }));
  const canMoveTo = (templateId: string) => movers.some((c) => c.templateId !== templateId);
  // the one asked for (a row's Move clients here), or the newest with no
  // clients: most likely the copy just made
  const moveTo = templates.find((t) => t.id === move)?.id ?? [...templates].reverse().find((t) => t._count.clients === 0)?.id ?? templates[0]?.id ?? "";
  // what a connected assistant changed in each and could still undo, until
  // clients are on it (journalRuns.ts)
  const assistant = new Map(await Promise.all(templates.map(async (t) => [t.id, (await aiRunStatus(t.planner.id)).changes.length] as const)));
  // where clients added through the business's address start (clientIntake.ts
  // firstTemplateOf: the first template), while it has one
  const intake = business.intakeTokenHash && templates[0] ? { id: templates[0].id, title: templates[0].planner.title } : null;
  for (const t of templates) if (!t.planner.slug) t.planner.slug = await journalSlugOf(t.planner.id);
  // whose journals a change to a template's pages or settings has left behind
  const behind = await Promise.all(templates.map(async (t) => ({ template: t, clients: await clientsBehind(t.id) })));
  const waiting = behind.filter((b) => b.clients.length > 0);
  const names = (clients: Array<{ name: string }>) =>
    clients.length <= 3 ? clients.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1") : `${clients.slice(0, 2).map((c) => c.name).join(", ")} and ${clients.length - 2} more`;
  const cols = { "--cols": "minmax(0, 2fr) minmax(0, 1fr) auto" } as CSSProperties;
  return (
    <>
      <div className={css.head}>
        <h1>Templates</h1>
      </div>
      <p className={css.dim}>The design each client&rsquo;s journal starts from. Edit a template in the editor, as any journal of yours: what you change on its pages reaches its clients&rsquo; journals at once.</p>
      {waiting.map(({ template: t, clients }) => (
        <div key={t.id} className={css.card} style={{ boxShadow: "0 0 0 1px rgba(178, 80, 0, 0.35)" }}>
          <h2>{t.planner.title}: pages or settings changed</h2>
          <p>
            Pages were added or taken away, or its settings changed, since {clients.length === 1 ? "1 client’s journal was" : `${clients.length} clients’ journals were`} built. Those
            reach a journal only when you update it.
          </p>
          <p className={css.strong}>
            This changes the next book for {clients.length === 1 ? "1 client" : `${clients.length} clients`}: {names(clients)}. Books already printed don&rsquo;t change.
          </p>
          <div className={css.actions}>
            <UpdateClientsButton templateId={t.id} count={clients.length} />
          </div>
        </div>
      ))}
      {templates.length > 0 && (
        <div className={css.list} style={cols}>
          <div className={`${css.row} ${css.rowHead}`}>
            <span>Template</span>
            <span>Clients</span>
            <span />
          </div>
          {templates.map((t) => (
            <div key={t.id} className={css.row}>
              <span className={`${css.cell} ${css.strong}`}>{t.planner.title}</span>
              <span className={css.cell}>
                <span className={css.label}>Clients</span>
                {t._count.clients}
                {t.clients.length > 0 && (
                  <span className={css.dim}>
                    {" "}
                    · your edits reach {t.clients.length === 1 ? "1 journal" : `${t.clients.length} journals`}
                  </span>
                )}
                {/* a template waiting for its first clients: a copy just made, say */}
                {t._count.clients === 0 && canMoveTo(t.id) && (
                  <>
                    <span className={css.dim}> · </span>
                    <Link href={`/app/business/templates?move=${t.id}#move`} className={css.textLink}>
                      Move clients here
                    </Link>
                  </>
                )}
              </span>
              <span className={css.actions}>
                <Link href={`/app/j/${t.planner.slug ?? t.planner.id}`} className={css.btn}>
                  Edit
                </Link>
                <Link href={`/app/business/templates/${t.id}/questions`} className={css.btn}>
                  {questionsOf(t.questions).length ? `Questions (${questionsOf(t.questions).length})` : "Questions"}
                </Link>
                <Link href={`/app/j/${t.planner.slug ?? t.planner.id}/order`} className={css.btn}>
                  Order a sample
                </Link>
                <RemoveTemplateButton templateId={t.id} plannerId={t.planner.id} title={t.planner.title} />
              </span>
            </div>
          ))}
        </div>
      )}
      {templates.some((t) => canMoveTo(t.id)) && (
        // Keyed by the address alone, not by moveTo (review, 2026-11-04): with
        // none asked for, moveTo is the newest template with no clients, which
        // a move onto it changes, and the card started over as it came back,
        // losing who hadn't moved and why, and the template chosen.
        <MoveClients
          key={move ?? ""}
          initial={moveTo}
          intake={intake}
          templates={templates.map((t) => ({ id: t.id, title: t.planner.title, clients: t._count.clients, assistantChanges: assistant.get(t.id) ?? 0 }))}
          clients={movers}
        />
      )}
      <div className={css.card}>
        <h2>{templates.length ? "Add a template" : "Make your first template"}</h2>
        <AddTemplateForm journals={journals} hasTemplates={templates.length > 0} />
      </div>
    </>
  );
}

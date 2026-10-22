// memari. for businesses - Templates: the journals every client's journal
// starts from. A template is one of your own journals; you edit it in the
// editor as any other.

import Link from "next/link";
import type { CSSProperties } from "react";
import { prisma } from "@/lib/prisma";
import { currentBusiness } from "@/lib/business";
import { journalSlugOf } from "@/app/planner/journalSlugs";
import { AddTemplateForm, RemoveTemplateButton } from "../forms";
import css from "../business.module.css";

export default async function TemplatesPage() {
  const { owner, business } = (await currentBusiness())!;
  const [templates, journals] = await Promise.all([
    prisma.businessTemplate.findMany({
      where: { businessId: business!.id },
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
  ]);
  for (const t of templates) if (!t.planner.slug) t.planner.slug = await journalSlugOf(t.planner.id);
  const cols = { "--cols": "minmax(0, 2fr) minmax(0, 1fr) auto" } as CSSProperties;
  return (
    <>
      <div className={css.head}>
        <h1>Templates</h1>
      </div>
      <p className={css.dim}>The design each client&rsquo;s journal starts from. Edit a template in the editor, as any journal of yours.</p>
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
              </span>
              <span className={css.actions}>
                <Link href={`/app/j/${t.planner.slug ?? t.planner.id}`} className={css.btn}>
                  Edit
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
      <div className={css.card}>
        <h2>{templates.length ? "Add a template" : "Make your first template"}</h2>
        <AddTemplateForm journals={journals} />
      </div>
    </>
  );
}

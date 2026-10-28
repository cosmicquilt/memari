// memari. for businesses - one client: their journal and books, then their
// details and where their books go.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, ORDER_WORDS, requireBusiness, shippableAddress } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { journalSlugOf } from "@/app/planner/journalSlugs";
import { BuildJournalButton, ClientForm, ClientLink, type ClientValues } from "../../forms";
import css from "../../business.module.css";
import { LISTED } from "@/lib/print/holdsDays";

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function ClientPage({ params }: { params: Promise<{ clientId: string }> }) {
  const current = await requireBusiness();
  const business = current.business;
  const { clientId } = await params;
  const [client, templates] = await Promise.all([
    prisma.businessClient.findFirst({
      where: { id: clientId, businessId: business.id },
      include: { template: { include: { planner: { select: { title: true } } } }, planner: { select: { id: true, title: true } } },
    }),
    prisma.businessTemplate.findMany({ where: { businessId: business.id }, include: { planner: { select: { title: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!client) notFound();
  const slug = client.planner ? await journalSlugOf(client.planner.id) : null;
  const orders = client.planner
    ? await prisma.printOrder.findMany({ where: { plannerId: client.planner.id, OR: LISTED }, orderBy: { startDate: "desc" } })
    : [];
  const values: ClientValues = {
    id: client.id,
    name: client.name,
    coverName: client.coverName,
    email: client.email,
    startDate: client.startDate ? client.startDate.toISOString().slice(0, 10) : null,
    bookMonths: client.bookMonths,
    templateId: client.templateId,
    note: client.note,
    address: (client.shippingAddress as ClientValues["address"]) ?? undefined,
  };
  const canOrder = !!shippableAddress(client.shippingAddress);
  return (
    <>
      <h1>{client.name}</h1>
      <div className={css.card}>
        <h2>Their journal</h2>
        {client.planner && slug ? (
          <>
            {client.template ? (
              <p className={css.dim}>
                Built from <strong style={{ color: "var(--ink)" }}>{client.template.planner.title}</strong>. What you change in the template&rsquo;s pages reaches this journal,
                and every client&rsquo;s, until a book is printed: a printed book never changes. What you change in this journal is for {client.name} alone, until that page
                changes in the template.
              </p>
            ) : (
              <p className={css.dim}>
                On no template now, so nothing reaches this journal from one. Choose a template for {client.name} below and their journal is rebuilt from it, with the pages
                of their own kept.
              </p>
            )}
            <div className={css.actions}>
              <Link href={`/app/j/${slug}/order`} className={`${css.btn} ${canOrder ? css.primary : ""}`} aria-disabled={!canOrder || undefined}>
                Order their book
              </Link>
              <Link href={`/app/j/${slug}`} className={css.btn}>
                Open their journal
              </Link>
            </div>
            {!canOrder && <p className={css.dim}>Add where their books go, below, and the order screen fills it in.</p>}
            {orders.length > 0 && (
              <div className={css.steps}>
                {orders.map((o) => (
                  <div key={o.id} className={css.step} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                    <span>
                      <span className={css.strong}>
                        {date(o.startDate)} to {date(o.endDate)}
                      </span>
                      <br />
                      <span className={css.dim}>{o.title}</span>
                    </span>
                    <span className={`${css.tag} ${o.status === "FAILED" ? css.tagWarn : o.status === "SHIPPED" || o.status === "DELIVERED" ? css.tagOk : ""}`}>
                      {ORDER_WORDS[o.status] ?? o.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : client.template ? (
          <>
            <p className={css.dim}>
              From <strong style={{ color: "var(--ink)" }}>{client.template.planner.title}</strong>, titled &ldquo;{client.coverName || client.name}&rdquo;
              {client.startDate ? `, starting ${date(client.startDate)}` : ""}. It stays linked to the template, so your later changes to its pages reach it too.
            </p>
            <div className={css.actions}>
              <BuildJournalButton clientId={client.id} />
            </div>
          </>
        ) : (
          <p className={css.dim}>Choose a template for them, below, then build their journal from it.</p>
        )}
      </div>
      <ClientLink
        clientId={client.id}
        name={client.name}
        email={client.email}
        made={client.accessMadeAt ? date(client.accessMadeAt) : null}
        seen={client.accessSeenAt ? date(client.accessSeenAt) : null}
        guest={current.owner.guest}
      />
      <ClientForm client={values} templates={templates.map((t) => ({ id: t.id, title: t.planner.title }))} countries={countryOptions()} months={BOOK_MONTHS} />
    </>
  );
}

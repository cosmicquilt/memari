// memari. for businesses - one client: their journal and books, then their
// details and where their books go.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, ORDER_WORDS, bookAddressOf, requireBusiness, shippableAddress } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { journalSlugOf } from "@/app/planner/journalSlugs";
import { BuildJournalButton, ClientForm, ClientLink, type ClientValues } from "../../forms";
import { AnswersForm } from "../../Answers";
import { saveAnswersFor } from "../../actions";
import { questionsForClient } from "@/lib/clientAnswers";
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
      include: {
        template: { include: { planner: { select: { title: true } } } },
        planner: { select: { id: true, title: true } },
        group: { select: { id: true, name: true, shipToVenue: true, venueAddress: true } },
      },
    }),
    prisma.businessTemplate.findMany({ where: { businessId: business.id }, include: { planner: { select: { title: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  if (!client) notFound();
  const slug = client.planner ? await journalSlugOf(client.planner.id) : null;
  const questions = await questionsForClient(client.id);
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
  const canOrder = !!bookAddressOf(client);
  const place = client.group?.shipToVenue ? shippableAddress(client.group.venueAddress) : null;
  return (
    <>
      <h1>{client.name}</h1>
      {client.group && (
        <p className={css.dim}>
          In <Link href={`/app/business/groups/${client.group.id}`} className={css.textLink}>{client.group.name}</Link>
          {client.group.shipToVenue
            ? place
              ? `: their books go to ${place.name}, ${place.city}, with the group's. Their own address below is kept for later.`
              : ": their books go to the group's place, which needs its whole address."
            : "."}{" "}
          The group sets their template, start and length.
        </p>
      )}
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
              {/* the whole book as a PDF: their journal is the coach's to keep */}
              <a href={`/app/export?journal=${encodeURIComponent(client.planner.id)}`} className={css.btn} download>
                Download as PDF
              </a>
            </div>
            {!canOrder && <p className={css.dim}>{client.group?.shipToVenue ? "Give the group's place its whole address, and the order screen fills it in." : "Add where their books go, below, and the order screen fills it in."}</p>}
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
      {questions.length > 0 && (
        <div className={css.card}>
          <h2>Their answers</h2>
          <p className={css.dim}>
            {client.answersAt
              ? `${client.name.split(" ")[0]} last answered on ${date(client.answersAt)}. Correct anything here; it prints in their next book.`
              : `${client.name.split(" ")[0]} hasn't answered yet: they answer on their own page. You can fill these in for them.`}
          </p>
          <AnswersForm questions={questions} save={saveAnswersFor.bind(null, client.id)} done="Saved. It prints in their next book." />
        </div>
      )}
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

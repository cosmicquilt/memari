// memari. for businesses - one group (2026-10-31, src/lib/businessGroups.ts):
// its journals, its people's pages, ordering all their books in one
// payment, who is in it, and its settings.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BOOK_MONTHS, ORDER_WORDS, bookAddressOf, requireBusiness, shippableAddress } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { LISTED } from "@/lib/print/holdsDays";
import { orderingConfigured } from "@/lib/print/orders";
import { groupOrderStart } from "@/lib/print/groupOrders";
import { orderableBindings } from "@/lib/print/printer";
import { formatCents } from "@/lib/print/pricing";
import { AddPeople, BuildJournals, DeleteGroupButton, EmailLinks, GroupForm, GroupOrder, LeaveGroupButton } from "../GroupParts";
import css from "../../business.module.css";

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const length = (m: number) => (m === 1 ? "a month" : m === 12 ? "a year" : `${m} months`);

export default async function GroupPage({ params, searchParams }: { params: Promise<{ groupId: string }>; searchParams: Promise<{ build?: string; placed?: string }> }) {
  const { owner, business } = await requireBusiness();
  const { groupId } = await params;
  const asked = await searchParams;
  const group = await prisma.businessGroup.findFirst({
    where: { id: groupId, businessId: business.id },
    include: {
      template: { include: { planner: { select: { title: true } } } },
      clients: { where: { archivedAt: null }, orderBy: { name: "asc" }, include: { group: { select: { shipToVenue: true, venueAddress: true } } } },
    },
  });
  if (!group) notFound();
  const [templates, others, placed] = await Promise.all([
    prisma.businessTemplate.findMany({ where: { businessId: business.id }, include: { planner: { select: { title: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.businessClient.findMany({
      where: { businessId: business.id, archivedAt: null, OR: [{ groupId: null }, { groupId: { not: group.id } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, group: { select: { name: true } } },
    }),
    // back from Stripe, paid: the books appear below once Stripe has said so
    asked.placed ? prisma.printBatch.findFirst({ where: { id: asked.placed, ownerId: owner.id, groupId: group.id }, include: { orders: { select: { totalCents: true } } } }) : null,
  ]);
  const people = group.clients;
  const journals = people.flatMap((c) => (c.plannerId ? [c.plannerId] : []));
  const orders = journals.length ? await prisma.printOrder.findMany({ where: { plannerId: { in: journals }, OR: LISTED }, orderBy: { startDate: "desc" } }) : [];
  const latest = new Map<string, (typeof orders)[number]>();
  for (const o of orders) if (o.plannerId && !latest.has(o.plannerId)) latest.set(o.plannerId, o);

  const unbuilt = people.filter((c) => c.templateId && !c.plannerId).map((c) => ({ id: c.id, name: c.name }));
  const noTemplate = people.filter((c) => !c.templateId && !c.plannerId).length;
  const unlinked = people.filter((c) => c.email && !c.accessMadeAt).map((c) => ({ id: c.id, name: c.name }));
  const noEmail = people.filter((c) => !c.email && !c.accessMadeAt).length;
  const place = group.shipToVenue ? shippableAddress(group.venueAddress) : null;
  const ordering = orderingConfigured();
  const startISO = ordering.ok && !owner.guest && journals.length ? await groupOrderStart(owner.id, group.id) : null;
  const venue = (group.venueAddress as Record<string, string> | null) ?? null;

  return (
    <>
      <div className={css.head}>
        <h1>{group.name}</h1>
        <Link href="/app/business/groups" className={css.btn}>
          All groups
        </Link>
      </div>
      <p className={css.dim}>
        {people.length === 1 ? "1 person" : `${people.length} people`}
        {group.template ? ` on ${group.template.planner.title}` : ""}
        {group.startDate ? `, starting ${date(group.startDate)}` : ""}, {length(group.bookMonths)} a book.{" "}
        {group.shipToVenue ? (place ? `Every book goes to ${place.name}, ${place.city}.` : "Every book goes to one place, which needs its whole address below.") : "Each book goes to its owner's own address."}
      </p>

      {placed && (
        <div className={css.card} role="status">
          <p>
            <strong>
              Thank you: {placed.orders.length === 1 ? "1 book" : `${placed.orders.length} books`} ordered, {formatCents(placed.orders.reduce((s, o) => s + o.totalCents, 0))}.
            </strong>{" "}
            Each appears below once Stripe tells us it&rsquo;s paid, a moment from now, and we&rsquo;ll email you once they&rsquo;re all with the printer.
          </p>
        </div>
      )}

      <div className={css.card}>
        <h2>Their journals</h2>
        <p className={css.dim}>
          {journals.length} of {people.length} built
          {group.template ? `, each from ${group.template.planner.title}: what you change in it reaches all of theirs until a book is printed.` : "."}
          {noTemplate > 0 && ` ${noTemplate === 1 ? "One has" : `${noTemplate} have`} no template: choose one for the group below.`}
        </p>
        <BuildJournals people={unbuilt} autoStart={asked.build === "1"} />
      </div>

      <div className={css.card}>
        <h2>Their own pages</h2>
        <p className={css.dim}>
          {people.filter((c) => c.accessMadeAt).length} of {people.length} have a link to their own page, to see their journal
          {group.shipToVenue ? "" : ", give their address"}
          {business.clientsPay ? " and order their books" : ""}.
          {noEmail > 0 && ` ${noEmail === 1 ? "One has" : `${noEmail} have`} no email: make their link on their own client page, and send it yourself.`}
        </p>
        <EmailLinks people={unlinked} guest={owner.guest} />
      </div>

      <div className={css.card}>
        <h2>Order their books</h2>
        {!ordering.ok ? (
          <p className={css.dim}>Ordering isn&rsquo;t switched on here yet.</p>
        ) : owner.guest ? (
          <p className={css.dim}>
            <Link href={`/sign-in?redirect_url=${encodeURIComponent(`/app/business/groups/${group.id}`)}`} className={css.textLink}>
              Sign in
            </Link>{" "}
            to order the group&rsquo;s books: a payment for many books belongs to your account. Your business comes with you.
          </p>
        ) : !startISO ? (
          <p className={css.dim}>Build their journals and give the group a start date, and you can order all their books here, in one payment.</p>
        ) : (
          <GroupOrder groupId={group.id} startISO={startISO} bindings={orderableBindings()} length={length(group.bookMonths)} />
        )}
      </div>

      <div className={css.card}>
        <div className={css.head} style={{ margin: 0 }}>
          <h2 style={{ margin: 0, flex: 1 }}>People</h2>
          <AddPeople groupId={group.id} clients={others.map((c) => ({ id: c.id, name: c.name, email: c.email, group: c.group?.name ?? null }))} />
        </div>
        {people.length === 0 ? (
          <p className={css.dim}>Nobody yet. Add people: a name a line, or clients you have.</p>
        ) : (
          <div className={css.steps}>
            {people.map((c) => {
              const book = c.plannerId ? latest.get(c.plannerId) : undefined;
              const to = bookAddressOf(c);
              return (
                <div key={c.id} className={css.step} style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
                  <span>
                    <Link href={`/app/business/clients/${c.id}`} className={css.strong}>
                      {c.name}
                    </Link>
                    <br />
                    <span className={css.dim}>
                      {[c.email ?? "No email", c.plannerId ? "Journal built" : "No journal yet", group.shipToVenue ? null : to ? `Home, ${to.city}` : "No address yet"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className={`${css.tag} ${book?.status === "FAILED" ? css.tagWarn : book && (book.status === "SHIPPED" || book.status === "DELIVERED") ? css.tagOk : ""}`}>
                    {book ? `${ORDER_WORDS[book.status] ?? book.status}, ${date(book.startDate)}` : "No book yet"}
                  </span>
                  <LeaveGroupButton groupId={group.id} clientId={c.id} name={c.name} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <GroupForm
        group={{
          id: group.id,
          name: group.name,
          templateId: group.templateId,
          startDate: group.startDate ? group.startDate.toISOString().slice(0, 10) : null,
          bookMonths: group.bookMonths,
          shipToVenue: group.shipToVenue,
          venue,
        }}
        templates={templates.map((t) => ({ id: t.id, title: t.planner.title }))}
        countries={countryOptions()}
        months={BOOK_MONTHS}
      />
      <div className={css.actions}>
        <DeleteGroupButton groupId={group.id} name={group.name} />
      </div>
    </>
  );
}

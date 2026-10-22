// memari.studio/c/<token> - a client's own page (memari. for businesses
// v1.5; src/lib/clientPortal.ts): from their coach, by a private link. Their
// journal, their books, and where their books go. In the business screens'
// light style, with their coach's name and logo.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { portalFor } from "@/lib/clientPortal";
import { ORDER_WORDS } from "@/lib/business";
import { countryOptions } from "@/lib/print/countries";
import { BusinessMark } from "@/app/app/business/WorkspaceSwitcher";
import { AddressForm, JournalPages } from "./PortalParts";
import css from "@/app/app/business/business.module.css";

// private: never in a search engine, and the link is not passed on to any
// site it links to
export const metadata: Metadata = { title: "Your journal", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function ClientPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await portalFor(token);
  if (!data) notFound();
  const { business, client, journal, books } = data;
  const first = client.name.split(" ")[0];
  return (
    <main className={css.biz} data-biz-root="">
      <header className={css.top}>
        <BusinessMark name={business.name} logoUrl={business.logoUrl} />
        <strong>{business.name}</strong>
        <span className={css.spacer} />
      </header>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "48px 16px 72px", display: "grid", gap: 40 }}>
        <section style={{ display: "grid", gap: 10 }} className={css.page}>
          <h1 style={{ fontSize: "calc(var(--h1-size) * 1.25)" }}>{first}, your journal</h1>
          <p className={css.dim} style={{ fontSize: "1.15em", maxWidth: 620 }}>
            From {business.name}. Printed as you see it here, and posted to you
            {client.startDate ? `, starting ${date(client.startDate)}` : ""}.
          </p>
        </section>

        <section className={css.page}>
          <h2>Inside</h2>
          {journal && journal.length ? (
            <div className={css.card}>
              <JournalPages groups={journal} />
            </div>
          ) : (
            <div className={css.card}>
              <p className={css.dim}>Your journal is being made. Its pages appear here when it is ready.</p>
            </div>
          )}
        </section>

        <section className={css.page}>
          <h2>Your books</h2>
          <div className={css.card}>
            {books.length ? (
              <div className={css.steps}>
                {books.map((b) => (
                  <div key={b.id} className={css.step} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                    <span>
                      <span className={css.strong}>
                        {date(b.startDate)} to {date(b.endDate)}
                      </span>
                      {b.tracking && (
                        <>
                          <br />
                          <a href={b.tracking} target="_blank" rel="noreferrer noopener" style={{ color: "var(--accent)" }}>
                            Track it
                          </a>
                        </>
                      )}
                    </span>
                    <span className={`${css.tag} ${b.status === "SHIPPED" || b.status === "DELIVERED" ? css.tagOk : ""}`}>{ORDER_WORDS[b.status] ?? b.status}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className={css.dim}>Your first book has not been ordered yet. When it is, you can follow it here.</p>
            )}
          </div>
        </section>

        <section className={css.page}>
          <h2>Where your books go</h2>
          <div className={css.card}>
            <AddressForm token={token} address={client.address} countries={countryOptions()} />
          </div>
        </section>

        <p className={css.dim} style={{ textAlign: "center", fontSize: 12 }}>
          Made with{" "}
          <Link href="/" style={{ color: "inherit" }}>
            memari.
          </Link> This page is private to you: anyone with its link can open it.
        </p>
      </div>
    </main>
  );
}

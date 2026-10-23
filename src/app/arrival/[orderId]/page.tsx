// memari.studio/arrival/<order>?a=yes|no&sig=... - where "Has your book
// arrived?" leads (src/lib/print/delivery.ts sends it, emails.ts words it).
//
// Signed, so it works from the email without signing in; and a page with one
// button, not a link that acts - mail scanners open every link in an email,
// and would mark books arrived that nobody has seen. Once answered, the same
// link reads as answered, so opening it twice is harmless.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SitePage } from "@/app/landing/SitePage";
import { verifyArrival, type ArrivalAnswer } from "@/lib/print/delivery";
import { ArrivalAnswerForm } from "./ArrivalAnswerForm";
import styles from "../../renewal/renewal.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your book - memari. STUDIO",
  robots: { index: false, follow: false },
};

const longDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function ArrivalPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ a?: string; sig?: string }> }) {
  const { orderId } = await params;
  const query = await searchParams;
  const answer = query.a ?? null;
  const signature = query.sig ?? null;
  const order = verifyArrival(orderId, answer, signature) ? await prisma.printOrder.findUnique({ where: { id: orderId } }) : null;
  return <SitePage>{order ? <Body order={order} answer={answer as ArrivalAnswer} signature={signature!} /> : <Broken />}</SitePage>;
}

type Order = NonNullable<Awaited<ReturnType<typeof prisma.printOrder.findUnique>>>;

function Body({ order, answer, signature }: { order: Order; answer: ArrivalAnswer; signature: string }) {
  // Refunded, cancelled: nothing is on its way to ask about.
  if (order.status !== "SHIPPED" && order.status !== "DELIVERED") {
    return (
      <Card title="Nothing to answer here">
        <p className={styles.text}>This order isn&apos;t on its way any more. {order.paidByClient ? "Your coach can tell you what happened to it." : "Your Orders page says what happened to it."}</p>
        <Links client={order.paidByClient} />
      </Card>
    );
  }

  const tracking = Array.isArray(order.trackingUrls) ? (order.trackingUrls as string[]) : [];
  const facts = (
    <dl className={styles.facts}>
      <dt>Journal</dt>
      <dd>{order.title}</dd>
      {order.shippedAt && (
        <>
          <dt>Shipped</dt>
          <dd>{longDate(order.shippedAt)}</dd>
        </>
      )}
      {tracking.length > 0 && (
        <>
          <dt>Tracking</dt>
          <dd>
            {tracking.map((url, index) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" style={{ color: "inherit", marginRight: 12 }}>
                {tracking.length > 1 ? `Parcel ${index + 1}` : "Follow the parcel"}
              </a>
            ))}
          </dd>
        </>
      )}
    </dl>
  );

  if (answer === "yes") {
    if (order.arrivalAnswer === "ARRIVED") {
      return (
        <Card title="Glad it arrived">
          <p className={styles.text}>Thank you for letting us know. Enjoy filling it in.</p>
          <Links client={order.paidByClient} />
        </Card>
      );
    }
    return (
      <Card title="Has your book arrived?">
        {facts}
        <ArrivalAnswerForm orderId={order.id} answer="yes" signature={signature} label="Yes, it's here" />
      </Card>
    );
  }

  if (order.arrivalAnswer === "NOT_YET") {
    return (
      <Card title="Thanks, we're looking into it">
        {facts}
        <p className={styles.text}>We&apos;ll check with the printer and the carrier and email you at {order.contactEmail ?? "the address on your order"}.</p>
        <p className={styles.muted}>If it turns up in the meantime, the &ldquo;Yes, it&apos;s here&rdquo; link in our email tells us.</p>
        <Links client={order.paidByClient} />
      </Card>
    );
  }
  const carrierSays = order.status === "DELIVERED" && order.deliveredAt;
  return (
    <Card title="Not arrived yet?">
      {facts}
      <p className={styles.text}>
        {carrierSays
          ? `The carrier says it was delivered on ${longDate(order.deliveredAt!)}. If it isn't with you, tell us and we'll track it down and put it right.`
          : "Tell us and we'll track it down and put it right."}
      </p>
      <ArrivalAnswerForm orderId={order.id} answer="no" signature={signature} label="It hasn't arrived" />
    </Card>
  );
}

function Broken() {
  return (
    <Card title="This link doesn't work">
      <p className={styles.text}>It may have been copied only in part. Reply to our email and tell us whether your book has arrived.</p>
      <Links />
    </Card>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.card}>
      <h1 className={styles.title}>{title}</h1>
      {children}
    </section>
  );
}

/** `client`: a coach's client paid (clientPays.ts) - no account, no Orders
 *  page to send them to. */
function Links({ client = false }: { client?: boolean }) {
  return (
    <div className={styles.links}>
      {!client && <Link href="/app/account/orders">Your orders</Link>}
      <Link href="/help">Help</Link>
    </div>
  );
}

// memari.studio/renewal/<order>?do=skip|pause&sig=... - where the renewal
// reminder's "Skip this one" and "Pause auto-renew" lead (emails.ts).
//
// The signature lets it work from the email without signing in, but only
// for the two things that STOP an order; turning one back on (undoing a
// skip, auto-renew on again) charges a card, so that is on the Orders page,
// signed in. And it is a page with one button, not a link that acts: mail
// scanners open every link in an email, and would skip books nobody asked
// to skip.
//
// Once done, the same link reads as done, so opening it twice is harmless.

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { SitePage } from "@/app/landing/SitePage";
import { rangeLabel } from "@/lib/print/orderBook";
import { nextRange } from "@/lib/print/orderRange";
import { isChainHead, pastSkips, skipPreview, verifyRenewalAction, type RenewalAction } from "@/lib/print/renewalControls";
import { RenewalActionForm } from "./RenewalActionForm";
import styles from "../renewal.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your next book - memari. STUDIO",
  robots: { index: false, follow: false },
};

const longDate = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

type Range = { startDate: Date; endDate: Date; days: number };
const rangeOf = (order: Range) => rangeLabel({ start: order.startDate, end: order.endDate, days: order.days });

export default async function RenewalPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ do?: string; sig?: string }> }) {
  const { orderId } = await params;
  const query = await searchParams;
  const action = query.do ?? null;
  const signature = query.sig ?? null;
  const valid = verifyRenewalAction(orderId, action, signature);
  // A pause from an email sent before a skip pauses the order renewing now.
  const shown = valid ? (action === "pause" ? await pastSkips(orderId) : { id: orderId }) : null;
  const order = shown
    ? await prisma.printOrder.findUnique({
        where: { id: shown.id },
        include: { renewals: { orderBy: { createdAt: "desc" }, take: 1 } },
      })
    : null;

  return <SitePage>{order ? <Body order={order} linkOrderId={orderId} action={action as RenewalAction} signature={signature!} /> : <Broken />}</SitePage>;
}

type OrderWithRenewal = Prisma.PrintOrderGetPayload<{ include: { renewals: true } }>;

/** `order` is the one shown; `linkOrderId` the one the link is signed for. */
async function Body({ order, linkOrderId, action, signature }: { order: OrderWithRenewal; linkOrderId: string; action: RenewalAction; signature: string }) {
  const now = new Date();
  const preview = skipPreview(order, now);
  const following = order.renewals[0];

  // Already skipped - from this link, the Orders page, or a second click.
  if (following?.status === "SKIPPED") {
    return (
      <Card title="This one is skipped">
        <p className={styles.text}>Nothing is printed or charged for {rangeOf(following)}.</p>
        {following.autoRenew && following.renewsAt ? (
          <p className={styles.text}>
            Auto-renew is still on: the book after, {rangeLabel(nextRange({ start: following.startDate, end: following.endDate, days: following.days }))}, is ordered on {longDate(following.renewsAt)}. We&apos;ll email
            you a week before.
          </p>
        ) : (
          <p className={styles.text}>Auto-renew is off, so nothing more is ordered.</p>
        )}
        <p className={styles.muted}>Changed your mind? Undo the skip from your Orders page.</p>
        <Links />
      </Card>
    );
  }
  if (following) {
    return (
      <Card title="The next book has already been ordered">
        <p className={styles.text}>
          {order.title}: {rangeOf(following)}. If the printer hasn&apos;t started it, you can still cancel it from your Orders page for a full refund.
        </p>
        <Links />
      </Card>
    );
  }
  if (!order.autoRenew || !order.renewsAt) {
    return (
      <Card title={action === "pause" ? "Auto-renew is paused" : "Auto-renew is off"}>
        <p className={styles.text}>Nothing more is ordered for {order.title}. You can turn auto-renew back on from your Orders page whenever you like.</p>
        <Links />
      </Card>
    );
  }
  if (!(await isChainHead(order))) {
    return (
      <Card title="A later book follows this one">
        <p className={styles.text}>This link is for an older book. Your Orders page has the controls for the latest one.</p>
        <Links />
      </Card>
    );
  }

  const facts = (
    <dl className={styles.facts}>
      <dt>Journal</dt>
      <dd>{order.title}</dd>
      <dt>Next book</dt>
      <dd>
        {rangeLabel(preview.skipped)}, {preview.skipped.days} days
      </dd>
      <dt>Ordered on</dt>
      <dd>{longDate(order.renewsAt)}</dd>
    </dl>
  );
  if (action === "skip") {
    return (
      <Card title="Skip this one?">
        {facts}
        <p className={styles.text}>
          Nothing is printed or charged for {rangeLabel(preview.skipped)}. Auto-renew stays on: the book after, {rangeLabel(preview.after)}, is ordered on{" "}
          {longDate(preview.afterOrderedOn)}.
        </p>
        <RenewalActionForm orderId={linkOrderId} action="skip" signature={signature} label="Skip this one" />
        <p className={styles.muted}>You can undo it from your Orders page until the book after is ordered.</p>
      </Card>
    );
  }
  return (
    <Card title="Pause auto-renew?">
      {facts}
      <p className={styles.text}>Nothing more is ordered, this book or any after it, until you turn auto-renew back on from your Orders page.</p>
      <RenewalActionForm orderId={linkOrderId} action="pause" signature={signature} label="Pause auto-renew" />
    </Card>
  );
}

function Broken() {
  return (
    <Card title="This link doesn't work">
      <p className={styles.text}>It may have been copied only in part. Sign in and use your Orders page to skip or pause a book.</p>
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

function Links() {
  return (
    <div className={styles.links}>
      <Link href="/app/account/orders">Your orders</Link>
      <Link href="/help">Help</Link>
    </div>
  );
}

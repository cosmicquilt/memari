// /dev/payouts (development only): a coach's cards in states no check can
// reach, for the proof's photographs (2026-10-30) - "Who pays for books" in
// each payouts state (the real page reaches "noBank" only once Stripe's own
// onboarding is done), the client's order card with the share disclosed,
// the web address for other tools, off and on, and a group's books priced
// (which needs a signed-in coach and the printer's prices).

import { notFound } from "next/navigation";
import { BookPayerForm } from "@/app/app/business/forms";
import { IntakeAddress } from "@/app/app/business/IntakeAddress";
import { OrderBook } from "@/app/c/[token]/PortalParts";
import { GroupOrder } from "@/app/app/business/groups/GroupParts";
import type { GroupQuote } from "@/lib/print/groupOrders";
import css from "@/app/app/business/business.module.css";

// A group's prices as a signed-in coach sees them (groups, 2026-10-31): the
// numbers stand in: Standard mail is what the sandbox charged for three
// 136-page paperbacks to one place in check:groups; Ground is made up.
const GROUP_QUOTE: GroupQuote = {
  range: { startISO: "2027-01-04", endISO: "2027-04-03", days: 90, label: "4 Jan – 3 Apr 2027" },
  binding: "paperback",
  paper: "cream",
  members: [
    { clientId: "a", name: "Ana Lima", ok: true, pageCount: 136, place: "Northwind at Hotel Lumen, Austin" },
    { clientId: "m", name: "Maya Okafor", ok: true, pageCount: 136, place: "Northwind at Hotel Lumen, Austin" },
    { clientId: "p", name: "Priya Nair", ok: false, why: "Has a book for these days already." },
    { clientId: "s", name: "Sam Lee", ok: true, pageCount: 136, place: "Northwind at Hotel Lumen, Austin" },
  ],
  options: [
    { level: "MAIL", label: "Standard mail", totalCents: 7704, bookCents: 5907, shippingCents: 1797, perBook: { a: 2568, m: 2568, s: 2568 }, arrives: { earliest: "2026-11-12", latest: "2026-11-20" } },
    { level: "GROUND", label: "Ground", totalCents: 8697, bookCents: 5907, shippingCents: 2790, perBook: { a: 2899, m: 2899, s: 2899 }, arrives: { earliest: "2026-11-10", latest: "2026-11-14" } },
  ],
  note: "Printed by Lulu in the US.",
};

const STATES = [
  ["none", "No Stripe account yet"],
  ["pending", "Stripe wants more details"],
  ["noBank", "Share on, no bank yet (new)"],
  ["ready", "Share on, paid to their bank"],
] as const;

export default function DevPayouts() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className={css.biz} data-mode="light" style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ display: "grid", gap: 24, maxWidth: 760 }}>
        {STATES.map(([state, label]) => (
          <section key={state} id={`state-${state}`}>
            <h3 style={{ margin: "0 0 8px" }}>{label}</h3>
            <BookPayerForm clientsPay markupCents={1000} payouts={state} paymentsOn countries={[{ code: "US", name: "United States" }]} />
          </section>
        ))}
        <section id="client-order">
          <h3 style={{ margin: "0 0 8px" }}>The client&rsquo;s order card, the share disclosed (new)</h3>
          <div className={css.card}>
            <h2>Order your next book</h2>
            <OrderBook
              token="dev"
              businessName="Northwind Coaching"
              ordering={{ open: true, next: { startISO: "2027-04-05", days: 91, label: "5 Apr – 4 Jul 2027" }, bindings: ["coil"], email: "maya@example.com", shareCents: 1000 }}
            />
          </div>
        </section>
        <section id="group-order">
          <h3 style={{ margin: "0 0 8px" }}>A group&rsquo;s books, priced (new)</h3>
          <div className={css.card}>
            <h2>Order their books</h2>
            <GroupOrder groupId="dev" startISO="2027-01-04" bindings={["wireo", "paperback", "hardcover"]} length="3 months" preview={GROUP_QUOTE} />
          </div>
        </section>
        <section id="intake-off">
          <h3 style={{ margin: "0 0 8px" }}>Add clients from other tools: none yet (new)</h3>
          <IntakeAddress madeOn={null} guest={false} />
        </section>
        <section id="intake-on">
          <h3 style={{ margin: "0 0 8px" }}>Add clients from other tools: on (new)</h3>
          <IntakeAddress madeOn="2026-10-30" guest={false} />
        </section>
      </div>
    </main>
  );
}

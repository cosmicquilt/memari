// /dev/payouts (development only): a coach's "Who pays for books" card in
// each payouts state, for the proof's photographs (2026-10-30). The real
// settings page reaches "noBank" only once Stripe's own onboarding is done,
// which no check can drive.

import { notFound } from "next/navigation";
import { BookPayerForm } from "@/app/app/business/forms";
import css from "@/app/app/business/business.module.css";

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
      </div>
    </main>
  );
}

"use client";

// The order form open on a page of its own (page.tsx). Closing it leaves a
// short page with the two ways on: open the form again, or change pages in
// the editor first.

import { useState } from "react";
import { CREAM, cream, onCream } from "@/lib/cream";
import { OrderDialog } from "@/app/planner/OrderDialog";

const ACCENT = "#4a5cff";

export function StandaloneOrder({
  journalId,
  title,
  slug,
  weekStartDay,
  journalStartISO,
  journalEndISO,
}: {
  journalId: string;
  title: string;
  slug: string;
  weekStartDay: number;
  /** The journal's term, so a Lent or Ramadan book opens on its season
   *  (OrderDialog's openingRange). */
  journalStartISO?: string | null;
  journalEndISO?: string | null;
}) {
  const [open, setOpen] = useState(true);
  return (
    <main style={{ minHeight: "100vh", background: "#141414", color: onCream(0xdd), boxSizing: "border-box", paddingBlock: "28px 64px", paddingInline: 16 }}>
      <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gap: 22 }}>
        <header style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <a href="/app" style={{ color: CREAM, textDecoration: "none", flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 17 }}>
              memari. <span style={{ fontWeight: 200, fontSize: "0.8em", letterSpacing: "0.1em" }}>STUDIO</span>
            </strong>
          </a>
          <a href={`/app/j/${slug}`} style={{ fontSize: 13, color: cream(0.65) }}>
            Change pages first
          </a>
        </header>
        <section style={{ display: "grid", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 650, color: CREAM, textWrap: "balance" }}>Order {title}</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: cream(0.7) }}>
            Printed exactly as it is laid out now, every page dated. Choose how many days, the binding and where it goes, and you&rsquo;ll see the price before you pay.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
            <button
              type="button"
              onClick={() => setOpen(true)}
              style={{ padding: "9px 16px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", color: CREAM, background: ACCENT, border: "none", borderRadius: 8, cursor: "pointer" }}
            >
              Choose and see the price
            </button>
            <a href={`/app/j/${slug}`} style={{ padding: "9px 16px", fontSize: 14, fontWeight: 600, color: CREAM, background: "#2a2a2a", borderRadius: 8, textDecoration: "none" }}>
              Open it in the editor
            </a>
          </div>
        </section>
      </div>
      {open && (
        <OrderDialog journalId={journalId} weekStartDay={weekStartDay} journalStartISO={journalStartISO} journalEndISO={journalEndISO} onClose={() => setOpen(false)} />
      )}
    </main>
  );
}

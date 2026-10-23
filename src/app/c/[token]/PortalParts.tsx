"use client";

// A client's own page: their journal's pages, drawn as the timeline draws
// them, the address form, and - when their coach has clients pay - their
// next book to order.

import { useActionState, useRef, useState, useTransition } from "react";
import { PagePreview } from "@/app/planner/PagePreview";
import type { PortalPage } from "@/lib/clientPortal";
import type { PortalOrdering } from "@/lib/clientOrders";
import type { ShippingAddress } from "@/lib/print/lulu";
import { BINDING_SPECS, type Binding } from "@/lib/print/products";
import { formatCents } from "@/lib/print/pricing";
import { payForMyBook, quoteMyBook, saveMyAddress, type AddressState, type MyQuote } from "./actions";
import css from "@/app/app/business/business.module.css";

export function JournalPages({ groups }: { groups: Array<{ label: string; pages: PortalPage[] }> }) {
  return (
    // each month, each week, each day side by side where there is room
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 360px), 1fr))", gap: "28px 24px" }}>
      {groups.map((group) => (
        <div key={group.label} style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--dim)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{group.label}</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18 }}>
            {/* a spread's pages side by side, as the book opens */}
            {pairs(group.pages).map((spread, i) => (
              <div key={i} style={{ display: "flex", boxShadow: "0 6px 24px rgba(28, 25, 23, 0.12)", borderRadius: 4, overflow: "hidden", background: "#fff" }}>
                {spread.map((page, j) => (
                  // 170px, or half of what a phone has left inside the card
                  <div key={j} style={{ width: "min(170px, calc((100vw - 34px - 2 * var(--card-pad)) / 2))", aspectRatio: `${page.widthPx} / ${page.heightPx}` }}>
                    <PagePreview page={{ previewMarks: page.marks, pageWidthPx: page.widthPx, pageHeightPx: page.heightPx }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const pairs = <T,>(list: T[]) => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += 2) out.push(list.slice(i, i + 2));
  return out;
};

export function AddressForm({ token, address, countries }: { token: string; address: Partial<ShippingAddress> | null; countries: Array<{ code: string; name: string }> }) {
  const [state, action, pending] = useActionState<AddressState, FormData>(saveMyAddress.bind(null, token), null);
  const a = address ?? {};
  return (
    <form action={action} className={css.form}>
      <div className={css.fields}>
        <label className={css.field}>
          <span>Name on the parcel</span>
          <input type="text" name="name" required maxLength={120} defaultValue={a.name ?? ""} autoComplete="name" />
        </label>
        <label className={`${css.field} ${css.wide}`}>
          <span>Address</span>
          <input type="text" name="street1" required maxLength={200} defaultValue={a.street1 ?? ""} autoComplete="address-line1" />
        </label>
        <label className={`${css.field} ${css.wide}`}>
          <span>Address, second line</span>
          <input type="text" name="street2" maxLength={200} defaultValue={a.street2 ?? ""} autoComplete="address-line2" />
        </label>
        <label className={css.field}>
          <span>City</span>
          <input type="text" name="city" required maxLength={120} defaultValue={a.city ?? ""} autoComplete="address-level2" />
        </label>
        <label className={css.field}>
          <span>State or region</span>
          <input type="text" name="stateCode" maxLength={40} defaultValue={a.stateCode ?? ""} autoComplete="address-level1" />
        </label>
        <label className={css.field}>
          <span>Postcode</span>
          <input type="text" name="postcode" required maxLength={20} defaultValue={a.postcode ?? ""} autoComplete="postal-code" />
        </label>
        <label className={css.field}>
          <span>Country</span>
          <select name="countryCode" defaultValue={a.countryCode ?? "US"} autoComplete="country">
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          <span>Phone</span>
          <input type="tel" name="phoneNumber" required maxLength={40} defaultValue={a.phoneNumber ?? ""} autoComplete="tel" />
          <small>The courier asks for one.</small>
        </label>
      </div>
      {state?.error && (
        <p className={css.error} role="alert">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p className={css.saved} role="status">
          Saved. Your next book comes here.
        </p>
      )}
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          Save
        </button>
      </div>
    </form>
  );
}

/** Their next book, ordered and paid for here, when their coach has chosen
 *  that clients pay (2026-10-22; src/lib/clientOrders.ts). The binding, then
 *  its prices to their address, the post, an email for the receipt, and off
 *  to Stripe's payment page. */
export function OrderBook({ token, ordering, businessName }: { token: string; ordering: PortalOrdering; businessName: string }) {
  const first = ordering.open ? ordering.bindings[0] : null;
  const [binding, setBinding] = useState<Binding | null>(first);
  const [quote, setQuote] = useState<Extract<MyQuote, { ok: true }> | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [email, setEmail] = useState(ordering.open ? (ordering.email ?? "") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Each price asked for is numbered; one that answers after the binding
  // has changed is dropped, so the prices shown are always the chosen
  // binding's (review, 2026-10-23).
  const asked = useRef(0);
  if (!ordering.open) return ordering.why ? <p className={css.dim}>{ordering.why}</p> : null;
  const chosen = quote?.options.find((o) => o.level === level) ?? null;
  const pick = (b: Binding) => {
    asked.current++;
    setBinding(b);
    setQuote(null);
    setLevel(null);
    setError(null);
  };
  const price = () =>
    binding &&
    start(async () => {
      const ask = ++asked.current;
      const result = await quoteMyBook(token, binding);
      if (ask !== asked.current) return;
      if (result.ok) {
        setQuote(result);
        setLevel(result.options[0]?.level ?? null);
        setError(null);
      } else setError(result.error);
    });
  const pay = () =>
    binding &&
    chosen &&
    start(async () => {
      const result = await payForMyBook(token, { binding, level: chosen.level, email, expectTotalCents: chosen.totalCents, expectStartISO: quote!.range.startISO, expectDays: quote!.range.days });
      if (result.ok) window.location.href = result.url;
      else {
        setError(result.error);
        // the price or the dates moved: back to See prices (second review)
        if (result.again) {
          asked.current++;
          setQuote(null);
          setLevel(null);
        }
      }
    });
  return (
    <div className={css.form}>
      <p>
        Your next book covers <strong>{ordering.next.label}</strong>, {ordering.next.days} days. {ordering.withShare ? `The price is set by ${businessName}.` : ""}
      </p>
      <fieldset className={css.choices}>
        <legend className={css.choicesLegend}>Binding</legend>
        {ordering.bindings.map((b) => (
          <label key={b} className={css.choice}>
            <input type="radio" name="binding" value={b} checked={binding === b} disabled={pending} onChange={() => pick(b)} />
            <span>
              <strong>{BINDING_SPECS[b].label}</strong>
              <small>{BINDING_SPECS[b].note}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {!quote ? (
        <div className={css.actions}>
          <button type="button" className={`${css.btn} ${css.primary}`} disabled={!binding || pending} onClick={price}>
            {pending ? "Finding prices…" : "See prices"}
          </button>
        </div>
      ) : (
        <>
          <fieldset className={css.choices}>
            <legend className={css.choicesLegend}>Post</legend>
            {quote.options.map((o) => (
              <label key={o.level} className={css.choice}>
                <input type="radio" name="level" value={o.level} checked={level === o.level} onChange={() => setLevel(o.level)} />
                <span>
                  <strong>
                    {o.label}: {formatCents(o.totalCents)}
                  </strong>
                  {o.arrives && (
                    <small>
                      Arrives {o.arrives.earliest} to {o.arrives.latest}
                    </small>
                  )}
                </span>
              </label>
            ))}
          </fieldset>
          <label className={css.field} style={{ maxWidth: 360 }}>
            <span>Email for your receipt</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <div className={css.actions}>
            <button type="button" className={`${css.btn} ${css.primary}`} disabled={!chosen || !email || pending} onClick={pay}>
              {pending ? "Opening the payment page…" : chosen ? `Pay ${formatCents(chosen.totalCents)}` : "Choose the post"}
            </button>
          </div>
          <p className={css.dim}>
            Covers {quote.range.label}. {quote.pageCount} pages, printed as you see it above. You pay on Stripe&rsquo;s page; your card never reaches this site.
          </p>
        </>
      )}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

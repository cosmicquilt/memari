"use client";

// A client's own page: their journal's pages, drawn as the timeline draws
// them, and the address form.

import { useActionState } from "react";
import { PagePreview } from "@/app/planner/PagePreview";
import type { PortalPage } from "@/lib/clientPortal";
import type { ShippingAddress } from "@/lib/print/lulu";
import { saveMyAddress, type AddressState } from "./actions";
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

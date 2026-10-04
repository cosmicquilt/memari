"use client";

// ORDER A PRINTED BOOK (2026-10-04, "start on checkout"). How many days -
// 30, 90, a year or any number - from which day, in which binding, to
// where; then the prices Lulu quotes for that book to that address, every
// way it can be posted; then Stripe's payment page.
//
// Prices are never typed here or trusted from here: "See prices" asks the
// server, which builds the book for those days and asks the printer, and
// paying asks again (src/lib/print/orders.ts). Change anything after a quote
// and the quote is withdrawn, so a stale price cannot be paid.
//
// AUTO-RENEW IS OFF until switched on - "it should always default to auto
// renew off with the option to turn it on".

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CREAM, cream, onCream } from "@/lib/cream";
import { CONTROL_RADIUS, PANEL_RADIUS } from "./editorStyle";
import { checkoutPrint, orderingStatus, quotePrint, type OrderingStatus } from "./printActions";
import type { Quote } from "@/lib/print/orders";
import { BINDINGS, BINDING_SPECS, type Binding } from "@/lib/print/products";
import { MAX_ORDER_DAYS, ORDER_LENGTH_PRESETS, suggestedStart, type ShippingLevel } from "@/lib/print/orderRange";
import { formatCents } from "@/lib/print/pricing";
import { countryOptions } from "@/lib/print/countries";
import type { ShippingAddress } from "@/lib/print/lulu";

const ACCENT = "#4a5cff";
const SURFACE = "#1c1c1e";
const ERROR_INK = "#ff8a80";

const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: cream(0.6) };
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: onCream(0xf2),
  background: cream(0.06),
  border: "none",
  borderRadius: CONTROL_RADIUS,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={labelStyle}>{title}</span>
      {children}
    </section>
  );
}

function Choice({ selected, disabled, onPick, children, title }: { selected: boolean; disabled?: boolean; onPick: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      title={title}
      onClick={onPick}
      style={{
        flex: 1,
        minWidth: 0,
        padding: "8px 10px",
        fontSize: 12,
        fontFamily: "inherit",
        textAlign: "left",
        color: disabled ? cream(0.3) : selected ? CREAM : cream(0.75),
        background: selected ? cream(0.1) : cream(0.04),
        border: `1px solid ${selected ? ACCENT : "transparent"}`,
        borderRadius: CONTROL_RADIUS,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const EMPTY_ADDRESS: ShippingAddress = { name: "", street1: "", street2: "", city: "", stateCode: "", countryCode: "US", postcode: "", phoneNumber: "" };

export function OrderDialog({ journalId, weekStartDay, onClose }: { journalId: string; weekStartDay: number; onClose: () => void }) {
  const [status, setStatus] = useState<OrderingStatus | null>(null);
  const [days, setDays] = useState(90);
  const [customDays, setCustomDays] = useState("");
  const [startISO, setStartISO] = useState(() => isoDay(suggestedStart(new Date(), "GROUND", false, weekStartDay)));
  const [binding, setBinding] = useState<Binding>("coil");
  const [address, setAddress] = useState<ShippingAddress>(EMPTY_ADDRESS);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [level, setLevel] = useState<ShippingLevel | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [busy, setBusy] = useState<"quote" | "pay" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const countries = useMemo(() => countryOptions(typeof navigator !== "undefined" ? navigator.language : "en"), []);

  useEffect(() => {
    let live = true;
    void orderingStatus().then((value) => live && setStatus(value));
    return () => {
      live = false;
    };
  }, []);

  // Escape closes, as every other panel here does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Any change withdraws the prices shown. */
  const changed = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setQuote(null);
    setLevel(null);
    setError(null);
  };
  const setField = (key: keyof ShippingAddress) => (event: { target: { value: string } }) =>
    changed(setAddress)({ ...address, [key]: event.target.value });

  const addressReady = !!(address.name.trim() && address.street1.trim() && address.city.trim() && address.postcode.trim() && address.phoneNumber.trim() && address.countryCode);
  const input = { journalId, startISO, days, binding, address };

  const seePrices = async () => {
    setBusy("quote");
    setError(null);
    const result = await quotePrint(input);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setQuote(result.value);
    // The cheapest way to post it, to start with.
    const cheapest = [...result.value.options].sort((a, b) => a.price.totalCents - b.price.totalCents)[0];
    setLevel(cheapest?.level ?? null);
  };

  const pay = async () => {
    if (!level) return;
    setBusy("pay");
    setError(null);
    const result = await checkoutPrint({ ...input, level, autoRenew });
    if (!result.ok) {
      setBusy(null);
      setError(result.error);
      return;
    }
    window.location.assign(result.value.url);
  };

  const chosen = quote?.options.find((option) => option.level === level) ?? null;
  const fits = quote?.availability.find((a) => a.binding === binding);

  return (
    <div role="dialog" aria-modal="true" aria-label="Order a printed book" style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.55)" }} />
      <div
        style={{
          position: "relative",
          width: 520,
          maxWidth: "100%",
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: SURFACE,
          border: `1px solid ${cream(0.12)}`,
          borderRadius: PANEL_RADIUS,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          color: onCream(0xdd),
          colorScheme: "dark",
          overflow: "hidden",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: `1px solid ${cream(0.08)}` }}>
          <strong style={{ flex: 1, fontSize: 13, color: CREAM }}>Order a printed book</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 24, height: 24, padding: 0, border: "none", borderRadius: CONTROL_RADIUS, background: "transparent", color: cream(0.5), cursor: "pointer", fontSize: 16 }}>
            ×
          </button>
        </header>

        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
          {status === null && <p style={{ margin: 0, fontSize: 13, color: cream(0.6) }}>Checking…</p>}
          {status && !status.ready && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{status.message}</p>
              {(status.reason === "guest" || status.reason === "signed-out") && (
                <a
                  href={`/sign-in?redirect_url=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/app")}`}
                  style={{ alignSelf: "flex-start", padding: "7px 14px", background: ACCENT, color: CREAM, borderRadius: CONTROL_RADIUS, textDecoration: "none", fontSize: 13 }}
                >
                  Sign in
                </a>
              )}
            </div>
          )}

          {status?.ready && (
            <>
              <Section title="How long">
                <div role="radiogroup" aria-label="How long" style={{ display: "flex", gap: 6 }}>
                  {ORDER_LENGTH_PRESETS.map((preset) => (
                    <Choice key={preset.days} selected={days === preset.days && !customDays} onPick={() => { setCustomDays(""); changed(setDays)(preset.days); }}>
                      {preset.label}
                    </Choice>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={MAX_ORDER_DAYS}
                    placeholder="Days"
                    aria-label="Any number of days"
                    value={customDays}
                    onChange={(event) => {
                      setCustomDays(event.target.value);
                      const value = Math.round(Number(event.target.value));
                      if (value >= 1 && value <= MAX_ORDER_DAYS) changed(setDays)(value);
                    }}
                    style={{ ...inputStyle, width: 80, flex: "none" }}
                  />
                </div>
              </Section>

              <Section title="Starting">
                <input type="date" value={startISO} onChange={(event) => changed(setStartISO)(event.target.value)} style={{ ...inputStyle, width: 180 }} />
                <span style={{ fontSize: 11, color: cream(0.45), lineHeight: 1.4 }}>
                  Suggested: the first day of your week after a book posted today would arrive.
                </span>
              </Section>

              <Section title="Binding">
                <div role="radiogroup" aria-label="Binding" style={{ display: "flex", gap: 6 }}>
                  {BINDINGS.map((option) => {
                    const fit = quote?.availability.find((a) => a.binding === option);
                    return (
                      <Choice
                        key={option}
                        selected={binding === option}
                        disabled={fit ? !fit.ok : false}
                        title={fit && !fit.ok ? fit.reason : undefined}
                        onPick={() => changed(setBinding)(option)}
                      >
                        <div style={{ fontWeight: 600 }}>{BINDING_SPECS[option].label}</div>
                        <div style={{ fontSize: 11, color: cream(0.5), marginTop: 2 }}>{BINDING_SPECS[option].note}</div>
                      </Choice>
                    );
                  })}
                </div>
                {fits && !fits.ok && <span style={{ fontSize: 12, color: ERROR_INK }}>{fits.reason}</span>}
              </Section>

              <Section title="Ship to">
                <input placeholder="Full name" autoComplete="name" value={address.name} onChange={setField("name")} style={inputStyle} />
                <input placeholder="Address" autoComplete="address-line1" value={address.street1} onChange={setField("street1")} style={inputStyle} />
                <input placeholder="Apartment, suite (optional)" autoComplete="address-line2" value={address.street2 ?? ""} onChange={setField("street2")} style={inputStyle} />
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="City" autoComplete="address-level2" value={address.city} onChange={setField("city")} style={inputStyle} />
                  <input placeholder="State / region" autoComplete="address-level1" value={address.stateCode ?? ""} onChange={setField("stateCode")} style={{ ...inputStyle, width: 130, flex: "none" }} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input placeholder="Postcode" autoComplete="postal-code" value={address.postcode} onChange={setField("postcode")} style={{ ...inputStyle, width: 130, flex: "none" }} />
                  <select aria-label="Country" autoComplete="country" value={address.countryCode} onChange={setField("countryCode")} style={inputStyle}>
                    {countries.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input placeholder="Phone (the carrier may need it)" autoComplete="tel" value={address.phoneNumber} onChange={setField("phoneNumber")} style={inputStyle} />
              </Section>

              {!quote && (
                <button
                  type="button"
                  onClick={() => void seePrices()}
                  disabled={!addressReady || busy !== null}
                  style={{ alignSelf: "flex-start", padding: "8px 16px", fontSize: 13, fontFamily: "inherit", color: CREAM, background: addressReady ? ACCENT : cream(0.1), border: "none", borderRadius: CONTROL_RADIUS, cursor: addressReady && !busy ? "pointer" : "default", opacity: busy ? 0.7 : 1 }}
                >
                  {busy === "quote" ? "Pricing your book…" : "See prices"}
                </button>
              )}

              {quote && (
                <>
                  <p style={{ margin: 0, fontSize: 12, color: cream(0.6) }}>
                    {quote.range.label} · {quote.range.days} days · {quote.pageCount} pages
                  </p>
                  {quote.options.length > 0 && (
                    <Section title="Shipping">
                      <div role="radiogroup" aria-label="Shipping" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {quote.options.map((option) => (
                          <Choice key={option.level} selected={level === option.level} onPick={() => setLevel(option.level)}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                              <span>{option.label}</span>
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatCents(option.price.totalCents)}</span>
                            </div>
                            <div style={{ fontSize: 11, color: cream(0.5), marginTop: 2 }}>
                              Book {formatCents(option.price.bookCents)} + shipping {formatCents(option.price.shippingCents)}
                            </div>
                          </Choice>
                        ))}
                      </div>
                    </Section>
                  )}

                  {quote.options.length > 0 && (
                  <>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12, lineHeight: 1.45, cursor: "pointer" }}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={autoRenew}
                      onClick={() => setAutoRenew(!autoRenew)}
                      style={{ flex: "none", width: 34, height: 20, padding: 2, border: "none", borderRadius: 10, background: autoRenew ? ACCENT : cream(0.18), cursor: "pointer", display: "flex", justifyContent: autoRenew ? "flex-end" : "flex-start", transition: "background 150ms ease" }}
                    >
                      <span style={{ width: 16, height: 16, borderRadius: 8, background: CREAM, display: "block" }} />
                    </button>
                    <span>
                      <strong style={{ color: CREAM, fontWeight: 600 }}>Auto-renew</strong> - order the next {quote.range.days} days automatically before this book runs out, to the same address, at that book&apos;s own price (it is your journal as it is then). Your card is saved for it only if this is on. Turn it off any time under Orders.
                    </span>
                  </label>

                  {chosen && (
                    <button
                      type="button"
                      onClick={() => void pay()}
                      disabled={busy !== null}
                      style={{ padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: "inherit", color: CREAM, background: ACCENT, border: "none", borderRadius: CONTROL_RADIUS, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}
                    >
                      {busy === "pay" ? "Opening the payment page…" : `Pay ${formatCents(chosen.price.totalCents)}`}
                    </button>
                  )}
                  <span style={{ fontSize: 11, color: cream(0.45), lineHeight: 1.45 }}>
                    You pay on Stripe&apos;s secure page. Lulu prints and posts it - printing takes 3-5 business days, then the post.
                  </span>
                  </>
                  )}
                </>
              )}

              {error && <p style={{ margin: 0, fontSize: 12, color: ERROR_INK, lineHeight: 1.45 }}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** The header's way in, beside Export PDF - the file you print yourself,
 *  and the book printed for you. A soft wash of the accent rather than its
 *  solid fill, which stays Export PDF's alone, and no border: none of the
 *  header's buttons has one (Andrew's pick, 2026-10-01; check:browser). */
export function OrderPrintButton({ journalId, weekStartDay }: { journalId: string; weekStartDay: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Order this journal printed and bound - any number of days, coil, paperback or hardcover, posted anywhere"
        style={{
          flexShrink: 0,
          padding: "4px 12px",
          fontSize: 12,
          fontFamily: "inherit",
          background: "rgba(74, 92, 255, 0.28)",
          color: CREAM,
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        Order print
      </button>
      {open && <OrderDialog journalId={journalId} weekStartDay={weekStartDay} onClose={() => setOpen(false)} />}
    </>
  );
}

"use client";

// Settings > Add clients from other tools (2026-10-30): the private web
// address Zapier, Make or a booking tool posts new clients to
// (clientIntake.ts, /api/business/clients/<token>). Shown once, like a
// client's link: only its hash is kept.

import { useState, useTransition } from "react";
import { makeIntakeAddress, turnOffIntakeAddress } from "./actions";
import css from "./business.module.css";

const EXAMPLE = `{
  "name": "Maya Okafor",
  "email": "maya@example.com",
  "street": "120 Elm Street",
  "city": "Jersey City",
  "state": "NJ",
  "zip": "07302",
  "country": "US",
  "start_date": "2027-01-04",
  "months": 3
}`;

export function IntakeAddress({ madeOn, guest }: { madeOn: string | null; guest: boolean }) {
  const [on, setOn] = useState(madeOn);
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const make = () =>
    start(async () => {
      const result = await makeIntakeAddress();
      if (result.url) {
        setUrl(result.url);
        setOn(new Date().toISOString().slice(0, 10));
        setCopied(false);
        setError(null);
      } else setError(result.error ?? "The address could not be made.");
    });
  const off = () =>
    start(async () => {
      await turnOffIntakeAddress();
      setOn(null);
      setUrl(null);
    });
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={css.card}>
      <h2>Add clients from other tools</h2>
      <p className={css.dim}>
        When someone buys a package in Paperbell, Kajabi, Stripe or anything Zapier or Make can connect, they can arrive here as a client. In Zapier, choose your tool&rsquo;s
        &ldquo;new purchase&rdquo; as the trigger, then &ldquo;Webhooks by Zapier&rdquo;, POST, to the address below. A client already here is never added twice.
      </p>
      {guest ? (
        <p className={css.dim}>Sign in to add clients from other tools: the address belongs to your account.</p>
      ) : (
        <>
          {url ? (
            <div className={css.field}>
              <span>Your address (shown once: copy it now)</span>
              <input type="text" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Your address for adding clients" />
            </div>
          ) : (
            <p>{on ? <>An address has been on since {on}. It isn&rsquo;t shown again: make a new one to see it, and the old one stops.</> : "No address yet."}</p>
          )}
          <div className={css.actions}>
            {url && (
              <button type="button" className={`${css.btn} ${css.primary}`} onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </button>
            )}
            <button type="button" className={`${css.btn} ${!url ? css.primary : ""}`} disabled={pending} onClick={make}>
              {on ? "Make a new address" : "Make an address"}
            </button>
            {on && (
              <button type="button" className={css.btn} disabled={pending} onClick={off}>
                Turn it off
              </button>
            )}
          </div>
          <details>
            <summary className={css.dim}>What to send</summary>
            <p className={css.dim}>
              One client a request, as JSON or a form. Only a name is needed; with no country, the US. A &ldquo;template&rdquo; field naming one of your templates puts them on
              it; otherwise your first template.
            </p>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, overflowX: "auto" }}>{EXAMPLE}</pre>
          </details>
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

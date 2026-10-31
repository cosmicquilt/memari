"use client";

import { useState, useTransition } from "react";
import { newClaimLink } from "./actions";
import css from "@/app/app/business/business.module.css";

/** A new claim link, shown once to copy; the old one stops. */
export function NewLink({ businessId }: { businessId: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className={css.actions} style={{ margin: 0 }}>
        <button type="button" className={css.btn} disabled={pending} onClick={() => start(async () => setResult(await newClaimLink(businessId)))}>
          {pending ? "Making…" : "New claim link"}
        </button>
      </div>
      {result?.url && (
        <p style={{ margin: 0, display: "grid", gap: 4 }}>
          <input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} aria-label="The new claim link" style={{ width: "100%" }} />
          <small className={css.dim}>Shown once; the old link has stopped. It works for 14 days.</small>
        </p>
      )}
      {result?.error && (
        <p className={css.error} role="alert">
          {result.error}
        </p>
      )}
    </div>
  );
}

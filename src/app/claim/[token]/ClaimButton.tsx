"use client";

import { useState, useTransition } from "react";
import { claimWorkspace } from "./actions";
import css from "@/app/app/business/business.module.css";

export function ClaimButton({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={`${css.btn} ${css.primary}`} disabled={pending} onClick={() => start(async () => setError((await claimWorkspace(token))?.error ?? null))}>
        {pending ? "Opening…" : "Open your workspace"}
      </button>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

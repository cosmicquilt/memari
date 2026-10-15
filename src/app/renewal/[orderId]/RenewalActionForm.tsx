"use client";

// The page's one button, and what went wrong if it did not work.

import { useActionState } from "react";
import { actOnRenewal, type RenewalActionState } from "../actions";
import styles from "../renewal.module.css";

export function RenewalActionForm({ orderId, action, signature, label }: { orderId: string; action: "skip" | "pause"; signature: string; label: string }) {
  const [state, submit, pending] = useActionState<RenewalActionState, FormData>(actOnRenewal, { error: null });
  return (
    <form action={submit} className={styles.form}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="do" value={action} />
      <input type="hidden" name="sig" value={signature} />
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "One moment…" : label}
      </button>
      {state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

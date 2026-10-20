"use client";

// The page's one button, and what went wrong if it did not work.

import { useActionState } from "react";
import { answerArrival, type ArrivalActionState } from "../actions";
import styles from "../../renewal/renewal.module.css";

export function ArrivalAnswerForm({ orderId, answer, signature, label }: { orderId: string; answer: "yes" | "no"; signature: string; label: string }) {
  const [state, submit, pending] = useActionState<ArrivalActionState, FormData>(answerArrival, { error: null });
  return (
    <form action={submit} className={styles.form}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="a" value={answer} />
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

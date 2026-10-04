"use client";

// Cancel one book from the Orders page, while the printer has not begun it
// (orders.ts, cancelByCustomer). Two presses: the first asks, in place,
// what cancelling does; the second does it. The printer has the last word -
// if it has started, the answer says so and nothing is refunded.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREAM, cream } from "@/lib/cream";
import { cancelOrder } from "@/app/planner/printActions";

const ERROR_INK = "#ff8a80";

const quiet = { padding: "5px 10px", fontSize: 12, fontFamily: "inherit", border: "none", borderRadius: 6, cursor: "pointer" } as const;

export function CancelOrderButton({ orderId, total }: { orderId: string; total: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    setBusy(true);
    setError(null);
    const result = await cancelOrder(orderId);
    setBusy(false);
    setAsking(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    // Beside "Order the next" until it asks or answers; then the row's
    // whole width, so the words have room.
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: asking || error ? "1 1 100%" : "none" }}>
      {!asking ? (
        <button type="button" onClick={() => setAsking(true)} style={{ ...quiet, alignSelf: "flex-start", background: cream(0.08), color: cream(0.8) }}>
          Cancel this book
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: cream(0.05), borderRadius: 6 }}>
          <span style={{ fontSize: 12, lineHeight: 1.5 }}>
            Stop this book before it is printed? The whole {total} goes back to your card, and auto-renew is turned off for it.
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" disabled={busy} onClick={() => void cancel()} style={{ ...quiet, background: "#8c2f2a", color: CREAM, opacity: busy ? 0.7 : 1, cursor: busy ? "default" : "pointer" }}>
              {busy ? "Asking the printer…" : "Yes, cancel and refund"}
            </button>
            <button type="button" disabled={busy} onClick={() => setAsking(false)} style={{ ...quiet, background: cream(0.08), color: cream(0.8) }}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {error && <span style={{ fontSize: 12, color: ERROR_INK, lineHeight: 1.45 }}>{error}</span>}
    </div>
  );
}

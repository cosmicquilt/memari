"use client";

// Retry, Refund and Mark arrived for one order, the first two asking once
// more before they act - a refund cannot be taken back.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREAM, cream } from "@/lib/cream";
import { markArrivedAction, refundOrderAction, retryOrderAction } from "./actions";

const button = (background: string) => ({
  padding: "5px 10px",
  fontSize: 12,
  fontFamily: "inherit",
  color: CREAM,
  background,
  border: "none",
  borderRadius: 3,
  cursor: "pointer",
});

export function OrderActions({ orderId, canRetry, canRefund, canMarkArrived }: { orderId: string; canRetry: boolean; canRefund: boolean; canMarkArrived: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState<"retry" | "refund" | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (what: "retry" | "refund" | "arrived") => {
    setBusy(true);
    const outcome = what === "retry" ? await retryOrderAction(orderId) : what === "refund" ? await refundOrderAction(orderId, why) : await markArrivedAction(orderId);
    setBusy(false);
    setAsking(null);
    setResult(outcome.ok ? { ok: true, text: outcome.message } : { ok: false, text: outcome.error });
    router.refresh();
  };

  if (!canRetry && !canRefund && !canMarkArrived) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {asking === null && (
        <div style={{ display: "flex", gap: 6 }}>
          {canRetry && (
            <button type="button" disabled={busy} onClick={() => setAsking("retry")} style={button("#4a5cff")}>
              Retry
            </button>
          )}
          {canRefund && (
            <button type="button" disabled={busy} onClick={() => setAsking("refund")} style={button("#8a2a22")}>
              Refund
            </button>
          )}
          {canMarkArrived && (
            <button type="button" disabled={busy} onClick={() => void run("arrived")} style={button("#2f6b3a")}>
              {busy ? "Marking…" : "Mark arrived"}
            </button>
          )}
        </div>
      )}
      {asking === "retry" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
          <span>Send it to the printer again? Lulu charges our card again if it accepts.</span>
          <button type="button" disabled={busy} onClick={() => void run("retry")} style={button("#4a5cff")}>
            {busy ? "Sending…" : "Yes, retry"}
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(null)} style={button(cream(0.15))}>
            No
          </button>
        </div>
      )}
      {asking === "refund" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, flexWrap: "wrap" }}>
          <span>Refund the whole order? It can&apos;t be undone.</span>
          <input
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            placeholder="Why (kept on the order)"
            style={{ padding: "5px 8px", fontSize: 12, fontFamily: "inherit", color: CREAM, background: cream(0.08), border: "none", borderRadius: 3, minWidth: 200 }}
          />
          <button type="button" disabled={busy} onClick={() => void run("refund")} style={button("#8a2a22")}>
            {busy ? "Refunding…" : "Yes, refund"}
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(null)} style={button(cream(0.15))}>
            No
          </button>
        </div>
      )}
      {result && <span style={{ fontSize: 12, color: result.ok ? "#9fe0a8" : "#ff8a80" }}>{result.text}</span>}
    </div>
  );
}

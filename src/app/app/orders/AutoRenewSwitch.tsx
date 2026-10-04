"use client";

// One order's auto-renew, switchable from the Orders page. Off is always
// allowed; on needs the card saved when it was paid for (printActions.ts).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREAM, cream } from "@/lib/cream";
import { setAutoRenew } from "@/app/planner/printActions";

const ACCENT = "#4a5cff";

export function AutoRenewSwitch({ orderId, on, renewsAt, days }: { orderId: string; on: boolean; renewsAt: string | null; days: number }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const flip = async () => {
    setBusy(true);
    setError(null);
    const result = await setAutoRenew(orderId, !value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setValue(!value);
    router.refresh();
  };

  const when = renewsAt ? new Date(renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, cursor: busy ? "default" : "pointer" }}>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={busy}
          onClick={() => void flip()}
          style={{ flex: "none", width: 34, height: 20, padding: 2, border: "none", borderRadius: 10, background: value ? ACCENT : cream(0.18), cursor: "inherit", display: "flex", justifyContent: value ? "flex-end" : "flex-start", opacity: busy ? 0.6 : 1 }}
        >
          <span style={{ width: 16, height: 16, borderRadius: 8, background: CREAM, display: "block" }} />
        </button>
        <span>
          Auto-renew {value ? `on - the next ${days} days are ordered${when ? ` on ${when}` : ""}` : "off"}
        </span>
      </label>
      {error && <span style={{ fontSize: 12, color: "#ff8a80" }}>{error}</span>}
    </div>
  );
}

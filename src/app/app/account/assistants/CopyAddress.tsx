"use client";

// The connector's address, to select or copy.

import { useState } from "react";

export function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <code style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 10px", background: "#2a2a2a", borderRadius: 8, fontSize: 13.5, overflowWrap: "anywhere", userSelect: "all" }}>{address}</code>
      <button
        type="button"
        className="acct-btn acct-primary"
        onClick={() => {
          void navigator.clipboard
            .writeText(address)
            .then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
            .catch(() => {});
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

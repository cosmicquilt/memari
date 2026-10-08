"use client";

// Signing out, and deleting everything - asked twice: the button opens the
// summary of what goes, and only typing "delete" arms the last one.

import { useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { cream } from "@/lib/cream";
import { deleteAccount, deletionSummary, type DeletionSummary } from "../actions";

export function SignOut() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="acct-btn"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signOut({ redirectUrl: "/" });
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DeleteAccount({ guest }: { guest: boolean }) {
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!summary) {
    return (
      <div>
        <button
          type="button"
          className="acct-btn acct-danger"
          disabled={pending}
          onClick={() =>
            start(async () => {
              try {
                setSummary(await deletionSummary());
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })
          }
        >
          {pending ? "Checking…" : guest ? "Delete my guest work…" : "Delete my account…"}
        </button>
        {error && <p style={{ color: "#ff8f7a", fontSize: 13, marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  const goes = [
    plural(summary.journals, "journal"),
    plural(summary.savedPages, "saved page"),
    plural(summary.savedModules, "saved module"),
    plural(summary.calendars, "calendar"),
  ];
  const armed = typed.trim().toLowerCase() === "delete";
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ fontSize: 13.5, color: cream(0.85) }}>This deletes {goes.join(", ")}{guest ? "" : ", and your sign-in"}.</p>
      {summary.booksOnTheWay > 0 && (
        <p className="acct-dim">
          {plural(summary.booksOnTheWay, "printed book is", "printed books are")} already with the printer or on the way and will still arrive. The order records are kept as receipts.
        </p>
      )}
      {summary.renewing > 0 && <p className="acct-dim">Your renewing {summary.renewing === 1 ? "book stops" : "books stop"} renewing: nothing more will be charged.</p>}
      <label style={{ display: "grid", gap: 6, maxWidth: 320 }}>
        <span style={{ fontSize: 13, color: cream(0.75) }}>Type &ldquo;delete&rdquo; to confirm</span>
        <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
      </label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="acct-btn acct-danger"
          disabled={!armed || pending}
          onClick={() =>
            start(async () => {
              try {
                await deleteAccount(typed);
                // A full load, not a client navigation: the session is gone,
                // and nothing cached from it should paint again.
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate, see above
                window.location.assign("/");
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })
          }
        >
          {pending ? "Deleting…" : "Delete everything"}
        </button>
        <button type="button" className="acct-btn" disabled={pending} onClick={() => { setSummary(null); setTyped(""); setError(null); }}>
          {guest ? "Keep it" : "Keep my account"}
        </button>
      </div>
      {error && <p style={{ color: "#ff8f7a", fontSize: 13 }}>{error}</p>}
    </div>
  );
}

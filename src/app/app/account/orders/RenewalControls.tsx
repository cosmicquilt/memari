"use client";

// "Coming up" on the Orders page: each journal's next book that auto-renew
// will order, with Skip this one and Stop auto-renew one press away (asked
// 2026-10-15: "One-click skip and cancel, never buried"). Each answers in
// place with an Undo, so one press is safe. See renewalControls.ts.
//
// Drawn to the editor's Apple-derived rules (memory: editor design
// language; asked again 2026-10-15, "base ui off of apple"): the account's
// own card surface, quiet #2a2a2a controls at a 36px tap height (.acct-btn,
// account/layout.tsx), no accent on a row - every action here is equal, and
// the accent stays the page's one primary (Sign in, for a guest) - and the
// 11px tracked label.
//
// The list keeps what was just done, by journal, across the page's refresh:
// after a skip the journal's next book is a different one, and after a stop
// it has none, so the row would otherwise vanish with its Undo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CREAM, cream } from "@/lib/cream";
import { setAutoRenew, skipRenewal, undoSkipRenewal } from "@/app/planner/printActions";

const ERROR_INK = "#ff8a80";

export type ComingUp = {
  /** The journal: one row each. */
  key: string;
  orderId: string;
  title: string;
  /** The next book's days, as the page says them. */
  range: string;
  days: number;
  /** When it is ordered - the card is charged then. */
  orderedOn: string;
  /** What skipping says: the days after, and when they are ordered. */
  afterRange: string;
  afterOrderedOn: string;
  pagesHref: string | null;
};

type Done = { kind: "skipped"; skippedId: string; said: string } | { kind: "stopped"; said: string };

type Outcome = { ok: true; value?: unknown } | { ok: false; error: string };

function without<T>(all: Record<string, T>, key: string): Record<string, T> {
  const rest = { ...all };
  delete rest[key];
  return rest;
}

export function ComingUpList({ items }: { items: ComingUp[] }) {
  const router = useRouter();
  // Rows acted on: the row as it was, and what was done to it.
  const [acted, setActed] = useState<Record<string, { item: ComingUp; done: Done }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const run = async (key: string, work: () => Promise<Outcome>, then: (value: unknown) => void) => {
    setBusy(key);
    setErrors((all) => without(all, key));
    const result = await work();
    setBusy(null);
    if (!result.ok) {
      setErrors((all) => ({ ...all, [key]: result.error }));
      return;
    }
    then(result.value);
    router.refresh();
  };

  const forget = (key: string) => setActed((all) => without(all, key));

  const skip = (item: ComingUp) =>
    run(
      item.key,
      () => skipRenewal(item.orderId),
      (value) =>
        setActed((all) => ({
          ...all,
          [item.key]: {
            item,
            done: { kind: "skipped", skippedId: (value as { skippedId: string }).skippedId, said: `Skipped. Nothing is printed or charged for ${item.range}; ${item.afterRange} is ordered on ${item.afterOrderedOn}.` },
          },
        }))
    );
  const stop = (item: ComingUp) =>
    run(
      item.key,
      () => setAutoRenew(item.orderId, false),
      () => setActed((all) => ({ ...all, [item.key]: { item, done: { kind: "stopped", said: "Auto-renew is off. Nothing more is ordered for this journal." } } }))
    );
  const undo = (key: string) => {
    const entry = acted[key];
    if (!entry) return;
    const { item, done } = entry;
    void run(key, () => (done.kind === "skipped" ? undoSkipRenewal(done.skippedId) : setAutoRenew(item.orderId, true)), () => forget(key));
  };

  const keys = [...new Set([...items.map((item) => item.key), ...Object.keys(acted)])];
  if (keys.length === 0) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 11, fontWeight: 600, color: cream(0.6), textTransform: "uppercase", letterSpacing: "0.06em" }}>Coming up</h2>
      {keys.map((key) => {
        const entry = acted[key];
        const item = entry?.item ?? items.find((each) => each.key === key)!;
        const working = busy === key;
        return (
          <article key={key} className="acct-card" style={{ gap: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <strong style={{ flex: 1, minWidth: 0, color: CREAM, fontSize: 14 }}>{item.title}</strong>
              <span style={{ fontSize: 12, color: cream(0.6) }}>{item.days} days</span>
            </div>
            {!entry ? (
              <>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  {item.range} is ordered on <strong style={{ fontWeight: 600 }}>{item.orderedOn}</strong>, and your card is charged then.
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {item.pagesHref && (
                    <a href={item.pagesHref} className="acct-btn">
                      Change pages
                    </a>
                  )}
                  <button type="button" className="acct-btn" disabled={working} onClick={() => void skip(item)}>
                    Skip this one
                  </button>
                  <button type="button" className="acct-btn" disabled={working} onClick={() => void stop(item)}>
                    Stop auto-renew
                  </button>
                </div>
                <span style={{ fontSize: 12, color: cream(0.55), lineHeight: 1.45 }}>
                  If you skip, nothing is printed or charged for these days; the book after ({item.afterRange}) is ordered on {item.afterOrderedOn}.
                </span>
              </>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", fontSize: 13, lineHeight: 1.5 }}>
                <span style={{ flex: "1 1 260px", minWidth: 0 }}>{entry.done.said}</span>
                <button type="button" className="acct-btn" disabled={working} onClick={() => undo(key)}>
                  Undo
                </button>
              </div>
            )}
            {errors[key] && <span style={{ fontSize: 12, color: ERROR_INK, lineHeight: 1.45 }}>{errors[key]}</span>}
          </article>
        );
      })}
    </section>
  );
}

/** On a skipped book's own row: take the skip back, while the book after it
 *  has not been ordered. Auto-renew comes back on the book it stood in for. */
export function UndoSkipButton({ skippedId }: { skippedId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undo = async () => {
    setBusy(true);
    setError(null);
    const result = await undoSkipRenewal(skippedId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button type="button" className="acct-btn" disabled={busy} onClick={() => void undo()}>
        Undo skip
      </button>
      {error && <span style={{ fontSize: 12, color: ERROR_INK, lineHeight: 1.45 }}>{error}</span>}
    </div>
  );
}

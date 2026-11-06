"use client";

// The person's hearted covers, on the covers page (2026-11-05): read once
// from app/saved/covers, then changed there one heart at a time.
//
// A HEART SHOWS AT ONCE and the server's answer follows: every answer is the
// whole list, which then stands. The requests go one after another, never
// side by side, so two quick hearts cannot be answered out of order and
// leave the page showing one of them missing.

import { useCallback, useEffect, useRef, useState } from "react";

const ADDRESS = "/app/saved/covers";
const DID_NOT_KEEP = "That heart did not keep. Try again.";

type Answer = { hearts?: unknown; account?: unknown; error?: unknown };

export type CoverHearts = {
  /** the person's hearts have been read (until then none show) */
  ready: boolean;
  /** hearted cover ids, newest first */
  list: string[];
  has: (coverId: string) => boolean;
  toggle: (coverId: string) => void;
  /** kept on an account, not just this browser */
  account: boolean;
  /** why the last heart did not keep, until the next */
  problem: string | null;
};

async function ask(init?: RequestInit): Promise<{ ok: boolean; answer: Answer | null } | null> {
  const response = await fetch(ADDRESS, { cache: "no-store", ...init }).catch(() => null);
  if (!response) return null;
  return { ok: response.ok, answer: (await response.json().catch(() => null)) as Answer | null };
}

export function useCoverHearts(): CoverHearts {
  const [list, setList] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [account, setAccount] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // the list as it stands, for toggle to read between renders
  const current = useRef<string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const changed = useRef(false);

  const show = useCallback((next: string[]) => {
    current.current = next;
    setList(next);
  }, []);
  const take = useCallback(
    (answer: Answer | null | undefined) => {
      if (Array.isArray(answer?.hearts)) show(answer.hearts.filter((id): id is string => typeof id === "string"));
      if (typeof answer?.account === "boolean") setAccount(answer.account);
    },
    [show]
  );

  useEffect(() => {
    let live = true;
    void ask().then((reply) => {
      if (!live) return;
      // a heart made before this answer came carries the whole list itself
      if (!changed.current && reply?.ok) take(reply.answer);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [take]);

  const toggle = useCallback(
    (coverId: string) => {
      const on = !current.current.includes(coverId);
      changed.current = true;
      setProblem(null);
      show(on ? [coverId, ...current.current] : current.current.filter((id) => id !== coverId));
      queue.current = queue.current.then(async () => {
        const reply = await ask({ method: on ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ coverId }) });
        if (reply?.ok) {
          take(reply.answer);
          return;
        }
        setProblem(typeof reply?.answer?.error === "string" ? reply.answer.error : DID_NOT_KEEP);
        // show what is really kept, not what was hoped for: this heart undone
        // here, then the server's own list if it can be read
        show(on ? current.current.filter((id) => id !== coverId) : [coverId, ...current.current]);
        const now = await ask();
        if (now?.ok) take(now.answer);
      });
    },
    [show, take]
  );

  const has = useCallback((coverId: string) => list.includes(coverId), [list]);
  return { ready, list, has, toggle, account, problem };
}

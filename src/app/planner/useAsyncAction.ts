"use client";

import { useCallback, useState } from "react";

// The "click a button, call a server action, show a spinner while it's
// in flight, show any error inline afterward" shape shows up three times
// across the Properties and Week Settings panels (save content, resize,
// save week settings) — this is that pattern factored out once. Each
// call site passes its actual async work in at call time via run(), so
// the hook itself doesn't need to know anything about what it's running.
export function useAsyncAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }, []);

  return [pending, error, run] as const;
}

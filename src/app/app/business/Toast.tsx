"use client";

// Undo, not "are you sure?" (handoff/research/B2B-findings-summary.md): a
// change that can be taken back is made at once, with a toast that offers
// to take it back. The host sits round the whole business area, so the
// toast outlives the row it was about.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import css from "./business.module.css";

type Toast = { message: string; undo?: () => void | Promise<void> };
const ToastContext = createContext<(toast: Toast) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(Toast & { at: number }) | null>(null);
  const show = useCallback((t: Toast) => setToast({ ...t, at: Date.now() }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={css.toast} role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={async () => {
                const undo = toast.undo;
                setToast(null);
                await undo?.();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

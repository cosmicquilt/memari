// A prebuilt planner's buttons (2026-10-15): ORDER AS IS, straight to the
// order form with no editor (app/j/<journal>/order), and CHANGE IT FIRST,
// the whole book in the editor. The planner research (Gemini part B) put the
// order first: many buyers change nothing.
//
// Order as is is offered only where ordering works - production waits on
// the printer and Stripe keys - and always on this machine, so the way
// there can be tried. Without it, the one button is "Use this planner".
// Server-only: it reads the keys.

import { orderingConfigured } from "@/lib/print/orders";
import { UseThisWeek } from "./UseThisWeek";

export function orderAsIsOffered(): boolean {
  return orderingConfigured().ok || process.env.NODE_ENV !== "production";
}

export function PlannerActions({ plannerKey }: { plannerKey: string }) {
  if (!orderAsIsOffered()) return <UseThisWeek spreadKey={plannerKey} label="Use this planner" />;
  return (
    <>
      <UseThisWeek spreadKey={plannerKey} label="Order as is" then="order" />
      <UseThisWeek spreadKey={plannerKey} label="Change it first" quiet />
    </>
  );
}

/** What the buttons make, said plainly, under them. */
export function plannerActionsNote(makes: string): string {
  if (!orderAsIsOffered()) return `${makes} Change anything. No account needed to try it.`;
  return "Order as is goes straight to the order form, where you choose the days, binding and address and see the price before you pay. Change it first opens the whole book in the editor. No account needed for either.";
}

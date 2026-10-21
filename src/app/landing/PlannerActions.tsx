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
import { SaveButton } from "@/app/planner/templateSaved";
import { PLANNER_BY_KEY } from "./plannerTemplates";

export function orderAsIsOffered(): boolean {
  return orderingConfigured().ok || process.env.NODE_ENV !== "production";
}

export function PlannerActions({ plannerKey }: { plannerKey: string }) {
  // Save, to come back to from Saved in the app (2026-10-21).
  const save = <SaveButton save={{ kind: "planner", key: plannerKey }} what={`the ${PLANNER_BY_KEY[plannerKey]?.title ?? ""} planner`} />;
  if (!orderAsIsOffered())
    return (
      <>
        <UseThisWeek spreadKey={plannerKey} label="Use this planner" />
        {save}
      </>
    );
  return (
    <>
      <UseThisWeek spreadKey={plannerKey} label="Order as is" then="order" />
      <UseThisWeek spreadKey={plannerKey} label="Change it first" quiet />
      {save}
    </>
  );
}

/** What the buttons make, said plainly, under them. */
export function plannerActionsNote(makes: string): string {
  if (!orderAsIsOffered()) return `${makes} Change anything. No account needed to try it.`;
  return "Order as is goes straight to the order form, where you choose the days, binding and address and see the price before you pay. Change it first opens the whole book in the editor. No account needed for either.";
}

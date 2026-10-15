"use server";

// The one button on the reminder's skip and pause pages (page.tsx). The
// signature on the link is what lets it act without signing in, so it is
// checked again here - the page having shown a button proves nothing.

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pastSkips, RenewalControlError, skipNextBook, stopAutoRenew, verifyRenewalAction } from "@/lib/print/renewalControls";

export type RenewalActionState = { error: string | null };

export async function actOnRenewal(_previous: RenewalActionState, form: FormData): Promise<RenewalActionState> {
  const orderId = String(form.get("orderId") ?? "");
  const action = form.get("do") as string | null;
  const signature = form.get("sig") as string | null;
  if (!verifyRenewalAction(orderId, action, signature)) return { error: "This link doesn't work any more. Sign in and use your Orders page." };
  const order = await prisma.printOrder.findUnique({ where: { id: orderId }, select: { id: true, ownerId: true } });
  if (!order) return { error: "That order could not be found." };
  try {
    if (action === "skip") await skipNextBook(order.ownerId, order.id);
    else {
      // From an email sent before a skip: the skipped book now carries it.
      const renewing = await pastSkips(order.id);
      await stopAutoRenew(order.ownerId, renewing?.id ?? order.id);
    }
  } catch (error) {
    if (error instanceof RenewalControlError) return { error: error.message };
    console.error("[renewal] email action failed:", error);
    return { error: "Something went wrong. Try again in a moment, or use your Orders page." };
  }
  // Back to the same page, which now reads as done.
  redirect(`/renewal/${encodeURIComponent(order.id)}?do=${action}&sig=${signature}`);
}

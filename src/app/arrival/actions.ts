"use server";

// The one button on the arrival pages (page.tsx). The signature on the link
// is what lets it act without signing in, so it is checked again here - the
// page having shown a button proves nothing.

import { redirect } from "next/navigation";
import { recordArrivalAnswer, verifyArrival } from "@/lib/print/delivery";

export type ArrivalActionState = { error: string | null };

export async function answerArrival(_previous: ArrivalActionState, form: FormData): Promise<ArrivalActionState> {
  const orderId = String(form.get("orderId") ?? "");
  const answer = form.get("a") as string | null;
  const signature = form.get("sig") as string | null;
  if (!verifyArrival(orderId, answer, signature)) return { error: "This link doesn't work any more. Reply to our email instead." };
  try {
    if ((await recordArrivalAnswer(orderId, answer)) === "gone") return { error: "This order isn't on its way any more." };
  } catch (error) {
    console.error("[arrival] answer failed:", error);
    return { error: "Something went wrong. Try again in a moment, or reply to our email." };
  }
  // Back to the same page, which now reads as answered.
  redirect(`/arrival/${encodeURIComponent(orderId)}?a=${answer}&sig=${signature}`);
}

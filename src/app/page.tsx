import type { Metadata } from "next";
import { currentOwner } from "@/lib/owner";
import { Landing } from "./landing/Landing";

// memari.studio's front door: the landing page, for everyone (Andrew,
// 2026-09-22 - signed-in visitors see it too, with "Open Memari" in place of
// "Sign in" and "Start your planner"). It used to redirect straight to sign
// in and then the editor, which it did "for now" until this existed.

export const metadata: Metadata = {
  title: "Memari Studio - a planner as unique as you",
  description:
    "Design each page of your planner once - hours, habits, lists, notes - and Memari lays out the whole book, dated and ready to print.",
};

export default async function Home() {
  // A guest counts as someone already using Memari: they get "Open Memari".
  const owner = await currentOwner();
  return <Landing signedIn={owner !== null} />;
}

// memari.studio/app/j/<journal>/order - ORDER IT AS IT IS (2026-10-15).
// Where a planner's "Order as is" leads (layouts/<key>, via app/from/<key>):
// the order form on its own, with no editor to load or learn. The planner
// research (Gemini part B) found people who change nothing are best served by
// going straight to checkout; the editor stays one link away for anyone who
// wants to change something first.
//
// The journal is the person's own - a guest's too - like the editor's
// address (planner/levelPage.tsx).

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { claimGuestWork, currentOwner, signInPath } from "@/lib/owner";
import { isJournalSlug } from "@/lib/journalSlug";
import { prisma } from "@/lib/prisma";
import type { PlannerTheme } from "@/lib/theme";
import { journalIdForSlug, journalSlugOf } from "@/app/planner/journalSlugs";
import { StandaloneOrder } from "./StandaloneOrder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Order your journal - memari. STUDIO", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ journalId: string }> }) {
  const { journalId: address } = await params;
  const owner = await currentOwner();
  if (!owner) redirect(signInPath(`/app/j/${address}/order`));
  if (!owner.guest) await claimGuestWork(owner.id);

  const id = isJournalSlug(address) ? await journalIdForSlug(owner.id, address) : address;
  const journal = id ? await prisma.planner.findFirst({ where: { id, ownerId: owner.id, isTemplate: false }, select: { id: true, title: true, theme: true } }) : null;
  if (!journal) notFound();
  const slug = await journalSlugOf(journal.id);
  if (address !== slug) redirect(`/app/j/${slug}/order`);
  const theme = (journal.theme as PlannerTheme | null) ?? {};

  return <StandaloneOrder journalId={journal.id} title={journal.title} slug={slug} weekStartDay={theme.weekStartDay ?? 0} />;
}

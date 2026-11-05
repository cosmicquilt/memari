// /dev/covers?journal=<id> (development only): the order screen's Cover
// section on its own, in the screen's panel - for check:covers and the
// proof's photographs, as ordering is switched off where the printers' keys
// are not set, and the order screen with it.

import { notFound } from "next/navigation";
import { CoverChoice } from "@/app/planner/CoverChoice";
import { journalCover, photographedCoversOffered } from "@/lib/print/coverScans";
import { currentOwnerId } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { cleanCoverFront } from "@/lib/print/coverFront";
import { coverDatesWords } from "@/lib/print/coverDates";
import { orderRange } from "@/lib/print/orderRange";
import type { PlannerTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function DevCovers({ searchParams }: { searchParams: Promise<{ journal?: string; offered?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { journal: id, offered } = await searchParams;
  const ownerId = await currentOwnerId();
  const journal = id && ownerId ? await prisma.planner.findFirst({ where: { id, ownerId }, select: { id: true, theme: true, dated: true } }) : null;
  if (!journal) return <p style={{ padding: 24 }}>Open with ?journal= one of your journals.</p>;
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#3a3a3c", padding: 16 }}>
      <div style={{ width: 520, maxWidth: "100%", padding: 16, background: "#1c1c1e", borderRadius: 12, color: "#ddd", colorScheme: "dark", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(245,234,213,0.6)" }}>Cover</span>
        <CoverChoice
          journalId={journal.id}
          coverId={journalCover(journal.theme)?.id ?? null}
          front={cleanCoverFront((journal.theme as PlannerTheme | null)?.coverFront)}
          dated={journal.dated}
          // the book check:covers previews: 90 days from 1 January 2027
          datesWords={coverDatesWords(orderRange(new Date("2027-01-01T00:00:00Z"), 90))}
          offered={offered === "0" ? false : photographedCoversOffered()}
        />
      </div>
    </div>
  );
}

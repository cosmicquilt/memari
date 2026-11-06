// /dev/covers?journal=<id> (development only): the order screen's Cover
// section on its own, in the screen's panel - for check:covers and the
// proof's photographs, as ordering is switched off where the printers' keys
// are not set, and the order screen with it.
//
// It reads the journal as the order screen does, through journalCoverChoice
// (2026-11-05), so what check:covers sees here - the cover, its front, the
// person's hearts first - is what the order screen is handed.

import { notFound } from "next/navigation";
import { CoverChoice } from "@/app/planner/CoverChoice";
import { journalCoverChoice } from "@/app/planner/printActions";
import { photographedCoversOffered } from "@/lib/print/coverScans";
import { coverDatesWords } from "@/lib/print/coverDates";
import { orderRange } from "@/lib/print/orderRange";

export const dynamic = "force-dynamic";

export default async function DevCovers({ searchParams }: { searchParams: Promise<{ journal?: string; offered?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { journal: id, offered } = await searchParams;
  const choice = id ? await journalCoverChoice(id) : null;
  if (!id || !choice) return <p style={{ padding: 24 }}>Open with ?journal= one of your journals.</p>;
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#3a3a3c", padding: 16 }}>
      <div style={{ width: 520, maxWidth: "100%", padding: 16, background: "#1c1c1e", borderRadius: 12, color: "#ddd", colorScheme: "dark", display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(245,234,213,0.6)" }}>Cover</span>
        <CoverChoice
          journalId={id}
          coverId={choice.coverId}
          front={choice.front}
          dated={choice.dated}
          // the book check:covers previews: 90 days from 1 January 2027
          datesWords={coverDatesWords(orderRange(new Date("2027-01-01T00:00:00Z"), 90))}
          offered={offered === "0" ? false : photographedCoversOffered()}
          hearted={choice.hearts}
        />
      </div>
    </div>
  );
}

// When a book should arrive, in words, from a printer's ISO dates - for the
// order screen and a client's own page alike (2026-10-25: the client's page
// printed "Arrives 2026-11-02 to 2026-11-05").

/** "Arrives 21 – 28 Oct" (or "30 Oct – 4 Nov"), from a printer's ISO dates. */
export function arrivesLabel(arrives: { earliest: string; latest: string }): string {
  const date = (iso: string) => new Date(`${iso}T12:00:00Z`);
  const day = (iso: string) => date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  if (arrives.earliest === arrives.latest) return `Arrives ${day(arrives.earliest)}`;
  const sameMonth = arrives.earliest.slice(0, 7) === arrives.latest.slice(0, 7);
  return `Arrives ${sameMonth ? date(arrives.earliest).getUTCDate() : day(arrives.earliest)} – ${day(arrives.latest)}`;
}

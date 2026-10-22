// memari. for businesses: the words the charts use, in a plain module so a
// page (a server component) can write the same words into a chart's table
// view as charts.tsx writes beside its marks.

export type TimelineRow = {
  key: string;
  name: string;
  href?: string;
  books: Array<{ id: string; start: string; end: string; stage: string }>;
  state: "out" | "soon" | "ok" | "not started";
  coveredTo: string | null;
  firstStart: string | null;
};

export const DAY = 24 * 60 * 60 * 1000;
export const at = (isoDay: string) => Date.parse(`${isoDay}T00:00:00Z`);
export const shortDate = (isoDay: string) => new Date(at(isoDay)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** A row's state in words, with its icon where it wants attention. */
export function stateWords(r: Pick<TimelineRow, "state" | "coveredTo" | "firstStart"> & { books?: TimelineRow["books"] }): { icon: "out" | "warn" | null; text: string } {
  // a book ordered that never printed, and nothing else covering them: that
  // is what to say, not "no book"
  if (r.state !== "ok" && r.books?.some((b) => b.stage === "Needs attention" && (!r.coveredTo || b.end > r.coveredTo))) return { icon: "out", text: "Needs attention" };
  if (r.state === "out") return { icon: "out", text: r.coveredTo ? `Ran out ${shortDate(r.coveredTo)}` : "No book yet" };
  if (r.state === "soon") return { icon: "warn", text: r.coveredTo ? `Runs out ${shortDate(r.coveredTo)}` : `Book by ${shortDate(r.firstStart!)}` };
  if (r.state === "ok") return { icon: null, text: `To ${shortDate(r.coveredTo!)}` };
  return { icon: null, text: r.firstStart ? `Starts ${shortDate(r.firstStart)}` : "No start date" };
}

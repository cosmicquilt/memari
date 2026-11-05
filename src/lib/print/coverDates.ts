// The dates a cover prints, in words - a pure module, so the covers page
// can show a cover's dates exactly as the order will print them
// (2026-11-05, the covers page's "Make it yours"); orderBook.ts, which
// reads the database, re-exports it for the order, renewal and preview.

import { MONTH_NAMES } from "@/lib/pageLevels";
import type { OrderRange } from "./orderRange";

/** The dates as a photographed cover prints them, in words, as the
 *  carousel set them ("January to March 2027"): whole months by their
 *  names, any other days by their dates, "4 January to 3 April 2027". */
export function coverDatesWords(range: Pick<OrderRange, "start" | "end">): string {
  const { start, end } = range;
  const month = (d: Date) => MONTH_NAMES[d.getUTCMonth()];
  const lastOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() === d.getUTCDate();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (start.getUTCDate() === 1 && lastOfMonth(end)) {
    if (sameYear && start.getUTCMonth() === end.getUTCMonth()) return `${month(start)} ${end.getUTCFullYear()}`;
    return sameYear ? `${month(start)} to ${month(end)} ${end.getUTCFullYear()}` : `${month(start)} ${start.getUTCFullYear()} to ${month(end)} ${end.getUTCFullYear()}`;
  }
  const day = (d: Date) => `${d.getUTCDate()} ${month(d)}`;
  return sameYear ? `${day(start)} to ${day(end)} ${end.getUTCFullYear()}` : `${day(start)} ${start.getUTCFullYear()} to ${day(end)} ${end.getUTCFullYear()}`;
}

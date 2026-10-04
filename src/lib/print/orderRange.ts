// WHAT DAYS AN ORDER COVERS, and when its renewal is ordered.
//
// "30 and 90 days are options but also a year and any other amount of days"
// (2026-10-04). An order is a start date and a number of days; the book is
// generated for exactly that range (generateBook walks a journal's start
// and end dates, both inclusive - pageLevels' occurrences).
//
// RENEWAL IS OFF unless turned on ("it should always default to auto renew
// off with the option to turn it on"). When it is on, the next book covers
// the days straight after this one, and is ordered early enough to arrive
// before this one runs out: printing takes Lulu 3-5 business days, and the
// post takes what the shipping level takes.
//
// All arithmetic in whole UTC days, as pageLevels' is.

const DAY = 86_400_000;

/** The lengths offered as buttons; any other number of days is typed. */
export const ORDER_LENGTH_PRESETS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "A year" },
] as const;
/** The most days one book may cover. Lulu's thickest binding stops at 800
 *  pages, which a year of daily pages comes near; two years cannot fit. */
export const MAX_ORDER_DAYS = 731;

export type OrderRange = { start: Date; end: Date; days: number };

/** Midnight UTC of a date's own day. */
export function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** `days` days from `start`, both ends included. */
export function orderRange(start: Date, days: number): OrderRange {
  const whole = Math.max(1, Math.min(MAX_ORDER_DAYS, Math.round(days)));
  const first = utcDay(start);
  return { start: first, end: new Date(first.getTime() + (whole - 1) * DAY), days: whole };
}

/** The range a renewal covers: the same number of days, starting the day
 *  after this one ends. */
export function nextRange(range: OrderRange): OrderRange {
  return orderRange(new Date(range.end.getTime() + DAY), range.days);
}

export type ShippingLevel = "MAIL" | "PRIORITY_MAIL" | "GROUND" | "EXPEDITED" | "EXPRESS";
export const SHIPPING_LEVELS: readonly ShippingLevel[] = ["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"];

/**
 * Days from ordering to the book in hand, generously: Lulu's 3-5 business
 * days of printing (a week of calendar days), the carrier's time, and a few
 * days' slack. An estimate for planning a renewal and suggesting a start
 * date - never promised to anyone.
 */
export function leadDays(level: ShippingLevel, international: boolean): number {
  const transit: Record<ShippingLevel, [domestic: number, abroad: number]> = {
    MAIL: [10, 21],
    PRIORITY_MAIL: [6, 12],
    GROUND: [7, 14],
    EXPEDITED: [4, 8],
    EXPRESS: [3, 6],
  };
  return 7 + transit[level][international ? 1 : 0] + 3;
}

/** When a renewal is ordered: early enough to arrive before this book's
 *  last day, and never before today. */
export function renewalDate(range: OrderRange, level: ShippingLevel, international: boolean, today: Date): Date {
  const due = new Date(range.end.getTime() - leadDays(level, international) * DAY);
  return due < utcDay(today) ? utcDay(today) : due;
}

/**
 * A first start date to offer: the first day of the journal's week on or
 * after the book could arrive. Changeable - this only spares the person
 * working it out, and a book that starts before it arrives starts with
 * pages already behind them.
 */
export function suggestedStart(today: Date, level: ShippingLevel, international: boolean, weekStartDay: number): Date {
  const arrives = new Date(utcDay(today).getTime() + leadDays(level, international) * DAY);
  const ahead = (weekStartDay - arrives.getUTCDay() + 7) % 7;
  return new Date(arrives.getTime() + ahead * DAY);
}

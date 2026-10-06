// DAY ICONS: a small icon on the days something happens - trash day,
// recycling, payday, the vet - printed by the date on the weekly and daily
// pages' day headers and in the month grid's cells, to colour in by hand.
//
// Asked 2026-10-06: a "color inable trash can that can be added on trash days
// on weekly and monthly and daily spreads", set "in the module editor", and
// "customizable though like it can be one off or repeated once every
// whatever or skip or first monday etc."
//
// ONE SCHEDULE DESCRIPTION. A day icon's timing is an RFC 5545 rule run by
// the SAME engine as calendar events (calendarEvents.ts): a one-off is a
// start date with no rule; "every other Tuesday" is FREQ=WEEKLY;INTERVAL=2;
// BYDAY=TU; "the first Monday" is FREQ=MONTHLY;BYDAY=1MO; a skipped day is a
// cancelled occurrence, as a skipped event's is. A second scheduler here
// would be the "two descriptions of one thing" defect this project keeps
// paying for.
//
// THE JOURNAL'S, not a module's: stored once on Planner.theme, so the hours
// (weekly and daily pages) and the month grid (monthly pages) read the same
// list - trash day is trash day on every page - and either editor changes it.

import { GLYPH_SHAPES, type GlyphShape } from "./modules/glyphs";
import { eventsForDays, type StoredEvent } from "./calendarEvents";

export type DayIcon = {
  /** Stable, for keys and for telling two the same apart. */
  id: string;
  icon: GlyphShape;
  /** The first (or only) day, "YYYY-MM-DD". */
  start: string;
  /** An RFC 5545 rule without "RRULE:", or null for a one-off. */
  rrule: string | null;
  /** Days left out of the series, "YYYY-MM-DD". */
  skips: string[];
  /** Words for the editor's list ("Trash"). Never printed. */
  name?: string;
};

/** Enough for a household's bins, bills and appointments, few enough that a
 *  day header never has to hold a crowd. */
export const MAX_DAY_ICONS = 12;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDay = (v: unknown): v is string => typeof v === "string" && ISO_DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/**
 * The list, cleaned: anything malformed is dropped rather than drawn wrong,
 * a rule is kept only if it has a FREQ (the engine decides the rest - an
 * unreadable rule draws nothing there), and the list is capped.
 */
export function cleanDayIcons(value: unknown): DayIcon[] {
  if (!Array.isArray(value)) return [];
  const out: DayIcon[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!GLYPH_SHAPES.includes(r.icon as GlyphShape) || !isIsoDay(r.start)) continue;
    const rule = typeof r.rrule === "string" ? r.rrule.trim().replace(/^RRULE:/i, "") : "";
    const rrule = /(^|;)FREQ=/i.test(rule) ? rule.slice(0, 200) : null;
    const skips = Array.isArray(r.skips) ? [...new Set(r.skips.filter(isIsoDay))].sort().slice(0, 200) : [];
    const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= 40 ? r.id : `di${out.length}-${r.start}`;
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 40) : undefined;
    out.push({ id, icon: r.icon as GlyphShape, start: r.start, rrule, skips, ...(name ? { name } : {}) });
    if (out.length >= MAX_DAY_ICONS) break;
  }
  return out;
}

/** The journal's day icons, from its theme. */
export function dayIconsOf(theme: unknown): DayIcon[] {
  return cleanDayIcons((theme as { dayIcons?: unknown } | null | undefined)?.dayIcons);
}

const midnight = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A day icon as the calendar engine sees one: an all-day event, its skips
 *  cancelled occurrences. */
function asEvent(icon: DayIcon): StoredEvent {
  const startsAt = midnight(icon.start);
  return {
    id: icon.id,
    title: "",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 86_400_000),
    allDay: true,
    rrule: icon.rrule,
    timeZone: "UTC",
    overrides: icon.skips.map((day) => ({ recurrenceId: midnight(day), cancelled: true })),
  };
}

/**
 * For each date ("YYYY-MM-DD", or null for a column with none), the icons
 * that fall on it, in the list's order.
 */
export function iconsOnDates(icons: DayIcon[], dates: Array<string | null>): GlyphShape[][] {
  const out: GlyphShape[][] = dates.map(() => []);
  if (icons.length === 0) return out;
  const byId = new Map(icons.map((icon, order) => [icon.id, { icon: icon.icon, order }]));
  const placed = eventsForDays(
    icons.map(asEvent),
    dates.map((date) => ({ date: date && isIsoDay(date) ? midnight(date) : null })),
    "UTC"
  );
  const perDay: Array<Array<{ icon: GlyphShape; order: number }>> = dates.map(() => []);
  for (const mark of placed) {
    const found = byId.get(mark.id ?? "");
    if (found) perDay[mark.day].push(found);
  }
  perDay.forEach((list, day) => {
    out[day] = list.sort((a, b) => a.order - b.order).map((entry) => entry.icon);
  });
  return out;
}

/** "YYYY-MM-DD" of a UTC date. */
export const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/**
 * WHICH DAY EACH MONTH CELL IS, read off the number the cell prints - so an
 * icon cannot land in a cell showing some other date. A cell outside the
 * month is the month before in the first week and the month after in any
 * later one: that is the only place computeMonthCalendar puts them. Null for
 * a cell with no number (an undated book).
 */
export function monthCellDates(
  cells: Array<Array<{ date?: number | null; inCurrentMonth?: boolean }>>,
  /** Any day of the month the page is - the occurrence's start. */
  month: Date
): Array<Array<string | null>> {
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  return cells.map((week, w) =>
    week.map((cell) => {
      if (typeof cell?.date !== "number") return null;
      const shift = cell.inCurrentMonth === false ? (w === 0 ? -1 : 1) : 0;
      // Date.UTC carries a month of -1 or 12 into the next year.
      return isoDay(new Date(Date.UTC(year, index + shift, cell.date)));
    })
  );
}

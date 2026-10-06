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

// --- THE EDITOR'S TERMS -----------------------------------------------------
//
// What the day icon editor shows - "repeats weekly, every 2 weeks, on Tuesday,
// ends after 10 times" - read from and written to the stored rule. The rule is
// the one description; this is a way of looking at it, and only rules this
// writes are rules it has to read.

export type RepeatFreq = "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type Repeat = {
  freq: RepeatFreq;
  /** Every how many days, weeks, months or years: 1 to 99. */
  interval: number;
  /** WEEKLY: on which days, 0 Sunday to 6 Saturday. */
  weekdays: number[];
  /** MONTHLY: on a date ("the 14th") or a weekday ("the first Monday"). */
  monthlyBy: "day" | "weekday";
  /** MONTHLY by date: 1 to 31, or -1 for the last day. */
  monthDay: number;
  /** MONTHLY by weekday: 1 to 4, or -1 for the last. */
  ordinal: number;
  weekday: number;
  ends: "never" | "until" | "count";
  /** "YYYY-MM-DD", inclusive. */
  until: string;
  count: number;
};

const CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export const WEEKDAY_WORDS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_WORDS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const ORDINAL_WORDS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };
const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
export const addDays = (iso: string, days: number) => isoDay(new Date(midnight(iso).getTime() + days * 86_400_000));

/** "14th", "1st", "22nd" - or "last day". */
export function dayOrdinal(day: number): string {
  if (day === -1) return "last day";
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th";
  return `${day}${suffix}`;
}

/** What a new icon starting on `start` repeats as: weekly, on that day. */
export function defaultRepeat(start: string): Repeat {
  const date = midnight(start);
  return {
    freq: "WEEKLY",
    interval: 1,
    weekdays: [date.getUTCDay()],
    monthlyBy: "day",
    monthDay: date.getUTCDate(),
    ordinal: Math.min(4, Math.ceil(date.getUTCDate() / 7)),
    weekday: date.getUTCDay(),
    ends: "never",
    until: addDays(start, 91),
    count: 10,
  };
}

/** A stored icon's schedule, in the editor's terms. */
export function repeatOf(icon: Pick<DayIcon, "start" | "rrule">): Repeat {
  const base = defaultRepeat(icon.start);
  if (!icon.rrule) return { ...base, freq: "ONCE" };
  const parts: Record<string, string> = Object.fromEntries(
    icon.rrule.split(";").map((part) => {
      const [key, value = ""] = part.split("=");
      return [key.trim().toUpperCase(), value.trim().toUpperCase()];
    })
  );
  const freq = (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const).find((f) => f === parts.FREQ) ?? "WEEKLY";
  const repeat: Repeat = { ...base, freq, interval: clampInt(parts.INTERVAL ?? 1, 1, 99, 1) };
  const byDay = (parts.BYDAY ?? "").split(",").filter(Boolean);
  if (freq === "WEEKLY") {
    const days = byDay.map((code) => CODES.indexOf(code.slice(-2))).filter((d) => d >= 0);
    if (days.length > 0) repeat.weekdays = [...new Set(days)].sort((a, b) => a - b);
  }
  if (freq === "MONTHLY") {
    const nth = /^(-?\d)?([A-Z]{2})$/.exec(byDay[0] ?? "");
    if (nth && CODES.includes(nth[2])) {
      repeat.monthlyBy = "weekday";
      repeat.ordinal = nth[1] ? (Number(nth[1]) === -1 ? -1 : clampInt(nth[1], 1, 4, 1)) : 1;
      repeat.weekday = CODES.indexOf(nth[2]);
    } else if (parts.BYMONTHDAY) {
      const day = Number(parts.BYMONTHDAY.split(",")[0]);
      repeat.monthDay = day === -1 ? -1 : clampInt(day, 1, 31, base.monthDay);
    }
  }
  if (parts.UNTIL) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(parts.UNTIL);
    if (m) {
      repeat.ends = "until";
      repeat.until = `${m[1]}-${m[2]}-${m[3]}`;
    }
  } else if (parts.COUNT) {
    repeat.ends = "count";
    repeat.count = clampInt(parts.COUNT, 1, 999, 10);
  }
  return repeat;
}

/** The rule for a schedule, or null for a one-off. */
export function ruleOf(repeat: Repeat, start: string): string | null {
  if (repeat.freq === "ONCE") return null;
  const parts = [`FREQ=${repeat.freq}`];
  const interval = clampInt(repeat.interval, 1, 99, 1);
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (repeat.freq === "WEEKLY") {
    const days = repeat.weekdays.length > 0 ? repeat.weekdays : [midnight(start).getUTCDay()];
    parts.push(`BYDAY=${[...new Set(days)].sort((a, b) => a - b).map((d) => CODES[d]).join(",")}`);
  }
  if (repeat.freq === "MONTHLY") {
    parts.push(
      repeat.monthlyBy === "weekday"
        ? `BYDAY=${repeat.ordinal === -1 ? -1 : clampInt(repeat.ordinal, 1, 4, 1)}${CODES[clampInt(repeat.weekday, 0, 6, 0)]}`
        : `BYMONTHDAY=${repeat.monthDay === -1 ? -1 : clampInt(repeat.monthDay, 1, 31, 1)}`
    );
  }
  // A yearly icon repeats on its start's month and day - the engine's default.
  if (repeat.ends === "until" && isIsoDay(repeat.until)) parts.push(`UNTIL=${repeat.until.replace(/-/g, "")}`);
  if (repeat.ends === "count") parts.push(`COUNT=${clampInt(repeat.count, 1, 999, 10)}`);
  return parts.join(";");
}

/** "Tue 6 Jan 2026". */
export function shortDate(iso: string, withYear = true): string {
  const date = midnight(iso);
  const day = WEEKDAY_WORDS[date.getUTCDay()].slice(0, 3);
  const month = MONTH_WORDS[date.getUTCMonth()].slice(0, 3);
  return `${day} ${date.getUTCDate()} ${month}${withYear ? ` ${date.getUTCFullYear()}` : ""}`;
}

const listWords = (words: string[]) =>
  words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** One line for the editor's list: "Every other Tuesday", "Monthly on the
 *  first Monday, 10 times", "Once, Tue 6 Jan 2026". */
export function describeSchedule(icon: Pick<DayIcon, "start" | "rrule">): string {
  const r = repeatOf(icon);
  if (r.freq === "ONCE") return `Once, ${shortDate(icon.start)}`;
  const every = (unit: string) => (r.interval === 1 ? null : r.interval === 2 ? `Every other ${unit}` : `Every ${r.interval} ${unit}s`);
  let text: string;
  if (r.freq === "DAILY") {
    text = every("day") ?? "Every day";
  } else if (r.freq === "WEEKLY") {
    const days = r.weekdays.map((d) => WEEKDAY_WORDS[d]);
    const named = r.weekdays.length === 7 ? "day" : listWords(days.length > 2 ? days.map((d) => d.slice(0, 3)) : days);
    text =
      r.interval === 1
        ? `Every ${named}`
        : r.interval === 2 && days.length === 1
          ? `Every other ${named}`
          : `${every("week")} on ${named}`;
  } else if (r.freq === "MONTHLY") {
    const on = r.monthlyBy === "weekday" ? `the ${ORDINAL_WORDS[r.ordinal]} ${WEEKDAY_WORDS[r.weekday]}` : `the ${dayOrdinal(r.monthDay)}`;
    text = `${every("month") ?? "Monthly"} on ${on}`;
  } else {
    const date = midnight(icon.start);
    text = `${every("year") ?? "Every year"} on ${date.getUTCDate()} ${MONTH_WORDS[date.getUTCMonth()]}`;
  }
  if (r.ends === "until") text += `, until ${shortDate(r.until)}`;
  if (r.ends === "count") text += `, ${r.count} time${r.count === 1 ? "" : "s"}`;
  return text;
}

/**
 * The next `count` days the icon falls on, from `from` (or its start, if
 * later) - the skipped ones among them marked rather than left out, so the
 * editor can offer them back. Looks two years ahead at most.
 */
export function upcomingDays(icon: DayIcon, from: string, count: number): Array<{ date: string; skipped: boolean }> {
  const out: Array<{ date: string; skipped: boolean }> = [];
  const series = { ...icon, skips: [] };
  const skipped = new Set(icon.skips);
  let day = from > icon.start ? from : icon.start;
  for (let chunk = 0; chunk < 8 && out.length < count; chunk++) {
    const dates = Array.from({ length: 92 }, (_, i) => addDays(day, i));
    iconsOnDates([series], dates).forEach((list, i) => {
      if (list.length > 0 && out.length < count) out.push({ date: dates[i], skipped: skipped.has(dates[i]) });
    });
    day = addDays(day, 92);
  }
  return out;
}

/** Each icon's own name, for the picker. */
export const GLYPH_NAMES: Record<GlyphShape, string> = {
  circle: "Circle",
  square: "Square",
  rounded: "Rounded square",
  droplet: "Droplet",
  heart: "Heart",
  star: "Star",
  moon: "Moon",
  flame: "Flame",
  leaf: "Leaf",
  plant: "Potted plant",
  spoon: "Spoon",
  jar: "Jar",
  lotus: "Lotus",
  pill: "Pill",
  trash: "Bin",
};

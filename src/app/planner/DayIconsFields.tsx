"use client";

// DAY ICONS, edited: the journal's list of icons on the days something
// happens - trash day, payday, the vet - in the hours' and the month
// calendar's editors. See src/lib/dayIcons.ts for what they are.
//
// Asked 2026-10-06: set "in the module editor", and "customizable though like
// it can be one off or repeated once every whatever or skip or first monday
// etc." So each icon has a start day, a repeat (none, daily, weekly on chosen
// days, monthly on a date or on "the first Monday", yearly), every how many,
// an end, and days to skip - picked from its next few days, where a skipped
// one stays to be put back.
//
// PURE, like HoursFields: it shows the list and reports changes. The editor
// owns the draft, redraws the preview from it, and saves it with Done.

import { CONTROL_RADIUS, PREVIEW_RADIUS } from "./editorStyle";
import { useState, type CSSProperties } from "react";
import { GLYPH_SHAPES, glyphElement, type GlyphShape } from "@/lib/modules/glyphs";
import { toSvg } from "@/lib/proofSvg";
import {
  GLYPH_NAMES,
  MAX_DAY_ICONS,
  ORDINAL_WORDS,
  WEEKDAY_WORDS,
  dayOrdinal,
  defaultRepeat,
  describeSchedule,
  repeatOf,
  ruleOf,
  shortDate,
  upcomingDays,
  type DayIcon,
  type Repeat,
  type RepeatFreq,
} from "@/lib/dayIcons";
import { GlyphSwatch, selectStyle } from "./ModuleFieldsForm";
import { CREAM, cream, onCream } from "@/lib/cream";

const ACCENT = "#4a5cff";

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: cream(0.6),
};

// The fields panel's own input look - see ModuleFieldsForm's inputStyle.
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: onCream(0xf2),
  background: cream(0.06),
  border: "none",
  borderRadius: CONTROL_RADIUS,
  // The date picker's button, light on the dark panel - as the hours' times.
  colorScheme: "dark",
};

const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };
const inlineStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, minWidth: 0 };

const FREQ_OPTIONS: Array<{ value: RepeatFreq; label: string }> = [
  { value: "ONCE", label: "Does not repeat" },
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];
const UNIT: Record<RepeatFreq, [string, string]> = {
  ONCE: ["", ""],
  DAILY: ["day", "days"],
  WEEKLY: ["week", "weeks"],
  MONTHLY: ["month", "months"],
  YEARLY: ["year", "years"],
};
/** How many of its next days an open icon offers to skip. */
const NEXT_DAYS = 6;

/** Today on the person's own calendar, "YYYY-MM-DD". */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function newIcon(firstDay: string): DayIcon {
  return {
    id: `di-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    icon: "trash",
    start: firstDay,
    rrule: ruleOf(defaultRepeat(firstDay), firstDay),
    skips: [],
  };
}

/** The icon itself, on paper, drawn by the code that prints it. */
function GlyphChip({ shape, size = 24 }: { shape: GlyphShape; size?: number }) {
  const markup = toSvg(glyphElement({ id: `chip-${shape}`, x: 18, y: 18, sizePx: 64, shape, opacity: 1 }) as never);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block", flexShrink: 0, background: CREAM, borderRadius: PREVIEW_RADIUS }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

export function DayIconsFields({
  icons,
  onChange,
  firstDay,
  term,
  weekStartDay,
  dated,
}: {
  icons: DayIcon[];
  onChange: (next: DayIcon[]) => void;
  /** A new icon's first day: the first day of the page being edited. */
  firstDay: string;
  /** The journal's dates, which the days offered to skip come from. */
  term: { start: string; end: string } | null;
  /** The journal's - the weekday buttons run in its order. */
  weekStartDay: number;
  /** An undated journal has no days for an icon to fall on. */
  dated: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // THE DAYS OFFERED TO SKIP are the journal's next ones from today - or,
  // when today is outside its dates (a book for next year, or last term's),
  // its first. Days past its end are not offered: they are in no page.
  const [from] = useState(() => {
    const today = localToday();
    return term && (today < term.start || today > term.end) ? term.start : today;
  });

  const update = (id: string, patch: Partial<DayIcon>) =>
    onChange(icons.map((icon) => (icon.id === id ? { ...icon, ...patch } : icon)));
  const setRepeat = (icon: DayIcon, change: Partial<Repeat>) =>
    update(icon.id, { rrule: ruleOf({ ...repeatOf(icon), ...change }, icon.start) });

  if (!dated) {
    return (
      <section aria-label="Day icons" style={rowStyle}>
        <span style={labelStyle}>Day icons</span>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: cream(0.5) }}>
          Icons on the days something happens, like bin day. They need dates, and this journal is undated.
        </p>
      </section>
    );
  }

  return (
    // No <style> of its own: the panel's fields already carry FOCUS_CSS, and a
    // second copy made every hours editor open ~200ms later - a stylesheet
    // inserted re-checks the whole canvas's styles (measured by check:browser's
    // module editor probe, 2026-10-06).
    <section aria-label="Day icons" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={rowStyle}>
        <span style={labelStyle}>Day icons</span>
        <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: cream(0.5) }}>
          An icon to colour in on the days something happens, on every dated page.
        </p>
      </div>

      {icons.map((icon) => {
        const open = openId === icon.id;
        const title = icon.name || GLYPH_NAMES[icon.icon];
        return (
          <div
            key={icon.id}
            data-day-icon={icon.id}
            style={{ display: "flex", flexDirection: "column", background: open ? cream(0.04) : "transparent", borderRadius: CONTROL_RADIUS }}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : icon.id)}
              className="memari-field"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "6px 8px",
                border: "none",
                borderRadius: CONTROL_RADIUS,
                background: open ? "transparent" : cream(0.04),
                color: onCream(0xf2),
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <GlyphChip shape={icon.icon} />
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {title}
                </span>
                <span data-day-icon-summary style={{ fontSize: 11, color: cream(0.55), lineHeight: 1.35 }}>
                  {describeSchedule(icon)}
                  {icon.skips.length > 0 ? `, ${icon.skips.length} skipped` : ""}
                </span>
              </span>
              <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }}>
                <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {open && (
              <IconFields
                icon={icon}
                from={from}
                until={term?.end ?? null}
                weekStartDay={weekStartDay}
                update={(patch) => update(icon.id, patch)}
                setRepeat={(change) => setRepeat(icon, change)}
                remove={() => {
                  onChange(icons.filter((other) => other.id !== icon.id));
                  setOpenId(null);
                }}
              />
            )}
          </div>
        );
      })}

      <button
        type="button"
        disabled={icons.length >= MAX_DAY_ICONS}
        onClick={() => {
          const icon = newIcon(firstDay);
          onChange([...icons, icon]);
          setOpenId(icon.id);
        }}
        className="memari-field"
        style={{
          alignSelf: "flex-start",
          padding: "6px 10px",
          border: "none",
          borderRadius: CONTROL_RADIUS,
          background: cream(0.06),
          color: icons.length >= MAX_DAY_ICONS ? cream(0.35) : CREAM,
          font: "inherit",
          fontSize: 12,
          fontWeight: 600,
          cursor: icons.length >= MAX_DAY_ICONS ? "default" : "pointer",
        }}
      >
        {icons.length >= MAX_DAY_ICONS ? `${MAX_DAY_ICONS} is the most` : "+ Add a day icon"}
      </button>
    </section>
  );
}

function IconFields({
  icon,
  from,
  until,
  weekStartDay,
  update,
  setRepeat,
  remove,
}: {
  icon: DayIcon;
  from: string;
  until: string | null;
  weekStartDay: number;
  update: (patch: Partial<DayIcon>) => void;
  setRepeat: (change: Partial<Repeat>) => void;
  remove: () => void;
}) {
  const repeat = repeatOf(icon);
  const repeats = repeat.freq !== "ONCE";
  const [one, many] = UNIT[repeat.freq];
  const next = upcomingDays(icon, from, NEXT_DAYS).filter((n) => !until || n.date <= until);
  const shownNext = new Set(next.map((n) => n.date));
  const otherSkips = icon.skips.filter((day) => !shownNext.has(day));
  const toggleSkip = (day: string) =>
    update({ skips: icon.skips.includes(day) ? icon.skips.filter((d) => d !== day) : [...icon.skips, day].sort() });
  const weekOrder = Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "8px 8px 10px" }}>
      <label style={rowStyle}>
        <span style={labelStyle}>Name</span>
        <input
          value={icon.name ?? ""}
          placeholder={`${GLYPH_NAMES[icon.icon]} - not printed`}
          maxLength={40}
          onChange={(event) => update({ name: event.target.value || undefined })}
          className="memari-field"
          style={inputStyle}
        />
      </label>

      <div style={rowStyle}>
        <span style={labelStyle}>Icon</span>
        <div
          role="radiogroup"
          aria-label="Icon"
          style={{ display: "grid", gridTemplateColumns: `repeat(${Math.ceil(GLYPH_SHAPES.length / 2)}, 24px)`, gap: 3 }}
        >
          {GLYPH_SHAPES.map((shape) => (
            <GlyphSwatch
              key={shape}
              size={24}
              shape={shape}
              label={GLYPH_NAMES[shape]}
              selected={icon.icon === shape}
              onPick={() => update({ icon: shape })}
            />
          ))}
        </div>
      </div>

      <label style={rowStyle}>
        <span style={labelStyle}>{repeats ? "Starts" : "On"}</span>
        <input
          type="date"
          value={icon.start}
          required
          onChange={(event) => {
            const start = event.target.value;
            if (!start) return;
            // A one-off is its day; a series keeps its rule and begins here.
            update({ start, rrule: repeats ? icon.rrule : null });
          }}
          className="memari-field"
          style={inputStyle}
        />
      </label>

      <label style={rowStyle}>
        <span style={labelStyle}>Repeats</span>
        <select
          value={repeat.freq}
          onChange={(event) => setRepeat({ freq: event.target.value as RepeatFreq })}
          className="memari-field"
          style={selectStyle(inputStyle)}
        >
          {FREQ_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {repeats && (
        <div style={inlineStyle}>
          <span style={{ ...labelStyle, flexShrink: 0 }}>Every</span>
          <input
            type="number"
            min={1}
            max={99}
            value={repeat.interval}
            aria-label={`Every how many ${many}`}
            onChange={(event) => setRepeat({ interval: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })}
            className="memari-field"
            style={{ ...inputStyle, width: 56 }}
          />
          <span style={{ fontSize: 13, color: onCream(0xdd) }}>{repeat.interval === 1 ? one : many}</span>
        </div>
      )}

      {repeat.freq === "WEEKLY" && (
        <div style={rowStyle}>
          <span style={labelStyle}>On</span>
          <div role="group" aria-label="On these days" style={{ display: "flex", gap: 4 }}>
            {weekOrder.map((day) => {
              const on = repeat.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  aria-pressed={on}
                  aria-label={WEEKDAY_WORDS[day]}
                  title={WEEKDAY_WORDS[day]}
                  onClick={() => {
                    const days = on ? repeat.weekdays.filter((d) => d !== day) : [...repeat.weekdays, day];
                    // Never none: the last day on stays on.
                    if (days.length > 0) setRepeat({ weekdays: days });
                  }}
                  className="memari-field"
                  style={{
                    width: 28,
                    height: 28,
                    padding: 0,
                    border: "none",
                    borderRadius: CONTROL_RADIUS,
                    background: on ? ACCENT : cream(0.06),
                    color: on ? CREAM : onCream(0xdd),
                    font: "inherit",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {WEEKDAY_WORDS[day].charAt(0)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {repeat.freq === "MONTHLY" && (
        <div style={rowStyle}>
          <span style={labelStyle}>On</span>
          <select
            value={repeat.monthlyBy}
            aria-label="Monthly on"
            onChange={(event) => setRepeat({ monthlyBy: event.target.value === "weekday" ? "weekday" : "day" })}
            className="memari-field"
            style={selectStyle(inputStyle)}
          >
            <option value="day">A date</option>
            <option value="weekday">A weekday, like the first Monday</option>
          </select>
          {repeat.monthlyBy === "day" ? (
            <select
              value={repeat.monthDay}
              aria-label="Day of the month"
              onChange={(event) => setRepeat({ monthDay: Number(event.target.value) })}
              className="memari-field"
              style={selectStyle(inputStyle)}
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                <option key={day} value={day}>
                  The {dayOrdinal(day)}
                </option>
              ))}
              <option value={-1}>The last day</option>
            </select>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={repeat.ordinal}
                aria-label="Which one"
                onChange={(event) => setRepeat({ ordinal: Number(event.target.value) })}
                className="memari-field"
                style={{ ...selectStyle(inputStyle), flex: 1, minWidth: 0 }}
              >
                {[1, 2, 3, 4, -1].map((n) => (
                  <option key={n} value={n}>
                    The {ORDINAL_WORDS[n]}
                  </option>
                ))}
              </select>
              <select
                value={repeat.weekday}
                aria-label="Weekday"
                onChange={(event) => setRepeat({ weekday: Number(event.target.value) })}
                className="memari-field"
                style={{ ...selectStyle(inputStyle), flex: 1.2, minWidth: 0 }}
              >
                {weekOrder.map((day) => (
                  <option key={day} value={day}>
                    {WEEKDAY_WORDS[day]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {repeats && (
        <div style={rowStyle}>
          <span style={labelStyle}>Ends</span>
          <div style={{ display: "flex", gap: 6 }}>
            <select
              value={repeat.ends}
              aria-label="Ends"
              onChange={(event) => setRepeat({ ends: event.target.value as Repeat["ends"] })}
              className="memari-field"
              style={{ ...selectStyle(inputStyle), flex: 1, minWidth: 0 }}
            >
              <option value="never">Never</option>
              <option value="until">On a day</option>
              <option value="count">After a number</option>
            </select>
            {repeat.ends === "until" && (
              <input
                type="date"
                value={repeat.until}
                min={icon.start}
                aria-label="Last day"
                onChange={(event) => event.target.value && setRepeat({ until: event.target.value })}
                className="memari-field"
                style={{ ...inputStyle, flex: 1.3, minWidth: 0 }}
              />
            )}
            {repeat.ends === "count" && (
              <span style={{ ...inlineStyle, flex: 1 }}>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={repeat.count}
                  aria-label="How many times"
                  onChange={(event) => setRepeat({ count: Math.max(1, Math.min(999, Number(event.target.value) || 1)) })}
                  className="memari-field"
                  style={{ ...inputStyle, width: 64 }}
                />
                <span style={{ fontSize: 13, color: onCream(0xdd) }}>times</span>
              </span>
            )}
          </div>
        </div>
      )}

      {repeats && (
        <div style={rowStyle}>
          <span style={labelStyle}>Skip</span>
          {next.length === 0 ? (
            <span style={{ fontSize: 11, color: cream(0.5) }}>None of its days are in this journal.</span>
          ) : (
            <div role="group" aria-label="Next days - click one to skip it" style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {next.map(({ date, skipped }) => (
                <button
                  key={date}
                  type="button"
                  aria-pressed={skipped}
                  title={skipped ? "Skipped - click to put it back" : "Click to skip this day"}
                  onClick={() => toggleSkip(date)}
                  className="memari-field"
                  data-skip-day={date}
                  style={{
                    padding: "4px 7px",
                    border: "none",
                    borderRadius: CONTROL_RADIUS,
                    background: skipped ? "transparent" : cream(0.06),
                    boxShadow: skipped ? `inset 0 0 0 1px ${cream(0.2)}` : "none",
                    color: skipped ? cream(0.45) : onCream(0xdd),
                    textDecoration: skipped ? "line-through" : "none",
                    font: "inherit",
                    fontSize: 11,
                    cursor: "pointer",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {shortDate(date, false)}
                </button>
              ))}
            </div>
          )}
          <label style={inlineStyle}>
            <span style={{ fontSize: 11, color: cream(0.55), flexShrink: 0 }}>Another day</span>
            <input
              type="date"
              value=""
              min={icon.start}
              aria-label="Skip another day"
              onChange={(event) => {
                const day = event.target.value;
                if (day && !icon.skips.includes(day)) update({ skips: [...icon.skips, day].sort() });
              }}
              className="memari-field"
              style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "5px 8px", fontSize: 12 }}
            />
          </label>
          {otherSkips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {otherSkips.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-label={`Put back ${shortDate(day)}`}
                  title="Put this day back"
                  onClick={() => toggleSkip(day)}
                  className="memari-field"
                  style={{
                    padding: "4px 7px",
                    border: "none",
                    borderRadius: CONTROL_RADIUS,
                    background: "transparent",
                    boxShadow: `inset 0 0 0 1px ${cream(0.2)}`,
                    color: cream(0.45),
                    textDecoration: "line-through",
                    font: "inherit",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {shortDate(day)} &times;
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={remove}
        className="memari-field"
        style={{
          alignSelf: "flex-start",
          padding: 0,
          border: "none",
          background: "transparent",
          color: "#ff8f5c",
          font: "inherit",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Remove this icon
      </button>
    </div>
  );
}

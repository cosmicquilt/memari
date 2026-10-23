"use client";

// memari. for businesses: the charts (2026-10-22: "graphs and charts and
// visuals for them to look at ... fully planned and well thought out"; the
// numbers are src/lib/businessStats.ts). Plain SVG drawn at the width it
// has, so text is never stretched, to the dataviz method's specs: thin marks
// (bars at most 24px, 4px rounded ends, square at the baseline), hairline
// solid grids, 2px gaps between segments, values written only where they
// help, and the colour picked by the job it does - one series in the pen's
// blue; ordered stages as a ramp of that blue, light to dark (validated:
// monotone, every step visible, its light end 2.21:1 on the card, so every
// count is also written in the legend); the past in a quiet grey; and
// warnings in the status colours, always with an icon and words, never
// colour alone. Every chart answers hover and keyboard focus with a tooltip
// and has a Table switch showing the same numbers.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { DAY, at, shortDate, stateWords, type TimelineRow } from "./chartWords";
import css from "./business.module.css";

/* ------------------------------------------------------------- the frame */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export type Table = { head: string[]; rows: Array<Array<string | number>> };

/** A chart's card: the title says what is plotted, the line under it what
 *  it means; the Table switch shows the same numbers as a table. */
export function ChartCard({ title, sub, table, children, id }: { title: string; sub?: ReactNode; table: Table; children: ReactNode; id?: string }) {
  const [asTable, setAsTable] = useState(false);
  const auto = useId();
  const titleId = `${id ?? auto}-title`;
  return (
    <figure id={id} className={`${css.card} ${css.chart}`} aria-labelledby={titleId}>
      <div className={css.chartHead}>
        <div className={css.chartTitle}>
          <h2 id={titleId}>{title}</h2>
          {sub && <p className={css.dim}>{sub}</p>}
        </div>
        <button type="button" className={css.chartSwitch} aria-pressed={asTable} onClick={() => setAsTable((t) => !t)}>
          {asTable ? "Chart" : "Table"}
        </button>
      </div>
      {asTable ? (
        <div className={css.tableWrap}>
          <table className={css.dataTable}>
            <thead>
              <tr>
                {table.head.map((h) => (
                  <th key={h} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={j}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

/** The one tooltip: an optional heading, then each value first and what it
 *  is after, keyed by a short stroke of its mark's colour. Kept inside the
 *  chart's box. */
type TipRow = { value: string; label: string; colour?: string };
type Tip = { x: number; y: number; title?: string; rows: TipRow[] } | null;

function Tooltip({ tip, width }: { tip: Tip; width: number }) {
  if (!tip) return null;
  const left = Math.max(0, Math.min(width - 230, tip.x - 115));
  return (
    <div className={css.tip} style={{ left, top: tip.y }} role="status">
      {tip.title && <div className={css.tipTitle}>{tip.title}</div>}
      {tip.rows.map((r, i) => (
        <div key={i} className={css.tipRow}>
          {r.colour && <span className={css.tipKey} style={{ background: r.colour }} aria-hidden="true" />}
          <strong>{r.value}</strong>
          <span>{r.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Hover and focus for one mark: the tooltip follows the pointer across the
 *  mark's hit area, and sits over the mark when it is reached by keyboard. */
function markEvents(setTip: (t: Tip) => void, at: { x: number; y: number }, tip: { title?: string; rows: TipRow[] }, onEnter?: () => void, onLeave?: () => void) {
  return {
    tabIndex: 0,
    onPointerMove: (e: React.PointerEvent<SVGGElement>) => {
      const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
      onEnter?.();
      setTip({ ...tip, x: e.clientX - box.left, y: at.y });
    },
    onFocus: () => {
      onEnter?.();
      setTip({ ...tip, ...at });
    },
    onBlur: () => {
      onLeave?.();
      setTip(null);
    },
    className: css.chartMark,
  };
}

/** Money or a count, short for an axis ("$1.2K", "12"), in full for a
 *  tooltip ("$1,234.50"). */
export function formatter(currency?: string) {
  if (!currency)
    return {
      short: (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n),
      full: (n: number) => n.toLocaleString("en-US"),
    };
  return {
    short: (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: n >= 1000 ? 1 : 0 }).format(n),
    full: (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n),
  };
}

/** Clean axis steps: 0 and about four steps of 1, 2 or 5 x 10^n, the top
 *  one at or above the highest value; whole numbers only for counts. */
function ticks(max: number, whole: boolean) {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  if (whole) step = Math.max(1, Math.round(step));
  const out: number[] = [];
  for (let v = 0; out.length === 0 || out[out.length - 1] < max; v += step) out.push(+v.toFixed(6));
  return out;
}

/* ------------------------------------------------------------ stat tiles */

export type StatTileData = {
  label: string;
  value: string;
  /** The change against a named period, in ink with an arrow: more books is
   *  not good or bad in itself, so no green or red. */
  change?: { text: string; dir: "up" | "down" | "same" };
  spark?: number[];
  sparkLabel?: string;
  note?: string;
  warn?: boolean;
  href?: string;
};

/** The headline numbers: a label, the value, its change, and where it helps
 *  a sparkline of the last months in grey with this month as a blue dot. */
export function StatTiles({ tiles }: { tiles: StatTileData[] }) {
  return (
    <div className={css.tiles}>
      {tiles.map((t) => {
        const inner = (
          <>
            <span className={css.tileLabel}>
              {t.warn && <WarnIcon />}
              {t.label}
            </span>
            <span className={css.tileValue}>{t.value}</span>
            {t.change && (
              <span className={css.tileChange}>
                {t.change.dir === "up" ? "↑ " : t.change.dir === "down" ? "↓ " : ""}
                {t.change.text}
              </span>
            )}
            {t.note && <span className={css.tileChange}>{t.note}</span>}
            {t.spark && t.spark.length > 1 && <Spark values={t.spark} label={t.sparkLabel ?? t.label} />}
          </>
        );
        return t.href ? (
          <a key={t.label} href={t.href} className={css.tile}>
            {inner}
          </a>
        ) : (
          <div key={t.label} className={css.tile}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function Spark({ values, label }: { values: number[]; label: string }) {
  const w = 112;
  const h = 28;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [3 + (i / (values.length - 1)) * (w - 8), h - 4 - (v / max) * (h - 8)] as const);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${values.join(", ")}`} className={css.spark}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--deemph)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--series-1)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  );
}

export function WarnIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={css.statusIcon}>
      <path d="M8 1.6 15.2 14.2H.8L8 1.6Z" fill="var(--st-warning)" strokeLinejoin="round" />
      <path d="M8 6.2v3.6M8 12v.1" stroke="#1c1917" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function OutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className={css.statusIcon}>
      <circle cx="8" cy="8" r="7" fill="var(--st-critical)" />
      <path d="M5.2 8h5.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/* --------------------------------------------------------------- columns */

/** One series over months: a column per month in the blue; the highest and
 *  the latest carry their value, the rest are in the axis and the tooltip.
 *  Month names thin out when the columns are too narrow for every one. */
export function Columns({ data, label, currency }: { data: Array<{ label: string; long: string; value: number }>; label: string; currency?: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const [hover, setHover] = useState<number | null>(null);
  const f = formatter(currency);
  const h = 200;
  const max = Math.max(0, ...data.map((d) => d.value));
  const ys = ticks(max, !currency);
  const top = ys[ys.length - 1] || 1;
  // room for the widest axis label
  const padL = Math.max(24, Math.max(...ys.map((v) => f.short(v).length)) * 7 + 10);
  const pad = { l: padL, r: 4, t: 20, b: 24 };
  const plotW = Math.max(0, width - pad.l - pad.r);
  const plotH = h - pad.t - pad.b;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 6));
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const every = Math.max(1, Math.ceil(30 / band));
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const valued = new Set([peak, data.length - 1].filter((i) => data[i]?.value > 0));
  return (
    <div
      ref={ref}
      className={css.plot}
      onPointerLeave={() => {
        setTip(null);
        setHover(null);
      }}
    >
      {width > 0 && (
        <svg width={width} height={h} role="group" aria-label={label}>
          {ys.map((v) => (
            <g key={v} aria-hidden="true">
              <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} />
              <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" className={css.axisText}>
                {f.short(v)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            const left = cx - barW / 2;
            const yt = y(d.value);
            const r = Math.min(4, (y(0) - yt) / 2, barW / 2);
            const tipBody = { title: d.long, rows: [{ value: f.full(d.value), label, colour: "var(--series-1)" }] };
            return (
              <g key={d.long} {...markEvents(setTip, { x: cx, y: yt - 8 }, tipBody, () => setHover(i), () => setHover(null))} aria-label={`${d.long}: ${f.full(d.value)}`}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="transparent" />
                {d.value > 0 && (
                  <path
                    d={`M${left},${y(0)} V${yt + r} Q${left},${yt} ${left + r},${yt} H${left + barW - r} Q${left + barW},${yt} ${left + barW},${yt + r} V${y(0)} Z`}
                    fill="var(--series-1)"
                    opacity={hover === null || hover === i ? 1 : 0.5}
                  />
                )}
                {valued.has(i) && (
                  <text x={cx} y={yt - 6} textAnchor="middle" className={css.valueText}>
                    {f.short(d.value)}
                  </text>
                )}
                {(data.length - 1 - i) % every === 0 && (
                  <text x={cx} y={h - 6} textAnchor="middle" className={css.axisText}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          {max === 0 && (
            <text x={pad.l + plotW / 2} y={pad.t + plotH / 2} textAnchor="middle" className={css.axisText}>
              None in these months
            </text>
          )}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  );
}

/* ------------------------------------------------------------- stage bar */

const RAMP = ["var(--ord-1)", "var(--ord-2)", "var(--ord-3)", "var(--ord-4)"];
/** The count's ink on each ramp step: dark on the light end, white after -
 *  and the other way round on the dark ramp (business.module.css). */
const RAMP_INK = ["var(--ord-ink-1)", "var(--ord-ink-2)", "var(--ord-ink-3)", "var(--ord-ink-4)"];

/** Part of a whole, in order: one bar split by stage, light (first) to dark
 *  (last), with a 2px gap between segments. A count is written inside its
 *  segment only where it fits; the legend names every stage with its count. */
export function StageBar({ stages, label }: { stages: Array<{ label: string; count: number }>; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const total = stages.reduce((s, x) => s + x.count, 0);
  const h = 28;
  const r = 6;
  const shown = stages.map((s, i) => ({ ...s, i })).filter((s) => s.count > 0);
  const room = width - Math.max(0, shown.length - 1) * 2;
  let x = 0;
  return (
    <div className={css.stageBar}>
      <div ref={ref} className={css.plot} onPointerLeave={() => setTip(null)}>
        {width > 0 && (
          <svg width={width} height={h} role="group" aria-label={label}>
            {total === 0 ? (
              <rect x={0} y={0} width={width} height={h} rx={r} fill="var(--grid)" />
            ) : (
              shown.map((s, k) => {
                const w = (room * s.count) / total;
                const left = x;
                x += w + 2;
                const rl = k === 0 ? Math.min(r, w / 2) : 0;
                const rr = k === shown.length - 1 ? Math.min(r, w / 2) : 0;
                const right = left + w;
                const tipBody = { rows: [{ value: String(s.count), label: s.label, colour: RAMP[s.i] }] };
                return (
                  <g key={s.label} {...markEvents(setTip, { x: left + w / 2, y: -8 }, tipBody)} aria-label={`${s.label}: ${s.count}`}>
                    <path
                      d={`M${left + rl},0 H${right - rr} Q${right},0 ${right},${rr} V${h - rr} Q${right},${h} ${right - rr},${h} H${left + rl} Q${left},${h} ${left},${h - rl} V${rl} Q${left},0 ${left + rl},0 Z`}
                      fill={RAMP[s.i]}
                    />
                    {w >= String(s.count).length * 8 + 14 && (
                      <text x={left + w / 2} y={h / 2} dy="0.34em" textAnchor="middle" className={css.segmentText} fill={RAMP_INK[s.i]}>
                        {s.count}
                      </text>
                    )}
                  </g>
                );
              })
            )}
          </svg>
        )}
        <Tooltip tip={tip} width={width} />
      </div>
      <div className={css.legend}>
        {stages.map((s, i) => (
          <span key={s.label}>
            <span className={css.swatch} style={{ background: RAMP[i] }} aria-hidden="true" />
            {s.label} <strong>{s.count}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- bar list */

/** How many of everyone have reached each step: a bar per step, in the one
 *  blue (one measure across the steps, so one colour), with the count
 *  written at the end of its row. */
export function BarList({ steps, of }: { steps: Array<{ label: string; count: number }>; of: number }) {
  return (
    <div className={css.barList} role="list">
      {steps.map((s) => {
        const share = of ? s.count / of : 0;
        return (
          <div key={s.label} className={css.barRow} role="listitem" aria-label={`${s.label}: ${s.count} of ${of}`}>
            <span className={css.barLabel} aria-hidden="true">
              {s.label}
            </span>
            <span className={css.barTrack} aria-hidden="true">
              <span className={css.barFill} style={{ width: `${share * 100}%` }} />
            </span>
            <span className={css.barValue} aria-hidden="true">
              <strong>{s.count}</strong>
              <span className={css.dim}> of {of}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- timeline */

/** Who has pages, and until when: a row per client, their books as bars
 *  across the months - past ones in the quiet grey, current and coming ones
 *  in the blue - a line for today, a ring where a client starts with no book
 *  yet, and at the end of each row its state in words, with an icon where
 *  someone runs out. Narrow screens show fewer months, not smaller ones,
 *  and put the state under the name instead of in a column of its own.
 *  The rows come most urgent first; past `limit` the rest wait behind a
 *  Show all. */
export function Timeline({ rows: everyone, today, limit = 8 }: { rows: TimelineRow[]; today: string; limit?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<Tip>(null);
  const [all, setAll] = useState(false);
  const clip = useId();
  const rows = all ? everyone : everyone.slice(0, limit);
  const narrow = width < 560;
  const t = new Date(at(today));
  const from = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - (narrow ? 0 : 1), 1);
  const to = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + (narrow ? 3 : 6), 1);
  const nameW = narrow ? 128 : 160;
  const stateW = narrow ? 0 : 150;
  const plotL = nameW;
  const plotW = Math.max(0, width - nameW - stateW - (narrow ? 0 : 12));
  const rowH = narrow ? 52 : 44;
  const head = 24;
  const foot = 22;
  const body = rows.length * rowH;
  const h = head + body + foot;
  const x = (ms: number) => plotL + ((Math.min(Math.max(ms, from), to) - from) / (to - from)) * plotW;
  const months: number[] = [];
  for (let m = from; m < to; ) {
    months.push(m);
    const d = new Date(m);
    m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  const now = at(today);
  const fit = (name: string) => {
    const most = Math.floor((nameW - 12) / 7.6);
    return name.length > most ? `${name.slice(0, most - 1)}…` : name;
  };
  return (
    <div ref={ref} className={css.plot} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={h} role="group" aria-label="Each client's books by month">
          {/* a book running past either edge is cut square there, not
              rounded as if it ended */}
          <clipPath id={clip}>
            <rect x={plotL} y={0} width={plotW} height={h} />
          </clipPath>
          {months.map((m) => (
            <g key={m} aria-hidden="true">
              <line x1={x(m)} x2={x(m)} y1={0} y2={head + body} stroke="var(--grid)" />
              <text x={x(m) + 6} y={14} className={css.axisText}>
                {new Date(m).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const top = head + i * rowH;
            const cy = top + rowH / 2;
            const words = stateWords(r);
            const name = (
              <text x={0} y={narrow ? cy - 9 : cy} dy="0.34em" className={css.rowText}>
                {fit(r.name)}
              </text>
            );
            const state = (
              <span className={css.rowState} data-state={r.state} data-narrow={narrow || undefined}>
                {words.icon === "out" ? <OutIcon /> : words.icon === "warn" ? <WarnIcon /> : null}
                {words.text}
              </span>
            );
            return (
              <g key={r.key}>
                <line x1={0} x2={width} y1={top} y2={top} stroke="var(--grid)" aria-hidden="true" />
                {r.href ? (
                  <a href={r.href} className={css.rowLink} aria-label={`${r.name}: ${stateWords(r).text}`}>
                    <rect x={0} y={top + 4} width={nameW - 8} height={rowH - 8} fill="transparent" />
                    {name}
                  </a>
                ) : (
                  name
                )}
                {r.books.map((b) => {
                  const s = at(b.start);
                  const e = at(b.end) + DAY;
                  if (e <= from || s >= to) return null;
                  const past = e <= now;
                  const failed = b.stage === "Needs attention";
                  const left = s < from ? x(from) - 8 : x(s) + 1;
                  const w = Math.max(4, (e > to ? x(to) + 8 : x(e) - 1) - left);
                  const colour = failed ? "var(--st-critical)" : past ? "var(--deemph)" : "var(--series-1)";
                  const tipBody = { title: r.name, rows: [{ value: `${shortDate(b.start)} to ${shortDate(b.end)}`, label: b.stage, colour }] };
                  return (
                    <g key={b.id} {...markEvents(setTip, { x: left + w / 2, y: cy - 14 }, tipBody)} aria-label={`${r.name}: book ${shortDate(b.start)} to ${shortDate(b.end)}, ${b.stage}`}>
                      <rect x={left} y={cy - 16} width={w} height={32} fill="transparent" />
                      <g clipPath={`url(#${CSS.escape(clip)})`}>
                        {failed ? (
                          // never printed: an outline, not ink - and the row's
                          // words and the tooltip say why
                          <rect x={left + 0.75} y={cy - 6.25} width={w - 1.5} height={12.5} rx={4} fill="none" stroke={colour} strokeWidth={1.5} strokeDasharray="4 3" />
                        ) : (
                          <rect x={left} y={cy - 7} width={w} height={14} rx={4} fill={colour} />
                        )}
                      </g>
                    </g>
                  );
                })}
                {!r.books.length && r.firstStart && at(r.firstStart) >= from && at(r.firstStart) < to && (
                  <circle cx={x(at(r.firstStart))} cy={cy} r={5} fill="var(--card)" stroke="var(--series-1)" strokeWidth={2} aria-hidden="true" />
                )}
                {narrow ? (
                  <foreignObject x={0} y={cy + 1} width={nameW - 6} height={20} aria-hidden="true">
                    {state}
                  </foreignObject>
                ) : (
                  <foreignObject x={width - stateW} y={cy - 12} width={stateW} height={24} aria-hidden="true">
                    {state}
                  </foreignObject>
                )}
              </g>
            );
          })}
          {now >= from && now <= to && (
            <g aria-hidden="true">
              <line x1={x(now)} x2={x(now)} y1={head} y2={head + body + 4} stroke="var(--ink)" strokeWidth={1.5} />
              <text x={x(now)} y={h - 4} textAnchor="middle" className={css.todayText}>
                Today
              </text>
            </g>
          )}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
      {everyone.length > limit && (
        <button type="button" className={css.chartSwitch} style={{ marginTop: 8 }} onClick={() => setAll((a) => !a)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${everyone.length}`}
        </button>
      )}
    </div>
  );
}

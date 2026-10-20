"use client";

// The otter's quiz, in the start dialog (2026-10-20: "otter should be in
// same popup first time and have a way for them to retake"). Someone with no
// journals lands here; anyone comes back from the otter card in Featured
// and Create, or the landing page's post-it (/app?otter).
//
// One tap a question, the otter on a post-it asking it, and the planner
// building beside it as the answers come in: each answer is sent to the
// server (otterActions.ts, previewOtter), which makes the planner and draws
// it the way the Layouts page draws a layout. At the end the reveal - the
// otter's guess, its notes, a name and serif or sans - and Open my planner,
// which makes the journal and opens it. Retaking always makes a NEW journal;
// it never changes one you have.
//
// The questions, the route through them and the otter's words are
// lib/otterQuiz.ts; what each answer puts in the planner, otterPlanner.ts.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import otters from "../../../public/landing/otter/otters.json";
import { questionsFor, reactionTo, type AnswerDetails, type Answers, type Question, type ScheduleEntry } from "@/lib/otterQuiz";
import { usePrefersReducedMotion } from "./useMediaQuery";
import { createFromOtter, previewOtter, type OtterPreview } from "./otterActions";
import { SpreadThumb } from "./StartFeatured";

const DIM = "rgba(var(--sd-ink-rgb), 0.6)";
const INK = "var(--sd-ink)";
const ERROR_TEXT = "var(--sd-error)";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Pose = "otter-1" | "otter-2" | "otter-3";

export function OtterQuiz({
  guestLimit,
  leaving,
  onExit,
  onDone,
}: {
  /** Set when a guest already has as many journals as a guest may keep. */
  guestLimit: number | null;
  leaving: boolean;
  /** Leave the quiz: "Start blank instead", or a tab chosen. */
  onExit: () => void;
  /** The planner is made: open it. */
  onDone: (slug: string) => void;
}) {
  const [answers, setAnswers] = useState<Answers>({ pages: ["week"] });
  const [step, setStep] = useState(0);
  const [reaction, setReaction] = useState<string | null>(null);
  const [font, setFont] = useState<"serif" | "sans" | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<OtterPreview | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [part, setPart] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const pose = usePose();

  const route = useMemo(() => questionsFor(answers), [answers]);
  const atReveal = step >= route.length;
  const question = atReveal ? null : route[step];

  // The planner so far, drawn on the server a moment after the last answer.
  const asked = useRef(0);
  useEffect(() => {
    const id = ++asked.current;
    const timer = window.setTimeout(() => {
      setDrawing(true);
      previewOtter(answers, font)
        .then((next) => {
          if (id !== asked.current) return;
          setPreview(next);
          setDrawing(false);
        })
        .catch(() => {
          if (id === asked.current) setDrawing(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [answers, font]);

  const answer = (id: Question["id"], picked: string[] | undefined, details?: AnswerDetails) => {
    setAnswers((prev) => {
      const next: Answers = { ...prev, details: { ...prev.details, ...details } };
      if (picked && picked.length > 0) next[id] = picked;
      else delete next[id];
      return next;
    });
  };
  const advance = (id: Question["id"], picked: string[] | undefined) => {
    setReaction(reactionTo(id, picked));
    pose.wave();
    setStep((s) => s + 1);
  };
  const back = () => {
    setReaction(null);
    setReviewing(false);
    setStep((s) => Math.max(0, Math.min(s, route.length) - 1));
  };

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createFromOtter(answers, title, font ?? preview?.font, Intl.DateTimeFormat().resolvedOptions().timeZone);
      if ("error" in result) {
        setError(result.error);
        setBusy(false);
        return;
      }
      onDone(result.slug);
    } catch {
      setError("That didn't work. Try again in a moment.");
      setBusy(false);
    }
  };

  const shownPart = preview?.parts.find((p) => p.part === part) ?? preview?.parts.find((p) => p.part === "week") ?? preview?.parts[0] ?? null;

  return (
    <div className="sd-body oq-body">
      <div className="sd-main oq-main">
        <div className="oq-top">
          <span className="sd-label">{atReveal ? "Your planner" : `Question ${step + 1} of about ${route.length}`}</span>
          <button type="button" className="sd-link oq-quiet" onClick={onExit}>
            Start blank instead
          </button>
        </div>
        <Otter pose={pose.now} text={atReveal ? (preview?.guess ?? "Here's your planner!") : `${reaction ? `${reaction} ` : ""}${question!.ask(answers)}`} />

        {question && <Ask key={question.id} question={question} answers={answers} onAnswer={answer} onAdvance={advance} />}

        {atReveal && !reviewing && (
          <div className="oq-reveal">
            {preview && preview.notes.length > 0 && (
              <ul className="oq-notes">
                {preview.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
            <label className="sd-field">
              <span>Its name, for the cover</span>
              <input className="sd-input" value={title} maxLength={80} placeholder="My planner" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="sd-field">
              <span>Type</span>
              <div className="sd-seg" role="group" aria-label="Type">
                {(["serif", "sans"] as const).map((f) => (
                  <button key={f} type="button" aria-pressed={(font ?? preview?.font) === f} onClick={() => setFont(f)}>
                    {f === "serif" ? "Serif" : "Sans"}
                  </button>
                ))}
              </div>
            </div>
            {guestLimit !== null && (
              <p style={{ color: DIM, fontSize: 12.5, margin: 0, lineHeight: 1.45 }}>
                A guest can keep {guestLimit} journals. Sign in to make more. The ones you have come with you.
              </p>
            )}
            {error && <p style={{ color: ERROR_TEXT, fontSize: 12.5, margin: 0 }}>{error}</p>}
            <div className="oq-nav">
              <button type="button" className="sd-btn" onClick={() => setReviewing(true)} disabled={busy || leaving}>
                Change an answer
              </button>
              <button type="button" className="sd-btn sd-primary" onClick={() => void make()} disabled={busy || leaving || guestLimit !== null || !preview}>
                {busy || leaving ? "Making it…" : "Open my planner"}
              </button>
            </div>
          </div>
        )}

        {atReveal && reviewing && (
          <ol className="oq-review">
            {route.map((q, i) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => {
                    setReviewing(false);
                    setReaction(null);
                    setStep(i);
                  }}
                >
                  <span>{q.title}</span>
                  <span style={{ color: DIM }}>{labelsOf(q, answers) || "Skipped"}</span>
                </button>
              </li>
            ))}
          </ol>
        )}

        {!atReveal && (
          <div className="oq-nav oq-nav-quiet">
            <button type="button" className="sd-link oq-quiet" onClick={back} disabled={step === 0}>
              Back
            </button>
            <button type="button" className="sd-link oq-quiet" onClick={() => setStep(route.length)}>
              Skip to my planner
            </button>
          </div>
        )}
      </div>

      <aside className="sd-details oq-preview" aria-live="polite" aria-busy={drawing}>
        <div className="oq-top">
          <span className="sd-label">{drawing ? "Building…" : "Your planner so far"}</span>
        </div>
        {preview && preview.parts.length > 1 && (
          <div className="sd-seg" role="group" aria-label="Pages">
            {preview.parts.map((p) => (
              <button key={p.part} type="button" aria-pressed={shownPart?.part === p.part} onClick={() => setPart(p.part)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="oq-spread" style={{ opacity: drawing ? 0.55 : 1 }}>
          <SpreadThumb spread={shownPart?.spread ?? null} height={300} />
        </div>
        {shownPart?.part === "day" && <p className="sd-meta">Shown as two facing days.</p>}
      </aside>
    </div>
  );
}

/** The labels of a question's answer, for "Change an answer". */
function labelsOf(q: Question, answers: Answers): string {
  const options = q.options(answers);
  return (answers[q.id] ?? []).map((id) => options.find((o) => o.id === id)?.label ?? id).join(", ");
}

// ------------------------------------------------------------ one question

function Ask({
  question,
  answers,
  onAnswer,
  onAdvance,
}: {
  question: Question;
  answers: Answers;
  onAnswer: (id: Question["id"], picked: string[] | undefined, details?: AnswerDetails) => void;
  onAdvance: (id: Question["id"], picked: string[] | undefined) => void;
}) {
  const options = question.options(answers);
  const current = answers[question.id] ?? question.preset?.(answers) ?? [];
  const [picked, setPicked] = useState<string[]>(current);
  const max = question.multi?.max ?? options.length;
  const details = answers.details ?? {};
  // A pick that needs more before moving on: a date, a schedule, which days.
  const needsMore = (ids: string[]) =>
    (question.id === "start" && ids[0] === "pick") || (question.id === "schedule" && ids[0] === "add") || (question.id === "marks" && ids.some((id) => id !== "none"));

  const choose = (id: string) => {
    if (!question.multi) {
      const next = [id];
      setPicked(next);
      onAnswer(question.id, next);
      if (!needsMore(next)) window.setTimeout(() => onAdvance(question.id, next), 140);
      return;
    }
    const option = options.find((o) => o.id === id);
    let next: string[];
    if (picked.includes(id)) next = picked.filter((p) => p !== id);
    else if (option?.only) next = [id];
    else next = [...picked.filter((p) => !options.find((o) => o.id === p)?.only), id].slice(-max);
    setPicked(next);
    onAnswer(question.id, next);
  };

  const canGo = picked.length > 0 || question.optional;
  return (
    <div className="oq-ask">
      {question.multi && <p className="sd-meta" style={{ margin: 0 }}>{question.multi.max ? `Pick up to ${question.multi.max}.` : "Pick any."}</p>}
      <div className="oq-options" role="group" aria-label={question.title}>
        {options.map((option) => (
          <button key={option.id} type="button" className="oq-option" aria-pressed={picked.includes(option.id)} onClick={() => choose(option.id)}>
            <span className="oq-label">{option.label}</span>
            {option.hint && <span className="oq-hint">{option.hint}</span>}
          </button>
        ))}
      </div>

      {question.id === "start" && picked[0] === "pick" && (
        <label className="sd-field" style={{ maxWidth: 220 }}>
          <span>Starting on</span>
          <input type="date" className="sd-input" value={details.startDate ?? ""} onChange={(e) => onAnswer("start", picked, { startDate: e.target.value })} />
        </label>
      )}
      {question.id === "schedule" && picked[0] === "add" && (
        <ScheduleForm entries={details.schedule ?? []} weekStartsMonday={answers.weekStart?.[0] !== "sunday"} onChange={(schedule) => onAnswer("schedule", picked, { schedule })} />
      )}
      {question.id === "marks" && <MarkDetails picked={picked} details={details} onChange={(d) => onAnswer("marks", picked, d)} />}

      {(question.multi || needsMore(picked)) && (
        <div className="oq-nav">
          {question.optional && picked.length === 0 && (
            <button type="button" className="sd-btn" onClick={() => onAdvance(question.id, undefined)}>
              Skip
            </button>
          )}
          <button type="button" className="sd-btn sd-primary" disabled={!canGo} onClick={() => onAdvance(question.id, picked)}>
            Continue
          </button>
        </div>
      )}
      {!question.multi && !needsMore(picked) && question.optional && (
        <div className="oq-nav">
          <button type="button" className="sd-btn" onClick={() => onAdvance(question.id, undefined)}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

/** Classes, shifts, practice: what, which days, from and to. */
function ScheduleForm({ entries, weekStartsMonday, onChange }: { entries: ScheduleEntry[]; weekStartsMonday: boolean; onChange: (entries: ScheduleEntry[]) => void }) {
  const rows = entries.length > 0 ? entries : [{ title: "", days: [], from: "09:00", to: "10:00" }];
  const order = weekStartsMonday ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const set = (i: number, patch: Partial<ScheduleEntry>) => onChange(rows.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  return (
    <div className="oq-schedule">
      {rows.map((row, i) => (
        <div key={i} className="oq-schedule-row">
          <input className="sd-input" placeholder="What, like Bio lab" value={row.title} maxLength={60} onChange={(e) => set(i, { title: e.target.value })} aria-label="What" />
          <div className="oq-days" role="group" aria-label="Which days">
            {order.map((d) => (
              <button key={d} type="button" className="sd-chip" aria-pressed={row.days.includes(d)} onClick={() => set(i, { days: row.days.includes(d) ? row.days.filter((x) => x !== d) : [...row.days, d] })}>
                {DAYS[d].slice(0, 2)}
              </button>
            ))}
          </div>
          <div className="oq-times">
            <input type="time" className="sd-input" value={row.from} onChange={(e) => set(i, { from: e.target.value })} aria-label="From" />
            <span style={{ color: DIM }}>to</span>
            <input type="time" className="sd-input" value={row.to} onChange={(e) => set(i, { to: e.target.value })} aria-label="To" />
          </div>
          {row.from >= row.to && <p className="sd-meta" style={{ margin: 0 }}>Times past midnight are coming soon. For now, end it before midnight.</p>}
        </div>
      ))}
      {rows.length < 8 && (
        <button type="button" className="sd-link oq-quiet" style={{ justifySelf: "start" }} onClick={() => onChange([...rows, { title: "", days: [], from: "09:00", to: "10:00" }])}>
          Add another
        </button>
      )}
    </div>
  );
}

/** Which day the bins go out, how often payday comes. */
function MarkDetails({ picked, details, onChange }: { picked: string[]; details: AnswerDetails; onChange: (d: AnswerDetails) => void }) {
  const weekday = (value: number | undefined, fallback: number, set: (n: number) => void, label: string) => (
    <select className="sd-input" value={value ?? fallback} onChange={(e) => set(Number(e.target.value))} aria-label={label} style={{ width: "auto" }}>
      {DAYS.map((d, i) => (
        <option key={d} value={i}>
          {d}
        </option>
      ))}
    </select>
  );
  const dates = (value: number | undefined, set: (n: number) => void, label: string) => (
    <select className="sd-input" value={value ?? 1} onChange={(e) => set(Number(e.target.value))} aria-label={label} style={{ width: "auto" }}>
      {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
        <option key={n} value={n}>
          {ordinal(n)}
        </option>
      ))}
    </select>
  );
  return (
    <div className="oq-marks">
      {picked.includes("trash") && (
        <div className="oq-mark">
          <span>Trash goes out on</span>
          {weekday(details.trashDay, 2, (n) => onChange({ trashDay: n }), "Trash day")}
        </div>
      )}
      {picked.includes("recycling") && (
        <div className="oq-mark">
          <span>Recycling on</span>
          {weekday(details.recyclingDay, 2, (n) => onChange({ recyclingDay: n }), "Recycling day")}
          <select className="sd-input" value={details.recyclingEvery ?? 1} onChange={(e) => onChange({ recyclingEvery: Number(e.target.value) === 2 ? 2 : 1 })} aria-label="How often" style={{ width: "auto" }}>
            <option value={1}>every week</option>
            <option value={2}>every other week</option>
          </select>
        </div>
      )}
      {picked.includes("payday") && (
        <div className="oq-mark">
          <span>Paid</span>
          <select className="sd-input" value={details.paydayEvery ?? "fortnight"} onChange={(e) => onChange({ paydayEvery: e.target.value as AnswerDetails["paydayEvery"] })} aria-label="How often" style={{ width: "auto" }}>
            <option value="week">every week</option>
            <option value="fortnight">every other week</option>
            <option value="month">every month</option>
          </select>
          <span>on</span>
          {details.paydayEvery === "month" ? dates(details.paydayDay, (n) => onChange({ paydayDay: n }), "Payday date") : weekday(details.paydayDay, 5, (n) => onChange({ paydayDay: n }), "Payday")}
        </div>
      )}
      {picked.includes("bills") && (
        <div className="oq-mark">
          <span>Bills due on the</span>
          {dates(details.billsDate, (n) => onChange({ billsDate: n }), "Bills date")}
        </div>
      )}
    </div>
  );
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

// ------------------------------------------------------------ the otter

/** The otter's pose: looking at you, now and then glancing away, a paw up
 *  when an answer lands - the landing page's post-it's own cycle (PostIt.tsx).
 *  Still under reduced motion. */
function usePose(): { now: Pose; wave: () => void } {
  const reduce = usePrefersReducedMotion();
  const [now, setNow] = useState<Pose>("otter-3");
  const timer = useRef(0);
  useEffect(() => {
    if (reduce) return;
    let alive = true;
    const glance = () => {
      if (!alive) return;
      timer.current = window.setTimeout(() => {
        setNow("otter-1");
        timer.current = window.setTimeout(() => {
          setNow("otter-3");
          glance();
        }, 1300 + Math.random() * 1300);
      }, 2600 + Math.random() * 3000);
    };
    glance();
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
    };
  }, [reduce]);
  return {
    now,
    wave: () => {
      if (reduce) return;
      window.clearTimeout(timer.current);
      setNow("otter-2");
      timer.current = window.setTimeout(() => setNow("otter-3"), 420);
    },
  };
}

const OTTER_WIDTH = 150;
/** The tallest pose, as drawn at OTTER_WIDTH: the room left for it at the
 *  top of the note. */
const OTTER_HEIGHT = Math.max(...Object.values(otters).map((o) => (o.height / o.width) * OTTER_WIDTH));

/** The otter on the post-it with the question on it, peeking over its
 *  pencil line as it peeks over the landing page's fold - drawn ON the
 *  paper, so it reads on the dark backgrounds as well as the light. */
function Otter({ pose, text }: { pose: Pose; text: string }) {
  return (
    <div className="oq-note" style={{ paddingTop: OTTER_HEIGHT + 12 }}>
      <span className="oq-otter-art" aria-hidden="true" style={{ width: OTTER_WIDTH, height: OTTER_HEIGHT }}>
        {(["otter-1", "otter-2", "otter-3"] as const).map((p) => {
          const o = otters[p];
          const style: CSSProperties = { width: OTTER_WIDTH, height: (o.height / o.width) * OTTER_WIDTH, opacity: p === pose ? 1 : 0 };
          // eslint-disable-next-line @next/next/no-img-element -- three small poses swapped by opacity; the image pipeline would only add requests
          return <img key={p} src={`/landing/otter/${p}.webp`} alt="" width={o.width} height={o.height} style={style} />;
        })}
      </span>
      <p>{text}</p>
    </div>
  );
}

export const OTTER_STYLES = `
.oq-body { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.oq-main { gap: 16px; }
.oq-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 22px; }
.oq-quiet { font-size: 13px; color: ${DIM}; text-decoration: none; }
.oq-quiet:hover { color: ${INK}; text-decoration: underline; }
.oq-quiet:disabled { opacity: 0.35; cursor: default; text-decoration: none; }
.oq-otter-art { position: absolute; top: 8px; left: 14px; display: block; pointer-events: none; }
.oq-otter-art img { position: absolute; top: 0; left: 0; display: block; transition: opacity 90ms linear; mix-blend-mode: multiply; }
.oq-note p { margin: 0; }
.oq-note { position: relative; max-width: 520px; margin: 0; background: #fbec93; color: #3b3320; border-radius: 2px 2px 3px 3px; padding: 16px 18px 18px; font-size: 16px; line-height: 1.45; font-weight: 500; box-shadow: 0 1px 2px rgba(60, 45, 10, 0.18), 0 10px 24px rgba(60, 45, 10, 0.12); transform: rotate(-0.6deg); text-wrap: pretty; }
.oq-ask { display: grid; gap: 12px; }
.oq-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.oq-option { display: grid; gap: 2px; text-align: left; background: var(--sd-control); color: var(--sd-text); border: 1.5px solid transparent; border-radius: 10px; padding: 11px 14px; font: inherit; cursor: pointer; min-height: 48px; transition: border-color 120ms ease-out, background 120ms ease-out; }
.oq-option:hover { border-color: rgba(var(--sd-ink-rgb), 0.18); }
.oq-option[aria-pressed="true"] { border-color: #4a5cff; background: var(--sd-chip-on); }
.oq-option:focus-visible { outline: 2px solid #4a5cff; outline-offset: 2px; }
.oq-label { font-size: 14.5px; font-weight: 600; line-height: 1.3; }
.oq-hint { font-size: 12px; color: ${DIM}; line-height: 1.35; }
.oq-nav { display: flex; flex-wrap: wrap; gap: 10px; justify-content: flex-end; align-items: center; }
.oq-nav-quiet { justify-content: space-between; margin-top: auto; padding-top: 8px; }
.oq-schedule { display: grid; gap: 14px; }
.oq-schedule-row { display: grid; gap: 8px; padding: 12px; border-radius: 10px; background: var(--sd-control); }
.oq-days { display: flex; flex-wrap: wrap; gap: 4px; }
.oq-times { display: flex; align-items: center; gap: 8px; }
.oq-times .sd-input { width: auto; }
.oq-marks { display: grid; gap: 8px; }
.oq-mark { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }
.oq-reveal { display: grid; gap: 14px; }
.oq-notes { margin: 0; padding-left: 18px; display: grid; gap: 4px; font-size: 13px; line-height: 1.45; color: ${DIM}; }
.oq-review { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.oq-review button { width: 100%; display: flex; justify-content: space-between; gap: 12px; text-align: left; background: var(--sd-control); color: var(--sd-text); border: none; border-radius: 8px; padding: 10px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.oq-review button:hover { outline: 1.5px solid rgba(var(--sd-ink-rgb), 0.18); }
.oq-preview { gap: 12px; }
.oq-spread { display: grid; justify-items: center; transition: opacity 160ms ease-out; }
.oq-spread .sd-thumb { max-width: 100%; }
@media (max-width: 760px) {
  .oq-body { grid-template-columns: minmax(0, 1fr); }
  .oq-spread .sd-thumb { height: 200px !important; }
}
@media (prefers-reduced-motion: reduce) { .oq-otter-art img, .oq-option, .oq-spread { transition: none; } }
`;

/** The way back in: the otter's card, first in Featured's journals and in
 *  Create ("a way for them to retake", 2026-10-20). It always makes a new
 *  journal. */
export function OtterCard({ onClick }: { onClick: () => void }) {
  const o = otters["otter-3"];
  const width = 84;
  return (
    <button type="button" className="sd-card oq-card" onClick={onClick}>
      <span className="sd-thumb oq-card-thumb">
        <span className="oq-mini">
          {/* eslint-disable-next-line @next/next/no-img-element -- one small drawing */}
          <img src="/landing/otter/otter-3.webp" alt="" width={o.width} height={o.height} style={{ width, height: (o.height / o.width) * width }} />
          <span>A few questions and I&rsquo;ll build it.</span>
        </span>
      </span>
      <span className="sd-name">Build mine with the otter</span>
      <span className="sd-meta">Makes a new journal</span>
    </button>
  );
}

export const OTTER_CARD_STYLES = `
.sd-card.oq-card { opacity: 1; }
.sd-card.oq-card:hover { outline-color: rgba(var(--sd-ink-rgb), 0.2); }
.oq-card-thumb { align-items: center; }
.oq-mini { display: grid; justify-items: start; gap: 4px; width: 136px; box-sizing: border-box; background: #fbec93; color: #3b3320; font-size: 11.5px; font-weight: 600; line-height: 1.3; padding: 6px 10px 10px; border-radius: 2px; box-shadow: 0 1px 2px rgba(60, 45, 10, 0.18), 0 6px 14px rgba(60, 45, 10, 0.12); transform: rotate(-1.2deg); }
.oq-mini img { display: block; mix-blend-mode: multiply; }
`;

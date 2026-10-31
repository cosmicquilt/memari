"use client";

// Intake that fills the book (2026-10-31, src/lib/clientAnswers.ts): the
// questions a client answers - on their own page, or the coach correcting
// them on the client's screen - and, per template, which modules ask.

import { useState, useTransition } from "react";
import type { AskedQuestion, Answer } from "@/lib/clientAnswers";
import type { Candidate } from "@/lib/templateQuestions";
import { askAbout, stopAskingAbout } from "./actions";
import css from "./business.module.css";

type Save = (answers: Record<string, Answer>) => Promise<{ error?: string; saved?: number }>;

/** Each question with its answer: one box for a written answer, a line each
 *  for a list, as many as the question asks. What the template's module
 *  holds shows faintly, as an example. */
export function AnswersForm({ questions, save, done }: { questions: AskedQuestion[]; save: Save; done: string }) {
  const [values, setValues] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.kind === "list" ? Array.from({ length: q.max }, (_, i) => [q.answer ?? []].flat()[i] ?? "") : [q.answer ?? ""].flat().join("\n")]))
  );
  const [state, setState] = useState<{ error?: string; saved?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const set = (id: string, value: Answer) => {
    setValues((v) => ({ ...v, [id]: value }));
    setState(null);
  };
  return (
    <form
      className={css.form}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await save(values);
          setState(result.error ? { error: result.error } : { saved: true });
        });
      }}
    >
      {questions.map((q) => {
        const example = [q.example ?? []].flat();
        return (
          <fieldset key={q.id} className={css.field} style={{ border: 0, padding: 0, margin: 0 }} data-question={q.id}>
            <legend style={{ padding: 0 }}>
              <span className={css.strong}>{q.prompt}</span>
            </legend>
            <small style={{ display: "block", marginBottom: 6 }}>{q.where}</small>
            {q.kind === "text" ? (
              <textarea rows={3} maxLength={500} value={values[q.id] as string} placeholder={example.join(" ")} aria-label={q.prompt} onChange={(e) => set(q.id, e.target.value)} />
            ) : (
              <div style={{ display: "grid", gap: 6, maxWidth: 520 }}>
                {(values[q.id] as string[]).map((item, i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={120}
                    value={item}
                    placeholder={example[i] ?? ""}
                    aria-label={`${q.prompt}: ${i + 1} of ${q.max}`}
                    onChange={(e) => set(q.id, (values[q.id] as string[]).map((v, j) => (j === i ? e.target.value : v)))}
                  />
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
      {state?.error && (
        <p className={css.error} role="alert">
          {state.error}
        </p>
      )}
      {state?.saved && (
        <p className={css.saved} role="status">
          {done}
        </p>
      )}
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          {pending ? "Saving…" : "Save answers"}
        </button>
      </div>
    </form>
  );
}

/** One module of a template a client could fill: ask about it, word the
 *  question, choose how many answers a list takes, or stop asking. */
export function QuestionPicker({ templateId, candidate: c }: { templateId: string; candidate: Candidate }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(c.asked?.prompt ?? (c.heading ? `${c.heading}?`.replace(/\?\?$/, "?") : ""));
  const [max, setMax] = useState(c.asked?.max ?? Math.min(10, Math.max(1, c.items)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = open || !!c.asked;
  return (
    <div className={css.step} style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }} data-candidate={c.moduleId}>
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span className={css.strong}>{c.heading || c.name}</span>
          <span className={css.dim}>
            {" "}
            · {c.heading ? `${c.name} · ` : ""}
            {c.where}
          </span>
          {c.example && (
            <>
              <br />
              <span className={css.dim}>Now prints: {c.example}</span>
            </>
          )}
        </span>
        {c.asked ? (
          <span className={`${css.tag} ${css.tagOk}`}>Asked</span>
        ) : (
          !open && (
            <button type="button" className={css.btn} onClick={() => setOpen(true)}>
              Ask your clients
            </button>
          )
        )}
      </div>
      {editing && (
        <form
          className={css.form}
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const result = await askAbout(templateId, c.moduleId, prompt, max);
              setError(result.error ?? null);
              if (!result.error) setOpen(false);
            });
          }}
        >
          <div className={css.fields}>
            <label className={`${css.field} ${css.wide}`}>
              <span>The question, as your client reads it</span>
              <input type="text" maxLength={200} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="What three goals do you want this quarter?" required />
            </label>
            {c.kind === "list" && (
              <label className={css.field}>
                <span>Answers to ask for</span>
                <input type="number" min={1} max={10} value={max} onChange={(e) => setMax(Number(e.target.value))} />
                <small>A line each. Their answers fill the list, in place of what it prints now.</small>
              </label>
            )}
          </div>
          {error && (
            <p className={css.error} role="alert">
              {error}
            </p>
          )}
          <div className={css.actions}>
            <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
              {pending ? "Saving…" : c.asked ? "Save the question" : "Ask it"}
            </button>
            {c.asked ? (
              <button type="button" className={css.btn} disabled={pending} onClick={() => start(() => stopAskingAbout(templateId, c.moduleId))}>
                Stop asking
              </button>
            ) : (
              <button type="button" className={css.btn} onClick={() => setOpen(false)}>
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

"use client";

// Templates > Move clients (2026-11-04, Andrew: "Templates with no clients or
// they can even create new templates from existing ones claude then move the
// clients over on the website"). Several clients onto one template at once: a
// copy a connected assistant made of a template with clients, say, since it
// can change only a template no client follows. Whose next books change is said
// before anything moves, and that printed books don't; each client then moves
// as one does from their own page (businessJournals.ts moveClientsTo).
//
// IN TURNS (review, 2026-11-04): MOVE_AT_ONCE clients a request, so no
// request runs into the platform's time limit however many are chosen, and
// one cut off leaves each client either moved or not, never half.

import { useState, useTransition } from "react";
import { moveClientsToTemplate } from "./actions";
import { MOVE_AT_ONCE } from "./moveAtOnce";
import { useToast } from "./Toast";
import css from "./business.module.css";

export type MoveTemplate = {
  id: string;
  title: string;
  clients: number;
  /** Changes a connected assistant made to it that can still be undone, and
   *  can't be once a client is on it (journalRuns.ts undoRun). */
  assistantChanges: number;
};
export type MoveClient = {
  id: string;
  name: string;
  templateId: string | null;
  /** The template they are on now, by its title. */
  template: string | null;
  /** Whether their journal has been built: without one, nothing is rebuilt. */
  journal: boolean;
  /** A group that sets their template, and the one it sets. */
  group: { name: string; templateId: string | null; template: string | null } | null;
};

const clientsWord = (n: number) => (n === 1 ? "1 client" : `${n} clients`);
const names = (clients: Array<{ name: string }>) =>
  clients.length <= 3 ? clients.map((c) => c.name).join(", ").replace(/, ([^,]*)$/, " and $1") : `${clients.slice(0, 2).map((c) => c.name).join(", ")} and ${clients.length - 2} more`;

export function MoveClients({
  templates,
  clients,
  initial,
  intake,
}: {
  templates: MoveTemplate[];
  clients: MoveClient[];
  initial: string;
  /** The template clients added through the business's address start on
   *  when they name none (clientIntake.ts firstTemplateOf), while it is on. */
  intake: { id: string; title: string } | null;
}) {
  const toast = useToast();
  const [to, setTo] = useState(initial);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [pending, start] = useTransition();
  const target = templates.find((t) => t.id === to) ?? templates[0];
  if (!target) return null;

  // who can move here, by the template they are on now
  const movable = clients.filter((c) => c.templateId !== target.id);
  const sets = [...new Set(movable.map((c) => c.templateId ?? ""))].map((key) => {
    const on = movable.filter((c) => (c.templateId ?? "") === key);
    return { key, label: on[0].template ? `On ${on[0].template} now` : "On no template now", clients: on };
  });
  const picked = movable.filter((c) => chosen.has(c.id));
  const rebuilt = picked.filter((c) => c.journal);
  const waiting = picked.filter((c) => !c.journal);
  const offIntake = intake && intake.id !== target.id && picked.some((c) => c.templateId === intake.id);

  const toggle = (ids: string[], on: boolean) =>
    setChosen((was) => {
      const next = new Set(was);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const move = () =>
    start(async () => {
      const ids = picked.map((c) => c.id);
      const lost: string[] = [];
      let moved = 0;
      let refused: string | null = null;
      setError(null);
      setProblems([]);
      for (let i = 0; i < ids.length && !refused; i += MOVE_AT_ONCE) {
        setProgress({ done: i, of: ids.length });
        const result = await moveClientsToTemplate(target.id, ids.slice(i, i + MOVE_AT_ONCE)).catch(() => ({
          error: `${moved > 0 ? `${clientsWord(moved)} moved, and then the` : "The"} connection to Memari was lost. Whoever didn't move is still listed here: choose them and move them again.`,
          moved: undefined,
          problems: undefined,
        }));
        moved += result.moved ?? 0;
        lost.push(...(result.problems ?? []));
        refused = result.error ?? null;
      }
      setProgress(null);
      setError(refused);
      setProblems(lost);
      if (!refused) setChosen(new Set());
      if (moved > 0) toast({ message: `${clientsWord(moved)} moved to ${target.title}` });
    });

  const aside = (c: MoveClient) =>
    [
      c.journal ? `Their journal is rebuilt from ${target.title}` : "No journal yet",
      c.group?.templateId && c.group.templateId !== target.id
        ? `in ${c.group.name}, which is on ${c.group.template}: they stay on ${target.title} unless the group's template is changed`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className={css.card} id="move">
      <h2>Move clients to another template</h2>
      <p className={css.dim}>
        Onto a copy your assistant made, say: it can change a template only while no client is on it. Choose who moves, and you&rsquo;ll see whose next books change before
        anything does.
      </p>
      <div className={css.fields}>
        <label className={`${css.field} ${css.wide}`} style={{ maxWidth: 520 }}>
          <span>Move to</span>
          <select
            value={target.id}
            onChange={(e) => {
              setTo(e.target.value);
              setError(null);
              setProblems([]);
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
                {t.clients === 0 ? " (no clients yet)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      {movable.length === 0 ? (
        <p className={css.dim}>Every client of yours is on {target.title} already.</p>
      ) : (
        sets.map((set) => (
          <fieldset key={set.key} className={css.choices} style={{ maxHeight: 320, overflow: "auto" }}>
            <legend className={css.choicesLegend}>
              {set.label}
              {set.clients.length > 1 && (
                <button
                  type="button"
                  className={css.btn}
                  style={{ marginLeft: 10, minHeight: 0, padding: "2px 10px", fontSize: 12 }}
                  onClick={() => toggle(set.clients.map((c) => c.id), !set.clients.every((c) => chosen.has(c.id)))}
                >
                  {set.clients.every((c) => chosen.has(c.id)) ? "Choose none" : `Choose all ${set.clients.length}`}
                </button>
              )}
            </legend>
            {set.clients.map((c) => (
              <label key={c.id} className={css.choice}>
                <input type="checkbox" checked={chosen.has(c.id)} onChange={(e) => toggle([c.id], e.target.checked)} />
                <span>
                  <strong>{c.name}</strong>
                  <small>{aside(c)}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ))
      )}
      {picked.length > 0 && (
        <div data-move-impact="" style={{ display: "grid", gap: 6 }}>
          {rebuilt.length > 0 && (
            <p className={css.strong}>
              This changes the next book for {clientsWord(rebuilt.length)}: {names(rebuilt)}. Books already printed don&rsquo;t change.
            </p>
          )}
          {waiting.length > 0 && (
            <p>
              {names(waiting)} {waiting.length === 1 ? "has no journal yet: it's" : "have no journals yet: theirs are"} built from {target.title} when you build{" "}
              {waiting.length === 1 ? "it" : "them"}.
            </p>
          )}
          {rebuilt.length > 0 && (
            <p className={css.dim}>
              Each journal is rebuilt from {target.title}: the pages of the template it was on go, with anything changed on those pages for that client alone, and the pages
              you added just for them stay. Answers they gave print again wherever {target.title} asks the same question.
            </p>
          )}
          {target.assistantChanges > 0 && (
            <p data-move-assistant="">
              Your assistant&rsquo;s changes to {target.title} can&rsquo;t be undone once clients are on it. To take any of them back, open {target.title} in the editor and
              undo them there first.
            </p>
          )}
          {offIntake && (
            <p className={css.dim} data-move-intake="">
              Clients your other tools add through your address still start on {intake.title}, your first template, unless they name another.
            </p>
          )}
        </div>
      )}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      {problems.map((problem) => (
        <p key={problem} className={css.error} role="alert">
          {problem}
        </p>
      ))}
      <div className={css.actions}>
        <button type="button" className={`${css.btn} ${css.primary}`} disabled={pending || picked.length === 0} onClick={move}>
          {pending
            ? progress && progress.of > MOVE_AT_ONCE
              ? `Moving… ${progress.done} of ${progress.of}`
              : "Moving…"
            : picked.length === 0
              ? "Move"
              : `Move ${clientsWord(picked.length)} to ${target.title}`}
        </button>
      </div>
    </div>
  );
}

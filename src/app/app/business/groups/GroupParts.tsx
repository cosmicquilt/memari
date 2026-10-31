"use client";

// The group screens' parts (groups, 2026-10-31): the group's form, adding
// people, building every journal and emailing every link with the count as
// it goes, and ordering every book in one payment.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { buildJournalFor, emailLinkTo } from "../actions";
import { addPeopleAction, createGroupAction, deleteGroupAction, leaveGroupAction, payForGroup, prepareBook, quoteGroup, rejoinGroupAction, saveGroupAction, startGroupOrder } from "./actions";
import type { GroupOption, GroupQuote } from "@/lib/print/groupOrders";
import { BINDING_SPECS, PAPER_LABELS, paperChoices, type Binding, type PaperColour } from "@/lib/print/products";
import { arrivesLabel } from "@/lib/print/arrives";
import { formatCents } from "@/lib/print/pricing";
import { useToast } from "../Toast";
import css from "../business.module.css";
import type { FormState } from "../actions";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className={css.error} role="alert">{state.error}</p>;
  if (state?.saved) return <p className={css.saved} role="status">Saved</p>;
  return null;
}

const books = (n: number) => `${n} ${n === 1 ? "book" : "books"}`;
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

type Place = Partial<Record<"name" | "street1" | "street2" | "city" | "stateCode" | "postcode" | "countryCode" | "phoneNumber", string>>;

export type GroupValues = { id?: string; name?: string; templateId?: string | null; startDate?: string | null; bookMonths?: number; shipToVenue?: boolean; venue?: Place | null };

/** People to add: a pasted list, and the clients already here to tick. */
function PeopleFields({ clients }: { clients: Array<{ id: string; name: string; email: string | null; group: string | null }> }) {
  return (
    <>
      <label className={`${css.field} ${css.wide}`}>
        <span>Names, one a line</span>
        <textarea name="people" rows={6} placeholder={"Maya Okafor, maya@example.com\nSam Lee, sam@example.com\nPriya Nair"} />
        <small>An email after each name if you have it, or two columns pasted from a spreadsheet. Someone already a client joins as they are.</small>
      </label>
      {clients.length > 0 && (
        <fieldset className={css.choices} style={{ maxHeight: 260, overflow: "auto" }}>
          <legend className={css.choicesLegend}>Or choose clients you have</legend>
          {clients.map((c) => (
            <label key={c.id} className={css.choice}>
              <input type="checkbox" name="clientId" value={c.id} />
              <span>
                <strong>{c.name}</strong>
                <small>{[c.email, c.group && `in ${c.group} now: moves to this group`].filter(Boolean).join(" · ") || "No email"}</small>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

/** A new group, or a group's settings. */
export function GroupForm({
  group,
  templates,
  countries,
  months,
  clients = [],
}: {
  group: GroupValues;
  templates: Array<{ id: string; title: string }>;
  countries: Array<{ code: string; name: string }>;
  months: readonly number[];
  clients?: Array<{ id: string; name: string; email: string | null; group: string | null }>;
}) {
  const [state, action, pending] = useActionState(group.id ? saveGroupAction : createGroupAction, null);
  const [venue, setVenue] = useState(!!group.shipToVenue);
  const v = group.venue ?? {};
  return (
    <form action={action} className={css.form}>
      {group.id && <input type="hidden" name="id" value={group.id} />}
      <div className={css.card}>
        <h2>{group.id ? "The group" : "Group"}</h2>
        <div className={css.fields}>
          <label className={css.field}>
            <span>Group name</span>
            <input type="text" name="name" required maxLength={80} defaultValue={group.name ?? ""} placeholder="January cohort" autoComplete="off" />
            <small>Yours alone: it isn&rsquo;t printed.</small>
          </label>
          <label className={css.field}>
            <span>Template</span>
            {/* a group already made shows its own choice, "each keeps their own" too (review, 2026-10-31) */}
            <select name="templateId" defaultValue={group.id ? (group.templateId ?? "") : (templates[0]?.id ?? "")}>
              <option value="">{templates.length ? "Each keeps their own" : "No templates yet"}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            <span>Their first book starts</span>
            <input type="date" name="startDate" defaultValue={group.startDate ?? ""} />
          </label>
          <label className={css.field}>
            <span>Each book runs</span>
            <select name="bookMonths" defaultValue={String(group.bookMonths ?? 3)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? "1 month" : m === 12 ? "A year" : `${m} months`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {group.id && <p className={css.dim}>Saving sets each person in the group to these. Someone moved to a new template has their journal rebuilt from it, with their own pages kept.</p>}
      </div>
      <div className={css.card}>
        <h2>Where the books go</h2>
        <fieldset className={css.choices}>
          <legend className={css.choicesLegend}>Send them</legend>
          <label className={css.choice}>
            <input type="radio" name="shipTo" value="homes" checked={!venue} onChange={() => setVenue(false)} />
            <span>
              <strong>Each to their own address</strong>
              <small>The address on their client page, which they can fill in from their own page.</small>
            </span>
          </label>
          <label className={css.choice}>
            <input type="radio" name="shipTo" value="venue" checked={venue} onChange={() => setVenue(true)} />
            <span>
              <strong>All to one place</strong>
              <small>A venue, a retreat, your office. Each book has its owner&rsquo;s name on the cover.</small>
            </span>
          </label>
        </fieldset>
        <div className={css.fields} hidden={!venue} data-venue-fields="">
          <label className={css.field}>
            <span>Name on the parcels</span>
            <input type="text" name="addressName" maxLength={120} defaultValue={v.name ?? ""} placeholder="Northwind Coaching at Hotel Lumen" autoComplete="off" />
          </label>
          <label className={`${css.field} ${css.wide}`}>
            <span>Address</span>
            <input type="text" name="street1" maxLength={200} defaultValue={v.street1 ?? ""} autoComplete="off" />
          </label>
          <label className={`${css.field} ${css.wide}`}>
            <span>Address, second line</span>
            <input type="text" name="street2" maxLength={200} defaultValue={v.street2 ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>City</span>
            <input type="text" name="city" maxLength={120} defaultValue={v.city ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>State or region</span>
            <input type="text" name="stateCode" maxLength={40} defaultValue={v.stateCode ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>Postcode</span>
            <input type="text" name="postcode" maxLength={20} defaultValue={v.postcode ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>Country</span>
            <select name="countryCode" defaultValue={v.countryCode ?? "US"}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            <span>Phone</span>
            <input type="tel" name="phoneNumber" maxLength={40} defaultValue={v.phoneNumber ?? ""} autoComplete="off" />
            <small>The courier asks for one.</small>
          </label>
        </div>
      </div>
      {!group.id && (
        <div className={css.card}>
          <h2>Who&rsquo;s in it</h2>
          <PeopleFields clients={clients} />
        </div>
      )}
      <Status state={state} />
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          {pending ? (group.id ? "Saving…" : "Making the group…") : group.id ? "Save" : "Make the group"}
        </button>
        {!group.id && (
          <Link href="/app/business/groups" className={css.btn}>
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}

/** More people into the group. */
export function AddPeople({ groupId, clients }: { groupId: string; clients: Array<{ id: string; name: string; email: string | null; group: string | null }> }) {
  const [state, action, pending] = useActionState(addPeopleAction, null);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button type="button" className={css.btn} onClick={() => setOpen(true)}>
        Add people
      </button>
    );
  return (
    <form action={action} className={css.form} style={{ width: "100%" }}>
      <input type="hidden" name="id" value={groupId} />
      <PeopleFields clients={clients} />
      <Status state={state} />
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          {pending ? "Adding…" : "Add to the group"}
        </button>
        <button type="button" className={css.btn} onClick={() => setOpen(false)}>
          Done
        </button>
      </div>
    </form>
  );
}

/** Do something for each of them, one at a time, saying how far it has
 *  got; what failed is listed by name. */
function useEach() {
  const [progress, setProgress] = useState<{ done: number; of: number; name: string } | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const run = async <T extends { id: string; name: string }>(items: T[], one: (item: T) => Promise<string | null>) => {
    const failed: string[] = [];
    for (let i = 0; i < items.length; i++) {
      setProgress({ done: i, of: items.length, name: items[i].name });
      const problem = await one(items[i]);
      if (problem) failed.push(`${items[i].name}: ${problem}`);
    }
    setProgress(null);
    setProblems(failed);
    return failed;
  };
  return { progress, problems, run };
}

/** Build every journal not built yet, from the group's template - at once
 *  when the group has just been made. */
export function BuildJournals({ people: waiting, autoStart }: { people: Array<{ id: string; name: string }>; autoStart: boolean }) {
  const router = useRouter();
  const { progress, problems, run } = useEach();
  const started = useRef(false);
  const go = async () => {
    started.current = true;
    await run(waiting, async (c) => (await buildJournalFor(c.id)).error ?? null);
    router.replace(window.location.pathname);
    router.refresh();
  };
  useEffect(() => {
    if (autoStart && !started.current && waiting.length) void go();
    // once, as the page opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {progress ? (
        <p role="status">
          Building {progress.name}&rsquo;s journal ({progress.done + 1} of {progress.of})…
        </p>
      ) : (
        waiting.length > 0 && (
          <div className={css.actions}>
            <button type="button" className={`${css.btn} ${css.primary}`} onClick={() => void go()}>
              {waiting.length === 1 ? `Build ${waiting[0].name}'s journal` : `Build the other ${waiting.length} journals`}
            </button>
          </div>
        )
      )}
      {problems.length > 0 && (
        <div role="alert">
          {problems.map((p) => (
            <p key={p} className={css.error}>
              {p}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/** Email each of them their page's link: those with an email and no link
 *  yet. Each email is a new link (actions.ts emailLinkTo). */
export function EmailLinks({ people: waiting, guest = false }: { people: Array<{ id: string; name: string }>; guest?: boolean }) {
  const router = useRouter();
  const { progress, problems, run } = useEach();
  const [sent, setSent] = useState<number | null>(null);
  // a guest's business can't send email (clientLinkSend.ts): each would fail
  if (guest)
    return waiting.length > 0 ? <p className={css.dim}>Sign in to have Memari email them their links; until then, make each link on their client page and send it yourself.</p> : null;
  const go = async () => {
    const failed = await run(waiting, async (c) => {
      const result = await emailLinkTo(c.id);
      return result.sent ? null : result.error;
    });
    setSent(waiting.length - failed.length);
    router.refresh();
  };
  return (
    <>
      {progress ? (
        <p role="status">
          Emailing {progress.name} ({progress.done + 1} of {progress.of})…
        </p>
      ) : (
        waiting.length > 0 && (
          <div className={css.actions}>
            <button type="button" className={css.btn} onClick={() => void go()}>
              {waiting.length === 1 ? `Email ${waiting[0].name} their link` : `Email ${waiting.length} people their links`}
            </button>
          </div>
        )
      )}
      {sent !== null && sent > 0 && <p role="status">Sent to {people(sent)}.</p>}
      {problems.length > 0 && (
        <div role="alert">
          {problems.map((p) => (
            <p key={p} className={css.error}>
              {p}
            </p>
          ))}
        </div>
      )}
    </>
  );
}

/** Out of the group at once, with an undo. */
export function LeaveGroupButton({ groupId, clientId, name }: { groupId: string; clientId: string; name: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={css.btn}
      disabled={pending}
      aria-label={`Take ${name} out of the group`}
      onClick={() =>
        start(async () => {
          await leaveGroupAction(groupId, clientId);
          toast({ message: `${name} is out of the group`, undo: () => rejoinGroupAction(groupId, clientId) });
        })
      }
    >
      Take out
    </button>
  );
}

/** The group gone, once asked twice: its people stay clients. */
export function DeleteGroupButton({ groupId, name }: { groupId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (!asking)
    return (
      <button type="button" className={css.btn} onClick={() => setAsking(true)}>
        Delete the group
      </button>
    );
  return (
    <span className={css.actions} style={{ margin: 0 }}>
      <span>Delete {name}? Its people stay your clients, with their journals and books.</span>
      <button type="button" className={css.btn} disabled={pending} onClick={() => start(() => deleteGroupAction(groupId))}>
        {pending ? "Deleting…" : "Yes, delete it"}
      </button>
      <button type="button" className={css.btn} onClick={() => setAsking(false)}>
        Keep it
      </button>
    </span>
  );
}

/**
 * Every book of the group, one payment: the start, binding and paper, then
 * the prices - who has a book and who not, and why - then the post. Paying
 * makes each book's print files one at a time, saying whose, then opens
 * Stripe's page for all of them.
 */
export function GroupOrder({
  groupId,
  startISO,
  bindings,
  length,
  preview,
}: {
  groupId: string;
  startISO: string;
  bindings: Binding[];
  length: string;
  /** Prices already found: only /dev/payouts, to photograph a state that
   *  needs a signed-in coach and the printer's prices. */
  preview?: GroupQuote;
}) {
  const [start, setStart] = useState(startISO);
  const [binding, setBinding] = useState<Binding | null>(preview?.binding ?? bindings[0] ?? null);
  const [paper, setPaper] = useState<PaperColour>("cream");
  const [quote, setQuote] = useState<GroupQuote | null>(preview ?? null);
  const [level, setLevel] = useState<string | null>(preview?.options[0]?.level ?? null);
  const [error, setError] = useState<string | null>(null);
  const [making, setMaking] = useState<{ done: number; of: number; name: string } | null>(null);
  const [pending, begin] = useTransition();
  const asked = useRef(0);
  const reset = () => {
    asked.current++;
    setQuote(null);
    setLevel(null);
  };
  const chosen: GroupOption | null = quote?.options.find((o) => o.level === level) ?? null;
  const ready = quote?.members.filter((m) => m.ok) ?? [];
  const left = quote?.members.filter((m) => !m.ok) ?? [];

  const price = () =>
    binding &&
    begin(async () => {
      const ask = ++asked.current;
      setError(null);
      const result = await quoteGroup(groupId, { startISO: start, binding, paper });
      if (ask !== asked.current) return;
      if (!result.ok) return setError(result.error);
      setQuote(result.value);
      setLevel(result.value.options[0]?.level ?? null);
      if (result.value.members.every((m) => !m.ok)) setError("Nobody in the group can have a book for these days yet: see why beside each name.");
      else if (result.value.options.length === 0) setError("No one way of posting reaches all of them. Take out whoever's far away, and order theirs on its own.");
    });

  const pay = () =>
    chosen &&
    quote &&
    binding &&
    begin(async () => {
      setError(null);
      const batch = await startGroupOrder(groupId);
      if (!batch.ok) return setError(batch.error);
      for (let i = 0; i < ready.length; i++) {
        const m = ready[i];
        setMaking({ done: i, of: ready.length, name: m.name });
        const made = await prepareBook(batch.value.batchId, m.clientId, {
          startISO: quote.range.startISO,
          days: quote.range.days,
          binding,
          paper: quote.paper,
          level: chosen.level,
          expectCents: chosen.perBook[m.clientId],
        });
        if (!made.ok) {
          setMaking(null);
          setError(made.error);
          if (made.again) reset();
          return;
        }
      }
      setMaking(null);
      const page = await payForGroup(batch.value.batchId, chosen.totalCents);
      if (!page.ok) {
        setError(page.error);
        if (page.again) reset();
        return;
      }
      window.location.href = page.value.url;
    });

  const papers = binding ? paperChoices(binding) : [];
  return (
    <div className={css.form}>
      <div className={css.fields}>
        <label className={css.field}>
          <span>The books start</span>
          <input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              reset();
            }}
            disabled={pending}
          />
          <small>Each runs {length}.</small>
        </label>
      </div>
      <fieldset className={css.choices}>
        <legend className={css.choicesLegend}>Binding, for all of them</legend>
        {bindings.map((b) => (
          <label key={b} className={css.choice}>
            <input
              type="radio"
              name="groupBinding"
              value={b}
              checked={binding === b}
              disabled={pending}
              onChange={() => {
                setBinding(b);
                reset();
              }}
            />
            <span>
              <strong>{BINDING_SPECS[b].label}</strong>
              <small>{BINDING_SPECS[b].note}</small>
            </span>
          </label>
        ))}
      </fieldset>
      {papers.length > 1 && (
        <fieldset className={css.choices}>
          <legend className={css.choicesLegend}>Paper</legend>
          {papers.map((p) => (
            <label key={p} className={css.choice}>
              <input
                type="radio"
                name="groupPaper"
                value={p}
                checked={paper === p}
                disabled={pending}
                onChange={() => {
                  setPaper(p);
                  reset();
                }}
              />
              <span>
                <strong>{PAPER_LABELS[p]}</strong>
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {!quote ? (
        <div className={css.actions}>
          <button type="button" className={`${css.btn} ${css.primary}`} disabled={!binding || !start || pending} onClick={price}>
            {pending ? "Finding prices…" : "See prices"}
          </button>
        </div>
      ) : (
        <>
          <p>
            <strong>{quote.range.label}</strong>, {quote.range.days} days. {ready.length > 0 && `${books(ready.length)}`}
            {left.length > 0 && `, ${left.length} left out`}.
          </p>
          <div className={css.steps} data-group-quote="">
            {quote.members.map((m) => (
              <div key={m.clientId} className={css.step} style={{ gridTemplateColumns: "minmax(0, 1fr) auto", opacity: m.ok ? 1 : 0.6 }}>
                <span>
                  <strong>{m.name}</strong>
                  <br />
                  <span className={css.dim}>{m.ok ? `${m.place} · ${m.pageCount} pages` : m.why}</span>
                </span>
                <span className={css.dim}>{m.ok && chosen ? formatCents(chosen.perBook[m.clientId]) : m.ok ? "" : "Left out"}</span>
              </div>
            ))}
          </div>
          {quote.options.length > 0 && (
            <fieldset className={css.choices}>
              <legend className={css.choicesLegend}>Post, for all of them</legend>
              {quote.options.map((o) => (
                <label key={o.level} className={css.choice}>
                  <input type="radio" name="groupLevel" value={o.level} checked={level === o.level} disabled={pending} onChange={() => setLevel(o.level)} />
                  <span>
                    <strong>
                      {o.label}: {formatCents(o.totalCents)}
                    </strong>
                    <small>
                      {formatCents(o.shippingCents)} of it post, each book posted on its own{o.arrives ? `. ${arrivesLabel(o.arrives)}` : ""}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {making ? (
            <p role="status">
              Making {making.name}&rsquo;s book ({making.done + 1} of {making.of})… Each takes a few seconds; keep this page open.
            </p>
          ) : (
            <div className={css.actions}>
              <button type="button" className={`${css.btn} ${css.primary}`} disabled={!chosen || ready.length === 0 || pending} onClick={pay}>
                {pending ? "Opening the payment page…" : chosen ? `Pay ${formatCents(chosen.totalCents)} for ${books(ready.length)}` : "Choose the post"}
              </button>
              <button type="button" className={css.btn} disabled={pending} onClick={reset}>
                Change
              </button>
            </div>
          )}
          <p className={css.dim}>
            One payment, on Stripe&rsquo;s page. Each book is then its own order under Orders: followed, and cancelled or refunded, on its own. {quote.note}
          </p>
        </>
      )}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

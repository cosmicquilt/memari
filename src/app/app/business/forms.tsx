"use client";

// The business screens' forms: starting the business, its settings, a
// client, choosing a template - and the buttons that change something at
// once with an undo.

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { addTemplate, buildJournalFor, emailLinkTo, makeLinkFor, openPayouts, removeTemplate, resetPayouts, saveBookPayer, saveBusinessSettings, saveClient, setClientArchived, startBusiness, startPayouts, turnOffLinkFor, updateTemplateClients, type FormState } from "./actions";
import { coachReceives } from "@/lib/print/clientPays";
import { useToast } from "./Toast";
import css from "./business.module.css";

function Status({ state }: { state: FormState }) {
  if (state?.error) return <p className={css.error} role="alert">{state.error}</p>;
  if (state?.saved) return <p className={css.saved} role="status">Saved</p>;
  return null;
}

export function StartBusinessForm() {
  const [state, action, pending] = useActionState(startBusiness, null);
  return (
    <form action={action} className={css.form}>
      <label className={css.field}>
        <span>Your business&rsquo;s name</span>
        <input type="text" name="name" required maxLength={80} placeholder="Northwind Coaching" autoComplete="organization" />
        <small>You can change it, and add your logo, in Settings.</small>
      </label>
      <Status state={state} />
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          Start
        </button>
      </div>
    </form>
  );
}

export function SettingsForm({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const [state, action, pending] = useActionState(saveBusinessSettings, null);
  return (
    <form action={action} className={css.form}>
      <div className={css.fields}>
        <label className={css.field}>
          <span>Name</span>
          <input type="text" name="name" required maxLength={80} defaultValue={name} autoComplete="organization" />
        </label>
        <label className={css.field}>
          <span>Logo</span>
          <input type="url" name="logoUrl" defaultValue={logoUrl ?? ""} placeholder="https://…/logo.png" />
          <small>The address of your logo picture, a square one if you have it.</small>
        </label>
      </div>
      <Status state={state} />
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          Save
        </button>
      </div>
    </form>
  );
}

/** Who pays for clients' books, and at what price (2026-10-22). The coach
 *  pays (the default), or clients pay from their own page: at Memari's
 *  price, or with the coach's share on top, paid out through Stripe Connect
 *  once their payouts are set up. */
export function BookPayerForm({
  clientsPay,
  markupCents,
  payouts,
  paymentsOn,
  guest = false,
  countries = [],
}: {
  clientsPay: boolean;
  markupCents: number;
  /** none: no Stripe account; pending: made, Stripe wants more; ready. */
  payouts: "none" | "pending" | "ready";
  /** Payments switched on on this site (Stripe and the printer). */
  paymentsOn: boolean;
  /** Trying it as a guest: payouts need an account (actions.ts startPayouts). */
  guest?: boolean;
  /** Where a coach can be paid (clientPays.ts PAYOUT_COUNTRIES), named. */
  countries?: Array<{ code: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(saveBookPayer, null);
  const [who, setWho] = useState(clientsPay ? "client" : "coach");
  const [price, setPrice] = useState(markupCents > 0 ? "share" : "memari");
  const [share, setShare] = useState(markupCents > 0 ? (markupCents / 100).toFixed(2).replace(/\.00$/, "") : "10");
  const [payoutError, setPayoutError] = useState<string | null>(null);
  // no country until the coach chooses one: a US account made by default
  // for a coach in Germany could not be paid there (third review)
  const [country, setCountry] = useState("");
  const [going, go] = useTransition();
  const shareCents = Math.round(Number(share.replace(/[$,\s]/g, "")) * 100);
  const receives = Number.isFinite(shareCents) && shareCents > 0 ? `$${(coachReceives(shareCents) / 100).toFixed(2)}` : null;
  const viaStripe = (step: () => Promise<{ error: string }>) =>
    go(async () => {
      const result = await step();
      setPayoutError(result?.error ?? null);
    });
  return (
    <div className={css.card}>
      <h2>Who pays for books</h2>
      <form action={action} className={css.form}>
        <fieldset className={css.choices}>
          <legend className="sr-only">Who pays</legend>
          <label className={css.choice}>
            <input type="radio" name="who" value="coach" checked={who === "coach"} onChange={() => setWho("coach")} />
            <span>
              <strong>You</strong>
              <small>You order and pay for each client&rsquo;s book, from their page here.</small>
            </span>
          </label>
          <label className={css.choice}>
            <input type="radio" name="who" value="client" checked={who === "client"} onChange={() => setWho("client")} />
            <span>
              <strong>Your clients</strong>
              <small>They order each book themselves from their own page, and it is sent to them. You can still order one for them.</small>
            </span>
          </label>
        </fieldset>
        {who === "client" && (
          <fieldset className={css.choices}>
            <legend className={css.choicesLegend}>What they pay</legend>
            <label className={css.choice}>
              <input type="radio" name="price" value="memari" checked={price === "memari"} onChange={() => setPrice("memari")} />
              <span>
                <strong>Memari&rsquo;s price</strong>
                <small>What you would pay. Nothing to set up.</small>
              </span>
            </label>
            <label className={css.choice}>
              <input type="radio" name="price" value="share" checked={price === "share"} onChange={() => setPrice("share")} />
              <span>
                <strong>Memari&rsquo;s price, plus your share</strong>
                <small>Paid to you through Stripe, to your bank.</small>
              </span>
            </label>
            {price === "share" && (
              <label className={css.field} style={{ maxWidth: 260, marginLeft: 30 }}>
                <span>Your share, each book ($)</span>
                <input type="text" name="share" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} aria-describedby="share-note" />
                <small id="share-note">{receives && shareCents >= 300 ? `You receive ${receives} of it: the card fee on it and $1 towards Stripe's cost of paying you are kept back.` : "From $3 to $200."}</small>
              </label>
            )}
          </fieldset>
        )}
        <Status state={state} />
        <div className={css.actions}>
          <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
            Save
          </button>
        </div>
      </form>
      {who === "client" && price === "share" && (
        <div className={css.payouts}>
          {payouts === "ready" ? (
            <>
              <p>
                <span className={`${css.tag} ${css.tagOk}`}>Payouts ready</span> Your share is added to what your clients pay.
              </p>
              <button type="button" className={css.btn} disabled={going} onClick={() => viaStripe(openPayouts)}>
                Open your Stripe
              </button>
            </>
          ) : (
            <>
              <p>
                {payouts === "pending" ? "Stripe needs a few more details before it can pay you." : "To be paid your share, connect a Stripe account: Stripe asks for your details and your bank."}{" "}
                Until then, clients pay Memari&rsquo;s price.
              </p>
              {guest && <p className={css.dim}>Sign in to set up payouts: they belong to your account.</p>}
              {payouts === "none" && (
                <label className={css.field} style={{ maxWidth: 320 }}>
                  <span>Where you are paid</span>
                  <select value={country} onChange={(e) => setCountry(e.target.value)} aria-describedby="payout-countries">
                    <option value="" disabled>
                      Choose your country
                    </option>
                    {countries.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <small id="payout-countries">The US, the UK, Europe, Canada and Switzerland for now. Elsewhere, your clients can still pay Memari&rsquo;s price.</small>
                </label>
              )}
              <button type="button" className={`${css.btn} ${css.primary}`} disabled={going || !paymentsOn || guest || (payouts === "none" && !country)} onClick={() => viaStripe(() => startPayouts(country))}>
                {going ? "Opening Stripe…" : payouts === "pending" ? "Finish setting up payouts" : "Set up payouts"}
              </button>
              {payouts === "pending" && (
                <button type="button" className={css.btn} disabled={going} onClick={() => viaStripe(resetPayouts)}>
                  Start again in another country
                </button>
              )}
            </>
          )}
          {payoutError && (
            <p className={css.error} role="alert">
              {payoutError}
            </p>
          )}
        </div>
      )}
      {who === "client" && !paymentsOn && <p className={css.dim}>Payments are not switched on on this site yet, so clients will see that ordering is not open.</p>}
    </div>
  );
}

export type ClientValues = {
  id?: string;
  name?: string;
  coverName?: string | null;
  email?: string | null;
  startDate?: string | null;
  bookMonths?: number;
  templateId?: string | null;
  note?: string | null;
  address?: Partial<Record<"name" | "street1" | "street2" | "city" | "stateCode" | "postcode" | "countryCode" | "phoneNumber", string>>;
};

export function ClientForm({
  client,
  templates,
  countries,
  months,
}: {
  client: ClientValues;
  templates: Array<{ id: string; title: string }>;
  countries: Array<{ code: string; name: string }>;
  months: readonly number[];
}) {
  const [state, action, pending] = useActionState(saveClient, null);
  const a = client.address ?? {};
  return (
    <form action={action} className={css.form}>
      {client.id && <input type="hidden" name="id" value={client.id} />}
      <div className={css.card}>
        <h2>Client</h2>
        <div className={css.fields}>
          <label className={css.field}>
            <span>Name</span>
            <input type="text" name="name" required maxLength={120} defaultValue={client.name ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>Name on the cover</span>
            <input type="text" name="coverName" maxLength={120} defaultValue={client.coverName ?? ""} />
            <small>If it is not the name above.</small>
          </label>
          <label className={css.field}>
            <span>Email</span>
            <input type="email" name="email" maxLength={200} defaultValue={client.email ?? ""} autoComplete="off" />
          </label>
        </div>
      </div>
      <div className={css.card}>
        <h2>Their book</h2>
        <div className={css.fields}>
          <label className={css.field}>
            <span>Template</span>
            <select name="templateId" defaultValue={client.templateId ?? ""}>
              <option value="">{templates.length ? "Choose later" : "No templates yet"}</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            <span>First book starts</span>
            <input type="date" name="startDate" defaultValue={client.startDate ?? ""} />
          </label>
          <label className={css.field}>
            <span>Each book runs</span>
            <select name="bookMonths" defaultValue={String(client.bookMonths ?? 3)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m === 1 ? "1 month" : m === 12 ? "A year" : `${m} months`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className={css.card}>
        <h2>Where their books go</h2>
        <div className={css.fields}>
          <label className={css.field}>
            <span>Name on the parcel</span>
            <input type="text" name="addressName" maxLength={120} defaultValue={a.name ?? ""} autoComplete="off" />
            <small>Their name, if left empty.</small>
          </label>
          <label className={`${css.field} ${css.wide}`}>
            <span>Address</span>
            <input type="text" name="street1" maxLength={200} defaultValue={a.street1 ?? ""} autoComplete="off" />
          </label>
          <label className={`${css.field} ${css.wide}`}>
            <span>Address, second line</span>
            <input type="text" name="street2" maxLength={200} defaultValue={a.street2 ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>City</span>
            <input type="text" name="city" maxLength={120} defaultValue={a.city ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>State or region</span>
            <input type="text" name="stateCode" maxLength={40} defaultValue={a.stateCode ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>Postcode</span>
            <input type="text" name="postcode" maxLength={20} defaultValue={a.postcode ?? ""} autoComplete="off" />
          </label>
          <label className={css.field}>
            <span>Country</span>
            <select name="countryCode" defaultValue={a.countryCode ?? "US"}>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className={css.field}>
            <span>Phone</span>
            <input type="tel" name="phoneNumber" maxLength={40} defaultValue={a.phoneNumber ?? ""} autoComplete="off" />
            <small>The courier asks for one.</small>
          </label>
        </div>
      </div>
      <div className={css.card}>
        <label className={css.field}>
          <span>Your note</span>
          <textarea name="note" maxLength={2000} defaultValue={client.note ?? ""} />
          <small>Only you see it; it is never printed.</small>
        </label>
      </div>
      <Status state={state} />
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          {client.id ? "Save" : "Add client"}
        </button>
        <Link href="/app/business/clients" className={css.btn}>
          Cancel
        </Link>
        {client.id && <ArchiveClientButton id={client.id} name={client.name ?? "this client"} />}
      </div>
    </form>
  );
}

/** Archive at once, with an undo. Their journal and books are kept. */
export function ArchiveClientButton({ id, name }: { id: string; name: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={css.btn}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setClientArchived(id, true);
          toast({ message: `${name} archived`, undo: () => setClientArchived(id, false) });
        })
      }
    >
      Archive
    </button>
  );
}

export function RestoreClientButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={css.btn} disabled={pending} onClick={() => start(() => setClientArchived(id, false))}>
      Restore
    </button>
  );
}

export function AddTemplateForm({ journals }: { journals: Array<{ id: string; title: string }> }) {
  const [state, action, pending] = useActionState(addTemplate, null);
  if (!journals.length)
    return (
      <p className={css.dim}>
        Every journal of yours is a template already. <Link href="/app">Make a new journal</Link> to use as another.
      </p>
    );
  return (
    <form action={action} className={css.form}>
      <div className={css.fields}>
        <label className={css.field}>
          <span>Use one of your journals</span>
          <select name="plannerId" required defaultValue="">
            <option value="" disabled>
              Choose a journal
            </option>
            {journals.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Status state={state} />
      <div className={css.actions}>
        <button type="submit" className={`${css.btn} ${css.primary}`} disabled={pending}>
          Make it a template
        </button>
      </div>
    </form>
  );
}

/** Stop using a journal as a template, at once, with an undo. */
export function RemoveTemplateButton({ templateId, plannerId, title }: { templateId: string; plannerId: string; title: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={css.btn}
      disabled={pending}
      onClick={() =>
        start(async () => {
          await removeTemplate(templateId);
          toast({
            message: `${title} is no longer a template`,
            undo: async () => {
              const form = new FormData();
              form.set("plannerId", plannerId);
              await addTemplate(null, form);
            },
          });
        })
      }
    >
      Stop using
    </button>
  );
}

/** Build a client's journal from their template. */
export function BuildJournalButton({ clientId, disabled }: { clientId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={`${css.btn} ${css.primary}`}
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const result = await buildJournalFor(clientId);
            setError(result.error ?? null);
          })
        }
      >
        {pending ? "Building…" : "Build their journal"}
      </button>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Update a template's clients' journals that are behind it, after the
 *  impact line has said whose next books it changes. */
export function UpdateClientsButton({ templateId, count }: { templateId: string; count: number }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={`${css.btn} ${css.primary}`}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await updateTemplateClients(templateId);
            setError(result.error ?? null);
            if (result.updated !== undefined) toast({ message: result.updated === 1 ? "1 journal updated" : `${result.updated} journals updated` });
          })
        }
      >
        {pending ? "Updating…" : count === 1 ? "Update their journal" : "Update their journals"}
      </button>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** Their own page: make a private link for a client, show it once to copy,
 *  make a new one (the old stops working), or turn it off. */
/** A client's own page, by a private link: made here and copied, or
 *  emailed to them (2026-10-22). Either way the link is new and any earlier
 *  one stops working, which the card says before it happens. */
export function ClientLink({ clientId, name, email, made, seen }: { clientId: string; name: string; email: string | null; made: string | null; seen: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const make = () =>
    start(async () => {
      const result = await makeLinkFor(clientId);
      setError(result.error ?? null);
      setUrl(result.url ?? null);
      setSentTo(null);
      setCopied(false);
    });
  const send = () =>
    start(async () => {
      const result = await emailLinkTo(clientId);
      setCopied(false);
      if (result.sent) {
        setSentTo(result.to);
        setUrl(null);
        setError(null);
      } else {
        // a press refused (a moment ago, no address) makes no link: the one
        // already shown, if any, stays to copy
        if (result.url) {
          setSentTo(null);
          setUrl(result.url);
        }
        setError(result.error);
      }
    });
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const first = name.split(" ")[0];
  const hasLink = !!(url || made || sentTo);
  return (
    <div className={css.card}>
      <h2>Their page</h2>
      <p className={css.dim}>
        A private link for {first}: their journal, their books, and where their books go, which they can correct. No account, nothing to install. Anyone with the link can open it, so send it only to
        them.
      </p>
      {sentTo ? (
        <p className={css.saved} role="status">
          Sent to {sentTo}. Replies go to you.
        </p>
      ) : url ? (
        <>
          <div className={css.actions}>
            <input type="text" readOnly value={url} aria-label={`${first}'s link`} onFocus={(e) => e.currentTarget.select()} style={{ flex: "1 1 280px" }} />
            <button type="button" className={`${css.btn} ${css.primary}`} onClick={copy}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className={css.dim}>Shown once: it is not kept anywhere but here. Send it to {first} however you usually talk.</p>
        </>
      ) : made ? (
        <p>
          A link was made on {made}
          {seen ? `, and ${first} last opened it on ${seen}.` : `; ${first} has not opened it yet.`}
        </p>
      ) : null}
      <div className={css.actions}>
        {email && (
          <button type="button" className={`${css.btn} ${css.primary}`} disabled={pending} onClick={send}>
            {pending ? "Sending…" : hasLink ? `Email ${first} a new link` : `Email ${first} their link`}
          </button>
        )}
        <button type="button" className={`${css.btn} ${email || hasLink ? "" : css.primary}`} disabled={pending} onClick={make}>
          {hasLink ? "Make a new link to copy" : "Make a link to copy"}
        </button>
        {hasLink && (
          <button
            type="button"
            className={css.btn}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await turnOffLinkFor(clientId);
                setUrl(null);
                setSentTo(null);
              })
            }
          >
            Turn it off
          </button>
        )}
      </div>
      <p className={css.dim}>
        {email ? <>Emails go to {email}. </> : <>Add {first}&rsquo;s email below to send it from here. </>}
        {hasLink && "A new link, emailed or copied, stops the old one working."}
      </p>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

// The business screens' forms: starting the business, its settings, a
// client, choosing a template - and the buttons that change something at
// once with an undo.

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { addTemplate, buildJournalFor, emailLinkTo, makeLinkFor, removeTemplate, saveBusinessSettings, saveClient, setClientArchived, startBusiness, turnOffLinkFor, updateTemplateClients, type FormState } from "./actions";
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

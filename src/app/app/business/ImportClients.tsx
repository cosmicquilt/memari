"use client";

// Clients > Import (2026-10-30): a spreadsheet of clients, read and shown
// before anything is added (clientIntake.ts). The file is read in the
// browser and sent as text; the server reads it again to add them.

import Link from "next/link";
import { useState, useTransition } from "react";
import { importClients, previewImport, type ImportPreview } from "./actions";
import css from "./business.module.css";

export function ImportClients({ templates }: { templates: Array<{ id: string; title: string }> }) {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);
  const [pending, start] = useTransition();

  const choose = (file: File | undefined) => {
    setPreview(null);
    setDone(null);
    setError(null);
    if (!file) return;
    if (file.size > 1_000_000) return setError("That file is too big: up to 1 MB, 500 clients at a time.");
    setFileName(file.name);
    start(async () => {
      const read = await file.text();
      setText(read);
      const result = await previewImport(read);
      if ("error" in result) setError(result.error);
      else setPreview(result);
    });
  };
  const add = () =>
    text &&
    start(async () => {
      const result = await importClients(text, templateId || null);
      if ("error" in result) setError(result.error);
      else {
        setDone(result);
        setPreview(null);
      }
    });

  const adding = preview?.clients.filter((c) => !c.already) ?? [];
  return (
    <div className={css.card}>
      <h2>Import a spreadsheet</h2>
      <p className={css.dim}>
        A CSV file, with the first row naming the columns. &ldquo;Name&rdquo; is the one you need; Email, Street, City, State, Zip, Country, Phone, Start date, Months, Note and
        Template are read too. Export a sheet from Google Sheets, Excel or your booking tool as CSV. A file you downloaded from Clients goes straight back in.
      </p>
      <label className={css.field} style={{ maxWidth: 420 }}>
        <span>Your file</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => choose(e.target.files?.[0])} disabled={pending} />
      </label>
      {pending && !preview && !done && <p className={css.dim}>Reading {fileName || "the file"}…</p>}
      {preview && (
        <>
          <p>
            <strong>
              {adding.length} {adding.length === 1 ? "client" : "clients"} to add
            </strong>
            {preview.clients.length > adding.length && <>, {preview.clients.length - adding.length} already here (skipped)</>}
            {preview.problems.length > 0 && (
              <>
                , {preview.problems.length} {preview.problems.length === 1 ? "row" : "rows"} that can&rsquo;t be added
              </>
            )}
            .
          </p>
          <div className={css.steps}>
            {preview.clients.slice(0, 50).map((c, i) => (
              <div key={i} className={css.step} style={{ gridTemplateColumns: "minmax(0, 1fr) auto", opacity: c.already ? 0.55 : 1 }}>
                <span>
                  <strong>{c.name}</strong>
                  {c.email && <span className={css.dim}> · {c.email}</span>}
                </span>
                <span className={css.dim}>{c.already ? "Already here" : c.address ? (c.template ? `On ${c.template}` : "With address") : "No address yet"}</span>
              </div>
            ))}
          </div>
          {preview.clients.length > 50 && <p className={css.dim}>And {preview.clients.length - 50} more.</p>}
          {preview.problems.length > 0 && (
            <div role="alert">
              {preview.problems.slice(0, 10).map((p) => (
                <p key={p.row} className={css.error}>
                  Row {p.row}: {p.error}
                </p>
              ))}
            </div>
          )}
          {preview.unknownColumns.length > 0 && <p className={css.dim}>Not read: {preview.unknownColumns.join(", ")}.</p>}
          {templates.length > 0 && (
            <label className={css.field} style={{ maxWidth: 360 }}>
              <span>Their template</span>
              <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
                <option value="">None yet</option>
              </select>
              <small>Unless a row names one of your templates in a Template column.</small>
            </label>
          )}
          <div className={css.actions}>
            <button type="button" className={`${css.btn} ${css.primary}`} disabled={pending || adding.length === 0} onClick={add}>
              {pending ? "Adding…" : `Add ${adding.length} ${adding.length === 1 ? "client" : "clients"}`}
            </button>
          </div>
        </>
      )}
      {done && (
        <p role="status">
          <strong>
            Added {done.added} {done.added === 1 ? "client" : "clients"}
          </strong>
          {done.skipped > 0 && <>, skipped {done.skipped} already here</>}. Build each one&rsquo;s journal from their page. <Link href="/app/business/clients">See your clients</Link>
        </p>
      )}
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

// The search box and its answer. A form posting to a server action, so it
// works before the page's script has loaded too; nothing is put in the
// address bar.

import { useActionState } from "react";
import { directionsUrl, printingSearchUrl, type FinderResult } from "@/lib/libraryFinder";
import { searchLibraries } from "./actions";
import site from "@/app/landing/site.module.css";
import styles from "./print.module.css";

const miles = (m: number) => (m < 0.1 ? "under 0.1 mi" : m < 10 ? `${m.toFixed(1)} mi` : `${Math.round(m)} mi`);

export function LibraryFinder() {
  const [result, search, pending] = useActionState<(FinderResult & { query: string }) | null, FormData>(searchLibraries, null);

  return (
    <div className={styles.finder}>
      <form action={search} className={styles.search} role="search">
        <label htmlFor="place" className={styles.searchLabel}>
          ZIP code, or town and state
        </label>
        <div className={styles.searchRow}>
          <input
            id="place"
            name="place"
            type="text"
            inputMode="text"
            autoComplete="postal-code"
            placeholder="e.g. 10001 or Dayton, OH"
            defaultValue={result?.query ?? ""}
            className={styles.input}
            maxLength={80}
            required
          />
          <button type="submit" className={site.button} disabled={pending}>
            {pending ? "Finding…" : "Find libraries"}
          </button>
        </div>
        <p className={styles.hint}>US libraries only, for now. What you type is used for this search and not kept.</p>
      </form>

      <div aria-live="polite">
        {result && !result.ok && <p className={styles.error}>{result.error}</p>}
        {result?.ok && (
          <>
            <p className={styles.near}>
              {result.exact ? (
                <>Nearest to {result.near}</>
              ) : (
                <>
                  Nearest to {result.near}, the closest ZIP code we have to {result.query.trim().slice(0, 5)}
                </>
              )}
            </p>
            <ol className={styles.results}>
              {result.found.map(({ library: l, miles: m }) => (
                <li key={`${l.name}-${l.address}`} className={styles.result}>
                  <div className={styles.resultHead}>
                    <h3>{l.name}</h3>
                    <span className={styles.distance}>{miles(m)}</span>
                  </div>
                  <p className={styles.address}>
                    {l.address}, {l.city}, {l.state} {l.zip}
                  </p>
                  <div className={styles.links}>
                    {l.phone && <a href={`tel:${l.phone.replace(/\D/g, "")}`}>{l.phone}</a>}
                    <a href={directionsUrl(l)} target="_blank" rel="noopener noreferrer">
                      Directions
                    </a>
                    <a href={printingSearchUrl(l)} target="_blank" rel="noopener noreferrer">
                      Their printing page
                    </a>
                  </div>
                </li>
              ))}
            </ol>
            <p className={styles.caveat}>
              We cannot see which libraries print, what they charge or when they are open. Most have printers; check their page or call
              ahead. Memari is not affiliated with any library.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

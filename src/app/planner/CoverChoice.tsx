"use client";

// THE COVER, on the order screen (2026-11-01): the 85 photographed covers
// of /covers, or the drawn one - "Choose what is on the outside." made true.
// The choice belongs to the journal (printActions chooseJournalCover), so
// it is chosen once and every book after prints it; the order screen's "the
// cover" link shows exactly what prints.
//
// The covers are offered only where their scans can be fetched to print
// (COVER_SCANS_URL); a journal that chose one where they can't is told so,
// and can go back to the drawn cover.

import { useState, type ReactNode } from "react";
import { COVERS, COVER_GROUPS, coverById } from "@/app/covers/catalogue";
import { CREAM, cream } from "@/lib/cream";
import { CONTROL_RADIUS } from "./editorStyle";
import { chooseJournalCover } from "./printActions";

const ACCENT = "#4a5cff";
const ERROR_INK = "#ff8a80";
const THUMB = 64;

/** The drawn cover's swatch: cream, a rule under the name. */
function PlainSwatch({ size }: { size: number }) {
  return (
    <span aria-hidden style={{ width: size, height: size, flex: "none", display: "grid", placeItems: "center", background: "#f5ead5", borderRadius: 4 }}>
      <span style={{ width: size * 0.42, height: 1, background: "#231f20", opacity: 0.6 }} />
    </span>
  );
}

export function CoverChoice({ journalId, coverId, offered, onChange }: { journalId: string; coverId: string | null; offered: boolean; onChange?: (coverId: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // what was chosen here, until the screen's own value catches up with it
  const [chosen, setChosen] = useState<{ from: string | null; id: string | null } | null>(null);
  const shown = chosen && chosen.from === coverId ? chosen.id : coverId;
  const current = shown ? coverById(shown) : null;

  const choose = async (id: string | null) => {
    setBusy(id ?? "plain");
    setError(null);
    const result = await chooseJournalCover(journalId, id);
    setBusy(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setChosen({ from: coverId, id: result.value.coverId });
    onChange?.(result.value.coverId);
    setOpen(false);
  };

  const tile = (id: string | null, label: string, picture: ReactNode) => {
    const selected = (shown ?? null) === id;
    return (
      <button
        key={id ?? "plain"}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        title={label}
        disabled={busy !== null}
        onClick={() => void choose(id)}
        data-cover={id ?? "plain"}
        style={{
          padding: 0,
          width: "100%",
          aspectRatio: "1",
          border: `2px solid ${selected ? ACCENT : "transparent"}`,
          borderRadius: 6,
          background: cream(0.04),
          overflow: "hidden",
          cursor: busy ? "wait" : "pointer",
          opacity: busy && busy !== (id ?? "plain") ? 0.5 : 1,
        }}
      >
        {picture}
      </button>
    );
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.image} alt="" width={52} height={52} style={{ flex: "none", objectFit: "cover", borderRadius: 4 }} />
        ) : (
          <PlainSwatch size={52} />
        )}
        <div style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, color: CREAM }} data-cover-name>
            {current ? current.name : "Plain"}
          </div>
          <div style={{ color: cream(0.55) }}>{current ? `${current.mark}, ${current.finishName.toLowerCase()}${current.dated ? ", with its dates" : ""}` : "Cream, your journal's name on the front"}</div>
        </div>
        {(offered || current) && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            style={{ flex: "none", padding: "6px 12px", fontSize: 12, fontFamily: "inherit", color: CREAM, background: cream(0.08), border: "none", borderRadius: CONTROL_RADIUS, cursor: "pointer" }}
          >
            {open ? "Done" : "Change"}
          </button>
        )}
      </div>
      {current && !offered && (
        <span style={{ fontSize: 12, color: ERROR_INK }}>
          Photographed covers can&rsquo;t be printed yet.{" "}
          <button type="button" onClick={() => void choose(null)} style={{ padding: 0, border: "none", background: "none", color: "#8a97ff", font: "inherit", cursor: "pointer", textDecoration: "underline" }}>
            Use the plain cover
          </button>
        </span>
      )}
      {open && (
        <div role="radiogroup" aria-label="Cover" style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB}px, 1fr))`, gap: 6 }}>
            {tile(null, "Plain: cream, your journal's name on the front", <PlainSwatch size={THUMB} />)}
          </div>
          {offered &&
            COVER_GROUPS.map((group) => (
              <div key={group} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 11, color: cream(0.5) }}>{group}</span>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB}px, 1fr))`, gap: 6 }}>
                  {COVERS.filter((c) => c.group === group).map((c) =>
                    // eslint-disable-next-line @next/next/no-img-element
                    tile(c.id, `${c.name}: ${c.mark}, ${c.finishName.toLowerCase()}`, <img src={c.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />)
                  )}
                </div>
              </div>
            ))}
          {offered && (
            <a href="/covers" target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "#8a97ff" }}>
              See them all large
            </a>
          )}
        </div>
      )}
      {error && <span style={{ fontSize: 12, color: ERROR_INK }}>{error}</span>}
    </>
  );
}

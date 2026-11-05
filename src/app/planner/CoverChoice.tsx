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
//
// MAKE IT YOURS (2026-11-05): under a photographed cover, what is on its
// front - the mark (or none), imprint or gold, the dates, a name - the same
// choices as the covers page, drawn on the same flat front, kept on the
// journal (printActions chooseJournalCoverFront) so every book after prints
// them. A journal that has chosen none prints its cover as pictured.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { COVERS, COVER_GROUPS, coverById, coverNumber, type Cover } from "@/app/covers/catalogue";
import { CoverFront as FlatFront } from "@/app/covers/CoverFront";
import { FRONT_MARKS, MARK_WORDS, NAME_MAX, picturedFront, type CoverFront } from "@/lib/print/coverFront";
import { CREAM, cream } from "@/lib/cream";
import { CONTROL_RADIUS } from "./editorStyle";
import { chooseJournalCover, chooseJournalCoverFront } from "./printActions";

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

export function CoverChoice({
  journalId,
  coverId,
  offered,
  onChange,
  front = null,
  dated = true,
  datesWords = "",
  onFrontChange,
}: {
  journalId: string;
  coverId: string | null;
  offered: boolean;
  onChange?: (coverId: string | null) => void;
  /** the journal's own front, or null: as the cover is pictured */
  front?: CoverFront | null;
  /** an undated journal prints no dates */
  dated?: boolean;
  /** this book's dates as its cover prints them */
  datesWords?: string;
  onFrontChange?: (front: CoverFront) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // what was chosen here, until the screen's own value catches up with it
  const [chosen, setChosen] = useState<{ from: string | null; id: string | null } | null>(null);
  const shown = chosen && chosen.from === coverId ? chosen.id : coverId;
  const current = shown ? coverById(shown) : null;
  // the front as it stands: the journal's own, or as the cover is pictured
  const [frontNow, setFrontNow] = useState<CoverFront | null>(front);
  const frontShown = current ? (frontNow ?? picturedFront(current)) : null;

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
            {current ? <CoverName cover={current} /> : "Plain"}
          </div>
          <div style={{ color: cream(0.55) }} data-cover-summary>{frontShown ? frontWords(frontShown, dated) : "Cream, your journal's name on the front"}</div>
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
                    tile(c.id, `${c.material} ${coverNumber(c)}`, <img src={c.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />)
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
      {current && offered && (
        <FrontChoice
          journalId={journalId}
          cover={current}
          front={front}
          dated={dated}
          datesWords={datesWords}
          onFrontChange={(next) => {
            setFrontNow(next);
            onFrontChange?.(next);
          }}
        />
      )}
      {error && <span style={{ fontSize: 12, color: ERROR_INK }}>{error}</span>}
    </>
  );
}

const MARK_LONG: Record<CoverFront["mark"], string> = {
  "m-centre": "m. in the centre",
  "m-corner": "m. in the corner",
  "wordmark-serif": '"memari." in serif',
  "wordmark-sans": '"memari." in sans',
  none: "No mark",
};

/** The front in words, under the cover's name: "m. in the centre, gold,
 *  with its dates, with Sam Rivera". */
function frontWords(front: CoverFront, dated: boolean): string {
  const parts = [MARK_LONG[front.mark]];
  if (front.mark !== "none" || front.name || (front.dates && dated)) parts.push(front.finish === "gold" ? "gold" : "imprint");
  if (front.dates && dated) parts.push("with its dates");
  if (front.name) parts.push(`with ${front.name}`);
  return parts.join(", ");
}

/** "Onyx 009": the material, then its number in three digits, smaller and
 *  quieter - as the covers page names a cover (2026-11-05). */
function CoverName({ cover }: { cover: Cover }) {
  return (
    <>
      {cover.material}{" "}
      <span style={{ fontSize: "0.85em", fontWeight: 500, opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{coverNumber(cover)}</span>
    </>
  );
}

/** One row of the front's choices: its label, then its choices. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px" }}>
      <span style={{ flex: "0 0 44px", fontSize: 11, color: cream(0.55) }}>{label}</span>
      <div role="group" aria-label={label} style={{ display: "flex", flexWrap: "wrap", gap: 3, padding: 2, borderRadius: 12, background: cream(0.06) }}>
        {children}
      </div>
    </div>
  );
}

function Pick({ on, disabled, onPick, children }: { on: boolean; disabled?: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onPick}
      style={{
        padding: "4px 9px",
        fontSize: 11,
        fontFamily: "inherit",
        fontWeight: 600,
        border: "none",
        borderRadius: 999,
        background: on ? CREAM : "transparent",
        color: on ? "#1c1917" : CREAM,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** What is on the chosen cover's front: the covers page's choices, saved
 *  to the journal as they change (a typed name a moment after the typing). */
function FrontChoice({
  journalId,
  cover,
  front,
  dated,
  datesWords,
  onFrontChange,
}: {
  journalId: string;
  cover: NonNullable<ReturnType<typeof coverById>>;
  front: CoverFront | null;
  dated: boolean;
  datesWords: string;
  onFrontChange?: (front: CoverFront) => void;
}) {
  // the journal's own, once it has chosen; until then the cover as pictured
  const [own, setOwn] = useState<CoverFront | null>(front);
  const [name, setName] = useState(front?.name ?? "");
  const [naming, setNaming] = useState(!!front?.name);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown: CoverFront = own ?? picturedFront(cover);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = async (next: CoverFront) => {
    setOwn(next);
    setSaving(true);
    setProblem(null);
    const result = await chooseJournalCoverFront(journalId, next);
    setSaving(false);
    if (!result.ok) {
      setProblem(result.error);
      return;
    }
    onFrontChange?.(result.value.front);
  };
  const change = (patch: Partial<CoverFront>) => void save({ ...shown, ...patch });
  // a name is saved once the typing pauses
  useEffect(() => {
    if (!naming) return;
    if (timer.current) clearTimeout(timer.current);
    if (name.trim() === shown.name) return;
    timer.current = setTimeout(() => void save({ ...shown, name }), 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // shown is rebuilt each render; the name's own changes drive this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, naming]);

  return (
    <div data-cover-front="" style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: 10, borderRadius: 10, background: cream(0.04) }}>
      <div style={{ flex: "0 0 74px" }}>
        <FlatFront cover={cover} options={{ mark: shown.mark, finish: shown.finish, dates: shown.dates && dated, name: !!shown.name }} datesWords={datesWords} name={shown.name} label="The front as it prints" />
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: cream(0.7) }}>Make it yours</span>
        <Row label="Mark">
          {FRONT_MARKS.map((m) => (
            <Pick key={m} on={shown.mark === m} onPick={() => change({ mark: m })}>
              {MARK_WORDS[m]}
            </Pick>
          ))}
        </Row>
        <Row label="Finish">
          <Pick on={shown.finish === "imprint"} onPick={() => change({ finish: "imprint" })}>
            Imprint
          </Pick>
          <Pick on={shown.finish === "gold"} onPick={() => change({ finish: "gold" })}>
            Gold
          </Pick>
        </Row>
        <Row label="Dates">
          <Pick on={shown.dates && dated} disabled={!dated} onPick={() => change({ dates: true })}>
            On
          </Pick>
          <Pick on={!shown.dates || !dated} disabled={!dated} onPick={() => change({ dates: false })}>
            Off
          </Pick>
        </Row>
        {!dated && <span style={{ fontSize: 11, color: cream(0.5) }}>Your journal is undated, so no dates print.</span>}
        <Row label="Name">
          <Pick on={naming} onPick={() => setNaming(true)}>
            On
          </Pick>
          <Pick
            on={!naming}
            onPick={() => {
              setNaming(false);
              if (shown.name) change({ name: "" });
            }}
          >
            Off
          </Pick>
        </Row>
        {naming && (
          <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, color: cream(0.55) }}>
            Name on the cover
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              placeholder="Your name"
              onChange={(e) => setName(e.target.value)}
              style={{ fontFamily: "inherit", fontSize: 13, color: "#1c1917", background: CREAM, border: "none", borderRadius: 6, padding: "6px 8px" }}
            />
          </label>
        )}
        <span style={{ fontSize: 11, color: problem ? ERROR_INK : cream(0.45) }} aria-live="polite">
          {problem ?? (saving ? "Saving..." : own ? "Kept on your journal: every book after prints it too." : "As the cover is pictured.")}
        </span>
      </div>
    </div>
  );
}

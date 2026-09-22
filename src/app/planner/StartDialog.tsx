"use client";

// The start dialog: what memari.studio/app opens on. Asked for 2026-09-21 -
// a Photoshop-style New Document dialog tailored to journals: SAVED (open one
// of yours) and CREATE (make a new one), in the editor's own chrome. It shows
// at /app and nowhere else; a journal's own link, /app/j/<id>, goes straight
// into it ("make it popup if you go to /app but not to a planner link").
//
// Returning is one step: the journal this browser last had open is already
// selected, so Enter or a double click opens it. First time, with nothing
// saved, it opens on Create.
//
// A guest (see guest.ts) sees what that means - journals kept in this
// browser, deleted after a while unopened - and how to keep them: sign in.
//
// Saved holds three kinds of thing (Andrew, 2026-09-21): Journals, Pages -
// a saved page or a saved spread - and Modules. Only a journal OPENS from
// here; a saved page or module has nowhere to go until a journal is open, so
// here they are looked at, renamed and deleted, and used from the editor.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PageLevel } from "@/lib/pageLevels";
import { LEVELS_IN_BINDING_ORDER, LEVEL_LABELS, LEVEL_PAGE_COUNT, bookPageCount } from "@/lib/pageLevels";
import type { PlannerTrimKey } from "@/lib/planner-trims";
import type { JournalCard, ThumbnailPage } from "./journals";
import {
  createJournal,
  deleteJournal,
  deleteSavedModule,
  deleteSavedPage,
  renameJournal,
  renameSavedModule,
  renameSavedPage,
} from "./actions";
import { PagePreview } from "./PagePreview";
import { SavedThumb } from "./SavedThumb";
import type { SavedModuleCard, SavedPageCard } from "./savedItems";
import { PLANNER_TRIMS } from "@/lib/planner-trims";
import { usePrefersReducedMotion } from "./useMediaQuery";

// The editor's chrome - see the design-language memory. Solid surfaces, one
// accent spent on the primary action and on selection, labels small and
// uppercase with tracking.
const HEADER = "#1a1a1a";
const PANEL = "#1c1c1e";
const CONTROL = "#2a2a2a";
const LINE = "rgba(255, 255, 255, 0.1)";
const DIM = "rgba(255, 255, 255, 0.6)";
const ACCENT = "#4a5cff";
/** The segmented group's inner padding. Named because the sliding pill has
 *  to start inside it, and a literal 3 in two places is two descriptions of
 *  one measurement. */
const SEGMENT_PADDING = 3;

/**
 * Behind the dialog: near-black, with a hint of granite.
 *
 * It was #111113 - a flat fill with a little BLUE in it, which is the
 * default-feeling neutral this project's design language warns about. Asked
 * for 2026-09-22: "black and white maybe a very little hint of brown
 * granite".
 *
 * So the ground is a true neutral near-black and the speckle is the only
 * colour in it, warm rather than blue. Three layers of fine dots on
 * co-prime tile sizes (37/41, 53/61, 71/67 px): co-prime so the three
 * patterns do not come back into step and print a visible grid, which is
 * what a single tiled layer does. Alphas are 0.05 and under - at full
 * strength this reads as dirt on the screen rather than stone.
 *
 * Pure CSS rather than an image: it covers the whole window at any size,
 * costs no request, and cannot be the thing that has not loaded yet behind a
 * dialog that is the first thing anyone sees.
 */
const BACKDROP_BASE = "#0c0c0c";
const BACKDROP_GRANITE = [
  "radial-gradient(circle at 30% 40%, rgba(150, 126, 104, 0.05) 0 0.9px, transparent 1.6px)",
  "radial-gradient(circle at 70% 20%, rgba(168, 148, 128, 0.035) 0 0.8px, transparent 1.5px)",
  "radial-gradient(circle at 45% 75%, rgba(120, 104, 90, 0.045) 0 1.1px, transparent 1.9px)",
].join(", ");
const BACKDROP_GRANITE_SIZE = "37px 41px, 53px 61px, 71px 67px";
const DANGER = "#d92d20";
const ERROR_TEXT = "#ff8f5c";

type Preset = { id: string; name: string; note: string; levels: PageLevel[]; cover: PageLevel };

/** Blank journals: which levels a new book starts with. Cadence is also the
 *  price - a daily level is 90 of a quarter's 126 pages - so it is the first
 *  choice rather than a setting buried later. */
const PRESETS: Preset[] = [
  { id: "month-week", name: "Monthly + Weekly", note: "A month spread, then a spread every week", levels: ["FRONT_MATTER", "MONTHLY", "WEEKLY", "BACK_MATTER"], cover: "MONTHLY" },
  { id: "weekly", name: "Weekly", note: "A spread every week", levels: ["FRONT_MATTER", "WEEKLY", "BACK_MATTER"], cover: "WEEKLY" },
  { id: "monthly", name: "Monthly", note: "A spread every month", levels: ["FRONT_MATTER", "MONTHLY", "BACK_MATTER"], cover: "MONTHLY" },
  { id: "daily", name: "Daily", note: "A page every day", levels: ["FRONT_MATTER", "DAILY", "BACK_MATTER"], cover: "DAILY" },
  { id: "everything", name: "Everything", note: "Months, weeks and days", levels: ["FRONT_MATTER", "MONTHLY", "WEEKLY", "DAILY", "BACK_MATTER"], cover: "WEEKLY" },
];

const utc = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00.000Z`) : null);

function termLabel(start: string | null, end: string | null): string {
  const a = utc(start);
  const b = utc(end);
  if (!a || !b) return "No term yet";
  const day = (d: Date, year: boolean) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${day(a, a.getUTCFullYear() !== b.getUTCFullYear())} – ${day(b, true)}`;
}

const levelsLabel = (levels: PageLevel[]) => levels.map((l) => LEVEL_LABELS[l]).join(" · ") || "No pages yet";

type SavedSection = "journals" | "pages" | "modules";

export function StartDialog({
  journals: initialJournals,
  savedPages: initialSavedPages,
  savedModules: initialSavedModules,
  lastJournalId,
  templates,
  defaultTerm,
  guest,
}: {
  journals: JournalCard[];
  savedPages: SavedPageCard[];
  savedModules: SavedModuleCard[];
  lastJournalId: string | null;
  templates: Record<PageLevel, ThumbnailPage[]>;
  defaultTerm: { start: string; end: string };
  /** Set for someone using Memari without an account - see guest.ts. */
  guest: { journalLimit: number; idleDays: number } | null;
}) {
  const router = useRouter();
  const [journals, setJournals] = useState(initialJournals);
  const [savedPages, setSavedPages] = useState(initialSavedPages);
  const [savedModules, setSavedModules] = useState(initialSavedModules);
  const [section, setSection] = useState<SavedSection>("journals");
  const [tab, setTab] = useState<"saved" | "create">(initialJournals.length > 0 ? "saved" : "create");
  const [selectedId, setSelectedId] = useState<string | null>(lastJournalId ?? initialJournals[0]?.id ?? null);
  const [backTo, setBackTo] = useState<string | null>(lastJournalId);
  const [leaving, setLeaving] = useState(false);

  const open = useCallback(
    (id: string) => {
      setLeaving(true);
      router.push(`/app/j/${id}`);
    },
    [router]
  );
  const close = useCallback(() => {
    if (backTo) open(backTo);
  }, [backTo, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && backTo) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [backTo, close]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: BACKDROP_BASE,
        backgroundImage: BACKDROP_GRANITE,
        backgroundSize: BACKDROP_GRANITE_SIZE,
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <style>{STYLES}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Open or create a journal"
        className="sd-dialog"
        style={{ background: PANEL, color: "#f2f2f2", border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", cursor: leaving ? "progress" : undefined }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "end", background: HEADER, borderBottom: `1px solid ${LINE}`, padding: "0 16px" }}>
          <strong style={{ alignSelf: "center", padding: "12px 0" }}>
            Memari <span style={{ fontWeight: 200, fontSize: "0.8em", letterSpacing: "0.1em" }}>STUDIO</span>
          </strong>
          <TabStrip tab={tab}>
            {(["saved", "create"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                data-tab={t}
                id={`start-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="start-panel"
                tabIndex={tab === t ? 0 : -1}
                className="sd-tab"
                onClick={() => setTab(t)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    const next = tab === "saved" ? "create" : "saved";
                    setTab(next);
                    document.getElementById(`start-tab-${next}`)?.focus();
                  }
                }}
              >
                {t === "saved" ? "Saved" : "Create"}
              </button>
            ))}
          </TabStrip>
          <div style={{ justifySelf: "end", alignSelf: "center" }}>
            {backTo && (
              <button type="button" className="sd-x" onClick={close} aria-label="Close and go back to your journal" title="Back to your journal">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6.5 6.5L17.5 17.5M17.5 6.5L6.5 17.5" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
        {guest && (
          <p className="sd-guest">
            You&rsquo;re using Memari as a guest. Your journals stay in this browser, and one you haven&rsquo;t opened
            for {guest.idleDays} days is deleted. <Link href="/sign-in?redirect_url=%2Fapp">Sign in</Link> to keep them
            &mdash; they come with you.
          </p>
        )}
        <div id="start-panel" role="tabpanel" aria-labelledby={`start-tab-${tab}`} className="sd-body">
          {tab === "saved" && section === "pages" ? (
            <SavedItems
              // Keyed by kind: the two sections are the same component in the
              // same place, and without a key the one shown second inherited
              // the first's selection - an id it does not have.
              key="page"
              kind="page"
              switcher={<SectionSwitch section={section} onChange={setSection} counts={[journals.length, savedPages.length, savedModules.length]} />}
              items={savedPages.map((page) => ({
                id: page.id,
                name: page.name,
                kindLabel: page.pageCount === 2 ? "Spread" : "Page",
                usedIn: page.usedIn,
                size: trimLabelFor(page.size.widthPx),
                thumb: <SavedThumb previews={page.previews} widthPx={page.size.widthPx} heightPx={page.size.heightPx} height={100} />,
              }))}
              onRename={async (id, name) => {
                const saved = await renameSavedPage(id, name);
                setSavedPages((all) => all.map((p) => (p.id === id ? { ...p, name: saved } : p)));
                return saved;
              }}
              onDelete={async (id) => {
                await deleteSavedPage(id);
                setSavedPages((all) => all.filter((p) => p.id !== id));
              }}
            />
          ) : tab === "saved" && section === "modules" ? (
            <SavedItems
              key="module"
              kind="module"
              switcher={<SectionSwitch section={section} onChange={setSection} counts={[journals.length, savedPages.length, savedModules.length]} />}
              items={savedModules.map((module) => ({
                id: module.id,
                name: module.name,
                kindLabel: module.kind,
                usedIn: module.usedIn,
                size: null,
                thumb: (
                  <span style={{ display: "block", position: "relative", height: "100%", maxWidth: "100%", aspectRatio: `${module.preview.widthPx} / ${module.preview.heightPx}`, background: "#fdfcf9" }}>
                    <PagePreview page={{ previewMarks: module.preview.marks, pageWidthPx: module.preview.widthPx, pageHeightPx: module.preview.heightPx }} />
                  </span>
                ),
              }))}
              onRename={async (id, name) => {
                const saved = await renameSavedModule(id, name);
                setSavedModules((all) => all.map((m) => (m.id === id ? { ...m, name: saved } : m)));
                return saved;
              }}
              onDelete={async (id) => {
                await deleteSavedModule(id);
                setSavedModules((all) => all.filter((m) => m.id !== id));
              }}
            />
          ) : tab === "saved" ? (
            <SavedJournals
              switcher={<SectionSwitch section={section} onChange={setSection} counts={[journals.length, savedPages.length, savedModules.length]} />}
              journals={journals}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onOpen={open}
              onCreate={() => setTab("create")}
              onRenamed={(id, title) => setJournals((all) => all.map((j) => (j.id === id ? { ...j, title } : j)))}
              onDeleted={(id) => {
                const rest = journals.filter((j) => j.id !== id);
                setJournals(rest);
                setSelectedId(rest[0]?.id ?? null);
                if (backTo === id) setBackTo(null);
                if (rest.length === 0) setTab("create");
              }}
              leaving={leaving}
            />
          ) : (
            <CreateJournal
              templates={templates}
              defaultTerm={defaultTerm}
              onCreated={open}
              leaving={leaving}
              guestLimit={guest && journals.length >= guest.journalLimit ? guest.journalLimit : null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Saved -----------------------------------------------------------------

/** Journals, Pages, Modules - which kind of saved thing Saved is showing. */
function SectionSwitch({
  section,
  onChange,
  counts,
}: {
  section: SavedSection;
  onChange: (section: SavedSection) => void;
  counts: [number, number, number];
}) {
  const sections: Array<[SavedSection, string]> = [
    ["journals", "Journals"],
    ["pages", "Pages"],
    ["modules", "Modules"],
  ];
  // NO SLIDING PILL HERE, and the reason is structural rather than a taste
  // call. The three Saved sections are three different components, each
  // rendering its own copy of this switcher, so choosing a section does not
  // re-render the strip - it REPLACES it. Measured: the old node detaches
  // (its rect reads 0) and a new one mounts knowing nothing about where the
  // highlight was. A CSS transition has nothing to travel from, and six
  // attempts at remembering the position across the remount each landed
  // somewhere worse - the last one left the pill under the wrong label.
  //
  // The fix is to stop it remounting: hoist this switcher out of
  // SavedJournals and the two SavedItems so it sits in one place above
  // them. That is a restructure of three components' layouts, and it is
  // the thing to do before trying this again.
  return (
    <div className="sd-seg" role="group" aria-label="Saved">
      {sections.map(([key, label], index) => (
        <button key={key} type="button" aria-pressed={section === key} onClick={() => onChange(key)}>
          {label}
          {/* Its own element with a real gap, rather than a space in the
              text - "more space between those and the number". */}
          <span style={{ opacity: 0.6, marginLeft: 9 }}>{counts[index]}</span>
        </button>
      ))}
    </div>
  );
}

const trimLabelFor = (widthPx: number) =>
  Object.values(PLANNER_TRIMS).find((trim) => trim.widthPx === widthPx)?.label ?? `${widthPx}px wide`;

function SavedJournals({
  switcher,
  journals,
  selectedId,
  onSelect,
  onOpen,
  onCreate,
  onRenamed,
  onDeleted,
  leaving,
}: {
  switcher: ReactNode;
  journals: JournalCard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onRenamed: (id: string, title: string) => void;
  onDeleted: (id: string) => void;
  leaving: boolean;
}) {
  const selected = journals.find((j) => j.id === selectedId) ?? null;
  const firstFocus = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    firstFocus.current?.focus();
  }, []);

  return (
    <>
      <div className="sd-main">
        {switcher}
        {journals.length === 0 ? (
          <p style={{ color: DIM, margin: 0 }}>
            No journals yet.{" "}
            <button type="button" className="sd-link" onClick={onCreate}>
              Create your first one
            </button>
          </p>
        ) : (
          <div className="sd-grid">
            {journals.map((journal) => (
              <button
                key={journal.id}
                ref={journal.id === selectedId ? firstFocus : undefined}
                type="button"
                className="sd-card"
                aria-pressed={journal.id === selectedId}
                onClick={() => onSelect(journal.id)}
                onDoubleClick={() => onOpen(journal.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onOpen(journal.id);
                  }
                }}
                title="Double-click or press Enter to open"
              >
                <Spread pages={journal.cover} />
                <span className="sd-name">{journal.title}</span>
                <span className="sd-meta">{termLabel(journal.term.start, journal.term.end)}</span>
              </button>
            ))}
            <button type="button" className="sd-card sd-new" onClick={onCreate}>
              <span className="sd-thumb" style={{ fontSize: 28, color: DIM }} aria-hidden="true">
                +
              </span>
              <span className="sd-name">New journal</span>
              <span className="sd-meta">Opens Create</span>
            </button>
          </div>
        )}
      </div>
      <aside className="sd-details" aria-live="polite">
        {selected ? (
          <JournalDetails key={selected.id} journal={selected} onOpen={onOpen} onRenamed={onRenamed} onDeleted={onDeleted} leaving={leaving} />
        ) : (
          <p style={{ color: DIM, margin: 0 }}>Select a journal to see it here.</p>
        )}
      </aside>
    </>
  );
}

function JournalDetails({
  journal,
  onOpen,
  onRenamed,
  onDeleted,
  leaving,
}: {
  journal: JournalCard;
  onOpen: (id: string) => void;
  onRenamed: (id: string, title: string) => void;
  onDeleted: (id: string) => void;
  leaving: boolean;
}) {
  const [name, setName] = useState(journal.title);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const commitName = async () => {
    const next = name.trim();
    if (next === journal.title) return;
    if (!next) {
      setName(journal.title);
      return;
    }
    try {
      const saved = await renameJournal(journal.id, next);
      setName(saved);
      onRenamed(journal.id, saved);
      setError(null);
    } catch (e) {
      setName(journal.title);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await deleteJournal(journal.id);
      onDeleted(journal.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="sd-label">Journal</div>
        <input
          className="sd-title-input"
          value={name}
          aria-label="Journal name"
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setName(journal.title);
            }
          }}
        />
      </div>
      <dl className="sd-facts">
        <Fact label="Term">{termLabel(journal.term.start, journal.term.end)}</Fact>
        <Fact label="Pages">{levelsLabel(journal.levels)}</Fact>
        <Fact label="Size">{journal.trim}</Fact>
        <Fact label="Dates">{journal.dated ? "Dated" : "Undated"}</Fact>
        <Fact label="Prints">{journal.pages === null ? "Set a term to count" : `${journal.pages} pages`}</Fact>
      </dl>
      {error && <p style={{ color: ERROR_TEXT, fontSize: 12, margin: 0 }}>{error}</p>}
      <div className="sd-actions">
        <button
          type="button"
          className="sd-btn"
          onClick={() => void remove()}
          onBlur={() => setArmed(false)}
          disabled={busy || leaving}
          style={armed ? { background: DANGER, borderColor: DANGER, color: "#fff" } : undefined}
        >
          {armed ? "Delete journal?" : "Delete"}
        </button>
        <button type="button" className="sd-btn sd-primary" onClick={() => onOpen(journal.id)} disabled={leaving}>
          {leaving ? "Opening…" : "Open"}
        </button>
      </div>
    </>
  );
}

/** A saved page or module, as Saved lists it. */
type SavedItemCard = {
  id: string;
  name: string;
  /** "Page", "Spread", or the module's kind. */
  kindLabel: string;
  usedIn: number;
  /** The page size a saved page keeps; null for a module, which has none. */
  size: string | null;
  thumb: ReactNode;
};

/**
 * Saved > Pages and Saved > Modules. Listed, renamed and deleted here - they
 * are USED from the editor, which is where there is a page to put one on.
 * The empty state says where, since that is the one thing a person arriving
 * here with none cannot guess.
 */
function SavedItems({
  kind,
  switcher,
  items,
  onRename,
  onDelete,
}: {
  kind: "page" | "module";
  switcher: ReactNode;
  items: SavedItemCard[];
  onRename: (id: string, name: string) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  return (
    <>
      <div className="sd-main">
        {switcher}
        {items.length === 0 ? (
          <p style={{ color: DIM, margin: 0, lineHeight: 1.5, maxWidth: 520 }}>
            {kind === "page"
              ? "No saved pages yet. In a journal, hover a page in the timeline, open its menu from the dots on its corner, and choose Save. A spread saves as one."
              : "No saved modules yet. In a journal, open a module to edit it and choose \u201cSave this module\u201d."}
          </p>
        ) : (
          <div className="sd-grid">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="sd-card"
                aria-pressed={item.id === selectedId}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="sd-thumb">{item.thumb}</span>
                <span className="sd-name">{item.name}</span>
                <span className="sd-meta">
                  {item.kindLabel} · {usedInLabel(item.usedIn)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <aside className="sd-details" aria-live="polite">
        {selected ? (
          <SavedItemDetails
            key={selected.id}
            kind={kind}
            item={selected}
            onRename={onRename}
            onDeleted={async (id) => {
              await onDelete(id);
              const rest = items.filter((item) => item.id !== id);
              setSelectedId(rest[0]?.id ?? null);
            }}
          />
        ) : (
          <p style={{ color: DIM, margin: 0 }}>
            {items.length === 0 ? "" : `Select a saved ${kind} to see it here.`}
          </p>
        )}
      </aside>
    </>
  );
}

const usedInLabel = (n: number) => (n === 0 ? "not used" : n === 1 ? "used in 1 journal" : `used in ${n} journals`);

function SavedItemDetails({
  kind,
  item,
  onRename,
  onDeleted,
}: {
  kind: "page" | "module";
  item: SavedItemCard;
  onRename: (id: string, name: string) => Promise<string>;
  onDeleted: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const commitName = async () => {
    const next = name.trim();
    if (next === item.name) return;
    if (!next) {
      setName(item.name);
      return;
    }
    try {
      setName(await onRename(item.id, next));
      setError(null);
    } catch (e) {
      setName(item.name);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    try {
      await onDeleted(item.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
      setArmed(false);
    }
  };

  const what = kind === "page" ? (item.kindLabel === "Spread" ? "spread" : "page") : "module";
  return (
    <>
      <div style={{ display: "grid", gap: 8 }}>
        <div className="sd-label">Saved {what}</div>
        <input
          className="sd-title-input"
          value={name}
          aria-label={`Saved ${what} name`}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") {
              e.stopPropagation();
              setName(item.name);
            }
          }}
        />
      </div>
      <span className="sd-thumb" style={{ height: 160 }}>
        {item.thumb}
      </span>
      <dl className="sd-facts">
        <Fact label="Kind">{item.kindLabel}</Fact>
        {item.size && <Fact label="Size">{item.size}</Fact>}
        <Fact label="Used">{usedInLabel(item.usedIn)}</Fact>
      </dl>
      <p style={{ color: DIM, fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
        Linked: a change to any use of it changes every use.{" "}
        {kind === "page"
          ? `Add it to a journal from the \u201c+\u201d at the end of a row in the timeline${item.size ? `, in a ${item.size} journal` : ""}.`
          : "Place it from Saved at the top of the Modules panel."}
      </p>
      {error && <p style={{ color: ERROR_TEXT, fontSize: 12, margin: 0 }}>{error}</p>}
      <div className="sd-actions">
        <button
          type="button"
          className="sd-btn"
          onClick={() => void remove()}
          onBlur={() => setArmed(false)}
          disabled={busy}
          title={
            kind === "page"
              ? "Journals using it keep the pages as they are, no longer linked"
              : "Modules placed from it keep their settings, no longer linked"
          }
          style={armed ? { background: DANGER, borderColor: DANGER, color: "#fff" } : undefined}
        >
          {armed ? `Delete saved ${what}?` : "Delete"}
        </button>
      </div>
      {armed && (
        <p style={{ color: DIM, fontSize: 12, lineHeight: 1.45, margin: 0 }}>
          {kind === "page"
            ? "Journals using it keep those pages exactly as they are - they just stop being linked."
            : "Modules placed from it keep their settings - they just stop being linked."}
        </p>
      )}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

// --- Create ----------------------------------------------------------------

function CreateJournal({
  templates,
  defaultTerm,
  onCreated,
  leaving,
  guestLimit,
}: {
  templates: Record<PageLevel, ThumbnailPage[]>;
  defaultTerm: { start: string; end: string };
  onCreated: (id: string) => void;
  leaving: boolean;
  /** Set when a guest already has as many journals as a guest may keep. */
  guestLimit: number | null;
}) {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [levels, setLevels] = useState<PageLevel[]>(PRESETS[0].levels);
  const [title, setTitle] = useState("Untitled journal");
  const [start, setStart] = useState(defaultTerm.start);
  const [end, setEnd] = useState(defaultTerm.end);
  const [dated, setDated] = useState(true);
  const [weekStartDay, setWeekStartDay] = useState<0 | 1>(0);
  const [font, setFont] = useState<"serif" | "sans">("serif");
  const [trim, setTrim] = useState<PlannerTrimKey>("bound7x10");
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const pages = useMemo(
    () =>
      bookPageCount(
        Object.fromEntries(levels.map((level) => [level, LEVEL_PAGE_COUNT[level]])),
        utc(start),
        utc(end),
        weekStartDay
      ),
    [levels, start, end, weekStartDay]
  );

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await createJournal({
        title,
        trim,
        startISO: start || null,
        endISO: end || null,
        levels,
        dated,
        weekStartDay,
        font,
      });
      onCreated(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const toggleLevel = (level: PageLevel) =>
    setLevels((current) =>
      current.includes(level)
        ? current.filter((l) => l !== level)
        : LEVELS_IN_BINDING_ORDER.filter((l) => l === level || current.includes(l))
    );

  return (
    <>
      <div className="sd-main">
        <div className="sd-label">Blank journals ({PRESETS.length})</div>
        <div className="sd-grid">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="sd-card"
              aria-pressed={preset.id === presetId}
              onClick={() => {
                setPresetId(preset.id);
                setLevels(preset.levels);
              }}
              onDoubleClick={() => void create()}
            >
              <Spread pages={templates[preset.cover]} />
              <span className="sd-name">{preset.name}</span>
              <span className="sd-meta">{preset.note}</span>
            </button>
          ))}
        </div>
      </div>
      <aside className="sd-details">
        <div style={{ display: "grid", gap: 8 }}>
          <div className="sd-label">New journal</div>
          <input
            ref={nameRef}
            className="sd-title-input"
            value={title}
            aria-label="Journal name"
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void create();
            }}
          />
        </div>
        <div className="sd-field">
          <span>Term</span>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <input type="date" className="sd-input" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Term starts" />
            <input type="date" className="sd-input" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Term ends" />
          </div>
        </div>
        <button type="button" className="sd-disclosure" aria-expanded={more} onClick={() => setMore((v) => !v)}>
          <span aria-hidden="true" style={{ display: "inline-block", transform: more ? "rotate(90deg)" : "none", transition: "transform 120ms ease-out" }}>
            ›
          </span>{" "}
          More options
        </button>
        {more && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="sd-field">
              <span>Pages</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {LEVELS_IN_BINDING_ORDER.map((level) => (
                  <button key={level} type="button" className="sd-chip" aria-pressed={levels.includes(level)} onClick={() => toggleLevel(level)}>
                    {LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
            <Segmented label="Dates" value={dated ? "dated" : "undated"} options={[["dated", "Dated"], ["undated", "Undated"]]} onChange={(v) => setDated(v === "dated")} />
            <Segmented label="Week starts" value={String(weekStartDay)} options={[["0", "Sunday"], ["1", "Monday"]]} onChange={(v) => setWeekStartDay(v === "1" ? 1 : 0)} />
            <Segmented label="Font" value={font} options={[["serif", "Serif"], ["sans", "Sans"]]} onChange={(v) => setFont(v === "sans" ? "sans" : "serif")} />
            <Segmented label="Size" value={trim} options={[["bound7x10", "7 × 10 in"], ["letter", "US Letter"]]} onChange={(v) => setTrim(v === "letter" ? "letter" : "bound7x10")} />
          </div>
        )}
        <div className="sd-count">
          <b>{pages === null ? "—" : `${pages} pages`}</b>
          <small>{pages === null ? "Set a term to count the pages" : levelsLabel(levels)}</small>
        </div>
        {error && <p style={{ color: ERROR_TEXT, fontSize: 12, margin: 0 }}>{error}</p>}
        {guestLimit !== null && (
          <p style={{ color: DIM, fontSize: 12, margin: 0, lineHeight: 1.45 }}>
            A guest can keep {guestLimit} journals. <Link href="/sign-in?redirect_url=%2Fapp" style={{ color: "#fff" }}>Sign in</Link> to
            make more &mdash; the ones you have come with you.
          </p>
        )}
        <div className="sd-actions">
          <button
            type="button"
            className="sd-btn sd-primary"
            onClick={() => void create()}
            disabled={busy || leaving || levels.length === 0 || guestLimit !== null}
          >
            {busy || leaving ? "Creating…" : "Create"}
          </button>
        </div>
      </aside>
    </>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="sd-field">
      <span>{label}</span>
      <div className="sd-seg" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A spread (or single page) of thumbnails, each page at its own shape. */
function Spread({ pages }: { pages: ThumbnailPage[] }) {
  return (
    <span className="sd-thumb">
      {pages.length === 0 ? (
        <span style={{ color: DIM, fontSize: 12 }}>No pages yet</span>
      ) : (
        <span style={{ display: "flex", gap: 1, height: "100%" }}>
          {pages.map((page, i) => (
            <span
              key={i}
              style={{
                position: "relative",
                height: "100%",
                aspectRatio: `${page.pageWidthPx} / ${page.pageHeightPx}`,
                background: "#fdfcf9",
                display: "block",
              } as CSSProperties}
            >
              <PagePreview page={page} />
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

const STYLES = `
.sd-dialog { width: min(1080px, 100%); height: min(720px, 100%); display: flex; flex-direction: column; }
.sd-guest { margin: 0; padding: 10px 22px; font-size: 13px; line-height: 1.45; color: ${DIM}; border-bottom: 1px solid ${LINE}; background: #202023; }
.sd-guest a { color: #fff; }
.sd-body { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 320px; min-height: 0; }
.sd-main { padding: 20px 22px; overflow: auto; display: grid; gap: 14px; align-content: start; border-right: 1px solid ${LINE}; }
.sd-details { padding: 20px; overflow: auto; display: grid; gap: 16px; align-content: start; grid-auto-rows: max-content; }
.sd-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${DIM}; }
.sd-tab { background: none; border: none; color: ${DIM}; font: inherit; font-size: 15px; padding: 14px 2px 12px; border-bottom: 2px solid transparent; cursor: pointer; min-height: 44px; }
.sd-tab[aria-selected="true"] { color: #fff; }
/* Until the sliding bar has measured the tabs - the page as the server sent
   it, before any script - the chosen tab carries its own underline, so the
   first paint is never missing one. */
.sd-tabs:not([data-measured]) .sd-tab[aria-selected="true"] { border-bottom-color: #fff; }
.sd-x { width: 32px; height: 32px; display: grid; place-items: center; background: none; border: none; color: ${DIM}; border-radius: 8px; cursor: pointer; }
.sd-x:hover { color: #fff; background: ${CONTROL}; }
.sd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.sd-card { background: ${CONTROL}; border: none; border-radius: 8px; padding: 10px 10px 12px; color: #f2f2f2; text-align: left; font: inherit; cursor: pointer; display: grid; gap: 6px; opacity: 0.6; outline: 2px solid transparent; outline-offset: 2px; transition: opacity 120ms ease-out; }
.sd-card:hover { opacity: 0.85; }
.sd-card[aria-pressed="true"] { opacity: 1; outline-color: ${ACCENT}; }
.sd-new { background: transparent; border: 1px dashed rgba(255,255,255,0.25); opacity: 0.8; }
.sd-thumb { display: flex; align-items: center; justify-content: center; height: 118px; background: #242426; border-radius: 4px; padding: 8px; overflow: hidden; }
.sd-name { font-size: 13.5px; font-weight: 700; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sd-meta { font-size: 12px; color: ${DIM}; line-height: 1.3; }
.sd-title-input { background: transparent; border: 1px solid transparent; border-radius: 6px; color: #fff; font: inherit; font-size: 20px; font-weight: 700; padding: 4px 6px; margin-left: -7px; width: calc(100% + 7px); }
.sd-title-input:hover { border-color: rgba(255,255,255,0.15); }
.sd-title-input:focus { border-color: ${ACCENT}; outline: none; background: ${CONTROL}; }
.sd-facts { display: grid; grid-template-columns: 64px 1fr; gap: 8px 12px; margin: 0; font-size: 13px; }
.sd-facts dt { color: ${DIM}; font-size: 12px; }
.sd-facts dd { margin: 0; }
.sd-field { display: grid; gap: 6px; }
.sd-field > span { font-size: 12px; color: ${DIM}; }
.sd-input { background: ${CONTROL}; border: 1px solid rgba(255,255,255,0.33); border-radius: 6px; color: #f2f2f2; font: inherit; font-size: 13px; padding: 6px 8px; min-height: 32px; color-scheme: dark; width: 100%; box-sizing: border-box; }
.sd-disclosure { background: none; border: none; color: ${DIM}; font: inherit; font-size: 13px; text-align: left; padding: 4px 0; cursor: pointer; }
.sd-disclosure:hover { color: #fff; }
.sd-chip { background: ${CONTROL}; border: 1px solid rgba(255,255,255,0.15); color: ${DIM}; font: inherit; font-size: 12px; padding: 4px 10px; border-radius: 999px; cursor: pointer; min-height: 28px; }
.sd-chip[aria-pressed="true"] { border-color: ${ACCENT}; color: #fff; background: #2d3170; }
.sd-seg { display: inline-flex; background: ${CONTROL}; border-radius: 8px; padding: ${SEGMENT_PADDING}px; gap: 3px; width: max-content; }
.sd-seg button { background: none; border: none; color: ${DIM}; font: inherit; font-size: 12.5px; padding: 5px 12px; border-radius: 6px; cursor: pointer; min-height: 26px; }
.sd-seg button[aria-pressed="true"] { background: #3a3a3c; color: #fff; }
.sd-count { border-top: 1px solid ${LINE}; padding-top: 12px; display: grid; gap: 2px; }
.sd-count b { font-size: 22px; font-variant-numeric: tabular-nums; }
.sd-count small { font-size: 12px; color: ${DIM}; }
.sd-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
.sd-btn { border-radius: 999px; font: inherit; font-size: 14px; font-weight: 700; padding: 8px 20px; min-height: 36px; cursor: pointer; border: 1.5px solid rgba(255,255,255,0.7); background: transparent; color: #fff; }
.sd-btn:disabled { opacity: 0.5; cursor: default; }
.sd-primary { background: ${ACCENT}; border-color: ${ACCENT}; }
.sd-link { background: none; border: none; padding: 0; color: #fff; font: inherit; text-decoration: underline; cursor: pointer; }
.sd-tab:focus-visible, .sd-card:focus-visible, .sd-btn:focus-visible, .sd-chip:focus-visible, .sd-seg button:focus-visible, .sd-x:focus-visible, .sd-disclosure:focus-visible, .sd-link:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
@media (max-width: 760px) {
  .sd-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto; overflow: auto; }
  .sd-main { border-right: none; border-bottom: 1px solid ${LINE}; overflow: visible; }
  .sd-details { overflow: visible; }
}
@media (prefers-reduced-motion: reduce) { .sd-card, .sd-disclosure span { transition: none !important; } }
`;

/** How the highlight travels, wherever it is used. One curve for both
 *  strips, so the Saved/Create underline and the Journals/Pages/Modules pill
 *  read as the same gesture rather than two that merely resemble each
 *  other. */
const HIGHLIGHT_SLIDE =
  "transform 280ms cubic-bezier(0.25, 0.8, 0.25, 1), width 280ms cubic-bezier(0.25, 0.8, 0.25, 1)";

/**
 * Measure the selected control in a strip, so ONE highlight can slide to it.
 *
 * Written once and used twice: the Saved / Create underline and the
 * Journals / Pages / Modules pill. They were going to be the same fifteen
 * lines twice over, and two copies of a measurement is how the two ended up
 * sliding at different speeds in the first place.
 *
 * Only a change of SELECTION slides. The first placement, a window resize and
 * the fonts arriving all move it without animating - a highlight that swept
 * in on load, or chased the controls while a window was dragged, would be
 * motion for nothing. (A label's width really does change when its face
 * arrives, which is why fonts.ready is listened for at all.)
 */
function useSlidingHighlight(active: string, selectedSelector: string) {
  const strip = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; width: number; height: number; slide: boolean } | null>(
    null
  );
  const placedFor = useRef<string | null>(null);

  const measure = useCallback(
    (slide: boolean) => {
      const control = strip.current?.querySelector<HTMLElement>(selectedSelector);
      if (!control) return;
      setBox({
        left: control.offsetLeft,
        width: control.offsetWidth,
        height: control.offsetHeight,
        slide,
      });
    },
    [selectedSelector]
  );

  useLayoutEffect(() => {
    measure(placedFor.current !== null && placedFor.current !== active);
    placedFor.current = active;
  }, [active, measure]);

  useEffect(() => {
    const still = () => measure(false);
    window.addEventListener("resize", still);
    void document.fonts?.ready.then(still);
    return () => window.removeEventListener("resize", still);
  }, [measure]);

  return { strip, box };
}

/**
 * The Saved / Create tabs, with ONE underline that slides to the chosen tab
 * - asked for, 2026-09-21: "animate the horizontal bar below to animate back
 * and forth as you swap". The bar is measured off the tab buttons
 * themselves, so it fits each label whatever its width, and re-measured on
 * resize and once the fonts have loaded (a label's width changes when its
 * face arrives). Under reduced motion it moves without sliding.
 */
function TabStrip({ tab, children }: { tab: "saved" | "create"; children: ReactNode }) {
  const { strip, box } = useSlidingHighlight(tab, '[aria-selected="true"]');
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div
      ref={strip}
      role="tablist"
      aria-label="Start"
      className="sd-tabs"
      data-measured={box ? "" : undefined}
      style={{ position: "relative", display: "flex", gap: 32 }}
    >
      {children}
      {box && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            height: 2,
            width: box.width,
            transform: `translateX(${box.left}px)`,
            background: "#fff",
            borderRadius: 1,
            transition: box.slide && !reduceMotion ? HIGHLIGHT_SLIDE : "none",
          }}
        />
      )}
    </div>
  );
}


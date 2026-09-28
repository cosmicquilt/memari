"use client";

// Every drawing in the doodle library, and two switches on each: on the
// start dialog's wall, and in the hero's sketch boxes. The wall can be
// previewed as it will be baked (the same packWall the build script runs),
// and Save writes both lists and the wall (save/route.ts).

import { useMemo, useState } from "react";
import { packWall, wallClassOf, wallSeed, WALL_CLASSES, WALL_THEMES, WALL_TILE, WALL_VARIANTS, type WallTheme } from "@/app/landing/doodleWall";

type Index = Record<string, Record<string, Array<[string, number, number]>>>;
type Choices = { wall: string[]; sketchBox: string[] };
type Mode = keyof Choices;

const ACCENT = "#4a5cff";
const INK = "#1c1917";
const MUTED = "#6b6259";
const LINE = "rgba(28, 25, 23, 0.12)";
const GROUNDS = Object.keys(WALL_THEMES) as WallTheme[];

const MODES: Array<{ key: Mode; label: string; note: string }> = [
  {
    key: "wall",
    label: "Wall",
    note: `Behind the start dialog in its doodle themes, in blue pen. People and animals big, small things fill the gaps; each load shows one of ${WALL_VARIANTS} arrangements.`,
  },
  {
    key: "sketchBox",
    label: "Sketch boxes",
    note: "Drawn large in the hero's sketch boxes. Each spread favours its own person's things when any are on; anything on can appear.",
  },
];

const sorted = (s: Set<string>) => [...s].sort();
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function DoodlePanel({ index, initial }: { index: Index; initial: Choices }) {
  const [chosen, setChosen] = useState({ wall: new Set(initial.wall), sketchBox: new Set(initial.sketchBox) });
  const [saved, setSaved] = useState({ wall: new Set(initial.wall), sketchBox: new Set(initial.sketchBox) });
  const [mode, setMode] = useState<Mode>("wall");
  const [style, setStyle] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [onlyOn, setOnlyOn] = useState(false);
  const [preview, setPreview] = useState<{ urls: Record<WallTheme, string>; of: string; counts: number[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const styles = Object.keys(index);
  const current = chosen[mode];
  const dirty = !sameSet(chosen.wall, saved.wall) || !sameSet(chosen.sketchBox, saved.sketchBox);
  const wallKey = sorted(chosen.wall).join("|");

  // The drawings to show: by style, then subject, filtered.
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    return styles
      .filter((s) => style === "all" || s === style)
      .map((s) => ({
        style: s,
        items: Object.entries(index[s])
          .filter(([subject]) => !q || subject.includes(q))
          .flatMap(([, list]) => list.map(([id]) => `${s}/${id}`))
          .filter((full) => !onlyOn || current.has(full)),
      }))
      .filter((section) => section.items.length)
      // The styles in use first - the wall opens on its pencil sketches,
      // not on a page of drawings that are all off.
      .sort((a, b) => b.items.filter((f) => current.has(f)).length - a.items.filter((f) => current.has(f)).length);
  }, [index, styles, style, query, onlyOn, current]);

  const set = (next: Set<string>) => {
    setChosen((c) => ({ ...c, [mode]: next }));
    setMessage(null);
  };
  const toggle = (full: string) => {
    const next = new Set(current);
    if (next.has(full)) next.delete(full);
    else next.add(full);
    set(next);
  };
  const setAll = (items: string[], on: boolean) => {
    const next = new Set(current);
    for (const full of items) {
      if (on) next.add(full);
      else next.delete(full);
    }
    set(next);
  };

  // A wall as the build script bakes it: the same packing, drawings, seed.
  const drawWall = async (ground: WallTheme, variant: number) => {
    const drawings = sorted(chosen.wall).map((full) => {
      const [s, id] = full.split("/");
      return { src: `/landing/doodles/${s}/${id}.webp`, cls: wallClassOf(id.replace(/-\d+$/, "")) };
    });
    return packWall({ drawings, classes: WALL_CLASSES, tile: WALL_TILE, ...WALL_THEMES[ground], seed: wallSeed(variant) });
  };

  const onPreview = async () => {
    setBusy("Drawing the wall...");
    try {
      const urls = {} as Record<WallTheme, string>;
      let counts: number[] = [];
      for (const ground of GROUNDS) {
        const out = await drawWall(ground, 0);
        urls[ground] = out.url;
        counts = out.counts;
      }
      setPreview({ urls, of: wallKey, counts });
    } finally {
      setBusy(null);
    }
  };

  const onSave = async () => {
    setBusy("Saving...");
    setMessage(null);
    try {
      // The walls are baked: every one is redrawn if what is on them changed.
      const walls: Array<{ name: string; image: string }> = [];
      if (!sameSet(chosen.wall, saved.wall)) {
        for (const ground of GROUNDS)
          for (let variant = 0; variant < WALL_VARIANTS; variant++) {
            setBusy(`Drawing walls, ${walls.length + 1} of ${GROUNDS.length * WALL_VARIANTS}...`);
            walls.push({ name: `${ground}-${variant}`, image: (await drawWall(ground, variant)).url });
          }
        setBusy("Saving...");
      }
      const res = await fetch("/dev/doodles/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wall: sorted(chosen.wall), sketchBox: sorted(chosen.sketchBox), walls }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? res.statusText);
      setSaved({ wall: new Set(chosen.wall), sketchBox: new Set(chosen.sketchBox) });
      setMessage(
        `Saved: ${result.wall} on the wall, ${result.sketchBox} for sketch boxes` +
          (result.walls ? `, ${result.walls} walls redrawn (${Math.round(result.wallBytes / 1024)} KB)` : "") +
          ". Reload the app or the landing page to see it; commit and push to put it live."
      );
    } catch (error) {
      setMessage(`Not saved: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(null);
    }
  };

  const shown = sections.flatMap((s) => s.items);
  return (
    <main style={{ minHeight: "100vh", background: "#f5ead5", color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <style>{CSS}</style>
      <header className="dp-bar">
        <strong style={{ fontSize: 17 }}>Drawings</strong>
        <div className="dp-seg" role="tablist" aria-label="Where">
          {MODES.map((m) => (
            <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)}>
              {m.label} <span className="dp-count">{chosen[m.key].size}</span>
            </button>
          ))}
        </div>
        <select className="dp-input" value={style} onChange={(e) => setStyle(e.target.value)} aria-label="Style">
          <option value="all">All styles</option>
          {styles.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input className="dp-input" placeholder="Search subjects" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="dp-check">
          <input type="checkbox" checked={onlyOn} onChange={(e) => setOnlyOn(e.target.checked)} /> Only switched on
        </label>
        <span style={{ flex: 1 }} />
        {busy ? <span className="dp-muted">{busy}</span> : dirty ? <span className="dp-muted">Unsaved changes</span> : null}
        {mode === "wall" && (
          <button className="dp-btn" onClick={onPreview} disabled={!!busy}>
            Preview wall
          </button>
        )}
        <button className="dp-btn dp-primary" onClick={onSave} disabled={!!busy || !dirty}>
          Save
        </button>
      </header>

      <div style={{ padding: "14px 24px 0", display: "grid", gap: 6 }}>
        <p className="dp-muted" style={{ margin: 0 }}>
          {MODES.find((m) => m.key === mode)!.note} Click a drawing to switch it on or off. {shown.filter((f) => current.has(f)).length} of{" "}
          {shown.length} shown are on.
        </p>
        {message && <p style={{ margin: 0, fontSize: 14 }}>{message}</p>}
      </div>

      {mode === "wall" && preview && (
        <section style={{ padding: "14px 24px 0" }}>
          <div className="dp-muted" style={{ marginBottom: 6 }}>
            Preview{preview.of === wallKey ? "" : " (out of date - preview again)"}: the first of {WALL_VARIANTS} walls per theme,{" "}
            {preview.counts[0]} big, {preview.counts[1]} middle, {preview.counts[2]} small. Save bakes all {WALL_VARIANTS * GROUNDS.length} the
            same way.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {GROUNDS.map((ground) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={ground} src={preview.urls[ground]} alt={`The ${ground} wall as it would be baked`} style={{ width: "100%", borderRadius: 6, border: `1px solid ${LINE}` }} />
            ))}
          </div>
        </section>
      )}

      {sections.map((section) => (
        <section key={section.style} style={{ padding: "18px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.08em" }}>{section.style}</h2>
            <span className="dp-muted">
              {section.items.filter((f) => current.has(f)).length} of {section.items.length} on
            </span>
            <button className="dp-link" onClick={() => setAll(section.items, true)}>
              All on
            </button>
            <button className="dp-link" onClick={() => setAll(section.items, false)}>
              All off
            </button>
          </div>
          <div className="dp-grid">
            {section.items.map((full) => {
              const on = current.has(full);
              const [, id] = full.split("/");
              return (
                <button key={full} className="dp-card" data-on={on} onClick={() => toggle(full)} aria-pressed={on} title={full}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/landing/doodles/${full}.webp`} alt="" loading="lazy" />
                  <span className="dp-name">{id}</span>
                  <span className="dp-marks">
                    <span data-on={chosen.wall.has(full)} title="On the wall">
                      W
                    </span>
                    <span data-on={chosen.sketchBox.has(full)} title="In sketch boxes">
                      S
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <div style={{ height: 40 }} />
    </main>
  );
}

const CSS = `
.dp-bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 24px; background: rgba(245, 234, 213, 0.92); backdrop-filter: blur(12px); border-bottom: 1px solid ${LINE}; }
.dp-seg { display: inline-flex; background: rgba(28, 25, 23, 0.07); border-radius: 8px; padding: 3px; gap: 3px; }
.dp-seg button { border: none; background: none; font: inherit; font-size: 14px; padding: 6px 12px; border-radius: 6px; cursor: pointer; color: ${MUTED}; }
.dp-seg button[aria-selected="true"] { background: #fffaf0; color: ${INK}; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.dp-count { font-variant-numeric: tabular-nums; opacity: 0.7; margin-left: 4px; }
.dp-input { font: inherit; font-size: 14px; padding: 6px 10px; border: 1px solid ${LINE}; border-radius: 8px; background: #fffaf0; color: ${INK}; }
.dp-check { font-size: 14px; color: ${MUTED}; display: inline-flex; gap: 6px; align-items: center; }
.dp-muted { color: ${MUTED}; font-size: 14px; }
.dp-btn { font: inherit; font-size: 14px; font-weight: 600; padding: 7px 16px; border-radius: 999px; border: 1.5px solid ${INK}; background: transparent; color: ${INK}; cursor: pointer; }
.dp-btn:disabled { opacity: 0.4; cursor: default; }
.dp-primary { background: ${ACCENT}; border-color: ${ACCENT}; color: #fff; }
.dp-link { border: none; background: none; font: inherit; font-size: 13px; color: ${ACCENT}; cursor: pointer; padding: 0; }
.dp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 10px; }
.dp-card { position: relative; display: grid; gap: 4px; padding: 8px 8px 6px; background: #fffaf0; border: 2px solid transparent; border-radius: 10px; cursor: pointer; font: inherit; text-align: left; opacity: 0.38; transition: opacity 120ms ease-out; }
.dp-card[data-on="true"] { opacity: 1; border-color: ${ACCENT}; }
.dp-card:hover { opacity: 0.85; }
.dp-card[data-on="true"]:hover { opacity: 1; }
.dp-card img { width: 100%; aspect-ratio: 1; object-fit: contain; }
.dp-name { font-size: 12px; color: ${MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 30px; }
.dp-marks { position: absolute; right: 6px; bottom: 5px; display: flex; gap: 3px; }
.dp-marks span { font-size: 10px; font-weight: 700; width: 14px; height: 14px; border-radius: 3px; display: grid; place-items: center; background: rgba(28,25,23,0.08); color: rgba(28,25,23,0.35); }
.dp-marks span[data-on="true"] { background: ${ACCENT}; color: #fff; }
`;

"use client";

// How a module's settings are edited, in one place.
//
// Every module declares a `fields` array - text, paragraph, lines, number,
// boolean, select, note - and that IS the editor's data model. It always was;
// it just had no reader outside the legacy Polotno panel, so the native
// editor grew two hand-written inline editors for the two modules somebody
// needed, by slug. This is the reader, so all 122 get one.
//
// PURE. It holds no draft and saves nothing: it renders values and reports
// changes. Whoever owns the draft decides when to write it, which is what
// lets the same form sit in a side panel and in a full-page editor without
// either of them arguing about when a save happens.

import { CONTROL_RADIUS, ICON_PICKER_COLUMNS, PREVIEW_RADIUS, concentric } from "./editorStyle";
import type { CSSProperties } from "react";
import type { ModuleField, RuleValue } from "@/lib/moduleRegistry";
import type { PageLevel } from "@/lib/pageLevels";
import { glyphElement, type GlyphShape } from "@/lib/modules/glyphs";
import { flatten, toSvg } from "@/lib/proofSvg";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { CREAM, cream, onCream } from "@/lib/cream";

const ACCENT = "#4a5cff";

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: cream(0.6),
};

/**
 * A DROPDOWN, with its arrow drawn rather than the browser's: as far in from
 * the right edge as its words are from the left, the field's 9px. The
 * browser's own sat a few px off the border - "the down arrow ... is too
 * close to the right border of its container compare to the text on the
 * left" (2026-10-01). The words stop short of the arrow: 9 + 10 + 8.
 */
const SELECT_ARROW =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23f2f2f2' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";
export function selectStyle(field: CSSProperties): CSSProperties {
  return {
    ...field,
    appearance: "none",
    WebkitAppearance: "none",
    padding: "7px 27px 7px 9px",
    background: `${SELECT_ARROW} no-repeat right 9px center / 10px 6px, ${String(field.background)}`,
    cursor: "pointer",
  };
}

/**
 * The border is 0.33 white, not the 0.12 the rest of this chrome uses, and
 * the number is MEASURED rather than chosen.
 *
 * WCAG 2.2 1.4.11 wants 3:1 between a control's visual boundary and what is
 * behind it. On this panel's #1c1c1e, white at 0.12 composites to #373739,
 * which is 1.43:1 - less than half. The alpha that first reaches 3:1 is
 * 0.329 (#676768, 3.01:1), so 0.33 it is.
 *
 * Worth knowing because the obvious fixes do not work: #444 reads 1.75:1 here
 * and #666 reads 2.96:1 - the second one misses by four hundredths, which is
 * exactly the kind of near-miss that survives being looked at. There is no
 * subtle boundary on a near-black ground; it either carries or it does not.
 * scripts/check-contrast.mts holds the arithmetic.
 *
 * NO BORDER SINCE 2026-10-01: Andrew set it on a page of sliders that showed
 * each border's contrast live, and pasted back "none" for fields, dropdowns,
 * steppers and the save-name field. A field's edge is now its fill alone,
 * about 1.2:1 - under 1.4.11's 3:1, which he saw. check:contrast reports it
 * as his exception and measures any border put back against 3:1 again.
 */
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: onCream(0xf2),
  background: cream(0.06),
  border: "none",
  borderRadius: CONTROL_RADIUS,
};

/**
 * A TEXT BOX THAT GROWS WITH WHAT IS IN IT, from `rows` lines up, rather than
 * one with a resize grip. The grip cost the to-do's editor its opening: it is
 * the only thing on the page Chrome draws as small anti-aliased diagonals, so
 * the GPU compiled new shaders for it on the flight's first frame - measured
 * 2026-09-30 as a 104-157ms frame on a fresh browser profile and 55-74ms in
 * later sessions, gone (18-20ms) with the grip off. Growing is the better
 * field anyway: nothing to drag, and a long list is never scrolled inside a
 * panel that already scrolls. `field-sizing` is Chrome's; elsewhere the box
 * keeps its `rows` and scrolls, as before less the grip.
 */
function growingTextareaStyle(rows: number): CSSProperties {
  // 13px at 1.5 is 19.5px a line, plus the padding and the border.
  return { ...inputStyle, resize: "none", fieldSizing: "content", lineHeight: 1.5, minHeight: rows * 19.5 + 16 };
}

/**
 * Focus, which inline styles cannot express - so a <style> element, the same
 * way the timeline drawer writes the rule it cannot inline.
 *
 * These fields had `outline: "none"` and nothing in its place, so a keyboard
 * user tabbing through them was moving a caret nothing on screen marked. An
 * `outline` rather than a border for the same reason the rest of this app uses
 * one: it is drawn outside the box and changes no geometry, so a focused field
 * is the same size as an unfocused one.
 *
 * The accent measures 3.46:1 against this panel, which clears 1.4.11's 3:1 for
 * a focus indicator, and 2px with a 2px offset is the house selection language
 * already used by the swatches, the drawer and the editor frame.
 */
export const FOCUS_CSS = `
.memari-field:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: 2px;
}
/* A swatch carries two states at once - which shape is CHOSEN, and which
   button the keyboard is ON - and they are not the same thing, so they cannot
   share a ring. Selection is the accent, focus is white, focus wins while it
   lasts. Both are set here rather than inline because an inline outline beats
   a stylesheet one and a selected swatch would have eaten its own focus ring. */
/* A dropdown's options, stated rather than left to the colour scheme: the
   fields' text is near-white, and an open list that fell back to the
   browser's white put it on white - "light grey text on white", reported
   2026-09-29. The panel is also colour-scheme dark (see ModuleEditor). */
.memari-field option { background-color: #2c2c2e; color: ${onCream(0xf2)}; }
/* The selection ring sits 2px out from a picture rounded PREVIEW_RADIUS, so
   its own corners are that plus 2 (an outline's radius is the element's plus
   its offset) - smaller than the panel's: "make it even smaller for the
   preview and selection within" (2026-09-30). */
.memari-swatch { outline: none; outline-offset: 2px; }
.memari-swatch[data-selected="true"] { outline: 2px solid ${ACCENT}; }
.memari-swatch:focus-visible { outline: 2px solid ${CREAM}; }
`;

const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

/**
 * One glyph, drawn rather than named.
 *
 * DRAWN BY THE SAME CODE THAT PRINTS IT: glyphElement is the one description
 * of what a droplet is, and proofSvg serialises it exactly as the proof
 * sheets and the PDF exporter do. A hand-drawn icon for the picker would be a
 * second description of the shape, and the first time one changed they would
 * disagree.
 *
 * On PAPER, not on the dark panel. The glyph is drawn in the real ink colour
 * at the real hairline weight, so the swatch shows what comes off the press
 * rather than a recoloured version of it - and it needs no recolouring, which
 * would have meant rewriting the markup the renderer emitted.
 */
/**
 * A switch, not a tick box. It reads as a state rather than a choice you are
 * making on a form, which is what it is. The fields' booleans and a day
 * icon's Faces both use it, so there is one switch in the panel.
 */
export function CapsuleSwitch({ on, label, onToggle }: { on: boolean; label: string; onToggle: (on: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", ...labelStyle }}>
      <span
        style={{
          width: 34,
          height: 20,
          flexShrink: 0,
          // A capsule, as Apple's switches are; the knob 2px inside it is
          // concentric, which on a 16px knob is a circle.
          borderRadius: 10,
          background: on ? ACCENT : cream(0.15),
          position: "relative",
          transition: "background 150ms ease-out",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: on ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: concentric(10, 2),
            background: CREAM,
            transition: "left 150ms ease-out",
          }}
        />
      </span>
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onToggle(event.target.checked)}
        // Off screen rather than display:none - a hidden input is out of the
        // accessibility tree and unreachable by keyboard, which is the whole
        // reason a real checkbox is here at all.
        style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
      />
      {label}
    </label>
  );
}

export function GlyphSwatch({
  shape,
  label,
  selected,
  onPick,
  size = 34,
  faces,
}: {
  shape: GlyphShape;
  /** Draw the icon's face drawing - the module's Faces switch. */
  faces?: boolean;
  label: string;
  selected: boolean;
  onPick: () => void;
  /** 34px in a picker of its own; smaller in a picker per row or day. */
  size?: number;
}) {
  // Drawn in a 100-unit box and shown at 34px. The viewBox does the scaling,
  // so the hairline stays proportionally what it is on the page.
  const markup = toSvg(
    glyphElement({ id: `swatch-${shape}`, x: 18, y: 18, sizePx: 64, shape, opacity: 1, faces }) as never
  );
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      title={label}
      aria-label={label}
      className="memari-swatch"
      data-selected={selected ? "true" : undefined}
      style={{
        width: size,
        height: size,
        padding: 0,
        border: "none",
        borderRadius: PREVIEW_RADIUS,
        background: CREAM,
        opacity: selected ? 1 : 0.65,
        cursor: "pointer",
        transition: "opacity 150ms ease-out",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ display: "block", pointerEvents: "none" }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </button>
  );
}

/**
 * What a line-style option looks like: the module drawn with that option, and
 * the window of it to show. See RuleSwatch.
 */
export type RuleSample = {
  elements: RenderedPolotnoElement[];
  window: { x: number; y: number; width: number; height: number };
};

/**
 * One line style, drawn rather than named - a zoomed-in corner of the module
 * itself with that style applied.
 *
 * THE MODULE'S OWN DRAWING, through the same toSvg the proofs and the PDF go
 * through, cropped by the viewBox. A picture drawn for the picker would be a
 * second description of what "crosses" means, and the first change to one
 * would leave them disagreeing - the argument GlyphSwatch makes for shapes.
 *
 * On paper, like the glyph swatches, for their reason: the real ink at the
 * real weight.
 */
export function RuleSwatch({
  sample,
  label,
  selected,
  onPick,
  width,
}: {
  sample: RuleSample;
  label: string;
  selected: boolean;
  onPick: () => void;
  width: number;
}) {
  const { window: w } = sample;
  // Only what can show. An hourly block with its dots on is a thousand marks,
  // and all but a dozen are outside the window.
  const markup = flatten(sample.elements)
    .filter((element) => {
      const x = element.x ?? 0;
      const y = element.y ?? 0;
      return (
        x <= w.x + w.width && x + (element.width ?? 0) >= w.x && y <= w.y + w.height && y + (element.height ?? 0) >= w.y
      );
    })
    .map((element) => toSvg(element))
    .join("");
  const height = (width * w.height) / w.width;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      title={label}
      aria-label={label}
      className="memari-swatch"
      data-selected={selected ? "true" : undefined}
      style={{
        width,
        padding: 0,
        border: "none",
        borderRadius: PREVIEW_RADIUS,
        background: "transparent",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        alignItems: "stretch",
        color: selected ? CREAM : cream(0.6),
        font: "inherit",
        fontSize: 11,
      }}
    >
      <svg
        viewBox={`${w.x} ${w.y} ${w.width} ${w.height}`}
        width={width}
        height={height}
        style={{
          display: "block",
          pointerEvents: "none",
          background: CREAM,
          borderRadius: PREVIEW_RADIUS,
          opacity: selected ? 1 : 0.85,
          transition: "opacity 150ms ease-out",
        }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
      <span style={{ paddingBottom: 3 }}>{label}</span>
    </button>
  );
}

/** Two lists the same, item for item. */
function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/** How wide each of `count` swatches is in the fields panel. */
export function ruleSwatchWidth(count: number): number {
  const room = 268;
  const gap = 10;
  return Math.min(124, Math.floor((room - gap * (count - 1)) / count));
}

export function ModuleFieldsForm({
  fields,
  values,
  onChange,
  defaults,
  drawRule,
  textOnPage,
  pageLevel,
}: {
  fields: ModuleField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  /** What a key reads as when the stored props do not have it - a module
   *  saved before the key existed draws its default, so its picker should
   *  show that one chosen. */
  defaults?: Record<string, unknown>;
  /** Draws the module with one line-style option, for a `rule` field. Without
   *  it, a rule field is an ordinary list of names. */
  drawRule?: (key: string, value: RuleValue) => RuleSample | null;
  /** The module's text is edited on the preview - so an empty panel is not
   *  "nothing to set". */
  textOnPage?: boolean;
  /** The level of the page the module is on, where it is known - a select
   *  option for other levels is not offered. */
  pageLevel?: PageLevel | null;
}) {
  if (fields.length === 0 && textOnPage) return null;
  if (fields.length === 0) {
    return (
      <p style={{ ...labelStyle, textTransform: "none", letterSpacing: 0, lineHeight: 1.6 }}>
        This module has nothing to set. Its drawing comes from its size and the
        page it sits on.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{FOCUS_CSS}</style>
      {fields.map((field, index) => {
        // Chosen on the preview - see IconPicksOnPage.
        if (field.kind === "iconsOnPage") return null;
        // Not as the module is set - see ModuleField's `when`.
        if (field.when && !field.when({ ...defaults, ...values })) return null;

        if (field.kind === "countEach") {
          // One stepper per item of the list it follows - lines under each
          // prompt. Stored as the whole list, so the numbers stay with their
          // items; an item that has none shows the default.
          const items = ((values[field.itemsKey] ?? defaults?.[field.itemsKey]) as unknown[] | undefined) ?? [];
          const fallback = Number(values[field.defaultKey] ?? defaults?.[field.defaultKey]) || field.min;
          const own = Array.isArray(values[field.key]) ? (values[field.key] as unknown[]) : [];
          const countOf = (i: number) => {
            const n = Number(own[i]);
            return Number.isFinite(n) && n > 0 ? n : fallback;
          };
          const step = (i: number, by: number) => {
            const next = items.map((_item, k) => countOf(k));
            next[i] = Math.max(field.min, Math.min(field.max, next[i] + by));
            onChange(field.key, next);
          };
          if (items.length === 0) return null;
          return (
            <div key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 12.5,
                        color: cream(0.85),
                      }}
                    >
                      {String(item ?? "") || `Prompt ${i + 1}`}
                    </span>
                    <span
                      role="group"
                      aria-label={`Lines under ${String(item ?? "") || `prompt ${i + 1}`}`}
                      style={{ display: "inline-flex", alignItems: "center", borderRadius: CONTROL_RADIUS, background: cream(0.06) }}
                    >
                      <button
                        type="button"
                        aria-label="One line fewer"
                        disabled={countOf(i) <= field.min}
                        onClick={() => step(i, -1)}
                        className="memari-field"
                        style={{ width: 26, height: 26, border: "none", borderRadius: concentric(CONTROL_RADIUS, 1), background: "transparent", color: onCream(0xf2), cursor: "pointer", fontSize: 14, opacity: countOf(i) <= field.min ? 0.35 : 1 }}
                      >
                        &minus;
                      </button>
                      <span style={{ minWidth: 18, textAlign: "center", fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: CREAM }}>
                        {countOf(i)}
                      </span>
                      <button
                        type="button"
                        aria-label="One line more"
                        disabled={countOf(i) >= field.max}
                        onClick={() => step(i, 1)}
                        className="memari-field"
                        style={{ width: 26, height: 26, border: "none", borderRadius: concentric(CONTROL_RADIUS, 1), background: "transparent", color: onCream(0xf2), cursor: "pointer", fontSize: 14, opacity: countOf(i) >= field.max ? 0.35 : 1 }}
                      >
                        +
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (field.kind === "columnWidths") {
          // Edited on the preview - see ColumnDividers. The panel says so,
          // and puts the words-and-weights layout back.
          const set = Array.isArray(values[field.key]) && (values[field.key] as unknown[]).length > 0;
          return (
            <div key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: cream(0.6) }}>
                Drag the lines between the columns on the preview. They snap to the dots.
              </p>
              {set && (
                <button
                  type="button"
                  onClick={() => onChange(field.key, [])}
                  className="memari-field"
                  style={{
                    alignSelf: "flex-start",
                    padding: "5px 10px",
                    fontSize: 12,
                    fontFamily: "inherit",
                    color: onCream(0xf2),
                    background: cream(0.06),
                    border: "none",
                    borderRadius: CONTROL_RADIUS,
                    cursor: "pointer",
                  }}
                >
                  Fit to the column names
                </button>
              )}
            </div>
          );
        }

        if (field.kind === "note") {
          return (
            <p
              key={`note-${index}`}
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                color: cream(0.5),
              }}
            >
              {field.text}
            </p>
          );
        }

        if (field.kind === "boolean") {
          // Unset is the schema's default, which is not always off: a module
          // stored before "Days from the months either side" existed draws
          // them, and the switch has to say so.
          const onValue = field.on ?? true;
          const on = (values[field.key] ?? defaults?.[field.key]) === onValue;
          return (
            <CapsuleSwitch
              key={field.key}
              on={on}
              label={field.label}
              onToggle={(next) => onChange(field.key, next ? onValue : field.off ?? false)}
            />
          );
        }

        if (field.kind === "number" && field.stepper) {
          // - n + on the label's own line: a count is nudged, not typed.
          const value = Number(values[field.key] ?? defaults?.[field.key] ?? field.min ?? 0) || 0;
          const min = field.min ?? 0;
          const max = field.max ?? 99;
          const step = (by: number) => onChange(field.key, Math.max(min, Math.min(max, value + by)));
          const button = (by: number, label: string, glyph: string) => (
            <button
              type="button"
              aria-label={label}
              disabled={by < 0 ? value <= min : value >= max}
              onClick={() => step(by)}
              className="memari-field"
              style={{ width: 26, height: 26, border: "none", borderRadius: concentric(CONTROL_RADIUS, 1), background: "transparent", color: onCream(0xf2), cursor: "pointer", fontSize: 14, opacity: (by < 0 ? value <= min : value >= max) ? 0.35 : 1 }}
            >
              {glyph}
            </button>
          );
          return (
            <div key={field.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={labelStyle}>{field.label}</span>
              <span
                role="group"
                aria-label={field.label}
                style={{ display: "inline-flex", alignItems: "center", borderRadius: CONTROL_RADIUS, background: cream(0.06) }}
              >
                {button(-1, `${field.label}: fewer`, "\u2212")}
                <span style={{ minWidth: 34, textAlign: "center", fontSize: 12.5, fontVariantNumeric: "tabular-nums", color: CREAM }}>
                  {value === 0 && field.zeroLabel ? field.zeroLabel : value}
                </span>
                {button(1, `${field.label}: more`, "+")}
              </span>
            </div>
          );
        }

        if (field.kind === "number") {
          return (
            <label key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={(values[field.key] as number | undefined) ?? ""}
                // A NUMBER, not the string an input hands back: a schema
                // default of 5 meeting a saved "5" is the
                // two-descriptions-of-one-fact problem in miniature.
                onChange={(event) =>
                  onChange(field.key, event.target.value === "" ? null : Number(event.target.value))
                }
                className="memari-field"
                style={inputStyle}
              />
            </label>
          );
        }

        if (field.kind === "select") {
          const current = field.shows ? field.shows(values) : ((values[field.key] as string | undefined) ?? "");
          // This page's options - and whatever is set now, if this page would
          // not offer it, so the menu never shows something other than what
          // is drawn.
          const offered = field.options.filter(
            (option) => !pageLevel || !option.levels || option.levels.includes(pageLevel) || option.value === current
          );
          return (
            <label key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <select
                value={current}
                onChange={(event) => onChange(field.key, field.numeric ? Number(event.target.value) : event.target.value)}
                className="memari-field"
                style={selectStyle(inputStyle)}
              >
                {offered.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        if (field.kind === "icon") {
          return (
            <div key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <div
                role="radiogroup"
                aria-label={field.label}
                // Small, and as few rows as fit - the drawings read at this
                // size, and two rows of LARGE ones were the bulk of the icon
                // strip's panel (2026-10-01, "as simple and compact as
                // possible"). Fourteen on one row ran four past the panel's
                // edge, hidden (2026-10-06); fifty-one, Flow's icons, are
                // rows of nine - see ICON_PICKER_COLUMNS. Shrinking them to
                // fewer rows would put them under a 24px target.
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(field.options.length, ICON_PICKER_COLUMNS)}, 24px)`,
                  gap: 3,
                }}
              >
                {field.options.map((option) => (
                  <GlyphSwatch
                    key={option.value}
                    size={24}
                    shape={option.value as GlyphShape}
                    // As the module draws them: with faces when its switch is on.
                    faces={values.faces === true}
                    label={option.label}
                    selected={values[field.key] === option.value}
                    onPick={() => onChange(field.key, option.value)}
                  />
                ))}
              </div>
            </div>
          );
        }

        if (field.kind === "rule") {
          const current = values[field.key] ?? defaults?.[field.key];
          const isCurrent = (value: RuleValue) =>
            Array.isArray(value) ? Array.isArray(current) && sameList(current, value) : current === value;
          // A list is stored as a copy, never the option's own array.
          const pick = (value: RuleValue) => onChange(field.key, Array.isArray(value) ? [...value] : value);
          const samples = drawRule ? field.options.map((option) => drawRule(field.key, option.value)) : [];
          if (!drawRule || samples.some((sample) => sample === null)) {
            return (
              <label key={field.key} style={rowStyle}>
                <span style={labelStyle}>{field.label}</span>
                <select
                  value={String(field.options.find((option) => isCurrent(option.value))?.value ?? current ?? "")}
                  onChange={(event) =>
                    pick(field.options.find((option) => String(option.value) === event.target.value)?.value ?? event.target.value)
                  }
                  className="memari-field"
                  style={selectStyle(inputStyle)}
                >
                  {field.options.map((option) => (
                    <option key={option.label} value={String(option.value)}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          const width = ruleSwatchWidth(field.options.length);
          return (
            <div key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <div role="radiogroup" aria-label={field.label} style={{ display: "flex", gap: 10 }}>
                {field.options.map((option, index) => (
                  <RuleSwatch
                    key={option.label}
                    sample={samples[index] as RuleSample}
                    label={option.label}
                    selected={isCurrent(option.value)}
                    onPick={() => pick(option.value)}
                    width={width}
                  />
                ))}
              </div>
            </div>
          );
        }

        if (field.kind === "paragraph") {
          return (
            <label key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <textarea
                rows={field.rows ?? 5}
                value={(values[field.key] as string | undefined) ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="memari-field"
                style={growingTextareaStyle(field.rows ?? 5)}
              />
            </label>
          );
        }

        if (field.kind === "lines") {
          return (
            <label key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <textarea
                rows={field.rows ?? 6}
                // Split on every keystroke and cleaned only at save, so a
                // blank line somebody is still typing around survives
                // instead of the cursor being fought - see cleanPropsForSave.
                value={((values[field.key] as string[] | undefined) ?? []).join("\n")}
                onChange={(event) => onChange(field.key, event.target.value.split("\n"))}
                className="memari-field"
                style={growingTextareaStyle(field.rows ?? 6)}
              />
              <span style={{ fontSize: 10.5, color: cream(0.35) }}>
                One per line.
              </span>
            </label>
          );
        }

        return (
          <label key={field.key} style={rowStyle}>
            <span style={labelStyle}>{field.label}</span>
            <input
              type="text"
              value={(values[field.key] as string | undefined) ?? ""}
              onChange={(event) => onChange(field.key, event.target.value)}
              className="memari-field"
              style={inputStyle}
            />
          </label>
        );
      })}
    </div>
  );
}

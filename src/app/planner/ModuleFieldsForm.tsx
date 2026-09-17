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

import type { CSSProperties } from "react";
import type { ModuleField } from "@/lib/moduleRegistry";
import { glyphElement, type GlyphShape } from "@/lib/modules/glyphs";
import { toSvg } from "@/lib/proofSvg";

const ACCENT = "#4a5cff";

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.6)",
};

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
 */
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#f2f2f2",
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.33)",
  borderRadius: 7,
};

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
const FOCUS_CSS = `
.memari-field:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: 2px;
}
/* A swatch carries two states at once - which shape is CHOSEN, and which
   button the keyboard is ON - and they are not the same thing, so they cannot
   share a ring. Selection is the accent, focus is white, focus wins while it
   lasts. Both are set here rather than inline because an inline outline beats
   a stylesheet one and a selected swatch would have eaten its own focus ring. */
.memari-swatch { outline: none; outline-offset: 2px; }
.memari-swatch[data-selected="true"] { outline: 2px solid ${ACCENT}; }
.memari-swatch:focus-visible { outline: 2px solid #ffffff; }
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
function GlyphSwatch({
  shape,
  label,
  selected,
  onPick,
}: {
  shape: GlyphShape;
  label: string;
  selected: boolean;
  onPick: () => void;
}) {
  // Drawn in a 100-unit box and shown at 34px. The viewBox does the scaling,
  // so the hairline stays proportionally what it is on the page.
  const markup = toSvg(
    glyphElement({ id: `swatch-${shape}`, x: 18, y: 18, sizePx: 64, shape, opacity: 1 }) as never
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
        width: 34,
        height: 34,
        padding: 0,
        border: "none",
        borderRadius: 5,
        background: "#fdfcf9",
        opacity: selected ? 1 : 0.65,
        cursor: "pointer",
        transition: "opacity 150ms ease-out",
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="34"
        height="34"
        style={{ display: "block", pointerEvents: "none" }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: markup }}
      />
    </button>
  );
}

export function ModuleFieldsForm({
  fields,
  values,
  onChange,
}: {
  fields: ModuleField[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
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
        if (field.kind === "note") {
          return (
            <p
              key={`note-${index}`}
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.6,
                color: "rgba(255, 255, 255, 0.5)",
              }}
            >
              {field.text}
            </p>
          );
        }

        if (field.kind === "boolean") {
          const on = values[field.key] === true;
          return (
            <label
              key={field.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                ...labelStyle,
              }}
            >
              {/* A switch, not a tick box. It reads as a state rather than a
                  choice you are making on a form, which is what it is. */}
              <span
                style={{
                  width: 34,
                  height: 20,
                  flexShrink: 0,
                  borderRadius: 10,
                  background: on ? ACCENT : "rgba(255,255,255,0.15)",
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
                    borderRadius: 8,
                    background: "#fff",
                    transition: "left 150ms ease-out",
                  }}
                />
              </span>
              <input
                type="checkbox"
                checked={on}
                onChange={(event) => onChange(field.key, event.target.checked)}
                // Off screen rather than display:none - a hidden input is
                // out of the accessibility tree and unreachable by keyboard,
                // which is the whole reason a real checkbox is here at all.
                style={{ position: "absolute", opacity: 0, width: 1, height: 1 }}
              />
              {field.label}
            </label>
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
          return (
            <label key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <select
                value={(values[field.key] as string | undefined) ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
                className="memari-field"
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {field.options.map((option) => (
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
                style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
              >
                {field.options.map((option) => (
                  <GlyphSwatch
                    key={option.value}
                    shape={option.value as GlyphShape}
                    label={option.label}
                    selected={values[field.key] === option.value}
                    onPick={() => onChange(field.key, option.value)}
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
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
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
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              />
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.35)" }}>
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

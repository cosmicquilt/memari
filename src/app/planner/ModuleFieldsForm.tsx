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

const ACCENT = "#4a5cff";

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "rgba(255, 255, 255, 0.6)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "7px 9px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#f2f2f2",
  background: "rgba(255, 255, 255, 0.06)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 7,
  outline: "none",
};

const rowStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: 6 };

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

        if (field.kind === "paragraph") {
          return (
            <label key={field.key} style={rowStyle}>
              <span style={labelStyle}>{field.label}</span>
              <textarea
                rows={field.rows ?? 5}
                value={(values[field.key] as string | undefined) ?? ""}
                onChange={(event) => onChange(field.key, event.target.value)}
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
              style={inputStyle}
            />
          </label>
        );
      })}
    </div>
  );
}

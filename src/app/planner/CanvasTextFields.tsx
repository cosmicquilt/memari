"use client";

// THE MODULE'S TEXT, EDITED WHERE IT PRINTS. A real text field laid exactly
// over each place lib/canvasText.ts finds - same face, size, alignment and
// capitals as the drawing - so hovering shows it is text, a click puts the
// caret where you clicked (it blinks there, as in any text field), and
// typing changes the drawing live. Asked 2026-09-30: "have them only
// editable through hovering the region it will display and clicking to edit
// text normally and live ... ideally with the blinking vertical bar
// indicating typing position as well".
//
// AT REST THE DRAWING SHOWS, not the field: every field's own text is
// transparent, so what you see is exactly what prints, cut-offs and all.
// Focused, the drawn text under it is hidden (the editor leaves it out) and
// the field's text shows in its place - the same letters where they print.
//
// NO HIGHLIGHT: no ring, no tint, no blue - asked 2026-09-30, "remove the
// blue highlight as well for the text". Text is edited as text is anywhere:
// the pointer turns to a text cursor over it, the caret blinks in the text's
// own ink, a selection is a neutral tint. The one hint is an empty place's
// faint placeholder on hover ("Add an item"), since otherwise nothing would
// say it is there.
//
// In CSS px OUTSIDE the preview's transform - the heading's field did this
// first; this is that field for everything.

import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MutableRefObject } from "react";
import type { CanvasSlot } from "@/lib/canvasText";


export type CanvasTextFieldsProps = {
  slots: CanvasSlot[];
  /** The module's box, in print px - where the preview is drawn from. */
  box: { x: number; y: number; width: number; height: number };
  scale: number;
  /** The paper around the preview, in CSS px. */
  pad: number;
  focusedId: string | null;
  /** Focus this place once it exists - a new item after Return. */
  pendingFocusId: string | null;
  onPendingFocusDone: () => void;
  onFocusChange: (id: string | null) => void;
  onText: (slot: CanvasSlot, text: string) => void;
  /** Return in a list item: a new item after it. */
  onEnterItem: (slot: CanvasSlot) => void;
  /** Leaving an item empty, or Backspace in one: it goes. */
  onRemoveItem: (slot: CanvasSlot, focusPrevious: boolean) => void;
  /** Which place's text field is the heading's, for the class the checks
   *  and the typing limit know it by. */
  headingSlotId: string | null;
};

/** The drawn text's ink: its fill at its own opacity. */
function inkOf(fill: string, opacity: number): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(fill);
  if (!hex) return fill;
  const n = parseInt(hex[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

function measureTextPx(text: string, fontSizePx: number, fontFamily: string): number {
  if (typeof document === "undefined" || !text || !(fontSizePx > 0)) return 0;
  const context = (measureTextPx as { context?: CanvasRenderingContext2D | null }).context ??=
    document.createElement("canvas").getContext("2d");
  if (!context) return 0;
  context.font = `${fontSizePx}px "${fontFamily}"`;
  return context.measureText(text).width;
}

export function CanvasTextFields(props: CanvasTextFieldsProps) {
  const refs = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement>());

  useEffect(() => {
    if (!props.pendingFocusId) return;
    const field = refs.current.get(props.pendingFocusId);
    if (!field) return;
    field.focus();
    const end = field.value.length;
    field.setSelectionRange(end, end);
    props.onPendingFocusDone();
  });

  return (
    <>
      <style>{`
        .memari-canvas-field::placeholder { color: transparent; }
        .memari-canvas-field::selection { background: rgba(35, 31, 32, 0.16); }
        .memari-canvas-field:hover::placeholder { color: var(--ghost-ink); }
        .memari-canvas-field:focus::placeholder { color: var(--rest-ink); }
      `}</style>
      {props.slots.map((slot) => (
        <CanvasTextField key={slot.id} slot={slot} refs={refs} {...props} />
      ))}
    </>
  );
}

function CanvasTextField({
  slot,
  refs,
  box,
  scale,
  pad,
  focusedId,
  onFocusChange,
  onText,
  onEnterItem,
  onRemoveItem,
  headingSlotId,
  slots,
}: CanvasTextFieldsProps & { slot: CanvasSlot; refs: MutableRefObject<Map<string, HTMLInputElement | HTMLTextAreaElement>> }) {
  const focused = focusedId === slot.id;
  const font = slot.font;
  const fontSize = font.sizePx * scale;
  const shown = slot.value || slot.placeholder;
  const measured = measureTextPx(font.uppercase ? shown.toUpperCase() : shown, fontSize, font.family) + 2;
  // As wide as its place, or as its text where the text is wider (the page
  // does not clip; a field does) - aligned as the text is, so every letter
  // stays where it prints. A stacked label becomes a line while edited.
  const placeWidth = slot.rect.width * scale;
  const width = slot.kind === "paragraph" ? placeWidth : Math.max(placeWidth, measured, focused ? 60 : 0);
  const left =
    pad +
    (slot.rect.x - box.x) * scale +
    (slot.kind === "paragraph"
      ? 0
      : font.align === "center"
      ? (placeWidth - width) / 2
      : font.align === "right"
      ? placeWidth - width
      : 0);
  const lineHeight = slot.kind === "paragraph" && font.lineHeightPx ? font.lineHeightPx * scale : fontSize * 1.2;
  const height = slot.kind === "paragraph" ? Math.max(slot.rect.height * scale, lineHeight) : fontSize * 1.2;
  // A stacked label's place is tall and one letter wide; edited, it is a line
  // at the middle of that place.
  const top = pad + (slot.rect.y - box.y) * scale + (slot.kind !== "paragraph" && slot.rect.height * scale > height * 1.5 ? (slot.rect.height * scale - height) / 2 : 0);

  const style: CSSProperties & Record<string, string | number> = {
    position: "absolute",
    left,
    top,
    width,
    height,
    margin: 0,
    padding: 0,
    border: "none",
    borderRadius: 2,
    resize: "none",
    overflow: "hidden",
    // Paper behind a stacked label while it is a line being typed, so the
    // plot's rules do not run through it; nothing anywhere else.
    background: focused && slot.rect.height * scale > height * 1.5 ? "#fdfcf9" : "transparent",
    outline: "none",
    fontFamily: font.family,
    fontSize,
    fontWeight: "normal",
    lineHeight: `${lineHeight}px`,
    textAlign: font.align,
    textTransform: font.uppercase ? "uppercase" : "none",
    // Transparent until focused: at rest the drawing is what shows.
    color: focused ? inkOf(font.fill, font.opacity) : "transparent",
    caretColor: inkOf(font.fill, 1),
    cursor: "text",
    whiteSpace: slot.kind === "paragraph" ? "pre-wrap" : "pre",
    // The placeholder: faint for a place nothing prints yet, in the page's
    // own ink for a module default ("TO - DO") that prints where it is empty.
    // On hover only where nothing prints yet: over a printed default ("Q2",
    // "TO - DO") it would draw the same words twice, darker.
    "--ghost-ink": slot.ghost ? "rgba(35, 31, 32, 0.38)" : "transparent",
    "--rest-ink": slot.ghost ? "rgba(35, 31, 32, 0.38)" : inkOf(font.fill, font.opacity),
  };

  const sameList = slots.filter((other) => other.key === slot.key && other.index !== null);
  const move = (by: number) => {
    const at = sameList.findIndex((other) => other.id === slot.id);
    const target = sameList[at + by];
    if (target) refs.current.get(target.id)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Escape is the editor's, as it was from the heading's field: it closes.
    if (slot.kind === "paragraph") return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (slot.kind === "item" && slot.value.trim()) onEnterItem(slot);
      else if (slot.kind === "item") move(1);
      else event.currentTarget.blur();
      return;
    }
    if (event.key === "Backspace" && slot.kind === "item" && !slot.isNew && event.currentTarget.value === "") {
      event.preventDefault();
      onRemoveItem(slot, true);
      return;
    }
    if (slot.kind === "item" && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
    }
  };

  const common = {
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (node) refs.current.set(slot.id, node);
      else refs.current.delete(slot.id);
    },
    "aria-label": slot.key === "heading" ? "Heading, on the page" : `${slot.key}${slot.index === null ? "" : ` ${slot.index + 1}`}, on the page`,
    "data-canvas-slot": slot.id,
    className: `memari-canvas-field${slot.id === headingSlotId ? " memari-heading-field" : ""}`,
    value: slot.value,
    placeholder: slot.placeholder,
    spellCheck: false,
    onChange: (event: { target: { value: string } }) => onText(slot, event.target.value),
    onKeyDown,
    onFocus: () => onFocusChange(slot.id),
    onBlur: () => {
      onFocusChange(null);
      if (slot.kind === "item" && !slot.isNew && !slot.value.trim()) onRemoveItem(slot, false);
    },
    style,
  };

  return slot.kind === "paragraph" ? <textarea {...common} /> : <input type="text" {...common} />;
}

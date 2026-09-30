// TEXT EDITED WHERE IT PRINTS - the places on a module's drawing where each
// of its text settings is drawn, found from the drawing itself.
//
// Asked 2026-09-30: "instead of typing things out in the side panel, have
// them only editable through hovering the region it will display and
// clicking to edit text normally and live". Each text field in the registry
// names the element that draws it (see CanvasText); this finds those
// elements, and where a value is empty and nothing is drawn, finds where it
// WOULD print by drawing the module once more with a placeholder written in
// - the ghost drawing. The editor lays a real text field over each place it
// returns, so a click puts the caret where you clicked and it blinks there.
//
// Pure, so every primitive's places can be checked without a browser - see
// canvasText.test.mts.

import type { CanvasList, CanvasText, ModuleField } from "./moduleRegistry";
import type { RenderedPolotnoElement } from "./renderModuleInstance";
import { estimateTextWidthPx } from "./modules/textFit";

type Rect = { x: number; y: number; width: number; height: number };

/** A text setting that says where it is drawn. */
export type CanvasField =
  | (Extract<ModuleField, { kind: "text" }> & { canvas: CanvasText })
  | (Extract<ModuleField, { kind: "paragraph" }> & { canvas: CanvasText })
  | (Extract<ModuleField, { kind: "lines" }> & { canvas: CanvasList });

export function canvasFields(fields: ModuleField[] | undefined): CanvasField[] {
  return (fields ?? []).filter(
    (field): field is CanvasField =>
      (field.kind === "text" || field.kind === "paragraph" || field.kind === "lines") && !!field.canvas
  );
}

/** One place on the drawing where a value is edited. */
export type CanvasSlot = {
  /** `heading`, or `levels#2` for a list's third item. */
  id: string;
  key: string;
  /** The item's index in its list, or null for a single value. */
  index: number | null;
  kind: "text" | "paragraph" | "item";
  /** The place after a list's last item: typing there adds one. */
  isNew: boolean;
  value: string;
  /** Shown when the value is empty: what the module prints in its place, or
   *  the field's own placeholder where it prints nothing. */
  placeholder: string;
  /** The drawn elements this place covers - hidden while it is edited, so
   *  the field's own text stands in for them. Empty for a ghost place. */
  elementIds: string[];
  /** Placed by the ghost drawing: nothing is printed there yet. */
  ghost: boolean;
  rect: Rect;
  font: {
    family: string;
    sizePx: number;
    align: "left" | "center" | "right";
    fill: string;
    /** The drawn text's own opacity - a to-do's items print lighter than
     *  its heading, and a field in a darker ink jumps a shade on a click. */
    opacity: number;
    /** The module prints it in capitals whatever is typed. */
    uppercase: boolean;
    /** Between one drawn line and the next, for a passage. */
    lineHeightPx: number | null;
  };
  /** The drawing shows less than the value - cut to fit its space. */
  truncated: boolean;
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function suffixes(canvas: CanvasText, index: number): string[] {
  const element = canvas.element;
  if (typeof element === "function") return [element(index)];
  return (Array.isArray(element) ? element : [element]).map((suffix) => suffix.replace("#", String(index)));
}

function find(elements: RenderedPolotnoElement[], instanceId: string, canvas: CanvasText, index: number): RenderedPolotnoElement[] {
  const texts = elements.filter((element) => element.type === "text");
  if (canvas.several) {
    const patterns = suffixes(canvas, index).map((suffix) => new RegExp(`^${escape(instanceId)}${suffix}$`));
    return texts.filter((element) => patterns.some((pattern) => pattern.test(String(element.id))));
  }
  for (const suffix of suffixes(canvas, index)) {
    const match = texts.find((element) => element.id === `${instanceId}${suffix}`);
    if (match) return [match];
  }
  return [];
}

function union(elements: RenderedPolotnoElement[]): Rect {
  const left = Math.min(...elements.map((e) => e.x ?? 0));
  const top = Math.min(...elements.map((e) => e.y ?? 0));
  const right = Math.max(...elements.map((e) => (e.x ?? 0) + (e.width ?? 0)));
  const bottom = Math.max(...elements.map((e) => (e.y ?? 0) + (e.height ?? Number(e.fontSize ?? 0) * 1.2)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Where a text's letters are, rather than its box - a table head's box is
 *  its whole column, and a place beside the letters is not on them. */
function inkOf(element: RenderedPolotnoElement): Rect {
  const box = union([element]);
  const ink = Math.min(box.width, estimateTextWidthPx(String(element.text ?? ""), Number(element.fontSize ?? 0)));
  const left = element.align === "center" ? box.x + (box.width - ink) / 2 : element.align === "right" ? box.x + box.width - ink : box.x;
  return { ...box, x: left, width: ink };
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

// What is STORED, not the schema's default: the renderer draws from the
// stored props alone, and a default it never sees (the totals label's
// "Total") would say a place is filled that prints nothing. Where the stored
// value is missing and the module prints something of its own, the drawing
// says so - see the placeholder.
function storedList(values: Record<string, unknown>, _defaults: Record<string, unknown> | undefined, key: string): string[] {
  const value = values[key];
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : "")) : [];
}

function storedText(values: Record<string, unknown>, _defaults: Record<string, unknown> | undefined, key: string): string {
  const value = values[key];
  return typeof value === "string" ? value : "";
}

/**
 * The values with every empty place written in as its placeholder, and one
 * item more on each list that can grow - drawn, it says where each would
 * print.
 */
export function ghostValues(
  fields: ModuleField[] | undefined,
  values: Record<string, unknown>,
  defaults?: Record<string, unknown>,
  /** Add the item after each list's last - for the places a new one would
   *  go. Without it, only the blanks are filled: an extra table column
   *  narrows every other, and a blank's place must be measured as it is. */
  next = true
): Record<string, unknown> {
  const out = { ...values };
  for (const field of canvasFields(fields)) {
    if (field.kind === "lines") {
      const list = storedList(values, defaults, field.key);
      // Empty and not positional: the module draws something of its own in
      // its place (a week's initials) or nothing at all; either way the
      // ghost adds one item, where a first item would go.
      const filled = list.map((item) => item.trim() || field.canvas.placeholder);
      if (field.canvas.add && next) filled.push(field.canvas.placeholder);
      out[field.key] = filled;
    } else if (!storedText(values, defaults, field.key).trim()) {
      out[field.key] = field.canvas.placeholder;
    }
  }
  return out;
}

export type CanvasPlaces = {
  slots: CanvasSlot[];
  /** Fields with no place on the drawing, which the panel keeps. */
  panelKeys: Set<string>;
  /** Each list as it is edited: the stored one, or - where the stored list
   *  is empty and the module prints items of its own (a week's initials) -
   *  those, so editing one keeps the rest. */
  lists: Record<string, string[]>;
};

/**
 * Every place a text setting can be edited on the drawing, in the order the
 * fields are declared.
 *
 * A value that is drawn is edited where it is drawn. One that is empty is
 * edited where the ghost drawing puts it - unless that lands on text the
 * module really prints (an optional heading whose band would push the
 * passage down), in which case it has no place yet and stays in the panel.
 */
export function canvasSlots(options: {
  fields: ModuleField[] | undefined;
  values: Record<string, unknown>;
  defaults?: Record<string, unknown>;
  real: RenderedPolotnoElement[];
  /** Drawn from ghostValues with `next` - where a new item would go. */
  ghost: RenderedPolotnoElement[];
  /** Drawn from ghostValues without it - where a blank item or an empty
   *  value would go. The ghost is used where this is not given. */
  ghostBlanks?: RenderedPolotnoElement[];
  instanceId: string;
}): CanvasPlaces {
  const { values, defaults, real, ghost, instanceId } = options;
  const ghostBlanks = options.ghostBlanks ?? ghost;
  const slots: CanvasSlot[] = [];
  const panelKeys = new Set<string>();
  const lists: Record<string, string[]> = {};
  const realTexts = real.filter((element) => element.type === "text");

  const place = (field: CanvasField, index: number | null, value: string, isNew: boolean): CanvasSlot | null => {
    const at = index ?? 0;
    const drawn = isNew ? [] : find(real, instanceId, field.canvas, at);
    const ghostOnly = drawn.length === 0;
    const elements = ghostOnly ? find(isNew ? ghost : ghostBlanks, instanceId, field.canvas, at) : drawn;
    if (elements.length === 0) return null;
    const rect = union(elements);
    // A ghost place's letters must be clear of every letter the module
    // really prints.
    if (ghostOnly) {
      const inks = elements.map(inkOf);
      const left = Math.min(...inks.map((r) => r.x));
      const top = Math.min(...inks.map((r) => r.y));
      const ink = {
        x: left,
        y: top,
        width: Math.max(...inks.map((r) => r.x + r.width)) - left,
        height: Math.max(...inks.map((r) => r.y + r.height)) - top,
      };
      if (realTexts.some((element) => overlaps(ink, inkOf(element)))) return null;
    }
    const first = elements[0];
    const drawnText = elements.map((element) => String(element.text ?? "")).join(field.kind === "paragraph" ? "\n" : "");
    const lineHeight = elements.length > 1 ? Math.abs((elements[1].y ?? 0) - (elements[0].y ?? 0)) || null : null;
    return {
      id: index === null ? field.key : `${field.key}#${index}`,
      key: field.key,
      index,
      kind: field.kind === "lines" ? "item" : field.kind,
      isNew,
      value,
      placeholder: !ghostOnly && !value.trim() ? drawnText : field.canvas.placeholder,
      elementIds: ghostOnly ? [] : elements.map((element) => String(element.id)),
      ghost: ghostOnly,
      rect,
      font: {
        family: String(first.fontFamily ?? ""),
        sizePx: Number(first.fontSize ?? 0),
        align: first.align === "center" || first.align === "right" ? first.align : "left",
        fill: String(first.fill ?? "#231F20"),
        opacity: typeof first.opacity === "number" ? first.opacity : 1,
        uppercase: /[A-Za-z]/.test(drawnText) && drawnText === drawnText.toUpperCase(),
        lineHeightPx: lineHeight,
      },
      truncated:
        !ghostOnly && field.kind !== "paragraph" && !field.canvas.several && /…$/.test(drawnText) && !/…$/.test(value),
    };
  };

  for (const field of canvasFields(options.fields)) {
    let placed = 0;
    if (field.kind !== "lines") {
      const slot = place(field, null, storedText(values, defaults, field.key), false);
      if (slot) {
        slots.push(slot);
        placed++;
      }
    } else {
      const from = field.canvas.from ?? 0;
      let list = storedList(values, defaults, field.key);
      // Empty, but printing items of its own: those are what is edited.
      if (list.length === 0 && !field.positional) {
        const own: string[] = [];
        while (find(real, instanceId, field.canvas, own.length).length > 0) {
          own.push(String(find(real, instanceId, field.canvas, own.length)[0].text ?? ""));
        }
        list = own;
      }
      lists[field.key] = list;
      // A positional list's places are the drawing's too - the icon strip
      // has as many label places as it draws strips.
      let last = list.length;
      if (field.positional) {
        while (find(real, instanceId, field.canvas, last).length > 0) last++;
      }
      for (let index = from; index < last; index++) {
        const slot = place(field, index, list[index] ?? "", false);
        if (slot) {
          slots.push(slot);
          placed++;
        }
      }
      if (field.canvas.add) {
        const slot = place(field, Math.max(from, list.length), "", true);
        if (slot) {
          slots.push(slot);
          placed++;
        }
      }
    }
    if (placed === 0) panelKeys.add(field.key);
  }
  return { slots, panelKeys, lists };
}

/** The values with one place's text changed. */
export function withSlotText(
  values: Record<string, unknown>,
  places: Pick<CanvasPlaces, "lists">,
  slot: Pick<CanvasSlot, "key" | "index">,
  text: string
): Record<string, unknown> {
  if (slot.index === null) return { ...values, [slot.key]: text };
  const list = [...(places.lists[slot.key] ?? [])];
  while (list.length < slot.index) list.push("");
  list[slot.index] = text;
  return { ...values, [slot.key]: list };
}

/** The values with a new, empty item after `index`, and its index. */
export function withItemAfter(
  values: Record<string, unknown>,
  places: Pick<CanvasPlaces, "lists">,
  key: string,
  index: number
): { values: Record<string, unknown>; index: number } {
  const list = [...(places.lists[key] ?? [])];
  while (list.length <= index) list.push("");
  list.splice(index + 1, 0, "");
  return { values: { ...values, [key]: list }, index: index + 1 };
}

/**
 * The values without an item: gone, with the ones after it up a place - or,
 * in a positional list, blank where it was.
 */
export function withoutItem(
  fields: ModuleField[] | undefined,
  values: Record<string, unknown>,
  places: Pick<CanvasPlaces, "lists">,
  key: string,
  index: number
): Record<string, unknown> {
  const field = canvasFields(fields).find((f) => f.key === key);
  const list = [...(places.lists[key] ?? [])];
  if (index >= list.length) return values;
  if (field?.kind === "lines" && field.positional) list[index] = "";
  else list.splice(index, 1);
  return { ...values, [key]: list };
}

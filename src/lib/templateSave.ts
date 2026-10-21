// What a Save button saves, and the key it is known by (2026-10-21) - shared
// by the server (app/planner/templateSaving.ts, which makes the saved item)
// and the buttons (app/planner/templateSaved.ts, which light up by key).
// Pure: no database, no React.

/** What a Save button saves. */
export type TemplateSave =
  | { kind: "planner"; key: string }
  | { kind: "layout"; key: string }
  | { kind: "module"; slug: string }
  | { kind: "layout-module"; key: string; slot: number };

/** Where a saved thing is listed: Saved > Journals, Pages or Modules. */
export type SavedWhere = "journals" | "pages" | "modules";

export function sourceKeyOf(save: TemplateSave): string {
  switch (save.kind) {
    case "planner":
      return `planner:${save.key}`;
    case "layout":
      return `layout:${save.key}`;
    case "module":
      return `module:${save.slug}`;
    case "layout-module":
      return `layout:${save.key}#${save.slot}`;
  }
}

/** A request body as a TemplateSave, or null - anything else is refused. */
export function parseTemplateSave(body: unknown): TemplateSave | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 120 ? v : null);
  if (b.kind === "planner" && text(b.key)) return { kind: "planner", key: text(b.key)! };
  if (b.kind === "layout" && text(b.key)) return { kind: "layout", key: text(b.key)! };
  if (b.kind === "module" && text(b.slug)) return { kind: "module", slug: text(b.slug)! };
  if (b.kind === "layout-module" && text(b.key) && Number.isInteger(b.slot) && (b.slot as number) >= 0 && (b.slot as number) < 200) {
    return { kind: "layout-module", key: text(b.key)!, slot: b.slot as number };
  }
  return null;
}

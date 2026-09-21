"use client";

// Editing one module, at a size you can actually see it.
//
// Asked for directly: click the edit control on a module and it "will expand
// the module to page size and create a container around it to further edit
// it" - text, and in time icons, column spacing and rule style.
//
// THE FIELDS ARE THE EDITOR. Every module already declares what it has to
// set - a `fields` array of text, paragraph, lines, number, boolean, select -
// and that has always been the data model for this. What was missing was a
// reader: the native editor had two hand-written inline editors chosen by
// SLUG, for the two modules somebody needed. Driving it off `fields` gives all
// 122 an editor and means a module added tomorrow arrives with one.
//
// THE PREVIEW IS THE MODULE, redrawn from the draft on every keystroke by the
// same renderModuleInstance the page uses. Not a mock-up and not a
// screenshot: if what you are editing could look different here from how it
// prints, this panel would be worth nothing.
//
// Design follows the timeline drawer's, which followed the research: a solid
// surface rather than a blurred one, a 2px accent ring with an offset rather
// than a border, controls that are permanently present and quiet rather than
// revealed on hover, and a spring rather than an ease.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { moduleDefinition, cleanPropsForSave } from "@/lib/moduleRegistry";
import { renderOnPage, type PageRenderContext } from "@/lib/renderContext";
import type { PageGrid } from "@/lib/grid";
import { gridCellToPixels } from "@/lib/grid";
import { flatten } from "@/lib/proofSvg";
import type { RenderedPolotnoElement } from "@/lib/renderModuleInstance";
import { PolotnoJsonRenderer } from "./PolotnoJsonRenderer";
import { ModuleFieldsForm } from "./ModuleFieldsForm";
import { updateModuleConfig } from "./actions";
import { useAsyncAction } from "./useAsyncAction";

const ACCENT = "#4a5cff";
const SURFACE = "#1c1c1e";
/** The widest the panel of fields gets. Beyond this a text input stops
 *  looking like a field and starts looking like a document. */
const FIELDS_WIDTH = 300;
const PADDING = 24;

export type EditingModule = {
  instanceId: string;
  slug: string;
  propValues: Record<string, unknown>;
  columnStart: number;
  rowStart: number;
  columnSpan: number;
  rowSpan: number;
};

export function ModuleEditor({
  editing,
  pageGrid,
  fontFamily,
  renderContext,
  onClose,
  onSaved,
}: {
  editing: EditingModule;
  pageGrid: PageGrid;
  fontFamily: string;
  /** The module's page's - see src/lib/renderContext.ts. The draft is the
   *  stored props; the preview shows them as the page prints them. */
  renderContext: PageRenderContext | null;
  onClose: () => void;
  /** The committed props, so the page behind can redraw without a reload. */
  onSaved: (instanceId: string, propValues: Record<string, unknown>) => void;
}) {
  const definition = moduleDefinition(editing.slug);
  const [draft, setDraft] = useState<Record<string, unknown>>(editing.propValues);
  const [pending, error, run] = useAsyncAction();
  const dirty = JSON.stringify(draft) !== JSON.stringify(editing.propValues);

  // Escape closes. A full-screen panel that can only be dismissed by finding
  // its own button is a trap, and this one covers the page you were editing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The module's own box, at the size it occupies on the page. Its geometry
  // is the page's, not a guess: a habit tracker changes layout below a width
  // and would lay out differently in a box of the wrong shape.
  const box = useMemo(
    () =>
      gridCellToPixels(pageGrid, {
        columnStart: editing.columnStart,
        rowStart: editing.rowStart,
        columnSpan: editing.columnSpan,
        rowSpan: editing.rowSpan,
      }),
    [pageGrid, editing.columnStart, editing.rowStart, editing.columnSpan, editing.rowSpan]
  );

  // Redrawn from the DRAFT, so the preview is what saving would produce.
  const elements = useMemo(
    () =>
      renderOnPage(
        {
          id: editing.instanceId,
          locked: true,
          columnStart: editing.columnStart,
          rowStart: editing.rowStart,
          columnSpan: editing.columnSpan,
          rowSpan: editing.rowSpan,
          propValues: draft,
          moduleType: { slug: editing.slug },
        },
        pageGrid,
        fontFamily,
        renderContext
      ),
    [draft, editing, pageGrid, fontFamily, renderContext]
  );

  // THE HEADING IS EDITED WHERE IT IS DRAWN - "it should allow you to edit
  // the title cleanly with a text hover". Every renderer that draws a
  // module's heading gives it the id `<instance>-heading` and reads it from
  // a `heading` text field, so when both are there the drawn heading gives
  // way to a real text field laid exactly over it: same face, same size,
  // same uppercase, same place. Hovering shows it is text; clicking puts
  // the caret where you clicked. It edits the same draft as the Heading
  // field beside it, so the two cannot disagree.
  const headingId = `${editing.instanceId}-heading`;
  const hasHeadingField = definition?.fields?.some((field) => field.kind === "text" && field.key === "heading") ?? false;
  const heading = useMemo(
    () =>
      hasHeadingField
        ? flatten(elements).find((element) => element.type === "text" && element.id === headingId) ?? null
        : null,
    [elements, hasHeadingField, headingId]
  );
  const drawnElements = useMemo(
    () => (heading ? withoutElement(elements, headingId) : elements),
    [elements, heading, headingId]
  );
  const [headingHovered, setHeadingHovered] = useState(false);
  const [headingFocused, setHeadingFocused] = useState(false);

  // Fit the module into whatever room is left beside the fields. Measured
  // from the viewport rather than assumed, because a module can be a sixth of
  // a page or the whole of it.
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });
  useEffect(() => {
    const sync = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  const frameWidth = Math.max(240, viewport.width - FIELDS_WIDTH - PADDING * 5);
  const frameHeight = Math.max(240, viewport.height - PADDING * 6);
  const scale = Math.min(frameWidth / box.width, frameHeight / box.height, 3);

  const save = () =>
    run(async () => {
      // Cleaned at SAVE, not on every keystroke - see cleanPropsForSave and
      // the `lines` field, where a blank line somebody is typing around has
      // to survive until they stop.
      const cleaned = cleanPropsForSave(editing.slug, draft);
      await updateModuleConfig(editing.instanceId, cleaned);
      onSaved(editing.instanceId, cleaned);
      onClose();
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${definition?.label ?? editing.slug}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: PADDING * 1.5,
        padding: PADDING,
        // A scrim, not a blur. The canvas behind is a flat pale page, so a
        // backdrop-filter would cost real GPU time to blur nothing - the same
        // reasoning the timeline drawer's surface follows.
        background: "rgba(0, 0, 0, 0.55)",
      }}
      onClick={(event) => {
        // The scrim dismisses; the panels do not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {/* THE MODULE, at a size you can see. On the page's own paper colour
          rather than on the dark chrome, because that is the ground it is
          designed against and a hairline reads differently on each. */}
      <div
        style={{
          width: box.width * scale,
          height: box.height * scale,
          flexShrink: 0,
          background: "#fdfcf9",
          // Square-cornered, as the palette cards are and for their reason:
          // the module's own outer border sits exactly on these bounds, so a
          // radius here would clip its real corners off.
          outline: `2px solid ${ACCENT}`,
          outlineOffset: 3,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* MAGNIFIED BY A TRANSFORM, as the canvas and the palette cards
            are. The renderer draws in print px - one SVG unit to one CSS
            px - and takes `scale` only for the hairline floor; it never
            enlarges anything itself. Without this the module drew at 1:1 in
            the top-left of a frame sized for `scale`: measured 438x437 in a
            604x604 frame, the "white space outside it" that was reported. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: box.width,
            height: box.height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <PolotnoJsonRenderer
            elements={drawnElements}
            originX={box.x}
            originY={box.y}
            scale={scale}
            suppressOuterBorderSize={null}
            textElements={null}
          />
        </div>

        {/* The heading, as a field. In CSS px OUTSIDE the transform, so its
            hover ring is a real 1px at any magnification rather than one
            print px scaled up. Its box is the renderer's text box exactly:
            one line, 1.2em tall, from the element's top - which is how the
            renderer draws every heading, wrapped or not - so nothing moves
            when the caret arrives. */}
        {heading && (
          <input
            type="text"
            aria-label="Heading, on the page"
            className="memari-heading-field"
            value={String(draft.heading ?? "")}
            // An UNSET heading prints its module's default - the to-do's
            // "TO - DO", a mini month's month name - so an empty field shows
            // what the renderer drew for it, in the same ink, where it
            // prints. Typing replaces it, exactly as it would on paper.
            placeholder={heading.text ?? ""}
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({ ...current, heading: value }));
            }}
            onKeyDown={(event) => {
              // A heading is one line; Return means done with it.
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onPointerEnter={() => setHeadingHovered(true)}
            onPointerLeave={() => setHeadingHovered(false)}
            onFocus={() => setHeadingFocused(true)}
            onBlur={() => setHeadingFocused(false)}
            style={{
              position: "absolute",
              left: ((heading.x ?? 0) - box.x) * scale,
              top: ((heading.y ?? 0) - box.y) * scale,
              width: (heading.width ?? 0) * scale,
              height: (heading.fontSize ?? 0) * 1.2 * scale,
              margin: 0,
              padding: 0,
              border: "none",
              borderRadius: 2,
              background: headingFocused
                ? "rgba(74, 92, 255, 0.07)"
                : headingHovered
                ? "rgba(74, 92, 255, 0.04)"
                : "transparent",
              // The ring sits OUTSIDE the text's box, so the text itself
              // stays exactly where the page prints it.
              outline: `1px solid ${
                headingFocused ? ACCENT : headingHovered ? "rgba(74, 92, 255, 0.5)" : "transparent"
              }`,
              outlineOffset: 3,
              fontFamily: heading.fontFamily,
              fontSize: (heading.fontSize ?? 0) * scale,
              fontWeight: "normal",
              lineHeight: 1.2,
              letterSpacing: (heading.letterSpacing as CSSProperties["letterSpacing"]) ?? "normal",
              textAlign: (heading.align as CSSProperties["textAlign"]) ?? "left",
              textTransform: "uppercase",
              color: heading.fill ?? "#000000",
              caretColor: ACCENT,
              cursor: "text",
              transition: "outline-color 120ms ease-out, background 120ms ease-out",
            }}
          />
        )}
      </div>

      <div
        style={{
          width: FIELDS_WIDTH,
          maxHeight: "100%",
          display: "flex",
          flexDirection: "column",
          background: SURFACE,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 12,
          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.5)",
          color: "#ddd",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <strong style={{ flex: 1, minWidth: 0, fontSize: 13, color: "#fff" }}>
            {definition?.label ?? editing.slug}
          </strong>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 24,
              height: 24,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              border: "none",
              borderRadius: 12,
              background: "transparent",
              color: "rgba(255,255,255,0.5)",
              cursor: "pointer",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M5 5l14 14M19 5L5 19"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          <ModuleFieldsForm
            fields={definition?.fields ?? []}
            values={draft}
            onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
          />
        </div>

        <footer
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {error && (
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#ff8f5c" }}>{error}</span>
          )}
          {!error && (
            <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              {dirty ? "Unsaved" : "Saved"}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              borderRadius: 7,
              background: dirty ? ACCENT : "rgba(255,255,255,0.1)",
              color: dirty ? "#fff" : "rgba(255,255,255,0.4)",
              cursor: pending || !dirty ? "default" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving…" : "Done"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** The element list without one element, wherever it sits - groups included,
 *  since a module that is not locked arrives wrapped in one. */
function withoutElement(elements: RenderedPolotnoElement[], id: string): RenderedPolotnoElement[] {
  return elements
    .filter((element) => element.id !== id)
    .map((element) =>
      element.type === "group" ? { ...element, children: withoutElement(element.children ?? [], id) } : element
    );
}

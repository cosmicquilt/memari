// Where a panel anchored to a control actually goes.
//
// Pure arithmetic, in its own file, because it has now been got wrong twice
// and the second time was invisible.
//
// THE FIRST TIME the panel was a child of the timeline's horizontal
// scroller, which clips on both axes whatever the overflow values say, so it
// drew itself entirely outside the visible region and only the bleed of its
// shadow showed. Its `position: fixed` scrim did not vanish with it, so
// clicking the control swallowed every click on the canvas while showing
// nothing. Fixed by portalling to the body and positioning from the
// control's measured rect.
//
// THE SECOND TIME is why this file exists. That fix clamped the panel to the
// viewport HORIZONTALLY and not vertically:
//
//     left:   Math.max(8, Math.min(rect.right - w, innerWidth - w - 8))
//     bottom: window.innerHeight - rect.top + 10          <- unclamped
//
// The panel's bottom edge sits ten pixels above the control and grows
// upward. Once the control is within ten pixels of the top of the viewport,
// that bottom edge is ABOVE the top of the viewport and the whole panel is
// off screen; below about 330 it is cut in half. The timeline's cogs ride up
// with the drawer, so dragging the drawer tall on a short viewport reaches
// it - and what you see is a control that does nothing when you click it,
// which is the same symptom as the first bug and a different cause.
//
// So: flip to whichever side of the control has more room, and cap the
// height at the room that side actually has. The panel scrolls
// (`overflowY: auto`), so a capped panel is short rather than clipped.

/** Clear of the viewport's own edges. */
export const PANEL_EDGE_GAP = 8;
/** Between the panel and the control it belongs to. */
export const PANEL_ANCHOR_GAP = 10;
/** As tall as the panel ever gets when there is room for it. */
export const PANEL_MAX_HEIGHT = 320;

export type AnchorRect = { top: number; bottom: number; right: number };
export type Viewport = { width: number; height: number };

export type PanelPlacement = {
  left: number;
  /** Which edge `offset` is measured from. Above the control when there is
   *  room, which is the common case: these panels hang off a drawer at the
   *  bottom of the screen. */
  place: "above" | "below";
  /** `bottom` when placed above, `top` when placed below. */
  offset: number;
  maxHeight: number;
};

/**
 * @param anchor   the control's rect, in viewport coordinates.
 * @param viewport `window.innerWidth` / `innerHeight`.
 * @param width    the panel's own width, which the caller fixes.
 */
export function placeAnchoredPanel(
  anchor: AnchorRect,
  viewport: Viewport,
  width: number
): PanelPlacement {
  const above = anchor.top - PANEL_ANCHOR_GAP - PANEL_EDGE_GAP;
  const below = viewport.height - anchor.bottom - PANEL_ANCHOR_GAP - PANEL_EDGE_GAP;

  // Ties go UP, so the ordinary case - a cog in a resting drawer, with most
  // of the window above it - keeps the behaviour it already had.
  const placeAbove = above >= below;
  const room = Math.max(0, placeAbove ? above : below);

  return {
    // Right-aligned with the control, which for a cog sits in its box's
    // top-right corner: the panel opens back over its own level rather than
    // out over the next one. Kept on screen either way.
    left: Math.max(PANEL_EDGE_GAP, Math.min(anchor.right - width, viewport.width - width - PANEL_EDGE_GAP)),
    place: placeAbove ? "above" : "below",
    offset: placeAbove
      ? viewport.height - anchor.top + PANEL_ANCHOR_GAP
      : anchor.bottom + PANEL_ANCHOR_GAP,
    maxHeight: Math.min(PANEL_MAX_HEIGHT, room),
  };
}

/**
 * The panel's own rect, given a placement - what the browser will lay out.
 *
 * Only a check needs this: the point of the placement is that the panel
 * lands on screen, and that is a statement about the RECTANGLE, not about
 * the CSS. Written beside the rule it verifies so the two cannot describe
 * different geometry.
 *
 * @param contentHeight how tall the content wants to be. The panel is the
 *   smaller of this and the placement's cap.
 */
export function panelRect(
  placement: PanelPlacement,
  viewport: Viewport,
  width: number,
  contentHeight = PANEL_MAX_HEIGHT
): { top: number; bottom: number; left: number; right: number } {
  const height = Math.min(contentHeight, placement.maxHeight);
  const top =
    placement.place === "above"
      ? viewport.height - placement.offset - height
      : placement.offset;
  return { top, bottom: top + height, left: placement.left, right: placement.left + width };
}

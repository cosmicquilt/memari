// The module editor's shared look.

/*
 * THE EDITOR'S CORNERS ARE APPLE'S - asked 2026-10-01, "for the corner radius
 * of the editor can you just try whatever apple uses", after 4px ("small")
 * and then 5px everywhere. Apple does not use one radius: macOS 27's AppKit,
 * measured at 2x, rounds a control (button, field, pop-up) 6pt and a menu,
 * box or overlay 12pt; a menu item's highlight is 7pt, which is 12 less its
 * 5pt margin. That last is the rule under all of it (WWDC25, "Get to know the
 * new design system"): a shape inside another is CONCENTRIC, the outer radius
 * less the padding between them, so the two curves stay parallel. And what
 * Apple draws as a capsule - a switch, a grabber - stays a capsule.
 *
 * THEN TUNED BY EYE (2026-10-01): Andrew set these on a page of sliders over
 * the progress meter's panel and pasted back panel 14, controls 3, pictures
 * 1, switches as capsules. Apple's structure, his numbers.
 */

/** The panel, and anything that floats over the page like it (the icon chooser). */
export const PANEL_RADIUS = 14;

/** A field, a button, a stepper, a segmented control. */
export const CONTROL_RADIUS = 3;

/** A shape inset `padding` inside one rounded `outer`: concentric with it. */
export function concentric(outer: number, padding: number): number {
  return Math.max(0, outer - padding);
}

/**
 * THE PREVIEWS INSIDE IT - the drawn pictures a picker chooses between, and
 * the timeline's page cards - and so their selection rings: "make it even
 * smaller for the preview and selection within" (2026-09-30). A ring is an
 * outline 2px out, and an outline's corner is the element's radius plus its
 * offset, so these 1px corners carry 3px rings. Not Apple's: pictures of
 * paper, whose corners are square.
 */
export const PREVIEW_RADIUS = 1;

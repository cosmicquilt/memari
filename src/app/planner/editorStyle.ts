// The module editor's shared look.

/**
 * EVERY CORNER IN THE MODULE EDITOR - the panel, its fields, steppers,
 * switches and buttons, the table's divider handles. Asked for small
 * (2026-09-30, "change the border radius of all of the module editor ui to
 * small": 4px), then "a bit higher" - "dont increase it fully back to its
 * original, just a bit more than now": 5px (it had been 7 on the fields and
 * 12 on the panel). Something nested inside a rounded thing (a switch's knob)
 * takes this less its inset, so the curves stay parallel.
 */
export const EDITOR_RADIUS = 5;

/**
 * THE PREVIEWS INSIDE IT - the drawn pictures a picker chooses between, and
 * the timeline's page cards - and so their selection rings: "make it even
 * smaller for the preview and selection within" (2026-09-30). A ring is an
 * outline 2px out, and an outline's corner is the element's radius plus its
 * offset, so these 1px corners carry 3px rings.
 */
export const PREVIEW_RADIUS = 1;

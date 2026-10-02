/**
 * THE APP'S WHITE IS CREAM (2026-10-01).
 *
 * Andrew: "adapt the cream white color from the landing page on every white
 * within the entire app, canvas background should be a darker version of
 * that landing page 'white'". Asked whether that took in the pages
 * themselves, and the panels' greys: pages cream too, and the greys warmed
 * to match.
 *
 * The value is the landing page's --cream (landing.module.css), sampled from
 * the lit pages of the hero's journal. CSS cannot import this, so that file
 * carries the same value; change both together.
 *
 * What does NOT change: what prints. The PDF has no page fill - the paper
 * is the stock - and the modules' own drawing colours (an event's fill
 * blended against paper, hourlyGridCore's PAPER) are print colours.
 */
export const CREAM_RGB = [245, 234, 213] as const;
export const CREAM = "#f5ead5";

/** Cream at an opacity - what rgba(255, 255, 255, a) was, on the dark
 *  chrome: text, hairlines and fills that let the panel through. */
export function cream(alpha: number): string {
  return alpha >= 1 ? CREAM : `rgba(${CREAM_RGB.join(", ")}, ${alpha})`;
}

/**
 * A neutral grey's place in the cream: the same lightness relative to the
 * app's white as the grey had to pure white, in the cream's warm tone. So a
 * field fill a few percent darker than a white panel is the same few percent
 * darker than a cream one, instead of a cold grey patch on it.
 *
 * `grey` is the channel value of the grey it replaces - 0xf2 for #f2f2f2.
 */
export function onCream(grey: number): string {
  const k = Math.max(0, Math.min(255, grey)) / 255;
  return "#" + CREAM_RGB.map((c) => Math.round(c * k).toString(16).padStart(2, "0")).join("");
}

/** The canvas round the pages: the darker cream, the step #e8e8e8 was below
 *  white. */
export const CANVAS_CREAM = onCream(0xe8);

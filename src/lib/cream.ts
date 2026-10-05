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
 *
 * HOW MUCH CREAM (2026-10-05). Andrew: "I actually like the white grey
 * color better than the current cream... add slider from all the cream
 * colors, I want it to be more subtle". Every warm colour in the app comes
 * from CREAM_RGB, so one number sets them all: CREAM_STRENGTH runs from 0
 * (white, and the greys neutral - the app before 1 October) to 1 (the
 * landing page's cream). He picks it on a slider page made from the app at
 * both ends. globals.css --background carries the result; change both.
 */
/** The landing page's cream, at full strength. */
const FULL_CREAM = [245, 234, 213] as const;
/** 0 is white, 1 the landing's cream. */
export const CREAM_STRENGTH = 1;
export const CREAM_RGB = FULL_CREAM.map((c) => Math.round(255 + (c - 255) * CREAM_STRENGTH)) as unknown as readonly [number, number, number];
export const CREAM = "#" + CREAM_RGB.map((c) => c.toString(16).padStart(2, "0")).join("");

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

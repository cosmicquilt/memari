/**
 * The window size the editor last measured, remembered in a cookie so the
 * SERVER can render the canvas at the zoom it is actually going to have.
 *
 * Why this exists. The canvas's zoom is a function of the window's width,
 * and the server has no window. It used to render the first frame for a
 * guessed 1200 x 800, and an effect corrected it once the page's script had
 * loaded - so every load and every refresh opened at the wrong zoom and then
 * jumped. Measured on the weekly spread: the first frame at scale(0.2648),
 * "26%", settling to 28% on Andrew's window and 22% on a 1024-wide one.
 *
 * With this, a refresh in the same window renders the right zoom from the
 * first frame. A first visit, or a window resized since the last one, is
 * caught by VIEWPORT_GUARD_SCRIPT before anything paints, and the canvas
 * stays hidden until the real size is applied - so it still appears once, at
 * its final zoom, rather than at a guess.
 *
 * One cookie name, one format, and the script is built from both here, so
 * the server's reading and the script's cannot drift apart.
 */

export const VIEWPORT_COOKIE = "memari-viewport";

export type ViewportSize = { width: number; height: number };
/** The size AND the display's pixel ratio - see DPR_SCALE. */
export type Viewport = ViewportSize & { dpr: number };

/**
 * The ratio is carried as a whole number of hundredths (300 for a 3x
 * display, 150 for a 1.5x one).
 *
 * The cookie is compared for equality by an inline script that has to be
 * tiny, and comparing `2.25` as text is a trap - "2.250" and "2.25" are the
 * same ratio and different strings. Integers cannot do that.
 */
const DPR_SCALE = 100;
export const dprToCookie = (dpr: number) => Math.round((dpr || 1) * DPR_SCALE);

const FORMAT = /^(\d{2,5})x(\d{2,5})@(\d{2,4})$/;

/**
 * NO RATIO, NO MATCH. A cookie written before the ratio was part of it
 * parses as null, which is the same path as a first visit: the guard script
 * flags the page and the canvas stays hidden until the editor measures. A
 * default of 1 here would instead render a 3x display's hairlines at three
 * device pixels and call it correct.
 */
export function parseViewportCookie(value: string | undefined | null): Viewport | null {
  const match = FORMAT.exec(value ?? "");
  return match
    ? { width: Number(match[1]), height: Number(match[2]), dpr: Number(match[3]) / DPR_SCALE }
    : null;
}

export function writeViewportCookie(size: ViewportSize, dpr: number): void {
  document.cookie =
    `${VIEWPORT_COOKIE}=${size.width}x${size.height}@${dprToCookie(dpr)}` +
    `; path=/; max-age=31536000; samesite=lax`;
}

/** On <html> while the page on screen was rendered for some other window
 *  size. globals.css hides the canvas under it; the editor removes it in the
 *  same layout pass that applies the measured size. */
export const VIEWPORT_UNMEASURED_ATTRIBUTE = "data-memari-viewport-unmeasured";

/**
 * Inline, blocking, in <head>: runs before the body paints. Compares the
 * window against the size the server rendered for - the cookie the server
 * read - and flags the page if they differ or there was none.
 */
export const VIEWPORT_GUARD_SCRIPT =
  `(function(){var m=document.cookie.match(/(?:^|; )${VIEWPORT_COOKIE}=(\\d+)x(\\d+)@(\\d+)(?:;|$)/);` +
  `if(!m||+m[1]!==innerWidth||+m[2]!==innerHeight||+m[3]!==Math.round((devicePixelRatio||1)*${DPR_SCALE}))` +
  `document.documentElement.setAttribute("${VIEWPORT_UNMEASURED_ATTRIBUTE}","")})()`;

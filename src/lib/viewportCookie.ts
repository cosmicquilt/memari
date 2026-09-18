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

const FORMAT = /^(\d{2,5})x(\d{2,5})$/;

export function parseViewportCookie(value: string | undefined | null): ViewportSize | null {
  const match = FORMAT.exec(value ?? "");
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

export function writeViewportCookie(size: ViewportSize): void {
  document.cookie = `${VIEWPORT_COOKIE}=${size.width}x${size.height}; path=/; max-age=31536000; samesite=lax`;
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
  `(function(){var m=document.cookie.match(/(?:^|; )${VIEWPORT_COOKIE}=(\\d+)x(\\d+)(?:;|$)/);` +
  `if(!m||+m[1]!==innerWidth||+m[2]!==innerHeight)` +
  `document.documentElement.setAttribute("${VIEWPORT_UNMEASURED_ATTRIBUTE}","")})()`;

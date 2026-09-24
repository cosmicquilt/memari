// The Veo clip of the journal opening (Andrew, 2026-09-23), and where the
// journal's pages lie in its last frame - the frame the layouts are drawn
// onto once it has stopped.
//
// The take is "new 4" (handoff/veo/output/new): Veo's 720p output, upscaled
// to 4K with SeedVR2 and given three FILM in-between frames per pair of
// frames (handoff/veo/tools/memari_upscale.ipynb). The site's files are not
// that as it came: its start and end are eased to rest, the output running
// longer than the take (5.9s against 4s), the slow stretches drawn from the
// in-between frames ("the last and beginning seconds are not still ... ease
// both"); and on the frames the layouts are drawn over, the journal's own dot
// grid is taken off its pages ("once you start overlaying ... cover the
// underlying dot grid"), keeping the paper's light and the leaf shadows - so
// the layouts' grid is the only one. Made in the browser with WebCodecs - the
// tool, and the call used, are in handoff/veo/tools/ (gitignored).
//
// Two sizes of the same film: 2560 x 1440 for most screens, and 4K where the
// screen has the pixels to show it (media4k). Everything below is measured in
// the 4K frame's pixels.
//
// Measured from its last frame: each page's outer and gutter edges as
// straight lines, and its top and bottom edges sampled every 48px - they
// arch, high mid-page and low at the corners and the gutter, as a thick
// book's pages curve into its spine. Beyond the right page's outer edge is a
// strip of page edges, about 50px wide; the outline stops at the page, so
// nothing is drawn on the stack.
//
// A new clip means new numbers: capture its last frame and, per column, find
// where the bright page begins (luminance over 130 and not wood-coloured:
// (R - B) / R under 0.33), in a window about the edge - sunlit wood above the
// pages can pass the test. The right edge is where the page's brightness
// first dips, scanning in from the cover's dark board.

export const HERO_VIDEO = {
  src: "/landing/hero-open.mp4",
  src4k: "/landing/hero-open-4k.mp4",
  /** Screens with the device pixels for the 4K film: about 2,900 across. */
  media4k: "(min-width: 1450px) and (min-resolution: 2dppx), (min-width: 1930px) and (min-resolution: 1.5dppx), (min-width: 2900px)",
  /** Shown while the clip loads, and where it begins. */
  first: "/landing/hero-open-first.jpg",
  /** The resting frame: shown instead of the clip for reduced motion. */
  last: "/landing/hero-open-last.jpg",
  width: 3840,
  height: 2160,
  /** When the layouts appear, in the file's seconds: as it comes to rest,
   *  about a second after the book has landed open ("after it is open a
   *  second or two of it then start overlaying the pages"). Frame 138 of
   *  141, the first with the dot grid cleaned off. */
  drawFrom: 138 / 24,
};

export type Point = readonly [x: number, y: number];

/** A page's outline in the frame. `a` is its left edge as the page's own
 *  picture has it, `b` its right; top and bottom run from a to b. */
export type PageOutline = {
  aTop: Point;
  aBottom: Point;
  bTop: Point;
  bBottom: Point;
  top: Point[];
  bottom: Point[];
};

const GUTTER_TOP: Point = [1920, 709];
const GUTTER_BOTTOM: Point = [1921, 1825];

export const PAGE_OUTLINES: { left: PageOutline; right: PageOutline } = {
  left: {
    aTop: [1083, 710],
    aBottom: [1021, 1823],
    bTop: GUTTER_TOP,
    bBottom: GUTTER_BOTTOM,
    top: [
      [1152, 705], [1200, 701], [1248, 698], [1296, 694], [1344, 690], [1392, 686], [1440, 681], [1488, 677], [1536, 673],
      [1584, 669], [1632, 667], [1680, 666], [1728, 667], [1776, 669], [1824, 676], [1872, 686], [1896, 695],
    ],
    bottom: [
      [1152, 1818], [1200, 1816], [1248, 1815], [1296, 1812], [1344, 1810], [1392, 1807], [1440, 1805], [1488, 1803], [1536, 1801],
      [1584, 1799], [1632, 1798], [1680, 1798], [1728, 1799], [1776, 1801], [1824, 1805], [1872, 1811], [1896, 1816],
    ],
  },
  right: {
    aTop: GUTTER_TOP,
    aBottom: GUTTER_BOTTOM,
    bTop: [2718, 699],
    bBottom: [2781, 1813],
    top: [
      [1944, 701], [1968, 692], [2016, 681], [2064, 674], [2112, 670], [2160, 669], [2208, 669], [2256, 670], [2304, 673],
      [2352, 676], [2400, 679], [2448, 683], [2496, 686], [2544, 689], [2592, 691], [2640, 694], [2688, 697],
    ],
    bottom: [
      [1944, 1820], [1968, 1815], [2016, 1808], [2064, 1804], [2112, 1800], [2160, 1798], [2208, 1797], [2256, 1798], [2304, 1799],
      [2352, 1801], [2400, 1802], [2448, 1804], [2496, 1806], [2544, 1807], [2592, 1809], [2640, 1811], [2688, 1812],
    ],
  },
};

/** The spread's middle, in the frame: where a phone centres the picture. */
export const SPREAD_CENTRE: Point = [1920, 1250];
/** How much of the frame a phone fits across its width: the spread cover to
 *  cover (about 1,795px) and a sliver of desk either side. */
export const SPREAD_WIDTH = 1840;

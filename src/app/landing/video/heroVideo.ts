// The Veo clip of the journal opening (Andrew, 2026-09-23), and where the
// journal's pages lie in its last frame - the frame the layouts are drawn
// onto once it has stopped.
//
// The take is "new 4" (handoff/veo/output/new): Veo's 720p output, upscaled
// to 4K with SeedVR2 and given three FILM in-between frames per pair of
// frames (handoff/veo/tools/memari_upscale.ipynb). The site's files are not
// that as it came:
// - only its first 71 frames (2.96s): the book drifts sideways into place
//   over its last second ("trim the end ... to 3.18 s ... some unnatural
//   movement of the book at the end", then "trim ... to 2.96, still some
//   unnatural movement at end", 2026-09-25);
// - its start and end eased to rest, the output running longer than that
//   (4.6s), the slow stretches drawn from the in-between frames ("the last
//   and beginning seconds are not still ... ease both");
// - the tea's steam taken out ("make the vapor ... almost invisible", then
//   "make the steam fully invisible"), against a steam-free plate of that
//   corner;
// - on the frames the layouts are drawn over, the journal's own dot grid
//   taken off its pages ("once you start overlaying ... cover the
//   underlying dot grid"), keeping the paper's light and the leaf shadows -
//   so the layouts' grid is the only one.
// Made in the browser with WebCodecs - the tool, and the call used, are in
// handoff/veo/tools/ (gitignored).
//
// Two sizes of the same film: 2560 x 1440 for most screens, and 4K where the
// screen has the pixels to show it (media4k). Everything below is measured in
// the 4K frame's pixels.
//
// Measured from its last frame (the take's frame 70 - moved there from frame
// 75's outline by matching the image around each point): each page's outer and
// gutter edges as straight lines, and its top and bottom edges sampled every
// 48px - they arch, high mid-page and low at the corners and the gutter, as a
// thick book's pages curve into its spine. Beyond the right page's outer edge is a
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
  /** When the layouts appear, in the file's seconds: as it comes to rest
   *  ("after it is open a second or two of it then start overlaying the
   *  pages"). Frame 108 of 111, the first with the dot grid cleaned off. */
  drawFrom: 108 / 24,
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

const GUTTER_TOP: Point = [1933, 706];
const GUTTER_BOTTOM: Point = [1934, 1820];

export const PAGE_OUTLINES: { left: PageOutline; right: PageOutline } = {
  left: {
    aTop: [1102, 697],
    aBottom: [1044, 1811],
    bTop: GUTTER_TOP,
    bBottom: GUTTER_BOTTOM,
    top: [
      [1162, 691], [1210, 687], [1258, 683], [1306, 678], [1354, 673], [1402, 669], [1450, 663], [1498, 657], [1547, 652],
      [1595, 650], [1643, 648], [1691, 648], [1739, 649], [1787, 653], [1835, 662], [1883, 675], [1907, 687],
    ],
    bottom: [
      [1164, 1806], [1212, 1804], [1260, 1801], [1308, 1798], [1356, 1796], [1404, 1794], [1452, 1792], [1499, 1790], [1547, 1789],
      [1595, 1788], [1643, 1787], [1691, 1788], [1739, 1790], [1787, 1793], [1835, 1798], [1883, 1805], [1907, 1812],
    ],
  },
  right: {
    aTop: GUTTER_TOP,
    aBottom: GUTTER_BOTTOM,
    bTop: [2733, 699],
    bBottom: [2794, 1813],
    top: [
      [1955, 699], [1979, 691], [2027, 680], [2075, 675], [2123, 671], [2171, 669], [2219, 669], [2267, 670], [2315, 673],
      [2364, 677], [2412, 680], [2460, 684], [2508, 687], [2556, 689], [2604, 692], [2652, 695], [2700, 697],
    ],
    bottom: [
      [1955, 1818], [1979, 1813], [2027, 1806], [2075, 1801], [2123, 1798], [2171, 1796], [2219, 1796], [2267, 1796], [2315, 1796],
      [2363, 1799], [2411, 1801], [2459, 1803], [2507, 1805], [2555, 1807], [2603, 1809], [2651, 1810], [2699, 1812],
    ],
  },
};

/** The spread's middle, in the frame: where a phone centres the picture. */
export const SPREAD_CENTRE: Point = [1933, 1248];
/** How much of the frame a phone fits across its width: the spread cover to
 *  cover (about 1,795px) and a sliver of desk either side. */
export const SPREAD_WIDTH = 1840;

// The Veo clip of the journal opening (Andrew, 2026-09-23), and where the
// journal's pages lie in its last frame - the frame the layouts are drawn
// onto once it has stopped.
//
// The take is the third (handoff/veo/output, ...133232.mp4: dot-grid pages,
// "which is better"; its steam is already faint, as Andrew wanted it). The
// file is not Veo's as it came: its start and end are eased to rest, the
// output running longer than the take (6.35s against 4.5s), neighbouring
// frames cross-faded where it is slow ("the last and beginning seconds are
// not still ... ease both"); and from the frame the layouts appear on, the
// journal's own dot grid is taken off its pages ("once you start overlaying
// ... cover the underlying dot grid"), keeping the paper's light and the
// moving leaf shadows - so the layouts' grid is the only one. Made in the
// browser with WebCodecs and a small MP4 writer - the tool, and the calls
// used, are in handoff/veo/tools/ (gitignored).
//
// Measured from that frame (1920 x 1080): each page's outer and gutter
// edges as straight lines, and its top and bottom edges sampled every 24px
// - they arch, high mid-page and low at the corners and the gutter, as a
// thick book's pages curve into its spine. The outer corners sit inside the
// strip of page edges Veo drew beyond the right page, so nothing is drawn on
// the stack's edge.
//
// A new clip means new numbers: capture its last frame, scan each column
// for where the bright page meets the wood (a pixel is paper where
// min(R, G) > 160 and R + G + B > 480), and read the corners off a zoom.

export const HERO_VIDEO = {
  src: "/landing/hero-open.mp4",
  /** Shown while the clip loads, and where it begins. */
  first: "/landing/hero-open-first.jpg",
  /** The resting frame: shown instead of the clip for reduced motion. */
  last: "/landing/hero-open-last.jpg",
  width: 1920,
  height: 1080,
  /** When the layouts appear, in the file's seconds: 1.3s of the take after
   *  the book has landed open ("after it is open a second or two of it
   *  then start overlaying the pages") - the take's 3.8s, eased, put on a
   *  frame boundary: frame 112, the first with the dot grid cleaned off.
   *  Its pages have not moved since the take's 3.5s; the leaf shadows and
   *  the steam go on moving under the drawing until the clip settles. */
  drawFrom: 112 / 24,
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

const GUTTER_TOP: Point = [961, 353];
const GUTTER_BOTTOM: Point = [963, 911];

export const PAGE_OUTLINES: { left: PageOutline; right: PageOutline } = {
  left: {
    aTop: [542, 352],
    aBottom: [511, 908],
    bTop: GUTTER_TOP,
    bBottom: GUTTER_BOTTOM,
    top: [
      [560, 356], [584, 352], [608, 351], [632, 349], [656, 347], [680, 345], [704, 343], [728, 340], [752, 338],
      [776, 336], [800, 335], [824, 334], [848, 334], [872, 334], [896, 336], [920, 340], [944, 346], [952, 349],
    ],
    bottom: [
      [560, 908], [584, 908], [608, 907], [632, 906], [656, 905], [680, 904], [704, 903], [728, 902], [752, 901],
      [776, 900], [800, 900], [824, 899], [848, 899], [872, 900], [896, 901], [920, 903], [944, 907], [952, 908],
    ],
  },
  right: {
    aTop: GUTTER_TOP,
    aBottom: GUTTER_BOTTOM,
    bTop: [1360, 349],
    bBottom: [1388, 906],
    top: [
      [970, 351], [994, 344], [1018, 339], [1042, 336], [1066, 335], [1090, 334], [1114, 334], [1138, 335], [1162, 337],
      [1186, 339], [1210, 342], [1234, 344], [1258, 345], [1282, 346], [1306, 348], [1330, 348], [1350, 351],
    ],
    bottom: [
      [970, 910], [994, 905], [1018, 902], [1042, 900], [1066, 899], [1090, 898], [1114, 898], [1138, 899], [1162, 899],
      [1186, 900], [1210, 901], [1234, 902], [1258, 903], [1282, 904], [1306, 904], [1330, 905], [1350, 905],
    ],
  },
};

/** The spread's middle, in the frame: where a phone centres the picture. */
export const SPREAD_CENTRE: Point = [962, 628];
/** How wide the spread is in the frame, cover to cover. */
export const SPREAD_WIDTH = 920;

// The two loose sheets on the desk in the film, and where their paper shows
// once the book has come to rest - drawn on (Andrew, 2026-09-28: "add two
// unique doodle wall drawings and paper texture to the two loose papers on
// the desk in the hero").
//
// In the 4K frame's pixels, like PAGE_OUTLINES. The camera never moves - each
// sheet sits on the same pixels in the first frame and the last. The drawings
// are there from the first frame ("dont make it fade in make it appear on
// load exactly when hero shows"), so what lies on the sheets is handled two
// ways: the pencil cup and the mug never move, and are cut out of the baked
// pictures (public/landing/sheets/*-mask.png); the book does - it opens and
// lands across the left sheet, and slides off the right one - so each
// picture is clipped to it frame by frame (BOOK_ON_SHEETS, sheetClip).
//
// Corners are the sheet's own top-left, top-right, bottom-right, bottom-left
// - its drawings are upright on the sheet, so they lean as it does. Measured
// on 40px grids over the 1920 stills (hence even numbers): the left sheet from
// the FIRST frame, before the book covers it; the right from the last, its
// bottom corner (at the mug) and left corner (under the book) where its
// visible edges meet. The masks are the sheet less the cup (by its red: the
// paper beside it reflects some, but nothing like the cup's own) and the mug
// (traced on a 10px grid: it is as white as the paper). They follow the
// objects exactly - taken in by a margin, they left a strip of bare paper
// that read as a bad cut-out ("edge detection not good"). (The tool that
// made them: handoff/veo/tools/sheet_masks.py.)
//
// The baked picture of each (public/landing/sheets/<id>.webp) covers exactly
// `box`, and is multiplied onto the film there - white leaves it alone.

import type { Point } from "./heroVideo";

export type SheetId = "left" | "right";

export type Sheet = {
  /** Top-left, top-right, bottom-right, bottom-left, in the 4K frame. */
  corners: [Point, Point, Point, Point];
  /** What the picture and its mask cover: x, y, width, height, 4K frame. */
  box: [number, number, number, number];
};

export const SHEETS: Record<SheetId, Sheet> = {
  left: {
    corners: [
      [274, 1196],
      [1126, 1024],
      [1326, 1986],
      [404, 2162],
    ],
    box: [266, 1016, 1068, 1144],
  },
  right: {
    corners: [
      [3026, 680],
      [3730, 966],
      [3318, 1700],
      [2614, 1414],
    ],
    box: [2606, 672, 1132, 1036],
  },
};

export const SHEET_IDS = Object.keys(SHEETS) as SheetId[];
export const sheetPath = (id: SheetId) => `/landing/sheets/${id}.webp`;
export const sheetMaskPath = (id: SheetId) => `/landing/sheets/${id}-mask.png`;

/**
 * Where the book lies over each sheet in each of the film's 111 frames (24 a
 * second), in the 1920 frame: its edge as the line x = a + s * y, found by
 * scanning rows of the sheet for the first run of the cover's dark board,
 * and fitted per frame (within 1px, but for three frames of the cover still
 * swinging in, held to its slant). Left sheet: the book's left edge, and the
 * cover's bottom - below it the paper shows again (the book's shadow on it
 * is paper, and drawn on) - or null before the book reaches it (frame 65).
 * Right sheet: the book's right edge, closed at first and sliding left as it
 * opens.
 */
export const BOOK_ON_SHEETS: {
  left: Array<[a: number, s: number, bottom: number] | null>;
  right: Array<[a: number, s: number]>;
} = {
  left: [
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, null,
    null, null, null, null, null, [659.6, -0.068, 856.0],
    [642.0, -0.068, 856.0], [622.8, -0.0643, 856.0], [607.1, -0.0617, 859.5], [599.3, -0.0673, 862.3], [590.2, -0.0685, 868.7], [583.4, -0.0705, 871.8],
    [565.8, -0.0545, 876.8], [571.6, -0.0712, 881.2], [567.5, -0.0712, 885.8], [565.1, -0.0724, 889.8], [562.5, -0.0712, 893.5], [560.9, -0.0706, 896.2],
    [559.9, -0.0703, 899.2], [558.1, -0.0679, 901.2], [557.8, -0.0679, 904.5], [557.0, -0.0669, 907.2], [557.5, -0.0672, 906.8], [558.9, -0.0679, 911.2],
    [558.5, -0.0672, 913.2], [559.3, -0.067, 915.2], [557.4, -0.0635, 917.2], [558.6, -0.0646, 918.0], [558.4, -0.0635, 919.2], [560.5, -0.0657, 920.2],
    [559.6, -0.0635, 922.0], [557.7, -0.0603, 922.5], [558.4, -0.0603, 924.0], [558.4, -0.06, 924.5], [558.9, -0.0599, 925.5], [557.8, -0.0582, 926.0],
    [559.0, -0.0594, 926.2], [558.8, -0.0589, 927.0], [558.8, -0.0589, 927.0], [559.0, -0.0589, 927.0], [558.3, -0.058, 927.2], [558.2, -0.058, 927.2],
    [559.0, -0.0593, 927.2], [559.0, -0.0593, 927.5], [559.0, -0.0594, 927.5], [559.0, -0.0594, 927.5], [559.0, -0.0594, 927.5], [559.0, -0.0594, 927.5],
    [559.0, -0.0594, 927.5], [559.0, -0.0594, 927.5], [559.0, -0.0594, 927.5],
  ],
  right: [
    [1408.7, 0.0714], [1408.7, 0.0714], [1408.7, 0.0714], [1408.7, 0.0714], [1408.7, 0.0714], [1408.7, 0.0714],
    [1408.7, 0.0714], [1408.7, 0.0714], [1408.2, 0.0726], [1408.2, 0.0726], [1408.7, 0.0714], [1408.7, 0.0714],
    [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726],
    [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726],
    [1408.2, 0.0726], [1408.2, 0.0726], [1408.2, 0.0726], [1408.1, 0.073], [1408.1, 0.073], [1408.0, 0.0742],
    [1410.0, 0.0722], [1411.2, 0.0726], [1412.4, 0.0726], [1413.8, 0.0714], [1414.2, 0.0706], [1412.4, 0.0726],
    [1411.4, 0.0726], [1409.1, 0.073], [1409.3, 0.0667], [1408.1, 0.0611], [1399.3, 0.0655], [1393.3, 0.0702],
    [1394.5, 0.0679], [1391.0, 0.0726], [1394.2, 0.0667], [1393.3, 0.0667], [1393.3, 0.0667], [1391.2, 0.069],
    [1392.3, 0.0667], [1394.2, 0.0631], [1391.3, 0.0667], [1395.1, 0.0595], [1392.7, 0.0631], [1391.6, 0.0643],
    [1391.7, 0.0631], [1393.0, 0.0607], [1393.1, 0.0595], [1392.3, 0.0607], [1394.0, 0.0571], [1392.1, 0.0595],
    [1391.3, 0.0607], [1389.7, 0.0631], [1393.4, 0.056], [1391.1, 0.0595], [1390.3, 0.0607], [1390.3, 0.0607],
    [1390.7, 0.0595], [1390.3, 0.0595], [1390.1, 0.0595], [1390.1, 0.0595], [1390.1, 0.0595], [1389.3, 0.0607],
    [1389.3, 0.0607], [1391.6, 0.056], [1389.4, 0.059], [1387.5, 0.0619], [1389.2, 0.0581], [1388.4, 0.059],
    [1386.1, 0.0619], [1387.8, 0.059], [1385.5, 0.0619], [1386.8, 0.059], [1386.4, 0.059], [1384.5, 0.0619],
    [1385.8, 0.059], [1386.3, 0.0571], [1383.1, 0.0619], [1382.5, 0.0619], [1383.8, 0.059], [1383.4, 0.059],
    [1378.3, 0.0667], [1378.3, 0.0667], [1382.4, 0.059], [1382.4, 0.059], [1382.2, 0.0581], [1381.4, 0.059],
    [1381.4, 0.059], [1380.8, 0.059], [1381.2, 0.0581], [1380.4, 0.059], [1375.3, 0.0667], [1379.8, 0.059],
    [1379.8, 0.059], [1380.2, 0.0581], [1379.4, 0.059], [1379.4, 0.059], [1379.4, 0.059], [1379.4, 0.059],
    [1379.4, 0.059], [1379.4, 0.059], [1379.4, 0.059],
  ],
};

/** The film's frame at a time in it. */
export const filmFrame = (seconds: number) => Math.max(0, Math.min(BOOK_ON_SHEETS.right.length - 1, Math.floor(seconds * 24)));

/**
 * What of a sheet's picture shows past the book in a frame, as a polygon in
 * the 4K frame (null: all of it): the left sheet keeps what is left of the
 * book's edge or below its bottom; the right keeps what is right of its edge.
 */
export function sheetShows(id: SheetId, frame: number): Array<[number, number]> | null {
  const [x0, y0, w, h] = SHEETS[id].box;
  // The 1920 line in the 4K frame: X = 2a + s * Y.
  if (id === "left") {
    const book = BOOK_ON_SHEETS.left[frame];
    if (!book) return null;
    const [a, s, bottom] = book;
    const edge = (Y: number) => 2 * a + s * Y;
    const Yb = Math.min(y0 + h, 2 * bottom);
    return [[x0, y0], [edge(y0), y0], [edge(Yb), Yb], [x0 + w, Yb], [x0 + w, y0 + h], [x0, y0 + h]];
  }
  const [a, s] = BOOK_ON_SHEETS.right[frame];
  const edge = (Y: number) => 2 * a + s * Y;
  return [[edge(y0), y0], [x0 + w, y0], [x0 + w, y0 + h], [edge(y0 + h), y0 + h]];
}

/** The same as the CSS clip-path of the sheet's picture, in its own box. */
export function sheetClip(id: SheetId, frame: number): string {
  const shows = sheetShows(id, frame);
  if (!shows) return "none";
  const [x0, y0, w, h] = SHEETS[id].box;
  return `polygon(${shows.map(([X, Y]) => `${(((X - x0) / w) * 100).toFixed(2)}% ${(((Y - y0) / h) * 100).toFixed(2)}%`).join(", ")})`;
}

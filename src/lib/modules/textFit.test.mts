// Vertically centred text puts its CAPITALS in the middle of the band.
//
// Andrew, 2026-09-22: "with the serif font the headers of modules do not look
// vertically centered." Twenty-five places across thirteen module renderers
// centred a label by centring its LINE BOX - `y = top + (band - fontSize *
// 1.2) / 2` - which is not the same thing. Where the glyphs sit inside that
// box is the font's business, and the two faces this app ships disagree:
// measured in the running editor, Newsreader's uppercase ink sat 0.12em
// ABOVE the box's middle at every size, and Hanken Grotesk's sat dead
// centre. The sans was right by luck.
//
// The assertion below is the definition, not a transcription of the fix: put
// the text where capCentredTextY says, work out where the capitals then
// land, and that has to be the middle of the band. It fails for BOTH fonts
// if the nudge is removed, because it is not written in terms of the nudge.
//
//   npx tsx src/lib/modules/textFit.test.mts

import {
  TEXT_LINE_HEIGHT,
  capCentreNudgeEm,
  capCentredTextY,
  estimateTextWidthPx,
  fitFontSizePx,
} from "./textFit";
import { FONT_SANS, FONT_SERIF } from "@/lib/theme";

let failures = 0;
const check = (ok: boolean, message: string) => {
  if (!ok) {
    console.error(`  FAIL  ${message}`);
    failures++;
  }
};

/**
 * Measured from the loaded faces, the same numbers textFit derives from -
 * repeated here ON PURPOSE. A test that imported the table would be checking
 * that the code equals itself; these are the readings from Chrome, in ems.
 */
const MEASURED = {
  [FONT_SERIF]: { ascent: 0.74, descent: 0.27, capHeight: 0.71 },
  [FONT_SANS]: { ascent: 1.0, descent: 0.3, capHeight: 0.71 },
};

/** Where the capitals actually sit, given the top of a text element. */
function capBandCentre(textY: number, fontSizePx: number, font: keyof typeof MEASURED): number {
  const { ascent, descent, capHeight } = MEASURED[font];
  const lineBox = fontSizePx * TEXT_LINE_HEIGHT;
  // The browser centres the font's content area in the line box; the PDF and
  // the canvas preview both follow the same 1.2.
  const baseline = textY + (lineBox - (ascent + descent) * fontSizePx) / 2 + ascent * fontSizePx;
  return baseline - (capHeight * fontSizePx) / 2;
}

// --- The capitals land in the middle of the band ---------------------------
for (const font of [FONT_SERIF, FONT_SANS] as const) {
  for (const fontSizePx of [8, 12.5, 20.83, 25, 29.17, 33.33, 60]) {
    for (const [bandTop, bandHeight] of [
      [0, 100],
      [193.5, 75],
      [1000.25, 37.5],
      [7, 9],
    ]) {
      const y = capCentredTextY(bandTop, bandHeight, fontSizePx, font);
      const centre = capBandCentre(y, fontSizePx, font);
      const wanted = bandTop + bandHeight / 2;
      check(
        Math.abs(centre - wanted) < 1e-9,
        `${font} ${fontSizePx}px in a ${bandHeight} band at ${bandTop}: capitals centre at ` +
          `${centre.toFixed(4)}, band centre is ${wanted.toFixed(4)} (out by ${(centre - wanted).toFixed(4)})`
      );
    }
  }
}

// --- The nudge is what was measured on screen ------------------------------
//
// Named separately from the property above, because the property would be
// satisfied by any self-consistent pair of numbers. These two came off a
// real screen: -4.0px at 33.3px serif, and nothing at all for the sans.
check(
  Math.abs(capCentreNudgeEm(FONT_SERIF) - 0.12) < 0.0005,
  `${FONT_SERIF} should need 0.120em of nudge, the 16.7% of cap height measured on screen; got ${capCentreNudgeEm(FONT_SERIF).toFixed(4)}`
);
check(
  Math.abs(capCentreNudgeEm(FONT_SANS) - 0.005) < 0.0005,
  `${FONT_SANS} should need 0.005em - it is centred by luck; got ${capCentreNudgeEm(FONT_SANS).toFixed(4)}`
);
check(
  Math.abs(capCentreNudgeEm(FONT_SERIF) * 33.33 + -4.0) < 0.05,
  `at 33.33px the serif nudge should be the 4.0px measured on screen, got ${(capCentreNudgeEm(FONT_SERIF) * 33.33).toFixed(2)}`
);

// --- An unknown family is corrected, not ignored ---------------------------
//
// The default is the app's own serif. Falling back to no correction would
// make a future font silently wrong in the direction this whole file exists
// to fix.
check(
  capCentreNudgeEm("Some Font That Is Not Installed") === capCentreNudgeEm(FONT_SERIF),
  "an unknown family should fall back to the serif's correction, not to zero"
);

// --- The horizontal half still works ---------------------------------------
check(estimateTextWidthPx("HELLO", 100) > estimateTextWidthPx("hello", 100), "capitals are wider than lowercase");
// 8 capitals at 0.73: 175.2px at 30, 116.8 at 20. So 400 takes the largest
// and 150 drops one step - the first version of this line asserted 20 for a
// 400px width, which the arithmetic says is simply wrong.
check(fitFontSizePx("NOVEMBER", 400, [30, 20, 10]) === 30, `400px wide should take the largest size`);
check(fitFontSizePx("NOVEMBER", 150, [30, 20, 10]) === 20, `150px wide should drop one step`);

if (failures > 0) {
  console.error(`\nText fitting: ${failures} problem(s).`);
  process.exit(1);
}
console.log(
  `All text fitting checks passed (capitals centre exactly in the band for both faces at 7 sizes ` +
    `and 4 bands; serif needs ${capCentreNudgeEm(FONT_SERIF).toFixed(3)}em, sans ${capCentreNudgeEm(FONT_SANS).toFixed(3)}em).`
);

// The handwriting faces the landing page's journal is written in.
//
// Real handwriting fonts - each traced from a person's hand - drawn a letter
// at a time with its own small size, lean and baseline shift (see
// handwriting/plan.ts). Loaded through next/font, so they are self-hosted
// with the site rather than fetched from Google on each visit, and NOT
// preloaded: nothing is written until the journal has opened, and the title
// must not wait for them.

import {
  Caveat,
  Covered_By_Your_Grace,
  Homemade_Apple,
  Nanum_Pen_Script,
  Permanent_Marker,
  Reenie_Beanie,
  Shadows_Into_Light,
} from "next/font/google";

// next/font reads these options at build time, so each call spells them out
// in full - a shared object spread into them is not allowed.
const permanentMarker = Permanent_Marker({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-marker", weight: "400" });
const caveat = Caveat({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-caveat", weight: ["500", "600"] });
const reenieBeanie = Reenie_Beanie({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-reenie", weight: "400" });
const shadowsIntoLight = Shadows_Into_Light({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-shadows", weight: "400" });
const nanumPen = Nanum_Pen_Script({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-nanum", weight: "400" });
const coveredByYourGrace = Covered_By_Your_Grace({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-grace", weight: "400" });
const homemadeApple = Homemade_Apple({ subsets: ["latin"], display: "swap", preload: false, variable: "--hand-homemade", weight: "400" });

/** Face name -> the CSS family next/font registered it under. */
export const HAND_FONTS = {
  marker: permanentMarker.style.fontFamily,
  caveat: caveat.style.fontFamily,
  reenie: reenieBeanie.style.fontFamily,
  shadows: shadowsIntoLight.style.fontFamily,
  nanum: nanumPen.style.fontFamily,
  grace: coveredByYourGrace.style.fontFamily,
  homemade: homemadeApple.style.fontFamily,
};
export type HandFontKey = keyof typeof HAND_FONTS;

/** Class names that pull each face's @font-face into the page WITHOUT
 *  setting any element's font - `variable` classes only declare a CSS
 *  variable. (The plain `className` sets font-family, and put the landing
 *  page's title in the last handwriting face on the list.) */
export const HAND_FONT_CLASSES = [
  permanentMarker,
  caveat,
  reenieBeanie,
  shadowsIntoLight,
  nanumPen,
  coveredByYourGrace,
  homemadeApple,
].map((font) => font.variable);

// The hand for the "you." that ends the landing page's tagline (Andrew,
// 2026-09-23: "change the you in the tagline to script and memari blue from
// the editor", then "different script more like handwriting"). Homemade
// Apple: a joined, pen-written hand - and one of the hands the journal on
// the page is written in (handFonts.ts), so the "you." reads as written by
// the same pen. Preloaded, unlike the journal's hands: the tagline arrives
// 2.35s after first paint and must not swap its face as it does.

import { Homemade_Apple } from "next/font/google";

export const script = Homemade_Apple({ subsets: ["latin"], display: "swap", weight: "400" });

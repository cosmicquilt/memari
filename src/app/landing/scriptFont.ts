// The hand for the "you." that ends the landing page's tagline (Andrew,
// 2026-09-23: "change the you in the tagline to script and memari blue from
// the editor", then "different script more like handwriting", then "try
// cedarville cursive"). Cedarville Cursive: a round, joined, everyday hand.
// Preloaded: the tagline arrives 2.35s after first paint and must not swap
// its face as it does.

import { Cedarville_Cursive } from "next/font/google";

// Also the hand the rest of the page is annotated in (ink/marks.tsx), through
// the --font-hand variable its root carries.
export const script = Cedarville_Cursive({ subsets: ["latin"], display: "swap", weight: "400", variable: "--font-hand" });

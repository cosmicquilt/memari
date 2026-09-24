// The script face for the "you." that ends the landing page's tagline
// (Andrew, 2026-09-23: "change the you in the tagline to script and memari
// blue from the editor"). Great Vibes: a formal script that still reads at
// tagline size. Preloaded, unlike the handwriting faces - the tagline
// arrives 2.35s after first paint and must not swap its face as it does.

import { Great_Vibes } from "next/font/google";

export const script = Great_Vibes({ subsets: ["latin"], display: "swap", weight: "400" });

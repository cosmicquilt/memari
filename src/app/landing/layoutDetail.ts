// What the Layouts popup is sent about one layout (landing/layouts/[key]):
// its picture, what it is, and its similar layouts. Types only, so the
// popup (a browser component) can name them without importing the server's.

import type { LandingSpread } from "./spreads";
import type { StarterKind } from "./starterLayouts";

export type LayoutDetail = {
  key: string;
  baseKey: string;
  kind: StarterKind;
  title: string;
  line: string;
  hours?: string;
  /** What a similar layout changed; empty for the layout itself. */
  changes: string[];
  /** "Use this week". */
  action: string;
  /** What "Use this" makes, said plainly. */
  makes: string;
  spread: LandingSpread;
  similar: Array<{ key: string; title: string; changes: string[]; spread: LandingSpread }>;
};

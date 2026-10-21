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
  /** The prebuilt planner it is a part of (plannerTemplates.ts), if any. */
  planner?: { key: string; title: string };
  similar: Array<{ key: string; title: string; changes: string[]; spread: LandingSpread }>;
  /** Its modules that can be saved on their own, and where each is drawn
   *  (page, box in the page's print px) - for Save on hover (2026-10-21).
   *  The spine goes with the page and is not among them. */
  modules: LayoutModuleBox[];
};

export type LayoutModuleBox = { slot: number; page: 0 | 1; box: [number, number, number, number]; name: string; slug: string };

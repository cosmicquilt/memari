// Planner-wide font choice (Page Settings > Font). Both are loaded via
// next/font/google in src/app/layout.tsx — literal-string fontFamily
// values in rendered element data resolve against those registered
// @font-face rules regardless of which component rendered the element
// (confirmed against the same mechanism PT Serif already relied on).

export const FONT_SERIF = "PT Serif";
export const FONT_SANS = "Hanken Grotesk";

export type FontChoice = "serif" | "sans";

export function resolveFontFamily(choice: FontChoice | null | undefined): string {
  return choice === "sans" ? FONT_SANS : FONT_SERIF;
}

// Shape stored in Planner.theme (a free-form Json? column — see
// schema.prisma). weekStartDay (0=Sun..6=Sat) is added by the Hours
// feature, read here too so every call site sharing a `theme` blob has
// one shared, typed shape instead of ad-hoc casts.
export type PlannerTheme = {
  fontFamily?: FontChoice;
  weekStartDay?: number;
};

// Cast + resolve in one step — every server action that loads a planner
// row already gets `theme` for free (no `select` clause restricts it),
// so this is just the repeated last step of turning that into a real
// font-family string.
export function fontFamilyFromTheme(theme: unknown): string {
  return resolveFontFamily((theme as PlannerTheme | null)?.fontFamily);
}

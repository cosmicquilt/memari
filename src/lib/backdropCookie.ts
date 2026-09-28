// The start dialog's background, as this browser last chose it (Andrew,
// 2026-09-27: "one of four themes, so far, dark (what it was before), dark
// (doodles), light, light (doodles) (current)"). A cookie, not storage, so
// the server paints the chosen one in the first frame - see
// lastJournalCookie.ts for the same pattern.

export const BACKDROP_THEMES = ["dark", "dark-doodles", "light", "light-doodles"] as const;
export type BackdropTheme = (typeof BACKDROP_THEMES)[number];
/** What a browser that has not chosen sees: the one that was current. */
export const DEFAULT_BACKDROP: BackdropTheme = "light-doodles";
export const BACKDROP_COOKIE = "memari-backdrop";

export function parseBackdropCookie(value: string | undefined): BackdropTheme {
  return (BACKDROP_THEMES as readonly string[]).includes(value ?? "") ? (value as BackdropTheme) : DEFAULT_BACKDROP;
}

export function writeBackdropCookie(theme: BackdropTheme) {
  if (!(BACKDROP_THEMES as readonly string[]).includes(theme)) return;
  document.cookie = `${BACKDROP_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

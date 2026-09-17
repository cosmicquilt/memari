"use client";

// The two accessibility preferences this editor honours, read once each.
//
// Extracted because a second component needed Reduce Motion and the choice
// was to copy nine lines of matchMedia or to have one of them. Copying is how
// the pair drifts: one gets the `change` listener and the other reads the
// value once at mount, and then the app honours the setting in half its
// chrome depending on whether you toggled it before or after loading.
//
// KEPT LIVE, not read at mount. Somebody can turn Reduce Motion on while the
// page is open - that is in fact when they are most likely to, having just
// watched something move.

import { useEffect, useLayoutEffect, useState } from "react";

/**
 * useLayoutEffect on the client, useEffect on the server.
 *
 * Next renders client components on the server too, where useLayoutEffect
 * warns because there is no layout to do. Anything that must land BEFORE the
 * browser paints - positioning one element against another, say - still wants
 * the layout version everywhere else, because an effect that runs after paint
 * shows one frame of the wrong answer.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function useMediaQuery(query: string): boolean {
  // False on the server and for the first client render, so the markup
  // matches; the effect corrects it before paint matters.
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setMatches(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);
  return matches;
}

/** Settles instantly instead of springing. */
export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/** Quiet chrome goes to full white rather than sitting at reduced contrast. */
export const usePrefersHighContrast = () => useMediaQuery("(prefers-contrast: more)");

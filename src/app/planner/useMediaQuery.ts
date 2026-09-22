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

/**
 * There is a pointer that can hover, so a control can be reached by moving
 * onto it rather than having to be revealed first.
 *
 * The module badges (delete, edit, the zone's +) are invisible until their
 * module is hovered, and they were also click-through while invisible - so
 * the only way to one was to enter the module first and travel out to the
 * corner. Reported exactly that way. Where a pointer hovers, they stay
 * hit-testable and light up when it arrives on them. Where it does NOT -
 * a touch screen, where the first contact is already a tap - an invisible
 * control that takes taps would delete a module nobody could see, so they
 * keep the old behaviour there.
 */
export const usePointerCanHover = () => useMediaQuery("(hover: hover)");

/**
 * How many DEVICE pixels the browser paints per CSS pixel.
 *
 * Needed wherever "the thinnest mark this display can draw" is the rule.
 * A hairline floored at one CSS pixel is three device pixels on a 3x
 * screen - three times thicker than the display can resolve - and a
 * legibility floor that overshoots by 3x stops being a floor and becomes
 * the thing you see. Measured in the editor at 28% zoom on a 3x display:
 * every ruled line was 3 device pixels of 35% grey, each landing on a
 * different subpixel phase, against crisp full-ink strokes beside them.
 *
 * `resolution` in a media query is the only way to be told when this
 * changes - there is no devicePixelRatio event - and it does change, when a
 * window is dragged between monitors.
 */
export function useDevicePixelRatio(): number {
  const [ratio, setRatio] = useState(1);
  useEffect(() => {
    const sync = () => setRatio(window.devicePixelRatio || 1);
    sync();
    // The query has to be rebuilt for each new ratio: it asks "is it still
    // this?", so it can only ever fire once.
    let media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    let cancelled = false;
    const listen = () => {
      media.addEventListener("change", onChange, { once: true });
    };
    const onChange = () => {
      if (cancelled) return;
      sync();
      media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      listen();
    };
    listen();
    return () => {
      cancelled = true;
      media.removeEventListener("change", onChange);
    };
  }, []);
  return ratio;
}

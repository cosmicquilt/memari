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

import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";

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
 * The ratio the SERVER rendered for, read from the viewport cookie.
 *
 * The server has no display, so without this it renders every hairline at
 * the one-CSS-pixel floor and the markup PAINTS that way before any script
 * runs - three device pixels on a 3x screen. The window size had exactly
 * this problem and is solved exactly this way; see viewportCookie.ts, which
 * now carries both. 1 is the right default for a first visit: the guard
 * script flags the page and the canvas stays hidden until it is measured,
 * so nobody sees the guess.
 */
export const ServerDevicePixelRatio = createContext(1);

/**
 * How many DEVICE pixels the browser paints per CSS pixel.
 *
 * Needed wherever "the thinnest mark this display can draw" is the rule. A
 * hairline floored at one CSS pixel is three device pixels on a 3x screen -
 * three times thicker than the display can resolve - and a legibility floor
 * that overshoots by 3x stops being a floor and becomes the thing you see.
 * Measured in the editor at 28% zoom on a 3x display: every ruled line was
 * 3 device pixels of 35% grey, each landing on a different subpixel phase,
 * against crisp full-ink strokes beside them.
 *
 * `resolution` in a media query is the only way to be told when this changes
 * - there is no devicePixelRatio event - and it does change, when a window is
 * dragged between monitors.
 */
export function useDevicePixelRatio(): number {
  // The server's ratio first, then corrected BEFORE THE PAINT - not after.
  //
  // It has to come from a context rather than from window: this renders on
  // the server too, and a lazy initialiser reading the real ratio on the
  // client would disagree with the server's markup and break hydration. The
  // context holds what the server actually used, so the two agree.
  //
  // But the correction was in a useEffect, which runs AFTER the browser has
  // painted, so every mount drew one or two frames of hairlines floored at
  // one CSS pixel - three device pixels on a 3x display. Invisible on a
  // 1x screen and obvious on this one, reported as "when changing between
  // pages or spreads... the split second it loads in the lines look thicker
  // before quickly jumping to their final state". Measured on a page change
  // at 3x, counting rules by rendered device-pixel thickness per frame:
  //
  //   frame 146   26 rules, all 3 device px      <- painted, wrong
  //   frame 148   26 rules, all 1 device px      <- corrected
  //   frame 166  610 rules, 584 at 3 device px   <- painted, wrong
  //   frame 168  610 rules, 1 and 2 device px    <- corrected
  //
  // A layout effect lands the real ratio in the same frame, so there is
  // nothing to see. This file's own useIsomorphicLayoutEffect exists for
  // exactly this - "an effect that runs after paint shows one frame of the
  // wrong answer" - and this was the one place that needed it and did not
  // use it.
  const [ratio, setRatio] = useState(useContext(ServerDevicePixelRatio));
  useIsomorphicLayoutEffect(() => {
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

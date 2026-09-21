"use client";

// A page's thumbnail, drawn to a canvas - the timeline's cards and the start
// dialog's journal and preset cards all draw with this one component, so a
// page looks the same wherever it is shown. It lived inside TimelineDrawer
// until the start dialog needed it too.

import { useRef } from "react";
import type { TimelinePage } from "./loadPlannerPages";
import { useIsomorphicLayoutEffect } from "./useMediaQuery";
import { drawPreview, forgetResolvedFamilies, forgetTextMetrics } from "./drawPreview";

/**
 * One page preview: a canvas, repainted whenever the card changes size.
 *
 * THE SIZE NEVER COMES THROUGH REACT. The card's width and height are CSS
 * custom properties on the drawer's own element, so a drag re-renders
 * nothing - that is what made the drag cheap in the first place, and handing
 * a canvas its size as a prop would hand it all straight back. A
 * ResizeObserver closes the loop instead: the property changes, the browser
 * lays out, the observer fires with the new box, the canvas redraws. All of
 * it inside the same frame, and React never hears about any of it.
 *
 * That one mechanism covers both cases, which is the reason to prefer it
 * over hooking the pointer handler: during a drag the size changes because a
 * finger moved, and during a settle it changes because a CSS transition is
 * running, and the observer cannot tell the difference and does not need to.
 *
 * `device-pixel-content-box` asks for the box in DEVICE pixels rather than
 * CSS pixels. On a 2x display that is the difference between a backing store
 * sized to the real grid and one rounded to half of it - and rounding is how
 * a hairline lands between two rows and disappears, which is the whole
 * complaint this replaced. Browsers that do not support the option fall back
 * to the CSS box times devicePixelRatio, which is the same number whenever
 * the ratio is a whole one.
 */
export function PagePreview({
  page,
}: {
  page: Pick<TimelinePage, "previewMarks" | "pageWidthPx" | "pageHeightPx">;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { previewMarks, pageWidthPx, pageHeightPx } = page;

  // Layout effect, not effect: an effect runs after paint, so the card would
  // show one frame of empty canvas on the way in.
  useIsomorphicLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    // OFF-SCREEN CARDS DO NOT DRAW.
    //
    // The filmstrip is one scrolling row holding every page of the book, and
    // a drag resizes all of them - so without this the cost is the whole
    // book, not the part you can see. Measured at 0.44ms a card, a twelve
    // page book is 5ms a frame and a sixty page book is 26ms, which is two
    // frames gone to draw fifty pages nobody is looking at.
    //
    // The size is still recorded while a card is away, so a card scrolled
    // into view draws once, at the size it should already be, rather than
    // appearing blank and catching up.
    let onScreen = true;
    let pending: { width: number; height: number } | null = null;

    const paint = (deviceWidth: number, deviceHeight: number) => {
      const width = Math.max(0, Math.round(deviceWidth));
      const height = Math.max(0, Math.round(deviceHeight));
      if (width === 0 || height === 0) return;
      if (!onScreen) {
        pending = { width, height };
        return;
      }
      pending = null;
      // Assigning either one clears the canvas, so only assign on a real
      // change - during a settle the size changes every frame, but at the
      // ends of a drag against a detent it does not.
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      drawPreview(context, previewMarks, pageWidthPx, pageHeightPx);
      // Takes the card's loading indicator away - see .memari-spinner in
      // globals.css. An attribute rather than state, so drawing re-renders
      // nothing.
      canvas.setAttribute("data-drawn", "");
    };

    const paintFromLayout = () => {
      const box = canvas.getBoundingClientRect();
      paint(box.width * window.devicePixelRatio, box.height * window.devicePixelRatio);
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const device = entry.devicePixelContentBoxSize?.[0];
        if (device) {
          paint(device.inlineSize, device.blockSize);
          continue;
        }
        const css = entry.contentBoxSize?.[0];
        const cssWidth = css ? css.inlineSize : entry.contentRect.width;
        const cssHeight = css ? css.blockSize : entry.contentRect.height;
        paint(cssWidth * window.devicePixelRatio, cssHeight * window.devicePixelRatio);
      }
    });
    try {
      observer.observe(canvas, { box: "device-pixel-content-box" });
    } catch {
      observer.observe(canvas);
    }
    paintFromLayout();

    // A margin of one card either side, so scrolling reaches a drawn card
    // rather than watching one arrive.
    const visibility = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const was = onScreen;
          onScreen = entry.isIntersecting;
          if (onScreen && !was) {
            if (pending) paint(pending.width, pending.height);
            else paintFromLayout();
          }
        }
      },
      { rootMargin: "0px 240px" }
    );
    visibility.observe(canvas);

    // A face that has not arrived yet does not throw - fillText quietly
    // draws in the fallback, and a thumbnail in the wrong serif looks close
    // enough to be believed. So: draw again once the set has settled, and
    // drop the family names resolved while it had not.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      forgetResolvedFamilies();
      forgetTextMetrics();
      paintFromLayout();
    });

    return () => {
      live = false;
      observer.disconnect();
      visibility.disconnect();
    };
  }, [previewMarks, pageWidthPx, pageHeightPx]);

  return (
    <>
      <canvas
        ref={ref}
        // Nothing inside a canvas is in the accessibility tree anyway; saying
        // so keeps it from being announced as an empty image. The card around
        // it is a real button with a real name, which is what a reader needs.
        aria-hidden="true"
        style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }}
      />
      {/* Until the canvas has drawn. The drawing cannot happen before the
          editor's script has loaded and hydrated - ~85ms warm in production,
          a second or more in dev or on a slow first visit - so this is
          rendered by the server and runs on CSS alone, and only fades in
          once the wait is long enough to notice. */}
      <span className="memari-spinner" aria-hidden="true">
        {SPINNER_SPOKES.map((spoke) => (
          <i key={spoke} />
        ))}
      </span>
    </>
  );
}

/** Eight, as Apple's activity indicator has. Positions and timing are in
 *  globals.css, keyed by :nth-child. */
const SPINNER_SPOKES = [0, 1, 2, 3, 4, 5, 6, 7];

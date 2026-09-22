"use client";

// A saved page or spread, drawn small - for the timeline's menus and Saved >
// Pages. The same PagePreview the timeline cards use, so a saved page looks
// like the page it was saved from.

import { Fragment } from "react";
import type { PreviewMark } from "@/lib/previewMarks";
import { PagePreview } from "./PagePreview";

export function SavedThumb({
  previews,
  widthPx,
  heightPx,
  height,
}: {
  /** One drawing per page. */
  previews: PreviewMark[][];
  widthPx: number;
  heightPx: number;
  /** The drawing's height in CSS px; its width follows from the pages. */
  height: number;
}) {
  const pageWidth = (height * widthPx) / heightPx;
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        flexShrink: 0,
        height,
        width: pageWidth * previews.length + (previews.length - 1),
        borderRadius: 2,
        overflow: "hidden",
        background: "#fdfcf9",
      }}
    >
      {previews.map((marks, index) => (
        <Fragment key={index}>
          {index > 0 && <span style={{ flex: "0 0 1px", background: "#c9c6bf" }} />}
          <span style={{ position: "relative", width: pageWidth, height }}>
            <PagePreview page={{ previewMarks: marks, pageWidthPx: widthPx, pageHeightPx: heightPx }} />
          </span>
        </Fragment>
      ))}
    </span>
  );
}

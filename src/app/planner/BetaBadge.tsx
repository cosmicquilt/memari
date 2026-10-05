// "BETA", beside the wordmark (2026-10-05). Asked in turn: "in same style
// as 'to review'"; then "smaller", "blue instead of yellow", "vertically
// center beta within the highlight"; then "smaller than studio and
// vertically aligned with studio"; then "the text and highlight are too
// light"; then "change the highlight color back". So: cream letters on
// the accent's wash, the box no taller than STUDIO's capitals, centred on
// them.
//
// CENTRED BY MEASUREMENT. Text snaps to whole pixels, so offsets are steps,
// not dials: 15 lifts and paddings were rendered at 1x, 2x and 4x and the
// ink found (scripts/_beta-tune.mts). With no lift and 0.5px of top
// padding, BETA's capitals sit dead centre in the box at all three, and on
// STUDIO's centre to 0.5px at 1x (the least possible there: 10 rows of
// capitals against 5), exactly at 2x, 0.12px at 4x. A lift of 1px put
// them 0.5-1px high.

import type { CSSProperties } from "react";
import { CREAM } from "@/lib/cream";

/** Centres BETA's capitals inside the box. */
const PAD_TOP = 0.5;

const BADGE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  boxSizing: "border-box",
  height: 11,
  marginLeft: 8,
  padding: `${PAD_TOP}px 4px 0`,
  borderRadius: 3,
  fontSize: 7,
  fontWeight: 600,
  letterSpacing: "0.08em",
  lineHeight: 1,
  textTransform: "uppercase",
  verticalAlign: "middle",
  color: CREAM,
  // The accent as a wash, not solid (asked back, 2026-10-05).
  background: "rgba(74, 92, 255, 0.28)",
};

export function BetaBadge() {
  return (
    <span style={BADGE} title="Memari is in beta: things may change, and we'd love your feedback">
      Beta
    </span>
  );
}

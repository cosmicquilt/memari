// "BETA", beside the wordmark (2026-10-05): Andrew asked for it "in same
// style as 'to review'" - the small uppercase amber tag of the palette
// mockup. That tag sat on cream (dark amber on a pale wash); this sits on
// the dark header, so the same amber is lightened to stay readable.

import type { CSSProperties } from "react";

const BADGE: CSSProperties = {
  display: "inline-block",
  marginLeft: 8,
  padding: "2px 6px 3px",
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.06em",
  lineHeight: 1,
  textTransform: "uppercase",
  verticalAlign: "2px",
  color: "#f0c46e",
  background: "rgba(240, 196, 110, 0.16)",
};

export function BetaBadge() {
  return (
    <span style={BADGE} title="Memari is in beta: things may change, and we'd love your feedback">
      Beta
    </span>
  );
}

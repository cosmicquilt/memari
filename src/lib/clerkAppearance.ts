// Clerk's own panels (sign-in, the account page's profile) in the app's
// dark chrome: its panel, controls and cream text, the one accent.

import { CREAM, cream } from "@/lib/cream";

export const DARK_CLERK = {
  variables: {
    colorPrimary: "#4a5cff",
    colorPrimaryForeground: "#ffffff",
    colorBackground: "#1c1c1e",
    colorForeground: CREAM,
    colorMutedForeground: cream(0.6),
    colorMuted: "#242426",
    colorInput: "#2a2a2a",
    colorInputForeground: CREAM,
    colorNeutral: CREAM,
    colorBorder: cream(0.12),
    colorDanger: "#ff8f7a",
    borderRadius: "8px",
  },
  elements: {
    // The panel sits in the page's own column, not in a floating card.
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none", border: `1px solid ${cream(0.1)}` },
  },
} as const;

// The heart on covers (2026-11-05): the covers page's and the order
// screen's, one drawing. Red when hearted, an outline in the ink around it
// when not.

/** The red of a hearted cover: 4.7:1 under cream words on the stage. */
export const HEART_RED = "#c8324b";

/** `fill` and `stroke` override the red, as on the stage's red pill, where
 *  a hearted heart is cream (the mockup's). */
export function HeartIcon({ filled, size = 18, stroke, fill }: { filled: boolean; size?: number; stroke?: string; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ flex: "none", display: "block" }}>
      <path
        d="M12 20.5s-7.5-4.6-9.6-9.2C1 8 3.1 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.2 1.8-2 3.3-3.2 5.4-3.2 3.5 0 5.6 3.5 4.2 6.8-2.1 4.6-9.6 9.2-9.6 9.2z"
        fill={filled ? (fill ?? HEART_RED) : "none"}
        stroke={stroke ?? (filled ? HEART_RED : "currentColor")}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </svg>
  );
}

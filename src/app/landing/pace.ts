// How fast the invisible hand writes in the landing page's journal - asked
// for 2026-09-23: "make the writing happen much faster ... a slider from
// instant to its current speed".
//
// The pace is the share of its natural time a spread's handwriting takes:
// 1 is the speed it was built at (a spread in 14-20 seconds), 0 is all at
// once. The default is a quarter - four times faster. One value for both
// heroes, remembered per browser, changed by PaceSlider.

const KEY = "memari.landing.writingPace";
export const DEFAULT_PACE = 0.25;

let pace = DEFAULT_PACE;
let read = false;
const listeners = new Set<() => void>();

export function getPace() {
  if (!read && typeof window !== "undefined") {
    read = true;
    try {
      const stored = Number.parseFloat(window.localStorage.getItem(KEY) ?? "");
      if (stored >= 0 && stored <= 1) pace = stored;
    } catch {
      // No storage (a private window): the default it is.
    }
  }
  return pace;
}

export function setPace(value: number) {
  pace = Math.min(1, Math.max(0, value));
  try {
    window.localStorage.setItem(KEY, String(pace));
  } catch {
    // Not remembered; still applied.
  }
  for (const listener of listeners) listener();
}

export function onPace(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The pen's clock for one spread: how many seconds of handwriting are done,
 * advanced by real seconds divided by the pace. Moving the slider mid-page
 * speeds the hand up or slows it from where it is, rather than jumping.
 */
export class InkClock {
  private written = 0;
  private last: number | null = null;

  constructor(private readonly startAt: number) {}

  /** Handwriting seconds done at `now`; negative before it starts. */
  advance(now: number) {
    if (now < this.startAt) return -1;
    const from = this.last ?? this.startAt;
    this.last = now;
    const p = getPace();
    if (p <= 0.0001) this.written = Infinity;
    else if (Number.isFinite(this.written)) this.written += (now - from) / p;
    return this.written;
  }
}

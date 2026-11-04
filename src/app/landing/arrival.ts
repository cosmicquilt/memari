// THE PAGE ARRIVES WHOLE (Andrew, 2026-11-04: "things load in at different
// times like doodles, paper texture, hero, etc. all at different times").
// Measured on the live landing page as a phone on Wi-Fi: the title and a bare
// post-it over an empty brown band at 0.8 s, the photo at 1.9 s, the torn edge
// and the otter with it, and the paper and the doodles only at 5.5 s.
//
// Now a curtain lies over the page's content (SiteArrival.tsx) - the hero's
// dark over the hero, the cream below - until what the first screen shows has
// arrived, and lifts once: everything appears in the same frame. This is
// what the parts of the page say to it: what they are still waiting for
// (`holdArrival`), and when it has lifted (`whenArrived`), for what should
// only start once it can be seen - the first layout on the hero's book, a
// handwritten mark coming into view, the covers fetched for later.

let arrived = false;
let waiting: Array<() => void> = [];
let holds: Array<Promise<unknown>> = [];

/** Something the first screen needs before the curtain lifts: a picture
 *  decoded, the doodle wall laid out. Taken until the curtain looks, as the
 *  page's parts mount; a failure counts as arrived (the curtain never waits
 *  on a picture that will not come). */
export function holdArrival(until: Promise<unknown>) {
  if (!arrived) holds.push(until.catch(() => {}));
}

/** The holds, taken by the curtain once every part of the page has mounted. */
export function takeHolds(): Array<Promise<unknown>> {
  const all = holds;
  holds = [];
  return all;
}

/** Resolves when the curtain lifts - at once if it has, or if the page has
 *  none (a part used on a page without SiteArrival never waits). */
export function whenArrived(): Promise<void> {
  if (arrived || (typeof document !== "undefined" && !document.querySelector("[data-curtain]"))) return Promise.resolve();
  return new Promise((resolve) => waiting.push(resolve));
}

export function hasArrived() {
  return arrived;
}

/** The curtain is lifting: everything under it can be seen from now. */
export function markArrived() {
  if (arrived) return;
  arrived = true;
  const all = waiting;
  waiting = [];
  for (const go of all) go();
}

/** A page left: the next one arrives afresh, under its own curtain. */
export function resetArrival() {
  arrived = false;
  waiting = [];
  holds = [];
}

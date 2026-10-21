// The doodle wall in the landing page's body (Andrew, 2026-10-01: "we move
// the doodle wall to the body below where it adapts around the contents ...
// a percentage of the viewport ... of the next section past the hero of the
// cream white background before the doodles begin").
//
// Packed live, in the browser, around what the page actually shows at its
// width: every heading's lines, paragraph's lines, card, demo, button and pen
// mark is measured as an area to keep clear (BodyDoodles.tsx), and the
// drawings - the `body` list in doodleChoices.json - are packed into what is
// left the way the start dialog's wall is (doodleWall.ts's packWall): the
// big ones first, each against the ones already down, then the middle ones,
// then the small. Its own copy of that packing rather than packWall's,
// because packWall has to be self-contained to run inside a bake script's
// page, and this one also keeps clear of the content and never wraps.
//
// The settings (bodyWallSettings.json) are tuned live with the sliders on the
// landing page itself in development (BodyWallTuner.tsx) and saved there.

import saved from "./bodyWallSettings.json";

export type BodyWallSettings = {
  /** How much of the section below the hero shows when the page opens, % of
   *  the screen's height: the hero is that much shorter (Andrew, 2026-10-01:
   *  "i cant see the section below hero when i load in thats what the
   *  percentage slider was supposed to be"). Desktop and phone. */
  peekDesktop: number;
  peekMobile: number;
  /** Then the hero cropped from the top, % of the screen's height, the film
   *  kept at the size the peek gives it (2026-10-10: "i like this zoom of
   *  the hero (~14%) but from here want it to crop from the top"). Desktop. */
  heroCropDesktop: number;
  /** Plain cream below the hero before the doodles begin, % of the screen's
   *  height - 0, the doodles fill the peek ("do want the doodle wall
   *  doodles in that cream portion peeking through at top scroll so add
   *  that back as a slider"). Desktop and phone. */
  bandDesktop: number;
  bandMobile: number;
  /** Paper kept between drawings, CSS px. */
  gap: number;
  /** Paper kept round the page's content, CSS px. */
  clearance: number;
  /** Drawing size, times the wall's sizes. */
  size: number;
  /** How many, times a full wall's count for the area. */
  density: number;
  /** How strong the blue is. */
  ink: number;
  /** The arrangement: a seed, or a new one each load. */
  seed: number;
  newEachLoad: boolean;
  /** The hero's blur toward the screen's sides (.sideBlur in
   *  landing.module.css): its strength at the very edge, CSS px, and how far
   *  in it reaches, % of the screen's width. Here because these sliders are
   *  the page's one toolbar. */
  sideBlur: number;
  sideBlurWidth: number;
  /** The cream's torn top edge (TornEdge.tsx): the drawn deckle, one of
   *  Flow's photographs of a torn sheet, or the straight edge it replaced
   *  (2026-10-06). A photograph's size is `tornScale` of its pixels; the
   *  shadow on the hero is `tornShadow` of its measured strength. */
  tornEdge: "drawn" | "flow-fine" | "flow-bold" | "none";
  tornScale: number;
  tornShadow: number;
  /** The hero darkened toward its edges, a vignette (.vignette; 2026-10-06:
   *  "a darkness vignette in the hero, controllable independently ... top
   *  and bottom seperately, the sides together"): how dark at the very edge,
   *  0 to 1, and how far in it reaches - % of the hero's height for the top
   *  and the bottom, of its width for the sides. The corners darker still,
   *  in an oval (`vignetteCorners`; "especially top corners ... oval round
   *  rectangle shape"); the bottom light, a shadow along the torn edge's. */
  vignetteTop: number;
  vignetteTopReach: number;
  vignetteBottom: number;
  vignetteBottomReach: number;
  vignetteSides: number;
  vignetteSidesReach: number;
  vignetteCorners: number;
  /** How long the tagline's "you." takes to write, seconds (Wordmark.tsx;
   *  2026-10-06: "i want a slider for you writing speed i want to slow it
   *  down"): its strokes and the pen-lifts between them, all in proportion. */
  youSeconds: number;
  /** The post-it's curled top left corner (PostIt.tsx, CURL): how dark its
   *  shade is at the tip, 0 to 1, and how far back toward the bend it
   *  reaches, 0 to 1 of the way (2026-10-07: "make that gradient shadow a
   *  bit more subtle, add to dev popup reach and opacity"). */
  curlShade: number;
  curlReach: number;
  /** Paper between the post-it's bottom and the covers' collage under it,
   *  CSS px (CoverCarousel.tsx; 2026-10-10: "carousel not that close to
   *  postit tho. add as slider"). */
  carouselGap: number;
  /** The drawings in the strip above the collage, times their usual size
   *  there (2026-10-10: "i wanted bigger doodles in that regiom"); never
   *  taller than the strip. */
  rowDoodleSize: number;
  /** How fast the covers' collage drifts, CSS px a second (2026-10-14:
   *  "faster carousel"; it was 26). */
  carouselSpeed: number;
  /** How far the collage's edge blur reaches in from each side of the
   *  screen, % of its width (2026-10-14: "push blur ... more towards the
   *  side of the screen ... add slider"). */
  carouselBlur: number;
  /** How much slower than the page the hero moves as it scrolls, a fraction
   *  of the scroll: the hero below the paper's plane (2026-10-14). 0, none. */
  heroParallax: number;
  /** The papers under the cream, each 0 to 1, any together (2026-10-14:
   *  "paper 6, 1, 3, 2 download all with light on ... color match them the
   *  current cream", then "turn each to a type of slider so i can combine
   *  more of them"): ambientCG scans lit from their own surface maps, the
   *  first fibre tile, and Paper003's soft crumples alone. At 1 each has the
   *  first fibre tile's contrast. 0 loads nothing. See PAPER_LAYERS. */
  paper006: number;
  paper001: number;
  paper002: number;
  paperFibre: number;
  /** Paper003's soft crumples, alone (crumple_bake.py): Paper003 was 95%
   *  crumples, so this is it. */
  paperCrumple: number;
  /** PAPER THROUGH THE INK (2026-10-21: "a slider that uses the effect ...
   *  on the /app background behind popup on the doodles ... so the paper
   *  texture shows ... on the doodle wall on the website pages outside of
   *  /app ... both for doodles and for the text on the page, separate
   *  sliders"). The start dialog's backdrop lays its paper photo over the
   *  doodle wall in overlay (StartDialog.tsx, backdropStyle), so the grain
   *  shows in the pen lines. These lay the same photo over the site's
   *  doodles, and inside its headings' and paragraphs' letters, 0 to 3: 0
   *  as it was, 1 the paper at its own strength (inkPaper), past 1 laid on
   *  again ("i dont see it applying": the start dialog's photo is faint on
   *  the site's bolder lines). */
  doodlePaper: number;
  textPaper: number;
  /** Which paper goes into the ink (2026-10-21: "does it only apply the
   *  line paper texture not the downloaded ones", then "have a switch or dev
   *  panel options for seeing the difference"): "site", the site's own
   *  paper, every layer at the strength the page lays it under the cream;
   *  "app", the start dialog's photo (/landing/paper.jpg); or one of
   *  PAPER_LAYERS' ids alone, at its full strength. See INK_PAPERS. */
  inkPaper: InkPaper;
  /** How the paper meets the ink: "overlay", the ink's own colour grained,
   *  as the start dialog lays its photo (a grain even about mid-grey leaves
   *  the ink's tone where it was); "hard-light", flecks of paper through
   *  the ink, as the page lays its own papers (it lifts dark ink paler, and
   *  a broad photo like the crumples fades whole patches of a drawing);
   *  "through", the overlay's grain and the paper showing through the ink
   *  in small gaps where a pen skips its tooth, none at 0, in full at 1.5,
   *  laid on twice at 3
   *  (2026-10-21: "3 still doesn't look very different" - grain alone
   *  cannot be strong on dark ink, overlay never takes it past twice its
   *  own value). */
  inkBlend: "overlay" | "hard-light" | "through";
  /** The text's paper on links and buttons too (2026-10-21: "a switch to
   *  include link/button with the text"); off, they keep their own ink. */
  textPaperLinks: boolean;
  /** And on text that is not on the paper: the hero's title and tagline,
   *  the nav, a popup ("another to apply the effect to text
   *  not over paper"). Those regions carry data-off-paper. */
  textPaperOffPaper: boolean;
  /** How cream the site is, everywhere outside the app (2026-10-15: "a dev
   *  panel slider that changes the cream color lighter or more cream
   *  'darker' everywhere outside of app"): 0 white, 1 the cream it has been
   *  (#f5ead5), 2 twice as far from white. Sets --cream and --cream-rgb on
   *  the page, which the landing, the site pages and the layouts popup all
   *  draw from; their few lighter and deeper creams are mixes of it. */
  creamDepth: number;
};

/** The paper layers (PaperLayers.tsx), bottom first: which setting, the
 *  grey picture (public/landing/paper/, hard-light), and its size on the page
 *  - the 1024 px bakes at half, so a 2x screen shows them pixel for pixel. */
export const PAPER_LAYERS = [
  { key: "paper006", id: "paper006", file: "Paper006.avif", size: "512px 512px", label: "Paper 006: fine tooth, faint specks" },
  { key: "paper001", id: "paper001", file: "Paper001.avif", size: "512px 300px", label: "Paper 001: finest, even grain" },
  { key: "paper002", id: "paper002", file: "Paper002.avif", size: "415px 535.5px", label: "Paper 002: fine, a few specks" },
  { key: "paperFibre", id: "fibre", file: "fibre.avif", size: "256px 256px", label: "Fibre (the first paper)" },
  { key: "paperCrumple", id: "crumples", file: "crumples.avif", size: "512px 512px", label: "Soft crumples (Paper 003)" },
] as const satisfies ReadonlyArray<{ key: keyof BodyWallSettings; id: string; file: string; size: string; label: string }>;

export const BODY_WALL_DEFAULTS: BodyWallSettings = saved as BodyWallSettings;

/** The papers the ink can take (inkPaper): the site's whole paper, the
 *  start dialog's photo, or one of the site's layers alone. */
export type InkPaper = "site" | "app" | (typeof PAPER_LAYERS)[number]["id"];
export const INK_PAPERS: Array<{ id: InkPaper; label: string }> = [
  { id: "site", label: "The site's paper: every layer, as mixed" },
  { id: "app", label: "The app's paper (paper.jpg)" },
  ...PAPER_LAYERS.map((p) => ({ id: p.id as InkPaper, label: `Only ${p.label}` })),
];

/** One photo in the ink: its picture, its size, its blend, how much. A
 *  "normal" one is a map of the paper's gaps (white where the paper shows). */
type InkLayer = { src: string; size: string; blend: "overlay" | "hard-light" | "normal"; weight: number };

/** The papers with a tooth for a pen to skip, and their gap maps (scratchpad
 *  fleck_bake.cjs: each photo's darkest 6% open, fading out by its darkest
 *  30%, at the size the page shows it).
 *  Not the crumples: folds, not tooth - their darkest spots are whole
 *  creases, and would open holes the size of a drawing. */
const GAPS: Record<string, string> = {
  app: "/landing/fleck-paper.avif",
  paper006: "/landing/paper/fleck-Paper006.avif",
  paper001: "/landing/paper/fleck-Paper001.avif",
  paper002: "/landing/paper/fleck-Paper002.avif",
  fibre: "/landing/paper/fleck-fibre.avif",
};

/** Where on the slider the gaps are in full; past it they are laid on
 *  again, and the soft edges of the map open too. */
const GAPS_FULL_AT = 1.5;

/** The photos the ink takes at a strength (inkPaper, inkBlend), the whole
 *  site's paper at the page's own mix of its layers. The site's are their
 *  ink- copies, moved to average mid-grey (scratchpad ink_paper_bake.cjs):
 *  the originals average ~155, which would lift the ink paler as well as
 *  grain it - the copies add the grain and not the tone. */
function inkLayers(s: BodyWallSettings, strength: number): InkLayer[] {
  if (strength <= 0) return [];
  const choice = s.inkPaper ?? "app";
  const look = s.inkBlend ?? "overlay";
  const blend = look === "hard-light" ? "hard-light" : "overlay";
  // each photo and its share: the app's alone, one layer alone, or the
  // site's layers at the page's own strengths
  const papers =
    choice === "app"
      ? [{ id: "app", src: "/landing/paper.jpg", size: "256px 256px", share: 1 }]
      : PAPER_LAYERS.filter((p) => (choice === "site" ? s[p.key] > 0 : p.id === choice)).map((p) => ({
          id: p.id as string,
          src: `/landing/paper/ink-${p.file}`,
          size: p.size,
          share: choice === "site" ? s[p.key] : 1,
        }));
  const grain: InkLayer[] = papers.map((p) => ({ src: p.src, size: p.size, blend, weight: p.share * strength }));
  if (look !== "through") return grain;
  // the gaps, in full at GAPS_FULL_AT, shared among the papers by their
  // strengths: the site's four together open about as much as one alone
  const toothed = papers.filter((p) => GAPS[p.id]);
  const total = toothed.reduce((sum, p) => sum + p.share, 0);
  const gaps: InkLayer[] = toothed.map((p) => ({
    src: GAPS[p.id],
    size: p.size,
    blend: "normal",
    weight: (p.share / total) * (strength / GAPS_FULL_AT),
  }));
  return [...grain, ...gaps];
}

/** One step of the paper in the ink, bottom first: a photo laid on in its
 *  blend, a wash back toward the ink by `alpha`, or the paper's colour in
 *  darken. The stylesheet's background stacks (inkStack) and the drawings'
 *  filter (InkPaperFilter.tsx) are both built from these. */
export type InkStep = { kind: "photo"; src: string; size: string; blend: InkLayer["blend"] } | { kind: "wash"; alpha: number } | { kind: "paper" };

/** A layer has no opacity of its own (a background layer, a filter's
 *  picture), so a photo's share is a wash of the ink laid over it: weakest
 *  first, the wash after each takes what is under it to its share of the
 *  next one up, and the last wash to the top one's own, so each photo ends
 *  at its weight. Past 1, a photo is laid on again. The gaps are white; on
 *  top, the paper's colour in darken takes them to the paper and leaves the
 *  ink, darker in every channel, as it was. */
export function inkSteps(layers: InkLayer[]): InkStep[] {
  const units = layers
    .flatMap((l) => Array.from({ length: Math.ceil(l.weight - 1e-3) }, (_, i) => ({ ...l, weight: Math.min(1, l.weight - i) })))
    .filter((l) => l.weight > 1e-3)
    .sort((a, b) => a.weight - b.weight);
  const steps: InkStep[] = [];
  units.forEach((u, i) => {
    steps.push({ kind: "photo", src: u.src, size: u.size, blend: u.blend });
    const keep = i + 1 < units.length ? u.weight / units[i + 1].weight : u.weight;
    if (keep < 0.999) steps.push({ kind: "wash", alpha: Math.round((1 - keep) * 1000) / 1000 });
  });
  if (units.some((u) => u.blend === "normal")) steps.push({ kind: "paper" });
  return steps;
}

/** The steps as background layers over a solid base colour (the doodles'
 *  blue, a letter's own colour), top first. At least one layer always, so
 *  the lists in the stylesheet stay whole. */
export function inkStack(layers: InkLayer[], base: (alpha: number) => string, paper: string) {
  const bottomUp = inkSteps(layers).map((step) =>
    step.kind === "photo"
      ? { image: `url(${step.src})`, size: step.size, blend: step.blend as string }
      : step.kind === "wash"
        ? { image: `linear-gradient(${base(step.alpha)} 0 0)`, size: "auto", blend: "normal" }
        : { image: `linear-gradient(${paper} 0 0)`, size: "auto", blend: "darken" }
  );
  if (!bottomUp.length) bottomUp.push({ image: "linear-gradient(transparent 0 0)", size: "auto", blend: "normal" });
  return bottomUp.reverse();
}

/** The steps the pen drawings take (Ink, through InkPaperFilter.tsx): the
 *  doodles' slider and paper. */
export function drawingInkSteps(s: BodyWallSettings) {
  return inkSteps(inkLayers(s, s.doodlePaper ?? 0));
}

/** The colour a letter shows on the cream, as a solid colour: its own
 *  laid over the cream at its own alpha, then alpha 1 (left out, a
 *  relative colour keeps its origin's). currentColor stays a word in the
 *  variable, so each letter's own colour is the one used. */
function textPaperBase([r, g, b]: [number, number, number]) {
  return `rgb(from currentColor calc(r * alpha + ${r} * (1 - alpha)) calc(g * alpha + ${g} * (1 - alpha)) calc(b * alpha + ${b} * (1 - alpha)) / 1)`;
}

/** A stack as the variables the stylesheet reads: images, sizes, blends,
 *  and a clip to the letters for each (the text's). */
function stackVars(name: string, stack: ReturnType<typeof inkStack>) {
  return {
    [`${name}-image`]: stack.map((l) => l.image).join(", "),
    [`${name}-size`]: stack.map((l) => l.size).join(", "),
    [`${name}-blend`]: stack.map((l) => l.blend).join(", "),
    [`${name}-clip`]: stack.map(() => "text").join(", "),
  };
}

/** The landing's cream, #f5ead5: what creamDepth 1 gives. */
export const CREAM_BASE_RGB = [245, 234, 213] as const;

/** The cream at `depth`: each channel that far from white along the line
 *  to CREAM_BASE_RGB, so 0 is white, 1 the base, 2 twice as far. */
export function creamRgb(depth: number): [number, number, number] {
  const d = Number.isFinite(depth) ? depth : 1;
  return CREAM_BASE_RGB.map((c) => Math.round(Math.max(0, Math.min(255, 255 - (255 - c) * d)))) as [number, number, number];
}

/** Any colour drawn for today's cream, moved to the cream at `depth`: each
 *  channel that far from white, the same line creamRgb follows. White stays
 *  white and #f5ead5 becomes the new cream, so a near-white drawn for the
 *  cream (the torn edge's core) keeps its place between them. */
export function onCreamLine(rgb: readonly [number, number, number], depth: number): [number, number, number] {
  const d = Number.isFinite(depth) ? depth : 1;
  return rgb.map((c) => Math.round(Math.max(0, Math.min(255, 255 - (255 - c) * d)))) as [number, number, number];
}

/** The same move as an SVG feColorMatrix, for pictures baked in today's
 *  cream (the torn edge's photographs): c' = d c + (1 - d), per channel,
 *  alpha kept. Use with color-interpolation-filters sRGB. */
export function creamLineMatrix(depth: number): string {
  const d = Number.isFinite(depth) ? depth : 1;
  const k = (1 - d).toFixed(4);
  return `${d} 0 0 0 ${k}  0 ${d} 0 0 ${k}  0 0 ${d} 0 ${k}  0 0 0 1 0`;
}

/** The settings the page's stylesheet reads, as its CSS variables: set on
 *  the page by Landing.tsx, and again, live, by the dev panel - one list, so
 *  the two never set different ones. */
export function pageVars(s: BodyWallSettings): Record<string, number | string> {
  return {
    "--peek": s.peekDesktop,
    "--peek-phone": s.peekMobile,
    "--hero-crop": s.heroCropDesktop,
    "--side-blur": s.sideBlur,
    "--side-blur-w": s.sideBlurWidth,
    "--vig-top": s.vignetteTop,
    "--vig-top-reach": s.vignetteTopReach,
    "--vig-bottom": s.vignetteBottom,
    "--vig-bottom-reach": s.vignetteBottomReach,
    "--vig-sides": s.vignetteSides,
    "--vig-sides-reach": s.vignetteSidesReach,
    "--vig-corners": s.vignetteCorners,
    "--you-seconds": s.youSeconds,
    "--curl-shade": s.curlShade,
    "--curl-reach": s.curlReach,
    "--carousel-gap": s.carouselGap,
    "--carousel-blur": s.carouselBlur,
    // The paper in the ink, as background layers (inkStack): over the
    // doodles' blue, and over each letter's own colour.
    ...stackVars("--doodle-paper", inkStack(inkLayers(s, s.doodlePaper ?? 0), (a) => `rgba(${BODY_INK_RGB}, ${a})`, `rgb(${creamRgb(s.creamDepth ?? 1).join(", ")})`)),
    // A letter's colour as it shows on the cream, solid: the photos are
    // solid, so over a see-through colour (the soft ink, 0.66) they would
    // turn the letters solid, darker and heavier than they were.
    "--text-paper-base": textPaperBase(creamRgb(s.creamDepth ?? 1)),
    ...stackVars(
      "--text-paper",
      inkStack(
        inkLayers(s, s.textPaper ?? 0),
        (a) => `color-mix(in srgb, var(--text-paper-base) ${Math.round(a * 1000) / 10}%, transparent)`,
        // the paper, or the letter's own colour where it is lighter (white
        // on a button stays white)
        `rgb(from var(--text-paper-base) ${creamRgb(s.creamDepth ?? 1).map((c, i) => `max(${"rgb"[i]}, ${c})`).join(" ")})`
      )
    ),
    // The site's cream (creamDepth). --paper is var(--cream) in the stylesheet.
    "--cream": `rgb(${creamRgb(s.creamDepth ?? 1).join(", ")})`,
    "--cream-rgb": creamRgb(s.creamDepth ?? 1).join(", "),
    // each paper layer: how strong, and its picture only when it shows
    ...Object.fromEntries(
      PAPER_LAYERS.flatMap((p) => [
        [`--paper-${p.id}`, s[p.key]],
        [`--paper-${p.id}-img`, s[p.key] > 0 ? `url(/landing/paper/${p.file})` : "none"],
      ])
    ),
  };
}

/** Below this width the page is laid out for a phone (the stylesheet's own
 *  breakpoint): drawings smaller, and the phone's cream band. */
export const PHONE_WIDTH = 760;

/** The ballpoint blue of every doodle wall (doodleWall.ts, WALL_THEMES). */
export const BODY_INK_RGB = "52, 72, 206";

// Live tuning, development only: the sliders set this and the wall follows.
let current = BODY_WALL_DEFAULTS;
const listeners = new Set<() => void>();
export const bodyWallSettings = () => current;
export function setBodyWallSettings(next: BodyWallSettings) {
  current = next;
  for (const l of listeners) l();
}
export function onBodyWallSettings(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Big, middle, small: the wall's own sizes (CSS px, longer side) and its
 *  counts for a 1400 x 1000 tile. */
const CLASSES = [
  { size: [130, 190], most: 60 },
  { size: [64, 104], most: 120 },
  { size: [24, 46], most: 320 },
] as const;

export type Keep = [x: number, y: number, w: number, h: number];
export type Placed = { src: string; x: number; y: number; w: number; h: number; angle: number };

/**
 * Pack drawings into a width x height area, keeping clear of `keep`. Each
 * drawing is placed whole: what it covers is its actual ink at its size and
 * turn, so they nestle. Yields to the page every few milliseconds - this
 * runs while the page is in use.
 *
 * `stay`: drawings already on the page. Each one whose ink is still clear of
 * `keep` stays exactly where it is, and counts toward its kind's share; only
 * the rest of the space is filled. So a page that grows - an answer opened
 * on the Help page (2026-10-08: "when you open the q's the doodles on the
 * page shift") - loses only the drawings its text now runs into, and the
 * others do not move.
 */
export async function packAround(opts: {
  width: number;
  height: number;
  keep: Keep[];
  drawings: Array<{ src: string; img: HTMLImageElement; cls: number }>;
  settings: BodyWallSettings;
  seed: number;
  phone: boolean;
  cancelled: () => boolean;
  stay?: Placed[];
  /** Strips to fill first with a row of small drawings, each kept only off
   *  its own `avoid` boxes (by `margin`), not off everything by the
   *  clearance: the cream between the hero's torn edge and the covers'
   *  collage is too narrow for that (2026-10-10: "i also want dodles in that
   *  region between the rip at below hero and top of carousel"). */
  rows?: Array<{ y0: number; y1: number; avoid: Keep[]; margin: number }>;
}): Promise<Placed[] | null> {
  const { width, height, keep, drawings, settings, phone } = opts;
  let seed = opts.seed >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const CELL = 6;
  const GW = Math.ceil(width / CELL);
  const GH = Math.ceil(height / CELL);
  const occ = new Uint8Array(GW * GH);
  // What to keep clear, grown by the clearance.
  const c = settings.clearance;
  for (const [x, y, w, h] of keep) {
    const x0 = Math.max(0, Math.floor((x - c) / CELL));
    const y0 = Math.max(0, Math.floor((y - c) / CELL));
    const x1 = Math.min(GW, Math.ceil((x + w + c) / CELL));
    const y1 = Math.min(GH, Math.ceil((y + h + c) / CELL));
    for (let gy = y0; gy < y1; gy++) occ.fill(1, gy * GW + x0, gy * GW + Math.max(x0, x1));
  }

  const grow = (m: Uint8Array, n: number, r: number) => {
    if (r <= 0) return m;
    const a = new Uint8Array(n * n);
    const out = new Uint8Array(n * n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < n) v = m[y * n + xx];
        }
        a[y * n + x] = v;
      }
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        let v = 0;
        for (let d = -r; d <= r && !v; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < n) v = a[yy * n + x];
        }
        out[y * n + x] = v;
      }
    return out;
  };
  // A drawing as cells: `test`, its ink grown by the gap - what must be free
  // to place it; `mark`, its ink alone - what it then takes (so the next one
  // keeps the gap from it, not twice the gap); `ring`, just beyond the test -
  // how much it would touch.
  const gapCells = Math.max(0, Math.round(settings.gap / CELL));
  const probe = document.createElement("canvas");
  const pg = probe.getContext("2d", { willReadFrequently: true })!;
  const cellsOf = (img: HTMLImageElement, w: number, h: number, angle: number) => {
    const n = Math.ceil(Math.hypot(w, h) / CELL) + 2 * (gapCells + 4);
    probe.width = probe.height = n;
    pg.clearRect(0, 0, n, n);
    pg.setTransform(Math.cos(angle) / CELL, Math.sin(angle) / CELL, -Math.sin(angle) / CELL, Math.cos(angle) / CELL, n / 2, n / 2);
    pg.drawImage(img, -w / 2, -h / 2, w, h);
    pg.setTransform(1, 0, 0, 1, 0, 0);
    const px = pg.getImageData(0, 0, n, n).data;
    const inked = new Uint8Array(n * n);
    for (let i = 0; i < inked.length; i++) inked[i] = px[i * 4 + 3] > 24 ? 1 : 0;
    const test = grow(inked, n, gapCells);
    const reach = grow(inked, n, gapCells + 3);
    const testCells: number[] = [];
    const markCells: number[] = [];
    const ringCells: number[] = [];
    for (let i = 0; i < test.length; i++) {
      const [x, y] = [(i % n) - (n >> 1), Math.floor(i / n) - (n >> 1)];
      if (inked[i]) markCells.push(x, y);
      if (test[i]) testCells.push(x, y);
      else if (reach[i]) ringCells.push(x, y);
    }
    return { testCells, markCells, ringCells };
  };
  const at = (cx: number, cy: number, dx: number, dy: number) => {
    const [x, y] = [cx + dx, cy + dy];
    return x < 0 || y < 0 || x >= GW || y >= GH ? -1 : y * GW + x;
  };
  const freeSpot = () => {
    for (let t = 0; t < 40; t++) {
      const i = Math.floor(rand() * occ.length);
      if (!occ[i]) return [i % GW, Math.floor(i / GW)];
    }
    return [Math.floor(rand() * GW), Math.floor(rand() * GH)];
  };

  const area = (width * height) / (1400 * 1000);
  const scale = settings.size * (phone ? 0.7 : 1);
  const placed: Placed[] = [];
  // What stays: tested against what must be kept clear (and each other) by
  // its own ink, as a new drawing would be.
  const bySrc = new Map(drawings.map((d) => [d.src, d]));
  const stayed = new Map<number, number>();
  for (const p of opts.stay ?? []) {
    const d = bySrc.get(p.src);
    if (!d) continue;
    const { testCells, markCells } = cellsOf(d.img, p.w, p.h, p.angle);
    const [cx, cy] = [Math.round(p.x / CELL), Math.round(p.y / CELL)];
    let hit = 0;
    for (let i = 0; i < testCells.length && !hit; i += 2) {
      const j = at(cx, cy, testCells[i], testCells[i + 1]);
      hit = j < 0 ? 1 : occ[j];
    }
    if (hit) continue;
    for (let i = 0; i < markCells.length; i += 2) {
      const j = at(cx, cy, markCells[i], markCells[i + 1]);
      if (j >= 0) occ[j] = 1;
    }
    placed.push(p);
    stayed.set(d.cls, (stayed.get(d.cls) ?? 0) + 1);
  }
  // The rows: drawings left to right along each strip, a gap apart,
  // stepping past what the strip must avoid - each kind whose smallest fits
  // the strip (a wider gap above the collage lets the middle and big ones
  // in), at the row's own size, never taller than the strip.
  const rowScale = scale * (settings.rowDoodleSize ?? 1);
  for (const row of opts.rows ?? []) {
    const room = row.y1 - row.y0;
    const pool = drawings.filter((d) => CLASSES[d.cls].size[0] * rowScale <= room || d.cls === CLASSES.length - 1);
    if (room < 14 || !pool.length) continue;
    const blocked = (x0: number, x1: number, y0: number, y1: number) =>
      row.avoid.some(([ax, ay, aw, ah]) => x1 > ax - row.margin && x0 < ax + aw + row.margin && y1 > ay - row.margin && y0 < ay + ah + row.margin);
    let bag: typeof pool = [];
    let x = settings.gap * rand();
    while (x < width) {
      if (!bag.length) {
        bag = [...pool];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      const d = bag.pop()!;
      const [lo, hi] = CLASSES[d.cls].size;
      const long = Math.min(room, (lo + rand() * (hi - lo)) * rowScale);
      const k = long / Math.max(d.img.width, d.img.height);
      const [w, h] = [d.img.width * k, d.img.height * k];
      const cy = row.y0 + h / 2 + rand() * Math.max(0, room - h);
      if (x + w > width) break;
      if (blocked(x, x + w, cy - h / 2, cy + h / 2)) {
        x += 12;
        continue;
      }
      const angle = (rand() - 0.5) * 0.5;
      const { markCells } = cellsOf(d.img, w, h, angle);
      const [cx, ccy] = [Math.round((x + w / 2) / CELL), Math.round(cy / CELL)];
      for (let i = 0; i < markCells.length; i += 2) {
        const j = at(cx, ccy, markCells[i], markCells[i + 1]);
        if (j >= 0) occ[j] = 1;
      }
      placed.push({ src: d.src, x: cx * CELL, y: ccy * CELL, w, h, angle });
      x += w + settings.gap * (0.8 + rand() * 0.8);
    }
  }

  let slice = performance.now();
  for (const [ci, cls] of CLASSES.entries()) {
    const pool = drawings.filter((d) => d.cls === ci);
    const most = Math.round(cls.most * settings.density * area);
    let misses = 0;
    let n = stayed.get(ci) ?? 0;
    let bag: typeof pool = [];
    while (pool.length && misses < 8 && n < most) {
      if (performance.now() - slice > 8) {
        await new Promise((r) => setTimeout(r, 0));
        if (opts.cancelled()) return null;
        slice = performance.now();
      }
      if (!bag.length) {
        bag = [...pool];
        for (let i = bag.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [bag[i], bag[j]] = [bag[j], bag[i]];
        }
      }
      const d = bag.pop()!;
      const long = (cls.size[0] + rand() * (cls.size[1] - cls.size[0])) * scale;
      const k = long / Math.max(d.img.width, d.img.height);
      const [w, h] = [d.img.width * k, d.img.height * k];
      const angle = (rand() - 0.5) * 0.5;
      const { testCells, markCells, ringCells } = cellsOf(d.img, w, h, angle);
      let best: { cx: number; cy: number; score: number } | null = null;
      for (let t = 0; t < 200; t++) {
        const [cx, cy] = freeSpot();
        let hit = 0;
        for (let i = 0; i < testCells.length && !hit; i += 2) {
          const j = at(cx, cy, testCells[i], testCells[i + 1]);
          hit = j < 0 ? 1 : occ[j];
        }
        if (hit) continue;
        let score = 0;
        for (let i = 0; i < ringCells.length; i += 2) {
          const j = at(cx, cy, ringCells[i], ringCells[i + 1]);
          if (j >= 0) score += occ[j];
        }
        score += rand() * 0.5;
        if (!best || score > best.score) best = { cx, cy, score };
      }
      if (!best) {
        misses++;
        continue;
      }
      misses = 0;
      for (let i = 0; i < markCells.length; i += 2) {
        const j = at(best.cx, best.cy, markCells[i], markCells[i + 1]);
        if (j >= 0) occ[j] = 1;
      }
      placed.push({ src: d.src, x: best.cx * CELL, y: best.cy * CELL, w, h, angle });
      n++;
    }
  }
  return placed;
}

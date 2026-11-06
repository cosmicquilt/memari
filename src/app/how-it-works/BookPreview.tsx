"use client";

// THE BOOK, AS IT WILL ARRIVE (2026-11-06): the How it works page's 3D book
// beside the covers ("a but with b's preview in place next to covers"), and
// smaller in the hero. Its front is the cover exactly as the covers page
// draws it (CoverFront: the scan, its mark, the book's dates); its thickness
// follows the pages; the binding is drawn as what it is.
//
// WIRE-O, NOT A SPIRAL (his note on the mockup: "right now mockup shows
// spiral instead of wire o"). A spiral is one wire wound through round
// holes, its turns slanting down the spine. Wire-o is TWIN LOOPS: at every
// punched hole, two parallel wires curl round the spine and back through
// the same hole, square to the edge, three holes to the inch. So each hole
// gets a PAIR of rings, upright, centred where a circle through both
// covers' hole lines would sit - real circles in 3D, so they curl round
// the spine from any angle. BookVault's wire is black (memory:
// memari-printer-tiers).

import type { CSSProperties } from "react";
import { CoverFront, picturedOptions } from "@/app/covers/CoverFront";
import { SpreadPreview } from "@/app/landing/SpreadPreview";
import type { Binding } from "@/lib/print/products";
import { RIBBON_COLOURS, useBook } from "./BookState";
import css from "./howItWorks.module.css";

/** Pixels per inch of the drawing: 7 x 10 in is 252 x 360. */
const PX = 36;
const W = 7 * PX;
const H = 10 * PX;
/** Wire-o's pitch: three holes to the inch. */
const PITCH = PX / 3;
/** The holes' centre line from the bound edge (about 4 mm). */
const HOLE_X = 6;
/** Holes down a 10 in edge at three to the inch, a quarter inch clear at each end. */
const HOLES = Math.floor((H - PX / 2) / PITCH);
/** The two wires of a loop, either side of the hole's middle. */
const TWIN = 1.3;
/** A hardcover's board, about 2.5 mm. */
const BOARD = 3.5;

/** A HARDCOVER IS A CASE (2026-11-06, his "the spine of hardcover on left
 *  side looks wrong"): its boards stand proud of the pages at head, tail
 *  and fore-edge, and the spine is as tall as the boards - it was the
 *  pages' height, so a step showed at each end with the pages' edge in the
 *  gap. The boards have thickness too: their edges, cover wrapped round
 *  them, at head, tail and fore-edge of each. */
const BOARD_EDGES = (["front", "back"] as const).flatMap((side) => (["head", "tail", "fore"] as const).map((edge) => ({ side, edge })));

/** About how thick the book is, inches: Lulu's 60# paper runs 444 pages an
 *  inch (the spine its covers are drawn for); BookVault's by weight, about
 *  0.1 mm a leaf at 80 gsm and 0.2 mm at 170 gsm. Plus the covers. */
export function thicknessInches(binding: Binding, printed: number): number {
  if (binding === "wireo") return ((printed / 2) * 0.2) / 25.4 + 0.05;
  if (binding === "wireoStandard") return ((printed / 2) * 0.1) / 25.4 + 0.05;
  return printed / 444 + (binding === "hardcover" ? 0.16 : 0.02);
}

/** The loops: a pair at each hole, from a quarter inch in at either end. */
function rings(t: number) {
  // a circle through (HOLE_X, +t/2) and (HOLE_X, -t/2), standing a little
  // proud of the covers
  const r = t / 2 + 3.5;
  const cx = HOLE_X - Math.sqrt(r * r - (t / 2) * (t / 2));
  const out: Array<{ key: string; style: CSSProperties }> = [];
  for (let y = PX / 4 + PITCH / 2; y < H - PX / 4; y += PITCH) {
    for (const dy of [-TWIN, TWIN]) {
      out.push({ key: `${y.toFixed(1)}${dy}`, style: { left: cx - r, top: y + dy - r, width: 2 * r, height: 2 * r } });
    }
  }
  return out;
}

export function BookPreview({ still = false, open = false }: { still?: boolean; open?: boolean }) {
  const book = useBook();
  const { binding, plan, cover, datesWords, ribbonOn, choices } = book;
  const wire = binding === "wireo" || binding === "wireoStandard";
  const t = Math.min(80, Math.max(6, thicknessInches(binding, plan.printed) * PX));
  const ribbon = RIBBON_COLOURS.find(([name]) => name === choices.ribbonColour)![1];
  const showOpen = open && !still;
  return (
    <div className={css.scene} data-still={still || undefined}>
      {showOpen ? (
        <div className={css.openBook} data-wire={wire || undefined}>
          <SpreadPreview spreadKey="student" />
          {/* open flat, each loop's two wires bridge the gutter from a hole
              on the left page to its hole on the right */}
          {wire &&
            Array.from({ length: HOLES }, (_, k) => <span key={k} className={css.loop} style={{ top: `${2.5 + ((k + 0.5) * 95) / HOLES}%` }} aria-hidden="true" />)}
        </div>
      ) : (
        <div
          className={css.book}
          data-binding={binding}
          style={{ "--w": `${W}px`, "--h": `${H}px`, "--t": `${t}px`, "--board": `${BOARD}px` } as CSSProperties}
          role="img"
          aria-label={`Your book: ${cover.name} cover, ${plan.printed} pages, ${wire ? "metal wire-o" : binding}`}
        >
          <div className={css.back} style={{ backgroundImage: `url(${cover.front})` }} />
          <div className={css.spine} style={wire ? undefined : { backgroundImage: `url(${cover.front})` }} />
          <div className={css.foreEdge} />
          <div className={css.topEdge} />
          <div className={css.bottomEdge} />
          {binding === "hardcover" &&
            BOARD_EDGES.map(({ side, edge }) => (
              <i key={`${side}-${edge}`} className={css.boardEdge} data-side={side} data-edge={edge} style={{ backgroundImage: `url(${cover.front})` }} />
            ))}
          <div className={css.front}>
            <CoverFront cover={cover} options={picturedOptions(cover)} datesWords={datesWords} name="" eager={still} />
            {wire && <span className={css.holes} style={{ "--pitch": `${PITCH}px`, "--hole-x": `${HOLE_X}px` } as CSSProperties} />}
            {binding === "hardcover" && <span className={css.joint} />}
            <span className={css.sheen} />
          </div>
          {wire && rings(t).map((ring) => <i key={ring.key} className={css.ring} style={ring.style} />)}
          {ribbonOn && <div className={css.ribbon} style={{ background: ribbon }} />}
        </div>
      )}
    </div>
  );
}

// A cover's front, flat, as it prints (2026-11-05, the covers page's "Make
// it yours"): the scan fitted to the 7 x 10 board, and on it the chosen
// mark in the chosen finish, the book's dates and a name - every one of
// them a choice on every cover (Andrew: "all covers will be able to have
// either imprint or gold", then "all of those are optional option as well
// as the persons name").
//
// Drawn with type rather than the print's mark pictures (coverMarks), at the
// places coverTexture.ts measured off the carousel's photographs: the m. a
// third of the way down, its ink 0.132 of the width; the corner m. at
// (0.876, 0.922); the wordmark 0.257 wide at a third down; the dates' right
// edge at 0.92 and their baseline near the foot. Sizes are in the front's
// own width (cqw), so a front of any size is the same drawing. The name sits
// under the mark, or a third of the way down when the mark is in the corner
// (his "name looks good").
//
// Pure: no state, so the page's server parts use it too.

import type { Cover, CoverGoldTone } from "./catalogue";
import { MARK_WORDS, NAME_PLACES, NAME_ROOM, NAME_SIZE, NAME_TRACK, markPicture, picturedFront, placeOf, type FrontFinish, type FrontMark } from "@/lib/print/coverFront";
import css from "./covers.module.css";

// one set of marks, words and places for the page and the print (coverFront.ts)
export { MARK_WORDS, type FrontFinish, type FrontMark };
/** The page's options: the name as on or off, its words held beside them. */
export type FrontOptions = { mark: FrontMark; finish: FrontFinish; dates: boolean; name: boolean };

/** The options as the cover is pictured on its notebook - where a person
 *  starts from. */
export function picturedOptions(cover: Cover): FrontOptions {
  const front = picturedFront(cover);
  return { mark: front.mark, finish: front.finish, dates: front.dates, name: false };
}

const INK: Record<"imprint" | CoverGoldTone, string> = {
  imprint: css.inkImprint,
  gold: css.inkGold,
  deep: css.inkDeep,
  dark: css.inkDark,
};


export function CoverFront({
  cover,
  options,
  datesWords,
  name,
  label,
  className,
  eager = false,
  src,
  hold,
}: {
  cover: Cover;
  options: FrontOptions;
  /** "December 2026 to February 2027", as the order prints them */
  datesWords: string;
  name: string;
  /** what the picture is, for a screen reader; none when words beside it say so */
  label?: string;
  className?: string;
  /** on the first screen: loaded at once */
  eager?: boolean;
  /** another picture of it - the whole scan, for a close look - placed as
   *  the printer places it: scaled to the board, held to its outer edge */
  src?: string;
  hold?: "right";
}) {
  // a light cover's gold is the deeper gold its picture has (goldTone)
  const tone = options.finish === "gold" ? cover.goldTone : "imprint";
  const ink = INK[tone];
  const shown = options.name ? name.trim() : "";
  // a long name gets smaller rather than running off the board: Newsreader's
  // capitals are about 0.667em a letter, and the spacing adds NAME_TRACK
  const nameSize = shown ? `min(${NAME_SIZE * 100}cqw, ${((NAME_ROOM * 100) / (shown.length * (0.667 + NAME_TRACK))).toFixed(2)}cqw)` : undefined;
  const mark = options.mark === "none" ? null : { place: placeOf(options.mark), src: `/landing/covers/marks/${markPicture(options.mark, tone).replace("/", "-")}.png` };
  return (
    // the dates are today's example, so they may differ from the build's (the label carries them)
    <div className={`${css.front} ${className ?? ""}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} suppressHydrationWarning>
      {/* the site's arrival turns a lazy picture on the first screen eager
          before React hydrates (SiteArrival.tsx), on purpose */}
      {/* eslint-disable-next-line @next/next/no-img-element -- the front, already sized (public/landing/covers/front) */}
      <img
        className={css.frontTexture}
        src={src ?? cover.front}
        alt=""
        width={420}
        height={600}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        style={hold ? { objectPosition: "right center" } : undefined}
        suppressHydrationWarning
      />
      {/* the very picture the printed cover draws (coverMarks), at its place */}
      {mark && (
        // eslint-disable-next-line @next/next/no-img-element -- the print's own mark, a small PNG
        <img className={css.frontMarkImg} src={mark.src} alt="" style={{ left: `${mark.place.x * 100}%`, top: `${mark.place.y * 100}%`, width: `${mark.place.width * 100}%` }} />
      )}
      {shown && (
        <span className={`${css.frontName} ${ink}`} style={{ top: `calc(${NAME_PLACES[options.mark] * 100}% - 0.4em)`, fontSize: nameSize, letterSpacing: `${NAME_TRACK}em` }}>
          {shown}
        </span>
      )}
      {options.dates && (
        <span className={`${css.frontDates} ${ink}`} suppressHydrationWarning>
          {datesWords}
        </span>
      )}
    </div>
  );
}

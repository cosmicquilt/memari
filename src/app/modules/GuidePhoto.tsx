import Image from "next/image";
import type { GuidePhoto as Photo } from "@/lib/moduleGuides";
import css from "./GuidePhoto.module.css";

// The picture at the top of a module page: the practice's person or place,
// as a postage stamp stuck to the page and franked - Andrew, 2026-10-15: "a
// polaroid photo taped photorealistic as possible", then "or maybe actually
// a stamp not a polaroid". A taped polaroid was built beside it to compare,
// and he kept the stamp (2026-10-16); one look for every page.
//
// The stamp is all CSS over the photo: perforations cut by a mask (so the
// page shows through the holes, and the shadow under them follows the
// teeth), a paper margin with the picture inset, its caption band, and a
// postmark struck across one corner in uneven ink. Its size is a whole
// number of perforations each way, so a hole falls on every corner.

const POSTMARK_WORD: Record<string, string> = {
  day: "DAILY",
  week: "WEEKLY",
  month: "MONTHLY",
  journal: "BOOK",
};

export function GuidePhoto({ photo, cadence }: { photo: Photo; cadence?: string }) {
  const wide = !!photo.landscape;
  const credit = (
    <figcaption className={css.credit}>
      <a href={photo.sourceUrl} rel="noreferrer">
        {photo.credit}
      </a>
      .{" "}
      {photo.licenseUrl ? (
        <a href={photo.licenseUrl} rel="noreferrer">
          {photo.license}
        </a>
      ) : (
        photo.license
      )}
      , via Wikimedia Commons.
    </figcaption>
  );

  return (
    <figure className={`${css.figure} ${css.stampFigure}`}>
      <div className={css.stampArea}>
        <div className={css.stampLift}>
          <div className={`${css.stamp} ${wide ? css.wide : ""}`}>
            <div className={css.stampPicture}>
              <Image src={photo.src} alt={photo.alt} width={wide ? 640 : 512} height={wide ? 512 : 640} sizes="240px" priority />
            </div>
            <div className={css.stampBand}>
              <span className={css.stampLine}>
                <span className={css.stampCaption}>{photo.caption}</span>
                <span className={css.stampIssuer}>m.</span>
              </span>
            </div>
          </div>
        </div>
        {!photo.unfranked && <Postmark word={POSTMARK_WORD[cadence ?? ""] ?? "MODULES"} />}
      </div>
      {credit}
    </figure>
  );
}

/** A hand-struck postmark: a double ring with the studio's name round it,
 *  and the wavy cancelling lines run off to the left - in an ink that is
 *  heavier where the stamp was pressed hardest and broken by the paper. */
function Postmark({ word }: { word: string }) {
  const waves = [0, 1, 2, 3, 4].map((i) => {
    const y = 26 + i * 7;
    let d = `M 30 ${y}`;
    for (let x = 30; x < 88; x += 12) d += ` q 3 -3.2 6 0 t 6 0`;
    return <path key={i} d={d} />;
  });
  return (
    <svg className={css.postmark} viewBox="28 0 144 96" aria-hidden>
      <defs>
        <filter id="pm-ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.9" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="broken" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="3" result="wobble" />
          <feDisplacementMap in="broken" in2="wobble" scale="1.6" />
        </filter>
        <linearGradient id="pm-press" x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.8" />
        </linearGradient>
        <mask id="pm-pressure">
          <rect x="28" width="144" height="96" fill="url(#pm-press)" />
        </mask>
        <path id="pm-top" d="M 98 48 a 30 30 0 0 1 60 0" />
        <path id="pm-bottom" d="M 95.5 48 a 32.5 32.5 0 0 0 65 0" />
      </defs>
      <g filter="url(#pm-ink)" mask="url(#pm-pressure)" fill="none" stroke="currentColor">
        <g strokeWidth="1.5" strokeLinecap="round">{waves}</g>
        <circle cx="128" cy="48" r="37" strokeWidth="1.7" />
        <circle cx="128" cy="48" r="24" strokeWidth="1.1" />
        <g fill="currentColor" stroke="none" fontFamily="var(--font-ui), system-ui, sans-serif" fontWeight="700" letterSpacing="1.4">
          <text fontSize="7.4">
            <textPath href="#pm-top" startOffset="50%" textAnchor="middle">
              MEMARI STUDIO
            </textPath>
          </text>
          <text fontSize="7.4">
            <textPath href="#pm-bottom" startOffset="50%" textAnchor="middle">
              ★ MODULES ★
            </textPath>
          </text>
          <text x="128" y="51" fontSize="8.6" textAnchor="middle" letterSpacing="0.8">
            {word}
          </text>
        </g>
      </g>
    </svg>
  );
}

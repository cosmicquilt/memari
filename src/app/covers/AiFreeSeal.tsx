// "AI-free textures", inked like the modules' postmark (modules/GuidePhoto.tsx:
// the same broken ink, rings and lettering round the edge), asked for
// 2026-10-26.
//
// TRUE, CHECKED: the covers come from ambientCG's CC0 library, whose creation
// methods are all photographs (photogrammetry, multi-angle light, a colour
// photo) or surfaces built in Adobe Substance 3D Designer by texture
// artists - none generated (docs.ambientcg.com/creation-methods; per cover in
// handoff/cover-tools/methods.json: 64 procedural, 18 photographed, 3 from
// procedural sky and snow files). The seal speaks of the TEXTURES only: the
// notebook previews were cut out with masking models (handoff mockups).

import css from "./covers.module.css";

export function AiFreeSeal() {
  return (
    <svg className={css.seal} viewBox="0 0 96 96" role="img" aria-label="AI-free textures: made by people, not AI">
      <defs>
        <filter id="seal-ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 1.9" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" result="broken" />
          <feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="1" seed="5" result="wobble" />
          <feDisplacementMap in="broken" in2="wobble" scale="1.4" />
        </filter>
        <linearGradient id="seal-press" x1="0" y1="0" x2="1" y2="0.4">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.8" />
        </linearGradient>
        <mask id="seal-pressure">
          <rect width="96" height="96" fill="url(#seal-press)" />
        </mask>
        <path id="seal-top" d="M 12.5 48 a 35.5 35.5 0 0 1 71 0" />
        <path id="seal-bottom" d="M 9.6 48 a 38.4 38.4 0 0 0 76.8 0" />
      </defs>
      <g filter="url(#seal-ink)" mask="url(#seal-pressure)" fill="none" stroke="currentColor">
        <circle cx="48" cy="48" r="44" strokeWidth="1.8" />
        <circle cx="48" cy="48" r="29" strokeWidth="1.2" />
        <g fill="currentColor" stroke="none" fontFamily="var(--font-ui), system-ui, sans-serif" fontWeight="700" letterSpacing="1.2">
          <text fontSize="7.4">
            <textPath href="#seal-top" startOffset="50%" textAnchor="middle">
              AI-FREE TEXTURES
            </textPath>
          </text>
          <text fontSize="7.4">
            <textPath href="#seal-bottom" startOffset="50%" textAnchor="middle">
              ★ MEMARI STUDIO ★
            </textPath>
          </text>
          <text x="48" y="52.5" fontSize="13.5" textAnchor="middle" letterSpacing="0.8">
            NO AI
          </text>
        </g>
      </g>
    </svg>
  );
}

"use client";

// The parts of How it works that show the reader's own book (BookState):
// counts in the text, the book's first pages, the outside with the 3D book
// beside the covers, the trip to the door, the renewal and the calculator.
// Everything else on the page is plain, server-drawn text (page.tsx).

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PageLevel } from "@/generated/prisma/enums";
import { loadSet } from "@/app/landing/previewSets";
import type { LandingSpread } from "@/app/landing/spreads";
import { PagePreview } from "@/app/planner/PagePreview";
import { BINDING_SPECS, paperChoices, type Binding } from "@/lib/print/products";
import { spreadsOf, type BookPage } from "./book";
import { BookPreview, thicknessInches } from "./BookPreview";
import { arrivalWords, bindingWords, dayMonth, LIMITS, makingWords, money, printerWords, RIBBON_COLOURS, useBook, type Choices } from "./BookState";
import css from "./howItWorks.module.css";

// --- small words ------------------------------------------------------------------

/** How many times a level prints in the reader's book. */
export function Times({ level }: { level: PageLevel }) {
  return <b className={css.live}>{useBook().plan.counts[level]}</b>;
}
export function FrontBack() {
  const { choices } = useBook();
  return <b className={css.live}>{choices.front + choices.back}</b>;
}
export function Printed() {
  return <b className={css.live}>{useBook().plan.printed}</b>;
}
export function LengthWords() {
  const { days, startDate } = useBook();
  return (
    <>
      {days} days from {dayMonth(startDate, true)}
    </>
  );
}

// --- controls ---------------------------------------------------------------------

function Switch({ on, onChange, label, id }: { on: boolean; onChange: (on: boolean) => void; label: string; id?: string }) {
  // data-paper-skip: an empty button is a picture, not text for the paper to fill (landing.module.css)
  return <button type="button" id={id} data-paper-skip="" className={css.switch} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

function Stepper({ value, onChange, min, max, label }: { value: number; onChange: (v: number) => void; min: number; max: number; label: string }) {
  return (
    <span className={css.stepper} role="group" aria-label={label}>
      <button type="button" disabled={value <= min} aria-label={`Fewer: ${label}`} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" disabled={value >= max} aria-label={`More: ${label}`} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}

function LevelControls() {
  const { choices: c, set, plan } = useBook();
  const fixed = (key: "front" | "back", name: string, note: string) => (
    <div className={css.level}>
      <span />
      <span className={css.levelName}>{name}</span>
      <Stepper value={c[key]} min={LIMITS[key][0]} max={LIMITS[key][1]} label={name} onChange={(v) => set({ [key]: v })} />
      <span className={css.levelNote}>{note}</span>
    </div>
  );
  const repeat = (key: "month" | "week" | "day", level: PageLevel, name: string, note: string, unit: string) => {
    const extra = `${key}Extra` as "monthExtra" | "weekExtra" | "dayExtra";
    const per = plan.perLevel[level];
    return (
      <div className={css.level} data-off={!c[key] || undefined}>
        <Switch on={c[key]} label={name} onChange={(on) => set({ [key]: on } as Partial<Choices>)} />
        <span className={css.levelName}>{name}</span>
        <span className={css.levelSum}>{c[key] ? `${per} × ${plan.counts[level]} = ${per * plan.counts[level]}` : "off"}</span>
        <span className={css.levelNote}>{note}</span>
        {c[key] && (
          <span className={css.levelExtra}>
            Extra pages each {unit}
            <Stepper value={c[extra]} min={LIMITS[extra][0]} max={LIMITS[extra][1]} label={`extra pages each ${unit}`} onChange={(v) => set({ [extra]: v })} />
          </span>
        )}
      </div>
    );
  };
  return (
    <div className={css.levels}>
      {fixed("front", "Front pages", "Goals, lists, a year at a glance. Printed once.")}
      {repeat("month", PageLevel.MONTHLY, "Every month", "A two-page month spread", "month")}
      {repeat("week", PageLevel.WEEKLY, "Every week", "A two-page week spread", "week")}
      {repeat("day", PageLevel.DAILY, "Every day", "A page a day", "day")}
      {fixed("back", "Back pages", "Notes and lists at the end. Printed once.")}
    </div>
  );
}

function LengthControl({ id }: { id: string }) {
  const { choices: c, set, startDate, plan } = useBook();
  return (
    <div className={css.control}>
      <div className={css.chips}>
        {([30, 90, 365, "other"] as const).map((length) => (
          <button key={length} type="button" className={css.chip} aria-pressed={c.length === length} onClick={() => set({ length })}>
            {length === 365 ? "A year" : length === "other" ? "Other" : `${length} days`}
          </button>
        ))}
      </div>
      <div className={css.fields}>
        {c.length === "other" && (
          <label className={css.field}>
            Days (up to 731)
            <input id={`${id}-days`} type="number" min={1} max={731} value={c.otherDays} onChange={(e) => e.target.value && set({ otherDays: Number(e.target.value) })} />
          </label>
        )}
        <label className={css.field}>
          Starts
          <input id={`${id}-start`} type="date" value={c.start} onChange={(e) => e.target.value && set({ start: e.target.value })} />
        </label>
      </div>
      <p className={css.small}>
        {dayMonth(startDate, true)} to {dayMonth(plan.end, true)}
      </p>
    </div>
  );
}

const ICONS: Record<Binding, ReactNode> = {
  wireo: <WireIcon />,
  wireoStandard: <WireIcon />,
  coil: <WireIcon />,
  paperback: (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="9" y="5" width="23" height="30" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12.5 5v30" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  ),
  hardcover: (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="8" y="4" width="26" height="32" rx="2" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 4c-1.6 4-1.6 28 0 32" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  ),
};

/** Wire-o in a line: twin loops, square to the edge (not a spiral's slant). */
function WireIcon() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect x="12" y="5" width="22" height="30" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {[9, 14, 19, 24, 29].map((y) => (
        <g key={y} stroke="currentColor" strokeWidth="1.1" fill="none">
          <path d={`M15 ${y - 0.9} H8.5`} />
          <path d={`M15 ${y + 0.9} H8.5`} />
        </g>
      ))}
    </svg>
  );
}

function BindingChoice({ wide = false }: { wide?: boolean }) {
  const { set, binding, options } = useBook();
  return (
    <div className={wide ? `${css.binds} ${css.bindsWide}` : css.binds}>
      {options.map((o) => {
        const spec = BINDING_SPECS[o.binding];
        return (
          <button key={o.binding} type="button" className={css.bind} aria-pressed={binding === o.binding} onClick={() => set({ binding: o.binding })}>
            {ICONS[o.binding]}
            <b>{spec.short}</b>
            <span>{o.binding === "wireo" || o.binding === "wireoStandard" ? `${spec.note}, lies flat` : "Cream or white paper"}</span>
            <span className={o.estimate ? css.bindPrice : `${css.bindPrice} ${css.muted}`}>
              {o.problem ? (o.binding === "wireo" ? "Too thick: standard paper" : "Too many pages") : o.estimate ? money(o.estimate.totalCents) : "Priced at checkout"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PaperChoice() {
  const { choices: c, set, binding } = useBook();
  const papers = paperChoices(binding);
  if (papers.length < 2) return null;
  return (
    <div className={css.control}>
      <span className={css.label}>Paper</span>
      <div className={css.chips}>
        {papers.map((paper) => (
          <button key={paper} type="button" className={css.chip} aria-pressed={c.paper === paper} onClick={() => set({ paper })}>
            {paper === "cream" ? "Cream" : "White"}
          </button>
        ))}
      </div>
    </div>
  );
}

function RibbonChoice({ id }: { id: string }) {
  const { choices: c, set, binding, estimate, ribbonOn } = useBook();
  return (
    <div className={css.control}>
      <div className={css.row}>
        <Switch id={id} on={c.ribbon} label="Ribbon" onChange={(ribbon) => set({ ribbon })} />
        <span>Ribbon</span>
        <span className={css.small}>{ribbonOn && estimate?.ribbonCents ? `adds ${money(estimate.ribbonCents)}` : "a satin bookmark, on hardcovers"}</span>
      </div>
      {ribbonOn && (
        <div className={css.ribbons}>
          {RIBBON_COLOURS.map(([name, colour]) => (
            <button key={name} type="button" data-paper-skip="" className={css.rib} style={{ background: colour }} aria-pressed={c.ribbonColour === name} aria-label={`${name} ribbon`} title={name} onClick={() => set({ ribbonColour: name })} />
          ))}
        </div>
      )}
      {c.ribbon && binding !== "hardcover" && (
        <p className={`${css.note} ${css.warn}`}>
          Ribbons are only sewn into hardcovers.{" "}
          <button type="button" onClick={() => set({ binding: "hardcover", ribbon: true })}>
            Switch to hardcover
          </button>
        </p>
      )}
    </div>
  );
}

function CoverChoice() {
  const { choices: c, set, covers, cover, coverCount } = useBook();
  return (
    <div className={css.control}>
      <span className={css.label}>
        Cover · <span className={css.labelValue}>{cover.name}</span>
      </span>
      <div className={css.covers}>
        {covers.map((cv) => (
          <button key={cv.id} type="button" data-paper-skip="" className={css.cov} style={{ backgroundImage: `url(${cv.front})` }} aria-pressed={c.cover === cv.id} aria-label={`${cv.name} cover`} title={cv.name} onClick={() => set({ cover: cv.id })} />
        ))}
      </div>
      <Link href="/covers" className={css.small}>
        See all {coverCount} covers
      </Link>
    </div>
  );
}

function AddressControl({ id }: { id: string }) {
  const { choices: c, set, countries } = useBook();
  return (
    <div className={css.control}>
      <div className={css.fields}>
        <label className={css.field}>
          Country
          <select id={`${id}-country`} value={c.country} onChange={(e) => set({ country: e.target.value })}>
            {countries.map((x) => (
              <option key={x.code} value={x.code}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className={css.field}>
          Postcode or ZIP
          <input id={`${id}-post`} value={c.postcode} autoComplete="postal-code" placeholder="11201" onChange={(e) => set({ postcode: e.target.value })} />
        </label>
      </div>
      <p className={css.small}>Post is estimated for the country. The order screen prices your exact address before you pay.</p>
    </div>
  );
}

// --- the book's first pages -------------------------------------------------------

/** The site's own spreads, fetched once (the Layouts gallery's set). */
function useSpreads(): Map<string, LandingSpread> | null {
  const [spreads, setSpreads] = useState<Map<string, LandingSpread> | null>(null);
  useEffect(() => {
    let live = true;
    void loadSet("all").then((all) => live && setSpreads(new Map(all.map((s) => [s.key, s]))));
    return () => {
      live = false;
    };
  }, []);
  return spreads;
}

/** Which real page stands for a page of the book: a week from the Student
 *  week, a month from its month, days from the ADHD days, the front from
 *  the reading pages. Extra pages and the dot grid are drawn as dot grid. */
function pictureOf(page: BookPage): [string, 0 | 1] | null {
  if (page.kind === PageLevel.WEEKLY) return ["student", page.n === 1 ? 0 : 1];
  if (page.kind === PageLevel.MONTHLY) return ["month-student", page.n === 1 ? 0 : 1];
  if (page.kind === PageLevel.DAILY) return ["day-adhd", (page.occurrence % 2) as 0 | 1];
  if (page.kind === PageLevel.FRONT_MATTER || page.kind === PageLevel.BACK_MATTER) return ["pages-reading", ((page.n - 1) % 2) as 0 | 1];
  return null;
}

function Thumb({ page, spreads }: { page: BookPage | null; spreads: Map<string, LandingSpread> | null }) {
  if (!page) return <span className={css.thumbGone} />;
  const pic = pictureOf(page);
  const spread = pic && spreads?.get(pic[0]);
  if (pic) {
    return <span className={css.thumb}>{spread && <PagePreview page={{ previewMarks: spread.pages[pic[1]].marks, pageWidthPx: 2175, pageHeightPx: 3075 }} />}</span>;
  }
  return <span className={page.kind === "blank" ? css.thumb : `${css.thumb} ${css.dots}`} />;
}

export function BookStrip() {
  const { plan } = useBook();
  const spreads = useSpreads();
  const all = spreadsOf(plan.pages.length);
  const shown = all.length > 13 ? [...all.slice(0, 12), null, all[all.length - 1]] : all;
  return (
    <div className={css.strip} tabIndex={0} aria-label={`The first pages of your ${plan.printed} page book`} data-keepout="">
      <div className={css.stripRow}>
        {shown.map((pair, i) => {
          if (!pair) return <span key="gap" className={css.stripGap}>…</span>;
          const [l, r] = pair.map((x) => (x === null ? null : plan.pages[x]));
          const pad = l?.kind === "pad" || r?.kind === "pad";
          const words = pad ? "Dot grid" : (r ?? l)!.kind === "blank" ? "Blank" : (r ?? l)!.label;
          const nums = pair.filter((x) => x !== null).map((x) => x! + 1);
          return (
            <div key={i} className={css.spreadThumb}>
              <span className={pad ? `${css.stripLabel} ${css.padLabel}` : css.stripLabel}>{words}</span>
              <span className={css.thumbs}>
                <Thumb page={l} spreads={spreads} />
                <Thumb page={r} spreads={spreads} />
              </span>
              <span className={css.stripLabel}>p. {nums.join("–")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- the outside: the book beside the covers ---------------------------------------

export function Outside() {
  const book = useBook();
  const [open, setOpen] = useState(false);
  const { binding, plan, cover, choices, moved } = book;
  return (
    <div className={css.outside}>
      {/* data-keepout here and on every mock and control on the page: the
          doodle wall (BodyDoodles) keeps clear of words and pictures, but
          sees nothing of a box drawn in divs - the 3D book, a label in a
          span, a panel's empty corner - and drew over them (2026-11-06) */}
      <div className={css.stage} data-keepout="">
        <div className={css.chips} role="group" aria-label="View">
          <button type="button" className={css.chip} aria-pressed={!open} onClick={() => setOpen(false)}>
            Closed
          </button>
          <button type="button" className={css.chip} aria-pressed={open} onClick={() => setOpen(true)}>
            Open
          </button>
        </div>
        <BookPreview open={open} />
        <p className={css.specs}>
          7 × 10 in · <b>{plan.printed}</b> printed pages · about {thicknessInches(binding, plan.printed).toFixed(1)} in thick
          <br />
          {bindingWords(binding, choices.paper)} · {cover.name}
        </p>
      </div>
      <div className={css.outsideControls} data-keepout="">
        <CoverChoice />
        <div className={css.control}>
          <span className={css.label}>Binding</span>
          <BindingChoice />
          {moved && <p className={`${css.note} ${css.warn}`}>At {plan.printed} pages this book is past the 350 thick paper holds, so it&rsquo;s printed on standard 80 gsm paper.</p>}
        </div>
        <PaperChoice />
        <RibbonChoice id="hiw-ribbon" />
      </div>
    </div>
  );
}

// --- printed and posted -------------------------------------------------------------

export function PrinterWords() {
  const { binding, choices } = useBook();
  return <>{printerWords(binding, choices.country)}</>;
}

export function PrintSteps() {
  const { binding, estimate, today, countryName, choices } = useBook();
  const arrives = arrivalWords(today, estimate?.arrives ?? null);
  const printer = binding === "wireo" || binding === "wireoStandard" ? "BookVault" : "Lulu";
  return (
    <ol className={css.timeline} data-keepout="">
      <li>
        <span className={css.dot}>1</span>
        <b>You pay</b>
        <span>The whole price, shown before you pay.</span>
      </li>
      <li>
        <span className={css.dot}>2</span>
        <b>An hour to change your mind</b>
        <span>Cancel from Orders until the printer starts, with all of it refunded.</span>
      </li>
      <li>
        <span className={css.dot}>3</span>
        <b>Printed by {printer}</b>
        <span>{makingWords(binding)}</span>
      </li>
      <li>
        <span className={css.dot}>4</span>
        <b>At your door</b>
        <span>
          {arrives ? (
            <>
              Expected <b>{arrives}</b> if you ordered today, to {choices.postcode ? `${choices.postcode}, ` : ""}
              {countryName}.
            </>
          ) : (
            <>Dates come with the price on the order screen.</>
          )}
        </span>
      </li>
    </ol>
  );
}

// --- keep it coming ---------------------------------------------------------------

export function Renewal() {
  const { startDate, plan, days, renewOn, choices, set } = useBook();
  const nextStart = new Date(plan.end.getTime() + 86_400_000);
  const nextEnd = new Date(plan.end.getTime() + days * 86_400_000);
  const at = Math.min(0.5, Math.max(0, (renewOn.getTime() - startDate.getTime()) / 86_400_000 / (2 * days))) * 100;
  return (
    <div className={css.calendar} data-keepout="">
      <div className={css.calRow}>
        <span className={css.small}>This book</span>
        <span className={css.calBar}>
          <span className={css.calThis}>
            {dayMonth(startDate)} to {dayMonth(plan.end)}
          </span>
        </span>
      </div>
      <div className={css.calRow}>
        <span className={css.small}>Next book</span>
        <span className={css.calBar}>
          <span className={css.calNext} data-on={choices.renew || undefined}>
            {dayMonth(nextStart)} to {dayMonth(nextEnd)}
          </span>
          <span className={css.calMark} style={{ left: `${at}%` }}>
            <span>ordered {dayMonth(renewOn)}</span>
          </span>
        </span>
      </div>
      <div className={`${css.row} ${css.calSwitch}`}>
        <Switch id="hiw-renew" on={choices.renew} label="Order the next book for me" onChange={(renew) => set({ renew })} />
        <span className={css.small}>
          {choices.renew
            ? `On: the next ${days} days are ordered around ${dayMonth(renewOn, true)}, at that book's own price, and we email you a week before.`
            : `Off, so nothing more is ordered. Turned on, the next book would be ordered around ${dayMonth(renewOn, true)}.`}
        </span>
      </div>
    </div>
  );
}

// --- the calculator ---------------------------------------------------------------

function Summary() {
  const book = useBook();
  const { estimate, problem, plan, binding, choices, countryName, today, days } = book;
  const arrives = arrivalWords(today, estimate?.arrives ?? null);
  return (
    <aside className={css.summary} aria-live="polite">
      <div className={css.summaryTop}>
        <span className={css.estimateTag}>Estimate</span>
        <span className={css.small}>{bindingWords(binding, choices.paper)}</span>
      </div>
      <div>
        <div className={css.total}>{problem ? "Too long" : estimate ? money(estimate.totalCents) : "At checkout"}</div>
        <div className={css.small}>{estimate ? `about ${money(Math.round(estimate.totalCents / (days / 7)))} a week, post included` : " "}</div>
      </div>
      {problem ? (
        <p className={`${css.note} ${css.warn}`}>{problem} Choose fewer days or fewer pages a day{binding === "wireo" || binding === "wireoStandard" ? ", or a paperback or hardcover" : ""}.</p>
      ) : estimate ? (
        <div className={css.lines}>
          <div>
            <span>Book, {plan.printed} pages</span>
            <span>{money(estimate.bookCents - estimate.ribbonCents)}</span>
          </div>
          {estimate.ribbonCents > 0 && (
            <div>
              <span>Ribbon, {choices.ribbonColour}</span>
              <span>{money(estimate.ribbonCents)}</span>
            </div>
          )}
          <div>
            <span>Post to {countryName}, at cost</span>
            <span>{money(estimate.postCents)}</span>
          </div>
          <div className={css.totalLine}>
            <span>Total</span>
            <span>{money(estimate.totalCents)}</span>
          </div>
        </div>
      ) : (
        <p className={css.note}>
          {BINDING_SPECS[binding].short} to {countryName} is priced on the order screen.
        </p>
      )}
      <div className={`${css.lines} ${css.quiet}`}>
        <div>
          <span>Your pages</span>
          <span>{plan.designed}</span>
        </div>
        {plan.pads > 0 && (
          <div>
            <span>Dot grid pages that keep spreads facing</span>
            <span>{plan.pads}</span>
          </div>
        )}
        <div>
          <span>Blank pages to a multiple of four</span>
          <span>{plan.blanks}</span>
        </div>
        <div>
          <span>Printed pages</span>
          <span>{plan.printed}</span>
        </div>
      </div>
      {estimate && arrives && (
        <p className={css.small}>
          Expected {arrives} if ordered today. {printerWords(binding, choices.country)}
        </p>
      )}
      <Link href="/app" className={css.cta}>
        Start designing
      </Link>
      <p className={`${css.small} ${css.center}`}>You see the exact price for your address before you pay.</p>
    </aside>
  );
}

export function Calculator() {
  return (
    <div className={css.calc} data-keepout="">
      <div className={css.form}>
        <div className={css.control}>
          <span className={css.label}>What repeats</span>
          <LevelControls />
        </div>
        <div className={css.control}>
          <span className={css.label}>How long</span>
          <LengthControl id="hiw-calc" />
        </div>
        <div className={css.control}>
          <span className={css.label}>Binding</span>
          <BindingChoice wide />
          <RibbonChoice id="hiw-calc-ribbon" />
        </div>
        <div className={css.control}>
          <span className={css.label}>Where it&rsquo;s going</span>
          <AddressControl id="hiw-calc" />
        </div>
      </div>
      <Summary />
    </div>
  );
}

/** The hero's book: closed, still, the reader's cover. */
export function HeroBook() {
  return <BookPreview still />;
}

/** The hero's loose pages behind the book: a month, a week and a day, the
 *  site's own (the same spreads the steps show). */
export function HeroPages() {
  const spreads = useSpreads();
  return (
    <>
      {(["month-student", "student", "day-adhd"] as const).map((key) => {
        const spread = spreads?.get(key);
        return <div key={key} className={css.heroPage}>{spread && <PagePreview page={{ previewMarks: spread.pages[0].marks, pageWidthPx: 2175, pageHeightPx: 3075 }} />}</div>;
      })}
    </>
  );
}

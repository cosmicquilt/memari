import type { Metadata } from "next";
import Link from "next/link";
import { COVERS, coverById } from "@/app/covers/catalogue";
import { Hand } from "@/app/landing/ink/marks";
import { Ink } from "@/app/landing/ink/Ink";
import { circleDrawing } from "@/app/landing/ink/pen";
import { SpreadPreview } from "@/app/landing/SpreadPreview";
import { SitePage } from "@/app/landing/SitePage";
import { PageLevel } from "@/generated/prisma/enums";
import { countryOptions } from "@/lib/print/countries";
import { estimateTable, type SampleQuotes } from "@/lib/print/estimate";
import { printerForBinding } from "@/lib/print/printer";
import { BINDINGS, type Binding } from "@/lib/print/products";
import sampleQuotes from "@/lib/print/sampleQuotes.json";
import landing from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";
import { BookProvider } from "./BookState";
import { BookStrip, Calculator, FrontBack, HeroBook, HeroPages, LengthWords, Outside, Printed, PrinterWords, PrintSteps, Renewal, Times } from "./Parts";
import { moduleOnSpread } from "./spreadBox";
import css from "./howItWorks.module.css";

// memari.studio/how-it-works (2026-11-06). Asked: "a more fleshed out how
// it works page ... a lot of mock ups and ... a price calculator where
// people can put the cover, whether or not they have a ribbon, ... the page
// count ... as well as an address ... whether or not they'll have a monthly
// spread and then they can add extra pages, or weekly spread ... or daily
// spread". Of four mockups (https://claude.ai/artifact/Lgma7JkmKw4EdnVZCP5Njr)
// he chose A, the walkthrough, "but with b's preview in place next to
// covers" - the 3D book - drawn as wire-o, not a spiral.
//
// One book runs down the page (BookState): the counts in step 1, its pages
// in step 3, its cover and binding in step 4, its post in step 5, its
// renewal in step 6 and its price in the calculator. Its pages are counted
// by the app's own rules (book.ts) and priced by the order's own formula
// from real quotes (estimate.ts); the order screen stays the price paid.
//
// THE RIBBON IS NOT ORDERABLE YET: neither printer sews one into what Memari
// sells (BookVault does on its hardbacks; Memari's hardcover is Lulu's).
// The calculator prices it as asked, hardcover only - his call before this
// page goes live.

export const metadata: Metadata = {
  title: "How it works - memari. STUDIO",
  description: "Design a few pages, choose what repeats, and Memari makes the whole book, priced before you pay. See what yours would cost.",
};

/** The covers to choose from here; all of them are on /covers. */
const SHOWN_COVERS = ["Onyx010", "Travertine004", "Fabric039", "Wood035", "Moss003", "Tiles077", "Leather033C", "Cardboard002"];

/** The book starts on a first of the month at least three weeks off, so
 *  it can arrive before it starts. */
function firstStart(today: Date): string {
  const d = new Date(today.getTime() + 21 * 86_400_000);
  const first = d.getUTCDate() === 1 ? d : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return first.toISOString().slice(0, 10);
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className={landing.stepNumber} data-paper-inline="">
      {n}
      <Ink drawing={circleDrawing(30 + n)} className={landing.circle} stretch delay={0.2} />
    </span>
  );
}

export default function HowItWorksPage() {
  const table = estimateTable(sampleQuotes as unknown as SampleQuotes);
  const limits = Object.fromEntries(BINDINGS.map((b) => [b, printerForBinding(b).pageLimits(b)])) as Record<Binding, { min: number; max: number }>;
  const covers = SHOWN_COVERS.map((id) => coverById(id)).filter((c) => c !== null);
  const names = new Map(countryOptions("en").map((c) => [c.code, c.name]));
  const countries = Object.keys(table.rows).map((code) => ({ code, name: names.get(code) ?? code }));
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return (
    <SitePage>
      <BookProvider table={table} limits={limits} covers={covers} coverCount={COVERS.length} countries={countries} start={firstStart(today)} today={today.toISOString().slice(0, 10)}>
        <div className={css.wrap}>
          <section className={css.hero}>
            <div>
              <p className={landing.eyebrow}>How it works</p>
              <h1 className={landing.headline}>
                Design a week once. Memari makes <Hand>the rest.</Hand>
              </h1>
              <p className={landing.lede}>
                You design a handful of pages: one month, one week, one day. Memari repeats them across every date you choose, binds them into a 7 × 10 in book and posts it to you.
              </p>
              <div className={css.heroButtons}>
                <Link href="/app" className={css.button}>
                  Build for Free
                </Link>
                <a href="#price" className={css.buttonGhost}>
                  What would mine cost?
                </a>
              </div>
            </div>
            <div className={css.heroArt} aria-hidden="true" data-keepout="">
              <HeroPages />
              <div className={css.heroBook}>
                <HeroBook />
              </div>
              <span className={css.heroNote} style={{ left: 0, bottom: "4%" }}>
                month, week, day…
              </span>
              <span className={css.heroNote} style={{ right: "2%", bottom: 0 }}>
                …one bound book
              </span>
            </div>
          </section>

          <ul className={css.facts}>
            <li>
              <b>Free to design</b>
              <span>The editor and your print-ready PDF cost nothing. No account needed to try.</span>
            </li>
            <li>
              <b>Priced before you pay</b>
              <span>Your pages, binding and address set the price. You see all of it first.</span>
            </li>
            <li>
              <b>Made one at a time</b>
              <span>Printed to order, posted worldwide, reprinted if it arrives wrong.</span>
            </li>
          </ul>

          <section className={css.step}>
            <StepNumber n={1} />
            <div>
              <h2 className={css.stepTitle}>Choose what repeats.</h2>
              <p className={css.stepLede}>Turn on the pages you want. Each one prints as often as its calendar says, so a week spread in a 90 day book prints 13 or 14 times.</p>
              <div className={css.levelCards} data-keepout="">
                <div className={css.levelCard}>
                  <div className={css.cardPicture}>
                    <SpreadPreview spreadKey="pages-reading" />
                  </div>
                  <b>Front and back pages</b>
                  <p>Goals, lists, a year at a glance. Printed once.</p>
                  <span className={css.cardCount}>
                    <FrontBack /> pages
                  </span>
                </div>
                <div className={css.levelCard}>
                  <div className={css.cardPicture}>
                    <SpreadPreview spreadKey="month-student" />
                  </div>
                  <b>Every month</b>
                  <p>A two-page month: the calendar and what goes around it.</p>
                  <span className={css.cardCount}>
                    prints <Times level={PageLevel.MONTHLY} /> times
                  </span>
                </div>
                <div className={css.levelCard}>
                  <div className={css.cardPicture}>
                    <SpreadPreview spreadKey="student" />
                  </div>
                  <b>Every week</b>
                  <p>A two-page week with the hours, lists and trackers you pick.</p>
                  <span className={css.cardCount}>
                    prints <Times level={PageLevel.WEEKLY} /> times
                  </span>
                </div>
                <div className={css.levelCard}>
                  <div className={css.cardPicture}>
                    <SpreadPreview spreadKey="day-adhd" />
                  </div>
                  <b>Every day</b>
                  <p>A page a day, for the ones who want it. Plenty of people skip it.</p>
                  <span className={css.cardCount}>
                    prints <Times level={PageLevel.DAILY} /> times
                  </span>
                </div>
              </div>
              <p className={css.small} style={{ marginTop: 16 }}>
                Counts are for the book in the calculator below: <LengthWords />. Any of them can have extra pages too, like a meal plan every week.
              </p>
            </div>
          </section>

          <section className={css.step}>
            <StepNumber n={2} />
            <div>
              <h2 className={css.stepTitle}>Build each page from modules.</h2>
              <p className={css.stepLede}>Drag hours, lists, habit trackers and more than a hundred others onto a quarter-inch dot grid. Everything snaps into place and resizes to fit.</p>
              {/* data-keepout: the doodle wall packs round it whole (BodyDoodles),
                  not only round its words and pictures - see Outside, Parts.tsx */}
              <div className={css.editor} aria-hidden="true" data-keepout="">
                <div className={css.editorBar}>
                  <i />
                  <i />
                  <i />
                  <b>Spring term</b>
                  <span>Week</span>
                </div>
                <div className={css.editorIn}>
                  <ul className={css.palette}>
                    <li className={css.group}>Plan</li>
                    <li>Hours</li>
                    <li>Weekly Priorities</li>
                    <li className={css.picked}>Habit tracker</li>
                    <li className={css.group}>Track</li>
                    <li>Water (week)</li>
                    <li>Mood Chart (week)</li>
                    <li>Bedtime Chart</li>
                    <li className={css.group}>Write</li>
                    <li>Brain Dump</li>
                    <li>Done List</li>
                  </ul>
                  <div className={css.canvas}>
                    <div className={css.canvasSpread}>
                      <SpreadPreview spreadKey="student" />
                      <span className={css.ghost} style={moduleOnSpread("student", "habit-tracker")}>
                        Habit tracker
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className={css.step}>
            <StepNumber n={3} />
            <div>
              <h2 className={css.stepTitle}>Set your dates. Get the whole book.</h2>
              <p className={css.stepLede}>
                Pick a start and how long. Every month, week and day is laid out in order and dated for you: <Printed /> pages for the book below.
              </p>
              <BookStrip />
              <p className={css.small}>A dot grid page goes in wherever a spread would otherwise start on a right-hand page, so every week opens flat across two facing pages.</p>
            </div>
          </section>

          <section className={css.step}>
            <StepNumber n={4} />
            <div>
              <h2 className={css.stepTitle}>Choose what&rsquo;s on the outside.</h2>
              <p className={css.stepLede}>Pick a cover and a binding, and see the book you&rsquo;d get. Every cover costs the same.</p>
              <Outside />
            </div>
          </section>

          <section className={css.step}>
            <StepNumber n={5} />
            <div>
              <h2 className={css.stepTitle}>Printed, bound and posted.</h2>
              <p className={css.stepLede}>
                <PrinterWords />
              </p>
              <PrintSteps />
            </div>
          </section>

          <section className={css.step}>
            <StepNumber n={6} />
            <div>
              <h2 className={css.stepTitle}>Keep it coming, if you like.</h2>
              <div className={css.renew}>
                <div>
                  <p className={css.stepLede}>
                    Auto-renew is off unless you turn it on. When it&rsquo;s on, the next book (the same number of days, starting the day after) is made from your journal as it is then, and ordered in time to arrive before this one runs out.
                  </p>
                  <p className={css.small} style={{ marginTop: 12 }}>
                    We email you about a week before. Skip one, stop, or change your pages first.
                  </p>
                </div>
                <Renewal />
              </div>
            </div>
          </section>

          <section className={site.block} id="price" style={{ padding: "96px 0 0" }}>
            <p className={landing.eyebrow}>Price</p>
            <h2 className={css.stepTitle}>What would yours cost?</h2>
            <p className={css.stepLede}>Change anything and the estimate follows. The order screen prices your exact address before you pay.</p>
            <Calculator />
          </section>

          <section className={site.block} style={{ padding: "96px 0 0" }}>
            <h2 className={css.stepTitle}>Questions people ask</h2>
            <div className={css.faq}>
              <div>
                <b>Do I have to buy a printed book?</b>
                <p>
                  No. The editor and the PDF of your whole book are free. Print it at home on US Letter, or <Link href="/print">find a library</Link> that will.
                </p>
              </div>
              <div>
                <b>Can I change it after I order?</b>
                <p>Not that book: it prints your journal as it was when you paid. Change your journal any time and the next book follows.</p>
              </div>
              <div>
                <b>What if it arrives damaged?</b>
                <p>Tell us within 30 days and we&rsquo;ll reprint it or refund you, whichever you prefer.</p>
              </div>
              <div>
                <b>Why do the pages come in fours?</b>
                <p>Books are printed on folded sheets, so a printer needs a multiple of four. Any blank pages go at the very end.</p>
              </div>
            </div>
          </section>
        </div>
      </BookProvider>

      <section className={site.end}>
        <h2 className={css.stepTitle}>Design it first. Decide later.</h2>
        <Link href="/app" className={`${site.button} ${css.button}`}>
          Start your planner
        </Link>
        <p className={site.note}>
          Questions? See <Link href="/help">Help</Link>.
        </p>
      </section>
    </SitePage>
  );
}

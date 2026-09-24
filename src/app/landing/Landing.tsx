// memari.studio - the landing page.
//
// Asked for 2026-09-22: an Apple-style hero that animates on load - a clear
// nav; a desk in the lofi-study mood, seen from the chair; "memari." arriving
// behind a sliding dot, then "studio", then "a journal as unique as you.";
// and below it a journal that opens to a week and is written in, one layout
// after another. Then the sections the nav links to.
//
// Every claim below is true of the product today. Bound, delivered copies
// are described as coming, because they are.
//
// The page is annotated by hand in the tagline's blue (2026-09-23: "continue
// that cursive theme throughout the landing page with other text and
// underlines and doodles in the background"): a written phrase or a pen
// mark in each headline, the steps' numbers written in loops, and the
// journal's own doodles in the margins (ink/).

import Link from "next/link";
import { Hero } from "./Hero";
import { VideoHero } from "./VideoHero";
import { LayoutGallery } from "./LayoutGallery";
import { Arrow, Circled, Doodle, Hand, Underlined } from "./ink/marks";
import { Ink } from "./ink/Ink";
import { circleDrawing } from "./ink/pen";
import { script } from "./scriptFont";
import styles from "./landing.module.css";

function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Memari Studio, home">
      memari.<span>studio</span>
    </Link>
  );
}

export function Landing({ signedIn, hero = "desk" }: { signedIn: boolean; hero?: "desk" | "video" }) {
  return (
    <div className={`${styles.page} ${script.variable}`}>
      <header className={styles.nav}>
        <Brand />
        <nav className={styles.links} aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#layouts">Layouts</a>
          <a href="#print">Print</a>
        </nav>
        <div className={styles.actions}>
          {signedIn ? (
            <Link href="/app" className={styles.primary}>
              Open Memari
            </Link>
          ) : (
            <>
              <Link href="/sign-in?redirect_url=%2Fapp" className={styles.quiet}>
                Sign in
              </Link>
              <Link href="/app" className={styles.primary}>
                Start your planner
              </Link>
            </>
          )}
        </div>
      </header>

      <main>
        {hero === "video" ? <VideoHero /> : <Hero />}

        <section id="how" className={styles.section}>
          <Doodle kind="sun" seed={11} style={{ top: 120, right: "6%", width: 92, transform: "rotate(-8deg)" }} />
          <Doodle kind="sparkle" seed={12} style={{ top: 262, right: "17%", width: 40 }} delay={0.9} />
          <Doodle kind="cloud" seed={13} style={{ top: 360, right: "3%", width: 104 }} delay={0.5} />
          <Doodle kind="star" seed={14} style={{ top: 150, left: -118, width: 54, transform: "rotate(-10deg)" }} outer />
          <p className={styles.eyebrow}>How it works</p>
          <h2 className={styles.headline}>
            Design a week <Underlined seed={21}>once</Underlined>.<br />
            Memari makes <Hand>the rest.</Hand>
          </h2>
          <p className={styles.lede}>
            A planner is a handful of pages you design - not hundreds you draw by hand. Choose what repeats, build each
            page from pieces, and the whole book comes out ready to print.
          </p>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>
                1
                <Ink drawing={circleDrawing(31)} className={styles.circle} stretch delay={0.20} />
              </span>
              <h3>Choose what repeats</h3>
              <p>A spread for every month, every week, a page for every day - or only the ones you want. Add pages at the front and back for goals and lists.</p>
            </li>
            <li>
              <span className={styles.stepNumber}>
                2
                <Ink drawing={circleDrawing(32)} className={styles.circle} stretch delay={0.45} />
              </span>
              <h3>Build each page from modules</h3>
              <p>Hours, to-dos, habit trackers, notes and more than a hundred others, dragged onto a quarter-inch dot grid. Everything snaps into place.</p>
            </li>
            <li>
              <span className={styles.stepNumber}>
                3
                <Ink drawing={circleDrawing(33)} className={styles.circle} stretch delay={0.70} />
              </span>
              <h3>Get the whole book</h3>
              <p>Set your dates and every page of the term is laid out for you: this week, next week, every week after, each one dated.</p>
            </li>
          </ol>
        </section>

        <section id="layouts" className={`${styles.section} ${styles.sectionWide}`}>
          <Doodle kind="heart" seed={41} style={{ top: 96, right: "4%", width: 60, transform: "rotate(10deg)" }} />
          <Doodle kind="flower" seed={42} style={{ top: 190, right: "10%", width: 70 }} delay={0.7} />
          <Doodle kind="sparkle" seed={43} style={{ top: 292, right: "21%", width: 32 }} delay={1} />
          <Doodle kind="moon" seed={44} style={{ top: 120, left: -104, width: 60, transform: "rotate(-14deg)" }} outer />
          <p className={styles.eyebrow}>Layouts</p>
          <h2 className={styles.headline}>
            Six weeks. Six different <Hand>people.</Hand>
          </h2>
          <p className={styles.lede}>
            Every spread here is a real Memari layout, made from modules in the catalogue - the same ones the journal
            above is turning through.
          </p>
          <LayoutGallery />
        </section>

        <section id="print" className={styles.section}>
          <Doodle kind="cup" seed={51} style={{ top: 118, right: "8%", width: 96, transform: "rotate(-6deg)" }} />
          <Doodle kind="star" seed={52} style={{ top: 290, right: "24%", width: 38, transform: "rotate(12deg)" }} delay={0.8} />
          <Doodle kind="leaf" seed={53} style={{ bottom: 40, right: "2%", width: 70, transform: "rotate(-20deg)" }} />
          <Doodle kind="sparkle" seed={54} style={{ top: 310, left: -96, width: 42 }} outer />
          <p className={styles.eyebrow}>Print</p>
          <h2 className={styles.headline}>
            Made to be <Underlined seed={61} twice>printed</Underlined>.
          </h2>
          <p className={styles.lede}>
            We print the structure. <Hand>You draw around it.</Hand>
          </p>
          <ul className={styles.facts}>
            <li>
              <h3>7 × 10 in, bound</h3>
              <p>Sized for a real journal, with bleed, at 300 dots per inch.</p>
            </li>
            <li>
              <h3>US Letter at home</h3>
              <p>The same design fits a sheet from your own printer.</p>
            </li>
            <li>
              <h3>Dated or undated</h3>
              <p>Let Memari fill in every date, or leave them for you to write.</p>
            </li>
            <li>
              <h3>
                <Circled seed={71}>Free</Circled> to make
              </h3>
              <p>The editor and the print-ready PDF are free. Bound copies, delivered each season, are on their way.</p>
            </li>
          </ul>
        </section>

        <section className={`${styles.closing} ${styles.section}`}>
          <Doodle kind="sparkle" seed={81} style={{ top: 118, left: "14%", width: 46 }} />
          <Doodle kind="sparkle" seed={82} style={{ top: 262, right: "11%", width: 34 }} delay={0.5} />
          <Doodle kind="heart" seed={83} style={{ bottom: 120, right: "22%", width: 44, transform: "rotate(-12deg)" }} delay={0.9} />
          <Doodle kind="star" seed={84} style={{ bottom: 92, left: "20%", width: 40, transform: "rotate(14deg)" }} delay={0.7} />
          <Doodle kind="flower" seed={85} style={{ top: 70, right: "7%", width: 66 }} delay={0.3} />
          <h2 className={styles.headline}>
            A journal as unique as <Hand>you.</Hand>
          </h2>
          <Link href="/app" className={styles.primaryLarge}>
            {signedIn ? "Open Memari" : "Start your planner"}
          </Link>
          {!signedIn && (
            <p className={styles.handNote}>
              <Arrow seed={91} style={{ right: "100%", bottom: "40%", width: 64, marginRight: 6, transform: "scaleY(-1) rotate(8deg)" }} delay={0.6} />
              no account needed to try it
            </p>
          )}
        </section>
      </main>

      <footer className={styles.footer}>
        <Brand />
        <span>© {new Date().getFullYear()} Memari</span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </footer>
    </div>
  );
}

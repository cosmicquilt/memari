// memari.studio - the landing page.
//
// Asked for 2026-09-22: an Apple-style hero that animates on load - a clear
// nav; a desk in the lofi-study mood, seen from the chair; "memari." arriving
// behind a sliding dot, then "studio", then "a planner as unique as you.";
// and below it a journal that opens to a week and is written in, one layout
// after another. Then the sections the nav links to.
//
// Every claim below is true of the product today. Bound, delivered copies
// are described as coming, because they are.

import Link from "next/link";
import { Hero } from "./Hero";
import { LayoutGallery } from "./LayoutGallery";
import styles from "./landing.module.css";

function Brand() {
  return (
    <Link href="/" className={styles.brand} aria-label="Memari Studio, home">
      memari.<span>studio</span>
    </Link>
  );
}

export function Landing({ signedIn }: { signedIn: boolean }) {
  return (
    <div className={styles.page}>
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
        <Hero />

        <section id="how" className={styles.section}>
          <p className={styles.eyebrow}>How it works</p>
          <h2 className={styles.headline}>Design a week once.<br />Memari makes the rest.</h2>
          <p className={styles.lede}>
            A planner is a handful of pages you design - not hundreds you draw by hand. Choose what repeats, build each
            page from pieces, and the whole book comes out ready to print.
          </p>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>1</span>
              <h3>Choose what repeats</h3>
              <p>A spread for every month, every week, a page for every day - or only the ones you want. Add pages at the front and back for goals and lists.</p>
            </li>
            <li>
              <span className={styles.stepNumber}>2</span>
              <h3>Build each page from modules</h3>
              <p>Hours, to-dos, habit trackers, notes and more than a hundred others, dragged onto a quarter-inch dot grid. Everything snaps into place.</p>
            </li>
            <li>
              <span className={styles.stepNumber}>3</span>
              <h3>Get the whole book</h3>
              <p>Set your dates and every page of the term is laid out for you: this week, next week, every week after, each one dated.</p>
            </li>
          </ol>
        </section>

        <section id="layouts" className={`${styles.section} ${styles.sectionWide}`}>
          <p className={styles.eyebrow}>Layouts</p>
          <h2 className={styles.headline}>Six weeks. Six different people.</h2>
          <p className={styles.lede}>
            Every spread here is a real Memari layout, made from modules in the catalogue - the same ones the journal
            above is turning through.
          </p>
          <LayoutGallery />
        </section>

        <section id="print" className={styles.section}>
          <p className={styles.eyebrow}>Print</p>
          <h2 className={styles.headline}>Made to be printed.</h2>
          <p className={styles.lede}>We print the structure. You draw around it.</p>
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
              <h3>Free to make</h3>
              <p>The editor and the print-ready PDF are free. Bound copies, delivered each season, are on their way.</p>
            </li>
          </ul>
        </section>

        <section className={styles.closing}>
          <h2 className={styles.headline}>A planner as unique as you.</h2>
          <Link href="/app" className={styles.primaryLarge}>
            {signedIn ? "Open Memari" : "Start your planner"}
          </Link>
          {!signedIn && <p className={styles.small}>No account needed to try it.</p>}
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

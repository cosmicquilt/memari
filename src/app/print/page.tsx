import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { LibraryFinder } from "./LibraryFinder";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";
import print from "./print.module.css";

// memari.studio/print (2026-10-08, Andrew: "a library locator for people
// that dont have a printer"). The free PDF is only free if you can print
// it: find the public libraries near you, then print it so the grid comes
// out a quarter inch. Stage 1 of the plan in handoff/research - US only,
// list first, no map, nothing about the search kept; see libraryFinder.ts.
//
// What the page does NOT say, because nothing tells us: which libraries
// print, what they charge, or their hours. "Most have printers" is as far
// as it goes, with "call ahead".

export const metadata: Metadata = {
  title: "Print it yourself - memari. STUDIO",
  description: "No printer? Find the public libraries near you, and print your planner so the quarter-inch grid comes out the right size.",
};

export default function PrintPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>Print it yourself</p>
        <h1 className={styles.headline}>No printer? Your library has one.</h1>
        <p className={styles.lede}>
          Your planner is a PDF you can print anywhere. Most public libraries have printers anyone can use, usually for a small
          charge a page. Find the ones near you, then print it so the grid comes out right.
        </p>
      </header>

      <section className={site.block} aria-label="Find a library">
        <LibraryFinder />
      </section>

      <section className={site.block} aria-labelledby="how-to-print">
        <h2 id="how-to-print" className={site.blockTitle}>
          Printing it right
        </h2>
        <p className={site.blockLede}>A planner is drawn to a quarter-inch grid, so it has to print at its true size. Five steps:</p>
        <ol className={print.guide}>
          <li>
            <h3>Make it US Letter</h3>
            <p>
              A journal made at 7 × 10 in is sized for a bound book. For printing on ordinary paper, choose US Letter when you make
              it, or switch it under Page Settings → Paper in the editor.
            </p>
          </li>
          <li>
            <h3>Download the PDF</h3>
            <p>
              Export PDF, at the top right of the editor, or{" "}
              <Link href="/app/account/data">Account → Data &amp; account</Link>. It is the whole book in one file.
            </p>
          </li>
          <li>
            <h3>Print the test page first</h3>
            <p>
              <a href="/print/test-page" target="_blank" rel="noopener">
                The print test
              </a>{" "}
              is one page: a box a bank card should cover exactly, a ruler, and your planner&rsquo;s finest dots and lines. If
              the card is bigger than the box, the printer is shrinking the page.
            </p>
          </li>
          <li>
            <h3>Actual size, both sides, long edge</h3>
            <p>
              In the print settings choose Actual size or Scale 100%, never Fit to page. To print on both sides, flip on the long
              edge: the backs come out the right way up, and in a binder each week&rsquo;s two pages face each other. Black and white
              is all it needs.
            </p>
          </li>
          <li>
            <h3>Send it, print it, bind it</h3>
            <p>
              Most libraries let you print from your phone, by an upload page, an email address or a print station, and their
              printing page says which. A three-hole punch and a binder, or binder clips, hold it together.
            </p>
          </li>
        </ol>
        <p className={print.credit}>
          Libraries: Institute of Museum and Library Services, Public Libraries Survey, fiscal year 2024: central libraries and
          branches, not bookmobiles. ZIP codes: U.S. Census Bureau, 2020 Gazetteer. Something wrong or missing? Write to{" "}
          <a href="mailto:hello@memari.studio" style={{ color: "inherit" }}>
            hello@memari.studio
          </a>
          .
        </p>
      </section>

      <section className={site.end}>
        <h2>Rather not print it yourself?</h2>
        <p className={site.note} style={{ maxWidth: 480, fontSize: 16, lineHeight: 1.55 }}>
          We can print and bind it for you, delivered. See what a book costs before you order.
        </p>
        <Link href="/pricing" className={site.buttonQuiet}>
          Pricing
        </Link>
      </section>
    </SitePage>
  );
}

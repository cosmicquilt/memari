import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { BINDING_SPECS } from "@/lib/print/products";
import { GUEST_JOURNAL_LIMIT } from "@/lib/guest";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/pricing (2026-10-08). There is no price list to print: a
// book's price is the printer's quote for THAT book - its pages, binding and
// address - marked up (src/lib/print/pricing.ts), so this page says how a
// price is made and promises it is shown before anyone pays, rather than
// quoting a number that would be wrong for most books. The margin and the
// minimum are still Andrew's placeholders, so neither is published.
//
// Every line below is read from the code or the Terms: bindings and page
// size (products.ts), lengths (orderRange.ts, MAX_ORDER_DAYS), cancelling
// and reprints (terms/page.tsx), renewals (renewals.ts). If one changes,
// this page changes with it.

export const metadata: Metadata = {
  title: "Pricing - memari. STUDIO",
  description: "The editor and your print-ready PDF are free. A printed, bound book is priced for that book and shown in full before you pay.",
};

const bindings = [BINDING_SPECS.coil, BINDING_SPECS.paperback, BINDING_SPECS.hardcover];

export default function PricingPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>Pricing</p>
        <h1 className={styles.headline}>Free to make. Pay for paper.</h1>
        <p className={styles.lede}>
          Designing your planner costs nothing, and neither does printing it yourself. You pay only if you want it printed and
          bound for you, and you see the whole price before you do.
        </p>
      </header>

      <section className={site.block} aria-label="What it costs">
        <div className={site.plans}>
          <div className={site.plan}>
            <h2>Make it</h2>
            <p className={site.price}>Free</p>
            <ul>
              <li>The editor, and every one of its modules</li>
              <li>Your whole book as a print-ready PDF</li>
              <li>
                Print it at home on US Letter, or anywhere you like. <Link href="/print">No printer? Find a library</Link>
              </li>
              <li>Dated or undated, weeks from Sunday or Monday, in your time zone</li>
              <li>No account needed to try it. A guest keeps up to {GUEST_JOURNAL_LIMIT} journals</li>
            </ul>
          </div>

          <div className={`${site.plan} ${site.planFeatured}`}>
            <h2>A printed book</h2>
            <p className={site.price}>Per book</p>
            <p className={site.priceNote}>Priced for your book, shown in full before you pay</p>
            <ul>
              <li>7 × 10 in, printed in black on uncoated white paper, with a matte cover</li>
              <li>{bindings.map((b, i) => (i === 0 ? b.label : b.label.toLowerCase())).join(", ").replace(/, ([^,]*)$/, " or $1")}. Coil lies flat when open</li>
              <li>Any length: 30 days, 90, a year, up to two</li>
              <li>Made to order and shipped worldwide</li>
              <li>Reprinted or refunded if it arrives damaged or misprinted</li>
            </ul>
          </div>

          <div className={site.plan}>
            <h2>Keep it coming</h2>
            <p className={site.price}>Optional</p>
            <p className={site.priceNote}>Auto-renew is off unless you turn it on</p>
            <ul>
              <li>Before your book runs out, the next one is ordered: the same number of days, starting the day after</li>
              <li>Made from your journal as it is then, so changes you make carry on</li>
              <li>We email you about a week before, and you can turn it off any time</li>
              <li>If a renewal cannot go through, nothing is charged and we tell you why</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={site.block} aria-labelledby="how-priced">
        <h2 id="how-priced" className={site.blockTitle}>
          How a book is priced
        </h2>
        <p className={site.blockLede}>Every book is different in its pages, its binding and where it is going, so there is no list. Instead:</p>
        <ol className={site.steps}>
          <li>
            <strong>The printer quotes your book.</strong>
            <span>Its page count, binding and size, as our printer, Lulu, would charge us for it.</span>
          </li>
          <li>
            <strong>We add our part.</strong>
            <span>The book&rsquo;s price covers printing it and keeps a margin, which is what pays for Memari, the free editor included.</span>
          </li>
          <li>
            <strong>Postage is passed on at cost.</strong>
            <span>What the printer charges for the speed you choose, nothing added.</span>
          </li>
          <li>
            <strong>You see all of it before you pay.</strong>
            <span>The book and the post, separately, on the order screen. Sign in to order, so your books and renewals have somewhere to live.</span>
          </li>
        </ol>
      </section>

      <section className={site.block} aria-labelledby="changed-mind">
        <h2 id="changed-mind" className={site.blockTitle}>
          If you change your mind
        </h2>
        <p className={site.blockLede}>
          Each book is made for you, so it can be cancelled, with the whole payment refunded, until the printer starts it,
          about an hour after you pay. After that it cannot be stopped. If it arrives damaged, misprinted or not as you designed
          it, tell us within 30 days and we will reprint it or refund you, whichever you prefer. The details are in the{" "}
          <Link href="/terms">Terms</Link>.
        </p>
      </section>

      <section className={site.end}>
        <h2>Design it first. Decide later.</h2>
        <Link href="/app" className={site.button}>
          Start your planner
        </Link>
        <p className={site.note}>
          Questions? See <Link href="/help">Help</Link>.
        </p>
      </section>
    </SitePage>
  );
}

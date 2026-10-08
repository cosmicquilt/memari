import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { Hand } from "@/app/landing/ink/marks";
import { LEGAL_CONTACT, LEGAL_ENTITY } from "@/app/legal/LegalPage";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/about (2026-10-08). Andrew's founding notes (2026-09-27 and
// 2026-10-08: simplicity, a moment that feels like an eternity, stone by
// stone, the artisan, "How will you choose to build yours?") under ONE
// spine - the craft is yours, the repetition is ours - with the humour kept
// and nothing cosmic. A DRAFT for him to rewrite in his own voice.
//
// The research he commissioned (handoff/research, Gemini, 2026-10-08)
// confirms "as simple as possible, but not simpler" is a later paraphrase of
// Einstein, so it is attributed as such; the relativity anecdote is used as
// an idea, unattributed. No founder biography is invented here: a founder's
// note is his to write.

export const metadata: Metadata = {
  title: "About - Memari Studio",
  description: "Why Memari exists: design your planner once, let the repetition be done for you, and keep your days on paper.",
};

export default function AboutPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>About</p>
        <h1 className={styles.headline}>
          The craft is yours.
          <br />
          The repetition is <Hand>ours.</Hand>
        </h1>
        <p className={styles.lede}>
          Memari is a small studio making one thing: a way to design your own paper planner once, and have every page of it
          laid out for you.
        </p>
      </header>

      <section className={site.block}>
        <div className={site.prose}>
          <h2>Why paper</h2>
          <p>
            A page does one thing at a time. It does not ping, it does not refresh, and nothing on it was put there to keep you
            looking. We like screens fine - Memari is built on one - but the place you plan your days should not be competing for
            them.
          </p>
          <p>
            Some moments last longer than the clock says they do: an evening with friends, a walk with someone you love, the
            first page of a new month. A planner is where you make room for them, and where they are still written down
            afterwards.
          </p>

          <h2>As simple as possible</h2>
          <blockquote className={site.pull}>
            &ldquo;Everything should be made as simple as possible, but not simpler.&rdquo;
            <cite>Often attributed to Albert Einstein, who said something longer.</cite>
          </blockquote>
          <p>
            It is the line we design to. Each module does one job. You design a week once, and Memari makes the rest - every
            week of the book, each one dated - because drawing the same boxes fifty-two times is not planning, it is copying.
          </p>

          <h2>Stone by stone</h2>
          <p>
            The big things in a life are built out of small ones: a week kept, a habit ticked, a good day written down before it
            is gone. They go down one at a time, by hand, the way anything made well is made. We draw the lines. What goes on
            them is yours.
          </p>
          <p>
            So the lines are drawn with care. Every module sits on a quarter-inch grid, so rules meet, text sits where your pen
            will, and the book that arrives is the one you designed. We print the structure. You draw around it.
          </p>

          <h2>What we will not do</h2>
          <p>
            No ads, no tracking, no selling what you write. You can try Memari without an account, and take your whole book as a
            PDF, free, whenever you like - see <Link href="/privacy">Privacy</Link> for exactly what is kept.
          </p>

          <p className={site.note} style={{ fontSize: 15 }}>
            Memari Studio is made by {LEGAL_ENTITY}. Write to us at <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a>.
          </p>
        </div>
      </section>

      <section className={site.end}>
        <h2>How will you build yours?</h2>
        <Link href="/app" className={site.button}>
          Start your planner
        </Link>
        <p className={site.note}>Free, and no account needed to try it.</p>
      </section>
    </SitePage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { SpreadPreview } from "@/app/landing/SpreadPreview";
import { UseThisWeek } from "@/app/landing/UseThisWeek";
import { ModuleCards } from "@/app/landing/ModuleCards";
import { GALLERY_LABEL, STARTER_MODULES, STARTER_WEEKS } from "@/app/landing/starterLayouts";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/layouts - weeks and modules to start from (2026-10-08). See
// starterLayouts.ts for what is shown and why it says nothing about who used
// them.

export const metadata: Metadata = {
  title: "Layouts - Memari Studio",
  description: "Weekly planner layouts to start from - student, shift work, teacher, parent, ADHD, training and more - each one yours to change, dated and ready to print.",
};

export default function LayoutsPage() {
  return (
    <SitePage>
      <header className={`${site.head} ${site.blockWide}`}>
        <p className={styles.eyebrow}>Layouts</p>
        <h1 className={styles.headline}>Start from a week that works.</h1>
        <p className={styles.lede}>
          Pick a week, make it yours, and Memari lays it out for every week of your book. Change any of it - every
          module moves, resizes and comes out.
        </p>
      </header>

      <section className={`${site.block} ${site.blockWide}`} aria-labelledby="weeks">
        <span className={site.label}>{GALLERY_LABEL}</span>
        <h2 id="weeks" className={site.blockTitle}>
          Weeks
        </h2>
        <p className={site.blockLede}>Each one is a real weekly spread. &ldquo;Use this week&rdquo; opens it as a journal of your own - no account needed.</p>
        <div className={site.layoutGrid}>
          {STARTER_WEEKS.map((week) => (
            <article key={week.key} className={site.card}>
              <Link href={`/layouts/${week.key}`} className={site.cardLink} aria-label={`${week.title} week: see what is on it`}>
                <SpreadPreview spreadKey={week.key} />
              </Link>
              <div>
                <h3 className={site.cardTitle}>
                  <Link href={`/layouts/${week.key}`} className={site.cardLink}>
                    {week.title}
                  </Link>
                </h3>
                <p className={site.cardText}>{week.line}</p>
              </div>
              <div className={site.cardActions}>
                <UseThisWeek spreadKey={week.key} />
                <Link href={`/layouts/${week.key}`} className={site.buttonQuiet}>
                  What&rsquo;s on it
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={`${site.block} ${site.blockWide}`} aria-labelledby="modules">
        <span className={site.label}>{GALLERY_LABEL}</span>
        <h2 id="modules" className={site.blockTitle}>
          Modules
        </h2>
        <p className={site.blockLede}>
          The pieces a page is built from. These are a few of more than 150 in the editor, from hours and
          habits to a year in pixels.
        </p>
        <ModuleCards modules={STARTER_MODULES} />
      </section>

      <section className={site.end}>
        <h2>Or start from a blank page.</h2>
        <Link href="/app" className={site.button}>
          Open the editor
        </Link>
        <p className={site.note}>Free, and no account needed to try it.</p>
      </section>
    </SitePage>
  );
}

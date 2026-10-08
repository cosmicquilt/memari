import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { LayoutCard, LayoutViewer } from "@/app/landing/LayoutViewer";
import { UseThisWeek } from "@/app/landing/UseThisWeek";
import { ModuleCards } from "@/app/landing/ModuleCards";
import {
  GALLERY_LABEL,
  KIND_SECTIONS,
  STARTERS,
  STARTER_MODULES,
  actionLabel,
} from "@/app/landing/starterLayouts";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/layouts: weeks, months, days and pages to start from, and
// modules (2026-10-08). See starterLayouts.ts for what is shown and why it
// says nothing about who used them.

export const metadata: Metadata = {
  title: "Layouts - Memari Studio",
  description:
    "Planner layouts to start from: weekly spreads for students, shift work, teachers, parents, ADHD and more, monthly spreads, daily pages and pages of modules. Each one yours to change, dated and ready to print.",
};

export default function LayoutsPage() {
  return (
    <SitePage>
      <LayoutViewer>
        <header className={`${site.head} ${site.blockWide}`}>
          <p className={styles.eyebrow}>Layouts</p>
          <h1 className={styles.headline}>Start from one that works.</h1>
          <p className={styles.lede}>
            Pick a week, a month, a day or a few pages, make it yours, and
            Memari lays it out for the whole book. Every module moves, resizes
            and comes out.
          </p>
          <nav aria-label="Kinds of layout" className={site.kinds} data-keepout>
            <span className={site.label}>{GALLERY_LABEL}</span>
            {KIND_SECTIONS.map(([kind, heading]) => (
              <a key={kind} href={`#${kind}`}>
                {heading}{" "}
                <span>{STARTERS.filter((s) => s.kind === kind).length}</span>
              </a>
            ))}
            <a href="#modules">Modules</a>
          </nav>
        </header>

        {KIND_SECTIONS.map(([kind, heading, lede]) => (
          <section
            key={kind}
            id={kind}
            className={`${site.block} ${site.blockWide}`}
            aria-labelledby={`${kind}-title`}
          >
            <h2 id={`${kind}-title`} className={site.blockTitle}>
              {heading}
            </h2>
            <p className={site.blockLede}>{lede}</p>
            <div className={site.layoutGrid}>
              {STARTERS.filter((s) => s.kind === kind).map((starter) => (
                <article key={starter.key} className={site.card}>
                  <LayoutCard spreadKey={starter.key} title={starter.title} />
                  <div>
                    <h3 className={site.cardTitle}>
                      <Link
                        href={`/layouts/${starter.key}`}
                        className={site.cardLink}
                      >
                        {starter.title}
                      </Link>
                    </h3>
                    {starter.hours && (
                      <p className={site.hours}>{starter.hours}</p>
                    )}
                    <p className={site.cardText}>{starter.line}</p>
                  </div>
                  <div className={site.cardActions}>
                    <UseThisWeek
                      spreadKey={starter.key}
                      label={actionLabel(starter.kind)}
                    />
                    <Link
                      href={`/layouts/${starter.key}`}
                      className={site.buttonQuiet}
                    >
                      What&rsquo;s on it
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}

        <section
          id="modules"
          className={`${site.block} ${site.blockWide}`}
          aria-labelledby="modules-title"
        >
          <h2 id="modules-title" className={site.blockTitle}>
            Modules
          </h2>
          <p className={site.blockLede}>
            The pieces a page is built from. These are a few of more than 150 in
            the editor, from hours and habits to a year in pixels.
          </p>
          <ModuleCards modules={STARTER_MODULES} />
        </section>
      </LayoutViewer>

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

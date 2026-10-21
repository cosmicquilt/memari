import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { LayoutCard, LayoutViewer } from "@/app/landing/LayoutViewer";
import { UseThisWeek } from "@/app/landing/UseThisWeek";
import { ModuleCards } from "@/app/landing/ModuleCards";
import {
  GALLERY_LABEL,
  KIND_SECTIONS,
  LISTED_STARTERS,
  STARTER_MODULES,
  actionLabel,
} from "@/app/landing/starterLayouts";
import { PART_NAMES, PLANNERS, coverSpreadOf, partsOf, plannerShelves, shelfId } from "@/app/landing/plannerTemplates";
import { PlannerActions } from "@/app/landing/PlannerActions";
import { SaveButton } from "@/app/planner/templateSaved";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/layouts: weeks, months, days and pages to start from, and
// modules (2026-10-08). See starterLayouts.ts for what is shown and why it
// says nothing about who used them. First, whole planners (2026-10-15,
// plannerTemplates.ts): books made for one kind of person, every part laid
// out. Their spreads are filed under them, not among the weeks and months.

export const metadata: Metadata = {
  title: "Layouts - memari. STUDIO",
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
            Pick a whole planner, or a week, a month, a day or a few pages,
            make it yours, and Memari lays it out for the whole book. Every module moves, resizes
            and comes out.
          </p>
          <nav aria-label="Kinds of layout" className={site.kinds} data-keepout>
            <span className={site.label}>{GALLERY_LABEL}</span>
            {PLANNERS.length > 0 && (
              <a href="#planners">
                Planners <span>{PLANNERS.length}</span>
              </a>
            )}
            {KIND_SECTIONS.map(([kind, heading]) => (
              <a key={kind} href={`#${kind}`}>
                {heading}{" "}
                <span>{LISTED_STARTERS.filter((s) => s.kind === kind).length}</span>
              </a>
            ))}
            <a href="#modules">Modules</a>
          </nav>
        </header>

        {PLANNERS.length > 0 && (
          <section
            id="planners"
            className={`${site.block} ${site.blockWide}`}
            aria-labelledby="planners-title"
          >
            <h2 id="planners-title" className={site.blockTitle}>
              Planners
            </h2>
            <p className={site.blockLede}>
              A whole book made for one kind of life: the pages at the front,
              and a spread for every month, week or day, all laid out. Change
              any of it.
            </p>
            <nav aria-label="Kinds of planner" className={site.kinds} data-keepout>
              {plannerShelves(PLANNERS).map(({ group, planners }) => (
                <a key={group} href={`#${shelfId(group)}`}>
                  {group} <span>{planners.length}</span>
                </a>
              ))}
            </nav>
            {plannerShelves(PLANNERS).map(({ group, planners }) => (
              <div key={group} id={shelfId(group)} className={site.shelf}>
                <h3 className={site.shelfTitle}>{group}</h3>
                <div className={site.layoutGrid}>
                  {planners.map((planner) => (
                    <article key={planner.key} className={site.card}>
                      <LayoutCard spreadKey={coverSpreadOf(planner)} title={planner.title} />
                      <div>
                        <h4 className={site.cardTitle}>
                          <Link href={`/layouts/${planner.key}`} className={site.cardLink}>
                            {planner.title}
                          </Link>
                        </h4>
                        <p className={site.hours}>{planner.forWhom}</p>
                        <p className={site.cardText}>{planner.line}</p>
                        <ul className={site.parts} aria-label="In the book">
                          {partsOf(planner).map(({ part }) => (
                            <li key={part}>{PART_NAMES[part]}</li>
                          ))}
                        </ul>
                        {/* A text link, not a third button: two buttons and a
                            third wrapped onto a line of its own (2026-10-15). */}
                        <Link href={`/layouts/${planner.key}`} className={site.textLink}>
                          See every page
                        </Link>
                      </div>
                      <div className={site.cardActions}>
                        <PlannerActions plannerKey={planner.key} />
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

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
              {LISTED_STARTERS.filter((s) => s.kind === kind).map((starter) => (
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
                    <SaveButton save={{ kind: "layout", key: starter.key }} variant="icon" what={`the ${starter.title} layout`} />
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
          {/* The practices behind them, each with a page of its own
              (2026-10-19: "make the /modules part of the site accessable
              from the layouts section"). */}
          <p className={styles.more}>
            <Link href="/modules" className={styles.moreButton}>
              Where the modules come from
              <span aria-hidden="true" className={styles.moreArrow}>
                &rarr;
              </span>
            </Link>
          </p>
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

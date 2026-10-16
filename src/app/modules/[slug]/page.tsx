import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/app/landing/SitePage";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";
import { GUIDE_BY_SLUG, MODULE_GUIDES, wikiRuns } from "@/lib/moduleGuides";
import { moduleDrawingSvg } from "@/lib/moduleGuideDrawing";
import { moduleDefinition } from "@/lib/moduleRegistry";
import { describeModule } from "@/lib/moduleDescriptions";
import own from "../modules.module.css";
import { GuidePhoto } from "../GuidePhoto";

// memari.studio/modules/<slug>: a practice, where it comes from, and the
// module that prints it - drawn by the real renderer. Only modules with a
// guide (moduleGuides.ts) have a page.

export function generateStaticParams() {
  return MODULE_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export const dynamicParams = false;

const WHERE: Record<string, string> = {
  day: "on the daily page",
  week: "on the weekly spread",
  month: "on the monthly spread",
  journal: "once, at the front of the book",
};

function nameOf(slug: string): string {
  return moduleDefinition(slug)?.label ?? slug;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const slug = (await params).slug;
  const guide = GUIDE_BY_SLUG[slug];
  if (!guide) return {};
  return {
    title: `${nameOf(slug)} - memari. STUDIO`,
    description: describeModule(slug) ?? guide.lede,
  };
}

export default async function ModuleGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const guide = GUIDE_BY_SLUG[slug];
  const definition = moduleDefinition(slug);
  if (!guide || !definition) notFound();
  const drawing = moduleDrawingSvg(slug);
  const name = nameOf(slug);
  const where = WHERE[definition.cadence ?? ""] ?? "in your planner";
  // A tall, narrow module sits beside the text on a wide screen, rather than
  // alone above it with the page's width empty beside it.
  const tall = !!drawing && drawing.heightPx > drawing.widthPx * 0.9;
  const related = MODULE_GUIDES.filter((other) => other.slug !== slug && moduleDefinition(other.slug)?.category === definition.category);
  // Each name links to Wikipedia where the page first names it: one set of
  // names still to link, used up in reading order.
  const unlinked = new Set(Object.keys(guide.wiki ?? {}));
  const prose = (text: string) =>
    wikiRuns(text, guide.wiki ?? {}, unlinked).map((run, i) =>
      typeof run === "string" ? (
        run
      ) : (
        <a key={i} href={run.url} rel="noreferrer" className={own.wiki}>
          {run.text}
        </a>
      ),
    );

  return (
    <SitePage>
      <header className={guide.photo ? `${site.head} ${own.headWithPhoto}` : site.head}>
        <div>
          <p className={styles.eyebrow}>{guide.kicker}</p>
          <h1 className={styles.headline}>{name}</h1>
          <p className={styles.lede}>{prose(guide.lede)}</p>
        </div>
        {guide.photo && <GuidePhoto photo={guide.photo} cadence={definition.cadence} />}
      </header>

      <section className={tall ? `${site.block} ${own.split}` : site.block}>
        {drawing && (
          <figure className={own.figure} style={{ maxWidth: `${tall ? 300 : Math.min(680, drawing.widthPx * 0.45)}px` }}>
            <svg
              className={own.drawing}
              viewBox={drawing.viewBox}
              role="img"
              aria-label={`The ${name} module`}
              dangerouslySetInnerHTML={{ __html: drawing.markup }}
            />
            <figcaption>
              The {name} module as it prints, {where}. The dots are the page&rsquo;s quarter-inch grid.
            </figcaption>
          </figure>
        )}

        <div className={site.prose}>
          {guide.sections.map((section) => (
            <div key={section.heading} style={{ display: "grid", gap: 22 }}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)}>{prose(paragraph)}</p>
              ))}
              {section.list && (
                <ul className={own.steps}>
                  {section.list.map((item) => (
                    <li key={item}>{prose(item)}</li>
                  ))}
                </ul>
              )}
              {section.quote && (
                <blockquote className={own.quote}>
                  {section.quote.lines.map((line) => (
                    <p key={line.slice(0, 40)}>{line}</p>
                  ))}
                  <cite>{section.quote.cite}</cite>
                </blockquote>
              )}
            </div>
          ))}

          {guide.sources.length > 0 && (
            <>
              <h2>Sources</h2>
              <ul className={own.sources}>
                {guide.sources.map((source) => (
                  <li key={source.text}>
                    {source.url ? (
                      <a href={source.url} rel="noreferrer">
                        {source.text}
                      </a>
                    ) : (
                      source.text
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <section className={site.end}>
        <h2>Put it in your planner</h2>
        <Link href="/app" className={site.button}>
          Start your planner
        </Link>
        <p className={site.note}>
          Find {name} in the module drawer, under {definition.category}. Free, and no account needed to try it.
        </p>
        {related.length > 0 && (
          <ul className={own.related} aria-label="More practices">
            {related.map((other) => (
              <li key={other.slug}>
                <Link href={`/modules/${other.slug}`}>{nameOf(other.slug)}</Link>
              </li>
            ))}
            <li>
              <Link href="/modules">All practices</Link>
            </li>
          </ul>
        )}
      </section>
    </SitePage>
  );
}

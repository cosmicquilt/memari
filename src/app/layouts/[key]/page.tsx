import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/app/landing/SitePage";
import { LayoutCard, LayoutViewer } from "@/app/landing/LayoutViewer";
import { UseThisWeek } from "@/app/landing/UseThisWeek";
import { SaveButton } from "@/app/planner/templateSaved";
import {
  KIND_SECTIONS,
  STARTERS,
  STARTER_BY_KEY,
  makesWhat,
  modulesOf,
  actionLabel,
} from "@/app/landing/starterLayouts";
import {
  PART_NAMES,
  PLANNERS,
  PLANNER_BY_KEY,
  partsOf,
  plannerMakes,
  type PlannerTemplate,
} from "@/app/landing/plannerTemplates";
import { PlannerActions, plannerActionsNote } from "@/app/landing/PlannerActions";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/layouts/<key>: one layout, the spread, every module on it
// and what it is for, and "Use this". Its own address so it can be linked to
// and found on its own. Or a whole planner (plannerTemplates.ts): each part
// of its book, the spread and its modules, and "Use this planner".

export function generateStaticParams() {
  return [...PLANNERS.map((planner) => ({ key: planner.key })), ...STARTERS.map((starter) => ({ key: starter.key }))];
}

export const dynamicParams = false;

// Built ahead, but rebuilt at most hourly when asked for, not kept until a
// deploy: a season's planner (Lent, Ramadan) says when its book runs, and
// that moves on to the next year's season once a printed book can no longer
// reach this one (plannerTemplates' `dates` and `when`). Kept a build long,
// the page would promise last season while "Use this planner" makes the next.
export const revalidate = 3600;

const KIND_NAME = {
  week: "weekly spread",
  month: "monthly spread",
  day: "daily page",
  pages: "pages",
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ key: string }>;
}): Promise<Metadata> {
  const key = (await params).key;
  const planner = PLANNER_BY_KEY[key];
  if (planner) {
    return {
      title: `${planner.title} planner - memari. STUDIO`,
      description: `${planner.forWhom} ${planner.line} A printable planner you can change, every page laid out.`,
    };
  }
  const starter = STARTER_BY_KEY[key];
  if (!starter) return {};
  return {
    title: `${starter.title} ${KIND_NAME[starter.kind]} - memari. STUDIO`,
    description:
      starter.kind === "pages"
        ? `${starter.line} Printable planner pages you can change, at the front of your book.`
        : `${starter.line} A printable planner layout you can change, laid out for every ${starter.kind} of your book.`,
  };
}

export default async function LayoutPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const key = (await params).key;
  const planner = PLANNER_BY_KEY[key];
  if (planner) return <PlannerPage planner={planner} />;
  const starter = STARTER_BY_KEY[key];
  if (!starter) notFound();
  const modules = modulesOf(starter.key);
  const section = KIND_SECTIONS.find(([kind]) => kind === starter.kind)!;
  // A planner's part goes back to its planner, where it is listed.
  const home = starter.planner ? PLANNER_BY_KEY[starter.planner] : null;
  return (
    <SitePage>
      <LayoutViewer>
        <header className={site.head}>
          {home ? (
            <Link href={`/layouts/${home.key}`} className={site.crumb}>
              ← {home.title}
            </Link>
          ) : (
            <Link href={`/layouts#${starter.kind}`} className={site.crumb}>
              ← All {section[1].toLowerCase()}
            </Link>
          )}
          <h1 className={styles.headline} style={{ marginTop: 18 }}>
            {starter.title}
          </h1>
          <p className={styles.lede}>{starter.line}</p>
        </header>

        <section className={site.block}>
          <div className={site.detail}>
            <div>
              <LayoutCard spreadKey={starter.key} title={starter.title} eager />
              {starter.kind === "day" && (
                <p className={site.note} style={{ marginTop: 10 }}>
                  Two days of the same daily page, side by side.
                </p>
              )}
            </div>
            <div>
              <div className={site.cardActions}>
                <UseThisWeek
                  spreadKey={starter.key}
                  label={actionLabel(starter.kind)}
                />
                <SaveButton save={{ kind: "layout", key: starter.key }} what={`the ${starter.title} layout`} />
              </div>
              <p
                className={site.note}
                style={{ marginTop: 12, lineHeight: 1.5 }}
              >
                {makesWhat(starter.kind, starter.key)} Change anything. No account needed to
                try it.
              </p>
              {starter.hours && (
                <p
                  className={site.note}
                  style={{ marginTop: 18, lineHeight: 1.5 }}
                >
                  <strong style={{ color: "var(--ink)" }}>Hours:</strong>{" "}
                  {starter.hours}
                </p>
              )}
              <h2
                className={site.blockTitle}
                style={{ marginTop: 32, fontSize: 20 }}
              >
                On this {starter.kind === "pages" ? "spread" : starter.kind}
              </h2>
              <ul className={site.detailList}>
                {modules.map((m) => (
                  <li key={`${m.slug}-${m.name}`}>
                    <strong>{m.name}</strong>
                    {m.description && <span>{m.description}</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className={site.end}>
          <h2>The whole book, laid out.</h2>
          <p
            className={site.note}
            style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.55 }}
          >
            {starter.kind === "pages"
              ? "Put them at the front of a journal and design the rest around them. Memari lays out every page after, each one dated, ready to print at home or as a bound book."
              : `Design it once. Memari repeats it for every ${starter.kind} you choose, each one dated, ready to print at home or as a bound book.`}
          </p>
          <div className={site.cardActions} style={{ justifyContent: "center" }}>
            <UseThisWeek
              spreadKey={starter.key}
              label={actionLabel(starter.kind)}
            />
            <SaveButton save={{ kind: "layout", key: starter.key }} what={`the ${starter.title} layout`} />
          </div>
        </section>
      </LayoutViewer>
    </SitePage>
  );
}

/** A whole planner: what it is for, every part of its book, and one button
 *  that makes all of it. */
function PlannerPage({ planner }: { planner: PlannerTemplate }) {
  const parts = partsOf(planner).map(({ part, key }) => ({ part, key, starter: STARTER_BY_KEY[key], modules: modulesOf(key) }));
  return (
    <SitePage>
      <LayoutViewer>
        <header className={site.head}>
          <Link href="/layouts#planners" className={site.crumb}>
            ← All planners
          </Link>
          <h1 className={styles.headline} style={{ marginTop: 18 }}>
            {planner.title}
          </h1>
          <p className={styles.lede}>{planner.line}</p>
          <p className={site.hours} style={{ marginTop: 14, fontSize: 15 }}>
            {planner.forWhom}
          </p>
          <div style={{ marginTop: 24 }}>
            <div className={site.cardActions}>
              <PlannerActions plannerKey={planner.key} />
            </div>
            <p className={site.note} style={{ marginTop: 12, lineHeight: 1.5, maxWidth: 560 }}>
              {plannerActionsNote(plannerMakes(planner))}
            </p>
          </div>
        </header>

        {parts.map(({ part, key, starter, modules }, index) => (
          <section key={part} className={site.block} aria-labelledby={`${part}-title`}>
            <h2 id={`${part}-title`} className={site.blockTitle}>
              {PART_NAMES[part]}
            </h2>
            {starter && <p className={site.blockLede}>{starter.line}</p>}
            <div className={site.partBlock} style={{ marginTop: 24 }}>
              <div>
                <LayoutCard spreadKey={key} title={`${planner.title}: ${PART_NAMES[part].toLowerCase()}`} eager={index === 0} />
              </div>
              <div>
                <ul className={site.detailList} style={{ marginTop: 0 }}>
                  {modules.map((m) => (
                    <li key={`${m.slug}-${m.name}`}>
                      <strong>{m.name}</strong>
                      {m.description && <span>{m.description}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}

        <section className={site.end}>
          <h2>The whole book, laid out.</h2>
          <p className={site.note} style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.55 }}>
            Every page dated and ready to print at home or as a bound book. Move, resize or take out anything, and Memari lays out every page after.
          </p>
          <div className={site.cardActions} style={{ justifyContent: "center" }}>
            <PlannerActions plannerKey={planner.key} />
          </div>
        </section>
      </LayoutViewer>
    </SitePage>
  );
}

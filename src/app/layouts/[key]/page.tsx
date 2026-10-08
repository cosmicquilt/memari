import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/app/landing/SitePage";
import { LayoutCard, LayoutViewer } from "@/app/landing/LayoutViewer";
import { UseThisWeek } from "@/app/landing/UseThisWeek";
import {
  KIND_SECTIONS,
  STARTERS,
  STARTER_BY_KEY,
  makesWhat,
  modulesOf,
  actionLabel,
} from "@/app/landing/starterLayouts";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/layouts/<key>: one layout, the spread, every module on it
// and what it is for, and "Use this". Its own address so it can be linked to
// and found on its own.

export function generateStaticParams() {
  return STARTERS.map((starter) => ({ key: starter.key }));
}

export const dynamicParams = false;

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
  const starter = STARTER_BY_KEY[(await params).key];
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
  const starter = STARTER_BY_KEY[(await params).key];
  if (!starter) notFound();
  const modules = modulesOf(starter.key);
  const section = KIND_SECTIONS.find(([kind]) => kind === starter.kind)!;
  return (
    <SitePage>
      <LayoutViewer>
        <header className={site.head}>
          <Link href={`/layouts#${starter.kind}`} className={site.crumb}>
            ← All {section[1].toLowerCase()}
          </Link>
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
              <UseThisWeek
                spreadKey={starter.key}
                label={actionLabel(starter.kind)}
              />
              <p
                className={site.note}
                style={{ marginTop: 12, lineHeight: 1.5 }}
              >
                {makesWhat(starter.kind)} Change anything. No account needed to
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
          <UseThisWeek
            spreadKey={starter.key}
            label={actionLabel(starter.kind)}
          />
        </section>
      </LayoutViewer>
    </SitePage>
  );
}

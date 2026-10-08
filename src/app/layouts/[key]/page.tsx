import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SitePage } from "@/app/landing/SitePage";
import { SpreadPreview } from "@/app/landing/SpreadPreview";
import { UseThisWeek } from "@/app/landing/UseThisWeek";
import { STARTER_WEEKS, STARTER_WEEK_BY_KEY, modulesOfWeek } from "@/app/landing/starterLayouts";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";

// memari.studio/layouts/<key> - one week: the spread, every module on it and
// what it is for, and "Use this week". Its own address so it can be linked
// to and found on its own.

export function generateStaticParams() {
  return STARTER_WEEKS.map((week) => ({ key: week.key }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const week = STARTER_WEEK_BY_KEY[(await params).key];
  if (!week) return {};
  return {
    title: `${week.title} weekly planner layout - Memari Studio`,
    description: `${week.line} A printable weekly layout you can change, dated for every week of your book.`,
  };
}

export default async function LayoutPage({ params }: { params: Promise<{ key: string }> }) {
  const week = STARTER_WEEK_BY_KEY[(await params).key];
  if (!week) notFound();
  const modules = modulesOfWeek(week.key);
  return (
    <SitePage>
      <header className={site.head}>
        <Link href="/layouts" className={site.crumb}>
          ← All layouts
        </Link>
        <h1 className={styles.headline} style={{ marginTop: 18 }}>
          {week.title} week
        </h1>
        <p className={styles.lede}>{week.line}</p>
      </header>

      <section className={site.block}>
        <div className={site.detail}>
          <SpreadPreview spreadKey={week.key} eager />
          <div>
            <UseThisWeek spreadKey={week.key} />
            <p className={site.note} style={{ marginTop: 12, lineHeight: 1.5 }}>
              Opens a journal of your own with this as its weekly spread, dated from next month for three months. Change
              anything; no account needed to try it.
            </p>
            <h2 className={site.blockTitle} style={{ marginTop: 36, fontSize: 20 }}>
              On this week
            </h2>
            <ul className={site.detailList}>
              {modules.map((m) => (
                <li key={m.slug}>
                  <strong>{m.name}</strong>
                  {m.description && <span>{m.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className={site.end}>
        <h2>Every week of the book, laid out.</h2>
        <p className={site.note} style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.55 }}>
          Design the week once. Memari repeats it for every week you choose, each one dated, ready to print at home or as a
          bound book.
        </p>
        <UseThisWeek spreadKey={week.key} />
      </section>
    </SitePage>
  );
}

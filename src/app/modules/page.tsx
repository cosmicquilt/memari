import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";
import { GUIDE_SECTIONS, guideSections } from "@/lib/moduleGuides";
import { moduleDefinition } from "@/lib/moduleRegistry";
import own from "./modules.module.css";
import { GuidePhoto } from "./GuidePhoto";

// memari.studio/modules: the practices with a page of their own, grouped as
// the module drawer groups them (but philosophy and faith apart), each group
// with its line and its stamp (GUIDE_SECTIONS, guideSections).

export const metadata: Metadata = {
  title: "Practices - memari. STUDIO",
  description: "The practices behind Memari's modules: where each comes from, how it is done, and the module that prints it.",
};

export default function ModuleGuidesPage() {
  return (
    <SitePage>
      <header className={site.head}>
        <p className={styles.eyebrow}>Practices</p>
        <h1 className={styles.headline}>Where the modules come from</h1>
        <p className={styles.lede}>
          Some modules are a practice someone else worked out: a prayer, a philosopher&rsquo;s exercise, a recovery step, a way of
          sorting a week. Each of these has a page: where it comes from, how it is done, and the module that prints it.
        </p>
      </header>

      {guideSections().map(([category, guides]) => (
        <section key={category} className={site.block}>
          <div className={own.group}>
            {GUIDE_SECTIONS[category] ? (
              <div className={own.groupHead}>
                <div className={own.groupText}>
                  <h2>{category}</h2>
                  <p>{GUIDE_SECTIONS[category].lede}</p>
                </div>
                <GuidePhoto photo={GUIDE_SECTIONS[category].photo} priority={false} />
              </div>
            ) : (
              <h2>{category}</h2>
            )}
            <ul className={own.list}>
              {guides.map((guide) => (
                <li key={guide.slug}>
                  <Link href={`/modules/${guide.slug}`} className={own.item}>
                    <span>{guide.kicker}</span>
                    <b>{moduleDefinition(guide.slug)?.label ?? guide.slug}</b>
                    <p>{guide.lede}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <section className={site.end}>
        <h2>Put one in your planner</h2>
        <Link href="/app" className={site.button}>
          Start your planner
        </Link>
        <p className={site.note}>Free, and no account needed to try it.</p>
      </section>
    </SitePage>
  );
}

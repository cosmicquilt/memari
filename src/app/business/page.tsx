import type { Metadata } from "next";
import Link from "next/link";
import { SitePage } from "@/app/landing/SitePage";
import { COVERS } from "@/app/covers/catalogue";
import { shortDate } from "@/app/app/business/chartWords";
import { currentOwner } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import styles from "@/app/landing/landing.module.css";
import site from "@/app/landing/site.module.css";
import css from "./forBusinesses.module.css";

// memari.studio/business (2026-11-05): the public page for coaches, before
// the workspace (/app/business, where every button here goes). Andrew's
// page 7 of the mockups canvas: page 6's opening with the open journal,
// page 1's books, page 2's survey through its questions, page 4's
// workspace without its buttons, and page 1's close - with clients
// printing their own books from their links woven in (Settings, Business.
// clientsMayPrint) and no gold-print covers.
//
// Every claim is the app's own, read from it on the day: the bindings, the
// lengths and the page size (pricing), the covers (catalogue.ts, counted),
// a name on the cover (coverName), answers printing in the book
// (clientAnswers.ts), the template's update card (templates/page.tsx), the
// order screen's auto-renew (OrderDialog), groups (groups/page.tsx), the
// import, who pays (forms.tsx BookPayerForm) and the workspace's own menu
// and words (BusinessNav, page.tsx, business.ts). If one changes, this
// page changes with it.

export const metadata: Metadata = {
  title: "For businesses - memari. STUDIO",
  description:
    "For coaches and small practices: one template becomes a printed book for each client, with their name on the cover and their answers inside, shipped to their door or printed from their link.",
};

const DAY = 24 * 60 * 60 * 1000;
/** A day this many days from today, as the workspace writes it ("17 Nov"). */
const fromToday = (days: number) => shortDate(new Date(Date.now() + days * DAY).toISOString().slice(0, 10));

/** The workspace's coverage chart, as an example: a row a client, its bar
 *  the share of the next six months their books cover. */
const COVERAGE: Array<{ name: string; days: number | null; startsIn?: number }> = [
  { name: "Sol", days: 12 },
  { name: "Dev", days: 20 },
  { name: "Maya", days: 150 },
  { name: "Ines", days: null, startsIn: 26 },
];
const WINDOW_DAYS = 180;

/** "Jul to Sep": the quarter before this one, as the workspace's Home names it. */
function lastQuarter(): string {
  const now = new Date();
  const first = new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3 - 3, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 2, 1));
  const m = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${m(first)} to ${m(last)}`;
}

const PHOTOS: Array<{ id: string; alt: string; caption: [string, string] }> = [
  { id: "Fabric030", alt: "A dark grey cloth wire-o notebook on a wooden desk", caption: ["Metal wire-o", ", which lies flat"] },
  { id: "Fabric039", alt: "A dark cloth hardcover notebook", caption: ["Hardcover", ", or paperback"] },
  { id: "Concrete047A", alt: "A concrete-textured hardcover notebook on a wooden desk beside lilac", caption: [`${COVERS.length} covers`, ", with their name on it"] },
  { id: "Fabric036", alt: "A light grey cloth wire-o notebook on a white desk with pens", caption: ["30 days to two years", ", 7 × 10 in"] },
];

/** The way in, in the visitor's words: a coach with a business opens it;
 *  someone signed in tries it; anyone else tries it as a guest. Read
 *  without touching the business (currentBusiness marks a guest's as used,
 *  and looking at this page is not using it). */
async function wayIn(): Promise<string> {
  const owner = await currentOwner();
  if (!owner) return "Try it without an account";
  const business = await prisma.business.findUnique({ where: { ownerId: owner.id }, select: { id: true } });
  if (business) return "Open your workspace";
  return owner.guest ? "Try it without an account" : "Try it free";
}

export default async function ForBusinessesPage() {
  const start = await wayIn();
  return (
    <SitePage>
      <div className={css.wrap}>
        <header className={css.hero}>
          <p className={`${styles.eyebrow} ${css.eyebrowBlue}`}>For coaches and small practices</p>
          <h1 className={styles.headline}>Your framework, printed and shipped to every client.</h1>
          <p className={`${styles.lede} ${css.lede}`}>
            One template becomes a book for each client: their name on the cover, their answers inside. We print it and send it to their door, or they print it
            themselves from their link.
          </p>
          <div className={css.actions}>
            <Link href="/app/business" className={`${site.button} ${css.big}`}>
              {start}
            </Link>
            <Link href="/app/business/templates" className={`${site.buttonQuiet} ${css.big}`}>
              Order a sample of your book
            </Link>
          </div>
        </header>

        <figure className={css.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- two sizes made for it, as the site's other photos */}
          <img
            src="/landing/business/journal-open-1200.webp"
            srcSet="/landing/business/journal-open-1200.webp 1200w, /landing/business/journal-open-2400.webp 2400w"
            sizes="(min-width: 1168px) 1120px, calc(100vw - 48px)"
            width={2400}
            height={1602}
            fetchPriority="high"
            alt="An open wire-o journal on dark wood, a week of wellness pages printed and written in: priorities, a mood tracker, gratitude, habits, meals and self-care"
          />
          <figcaption>a client&rsquo;s week, printed and written in</figcaption>
        </figure>

        <section className={css.books} aria-label="The books">
          {PHOTOS.map((p) => (
            <figure key={p.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the carousel's own pictures, already sized */}
              <img src={`/landing/covers/${p.id}.webp`} width={640} height={640} loading="lazy" alt={p.alt} />
              <figcaption>
                <b>{p.caption[0]}</b>
                {p.caption[1]}
              </figcaption>
            </figure>
          ))}
        </section>

        <section className={css.ownPrint} aria-labelledby="own-print">
          <div className={css.center}>
            <p className={css.note}>print at home!</p>
            <h2 id="own-print" className={css.h2}>
              Or they print it themselves.
            </h2>
            <p className={css.sub}>Switch it on, and every client&rsquo;s link has their journal as a print-ready PDF, for their own printer, a print shop or a library near them.</p>
            <Link href="/print#find-a-library" className={css.textLink}>
              Find a library with our library locator
            </Link>
          </div>
        </section>

        <section id="how" className={css.section} aria-labelledby="how-title">
          <div className={css.center}>
            <h2 id="how-title" className={`${css.h2} ${css.h2Big}`}>
              Ask your questions once. Their answers print in their book.
            </h2>
            <p className={css.sub}>Your clients answer on their own page. Their goals, in their words, set in the journal you designed. No PDFs to send, no forms to chase.</p>
          </div>
          <div className={css.demo} data-paper-skip="">
            <div className={css.phone} role="img" aria-label="Example: a client's page asking for their three goals for the next 90 days, answered">
              <div className={css.screen} aria-hidden="true">
                <p className={css.screenFrom}>[Your practice]</p>
                <p className={css.screenTitle}>Maya, your journal</p>
                <div className={css.answers}>
                  <p>What are your three goals for the next 90 days?</p>
                  <div className={css.field}>
                    First<span>Run a 10k by June</span>
                  </div>
                  <div className={css.field}>
                    Second<span>Say no to one thing a week</span>
                  </div>
                  <div className={css.field}>
                    Third<span>Phone out of the bedroom</span>
                  </div>
                  <span className={css.fakeButton}>Save answers</span>
                </div>
              </div>
            </div>
            <svg className={css.arrow} width="124" height="38" viewBox="-0.8 11.1 187.6 57.7" aria-hidden="true">
              <path
                d="M9.3 57.31Q14.6 50.07 18.78 46.41Q22.96 42.76 27.53 39.44Q32.09 36.11 36.85 33.34Q41.61 30.57 46.51 28.39Q51.4 26.21 56.41 24.63Q61.42 23.04 66.54 22.02Q71.65 21 76.86 20.51Q82.07 20.02 87.37 20.04Q92.68 20.05 98.06 20.57Q103.45 21.08 108.92 22.06Q114.38 23.03 119.92 24.42Q125.45 25.8 131.06 27.55Q136.67 29.3 142.36 31.35Q148.05 33.41 153.82 35.72Q159.6 38.03 167.74 42.16Q175.88 46.28 175.88 46.29Q175.87 46.29 175.87 46.3Q175.87 46.3 167.29 43.29Q158.7 40.28 152.96 37.98Q147.22 35.69 141.58 33.65Q135.95 31.61 130.4 29.88Q124.86 28.15 119.41 26.79Q113.95 25.42 108.59 24.46Q103.22 23.5 97.94 23Q92.67 22.49 87.48 22.47Q82.3 22.45 77.21 22.92Q72.13 23.4 67.14 24.39Q62.16 25.38 57.28 26.93Q52.41 28.47 47.64 30.6Q42.87 32.72 38.22 35.43Q33.58 38.15 29.11 41.42Q24.65 44.68 20.56 48.29Q16.46 51.9 12.89 54.61Q9.31 57.32 9.3 57.31Z"
                fill="var(--hand)"
              />
              <path
                d="M125.4 26.9 L127.6 27.5 L129.8 28.1 L132.1 28.9 L134.3 29.7 L136.5 30.4 L138.8 31.2 L141.0 31.9 L142.9 32.6 L144.8 33.4 L146.7 34.1 L148.6 34.8 L150.5 35.6 L152.4 36.3 L154.4 37.1 L156.3 37.9 L158.2 38.7 L160.2 39.5 L162.1 40.3 L164.0 41.1 L166.0 42.0 L168.0 42.8 L169.9 43.7 L171.9 44.6 L173.9 45.4 L175.9 46.3"
                fill="none"
                stroke="var(--hand)"
                strokeWidth="2.0"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M141.0 31.9 L142.9 32.6 L144.8 33.4 L146.7 34.1 L148.6 34.8 L150.5 35.6 L152.4 36.3 L154.4 37.1 L156.3 37.9 L158.2 38.7 L160.2 39.5 L162.1 40.3 L164.0 41.1 L166.0 42.0 L168.0 42.8 L169.9 43.7 L171.9 44.6 L173.9 45.4 L175.9 46.3"
                fill="none"
                stroke="var(--hand)"
                strokeWidth="2.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M156.3 37.9 L158.2 38.7 L160.2 39.5 L162.1 40.3 L164.0 41.1 L166.0 42.0 L168.0 42.8 L169.9 43.7 L171.9 44.6 L173.9 45.4 L175.9 46.3"
                fill="none"
                stroke="var(--hand)"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M160.6 26.3 Q169.5 36.7 176 46 Q165.9 45.7 155.1 47.5" fill="none" stroke="var(--hand)" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className={css.printed} role="img" aria-label="Example: the same three goals printed on page 3 of her book, under My three goals, above this week's check-in">
              <p className={css.printedLabel} aria-hidden="true">
                Week 1
              </p>
              <div className={css.box} aria-hidden="true">
                <p className={css.printedLabel}>My three goals</p>
                <p className={css.line}>1. Run a 10k by June</p>
                <p className={css.line}>2. Say no to one thing a week</p>
                <p className={css.line}>3. Phone out of the bedroom</p>
              </div>
              <div className={`${css.box} ${css.boxGrow}`} aria-hidden="true">
                <p className={css.printedLabel}>This week&rsquo;s check-in</p>
                <div className={css.blank} />
                <div className={css.blank} />
                <div className={css.blank} />
              </div>
              <p className={css.printedFoot} aria-hidden="true">
                Maya&rsquo;s book, page 3
              </p>
            </div>
          </div>
        </section>

        <section className={css.section} aria-label="What the workspace does">
          <div className={css.features}>
            <div className={css.feature}>
              <div className={css.featureText}>
                <h2 className={css.h2}>Never rebuild a workbook again.</h2>
                <p className={css.sub}>Your program is one template. Change a page and the next book of every client on it has the change. Books already printed stay as they were.</p>
              </div>
              <div className={css.card} data-paper-skip="">
                <p className={css.cardTitle}>90-day reset: pages or settings changed</p>
                <p className={css.dim}>This changes the next book for 3 clients: Maya, Sol and Dev. Books already printed don&rsquo;t change.</p>
                <span className={css.fakeButton} aria-hidden="true">
                  Update their journals
                </span>
              </div>
            </div>

            <div className={`${css.feature} ${css.featureFlip}`}>
              <div className={css.card} data-paper-skip="">
                <p className={css.cardTitle}>Who has pages, and until when</p>
                <div className={css.rows}>
                  {COVERAGE.map((c) => {
                    const soon = c.days !== null && c.days <= 30;
                    return (
                      <div key={c.name} className={css.row}>
                        <span>{c.name}</span>
                        <span className={css.track} aria-hidden="true">
                          {c.days !== null && <span className={`${css.fill} ${soon ? css.fillSoon : ""}`} style={{ width: `${Math.round((c.days / WINDOW_DAYS) * 100)}%` }} />}
                        </span>
                        <span className={`${css.state} ${soon ? css.stateSoon : ""}`}>
                          {c.days === null ? `Starts ${fromToday(c.startsIn ?? 0)}` : soon ? `Runs out ${fromToday(c.days)}` : `To ${fromToday(c.days)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className={`${css.dim} ${css.small}`}>Example workspace</p>
              </div>
              <div className={css.featureText}>
                <h2 className={css.h2}>See who is running out before they do.</h2>
                <p className={css.sub}>Books last from 30 days to two years. Turn on auto-renew and the next one is ordered before the last runs out, made from their journal as it is then.</p>
              </div>
            </div>

            <div className={css.feature}>
              <div className={css.featureText}>
                <h2 className={css.h2}>A group for every cohort.</h2>
                <p className={css.sub}>
                  Clients who start together share a group: one template, one start date, and all their books ordered in one payment, sent to each of them or all to one
                  place. Bring a client list in from a spreadsheet.
                </p>
              </div>
              <div className={css.card} data-paper-skip="">
                <div className={css.cardHead}>
                  <p className={css.cardTitle}>Spring cohort</p>
                  <p className={`${css.dim} ${css.small}`}>12 clients, 90 days, from 1 March</p>
                </div>
                <div className={css.chips}>
                  {["Maya", "Sol", "Dev", "Ines", "+ 8"].map((n) => (
                    <span key={n}>{n}</span>
                  ))}
                </div>
                <p className={`${css.dim} ${css.small}`}>Example workspace</p>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className={`${css.section} ${css.split}`} aria-labelledby="pricing-title">
          <div className={css.splitText}>
            <h2 id="pricing-title" className={css.h2}>
              Free to make. Pay for paper.
            </h2>
            <p className={css.sub}>Each book is quoted for its pages, binding and address, and shown in full before anyone pays. Postage at cost.</p>
            <Link href="/pricing" className={css.textLink}>
              How a book is priced
            </Link>
          </div>
          <div className={css.payers}>
            <p className={css.payer}>
              <b>You pay</b>
              <span>, as part of your program.</span>
            </p>
            <p className={css.payer}>
              <b>Your client pays Memari&rsquo;s price</b>
              <span>, from their page.</span>
            </p>
            <p className={css.payer}>
              <b>Your client pays Memari&rsquo;s price plus your share</b>
              <span>, paid to you through Stripe.</span>
            </p>
            <p className={`${css.payer} ${css.payerFree}`}>
              <b>Or no one pays</b>
              <span>: switch on printing at home, and your clients download their journal from their link.</span>
            </p>
          </div>
        </section>

        <section id="questions" className={`${css.section} ${css.split}`} aria-labelledby="questions-title">
          <h2 id="questions-title" className={css.h2}>
            Common Questions
          </h2>
          <div className={css.questions}>
            <div className={css.question}>
              <h3>Do my clients need an account?</h3>
              <p>No. Their page opens from the link you send them, and you can turn the link off.</p>
            </div>
            <div className={css.question}>
              <h3>Can my clients order their own books?</h3>
              <p>Yes, if you&rsquo;d like them to. From their link they order and pay for their next book, at our price or with your share added.</p>
            </div>
            <div className={css.question}>
              <h3>Can my clients print it themselves?</h3>
              <p>Yes, once you switch it on in Settings. Their link then has their journal as a print-ready PDF, to print at home, at a shop or at a library.</p>
            </div>
            <div className={css.question}>
              <h3>What if a client doesn&rsquo;t answer?</h3>
              <p>That part of their book prints as you designed it, for them to fill in by hand.</p>
            </div>
            <div className={css.question}>
              <h3>Can I fix an answer?</h3>
              <p>Yes. Every answer is on the client&rsquo;s page in your workspace, and you can change it before their book is printed.</p>
            </div>
          </div>
        </section>

        <section className={css.section} aria-labelledby="workspace-title">
          <div className={css.center}>
            <h2 id="workspace-title" className={`${css.h2} ${css.h2Big}`}>
              A book for every client. One workspace for all of them.
            </h2>
            <p className={css.sub}>Templates, client links, intake answers, orders and renewals, in one quiet place. Free to use. You pay for paper.</p>
          </div>
          <div className={css.workspace} data-paper-skip="" role="img" aria-label="Example workspace: Home, with 24 current clients, 31 books this quarter, 9 on the way and 3 running out, and two things to do">
            <div className={css.wsNav} aria-hidden="true">
              <p>[Your practice]</p>
              <span className={css.wsHere}>Home</span>
              <span>Clients</span>
              <span>Groups</span>
              <span>Templates</span>
              <span>Orders</span>
              <span className={css.wsLower}>Settings</span>
              <span>Help</span>
            </div>
            <div className={css.wsMain} aria-hidden="true">
              <div className={css.wsHead}>
                <p className={css.wsTitle}>Home</p>
                <p className={`${css.dim} ${css.small}`}>Example workspace</p>
              </div>
              <div className={css.tiles}>
                <div className={css.tile}>
                  <p className={css.tileLabel}>Current clients</p>
                  <p className={css.tileValue}>24</p>
                  <p className={css.tileNote}>22 with a book ordered</p>
                </div>
                <div className={css.tile}>
                  <p className={css.tileLabel}>Books this quarter</p>
                  <p className={css.tileValue}>31</p>
                  <p className={css.tileNote}>6 more than {lastQuarter()}</p>
                </div>
                <div className={css.tile}>
                  <p className={css.tileLabel}>Books on the way</p>
                  <p className={css.tileValue}>9</p>
                  <p className={css.tileNote}>2 approved, 4 printing, 3 shipped</p>
                </div>
                <div className={css.tile}>
                  <p className={css.tileLabel}>Running out</p>
                  <p className={`${css.tileValue} ${css.tileWarn}`}>3</p>
                  <p className={css.tileNote}>Within 30 days, or already out</p>
                </div>
              </div>
              <div className={css.todo}>
                <p className={css.cardTitle}>To do</p>
                <div className={css.todoRow}>
                  <span className={css.bang}>!</span>
                  <span className={css.cardTitle}>No address to send to</span>
                  <span className={css.dim}>Ines Ruiz</span>
                </div>
                <div className={css.todoRow}>
                  <span className={css.bang}>!</span>
                  <span className={css.cardTitle}>Journal not built yet</span>
                  <span className={css.dim}>Dev Patel</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className={css.close} data-paper-skip="" aria-labelledby="close-title">
          <h2 id="close-title">Hold your program in your hands.</h2>
          <div className={css.actions}>
            <Link href="/app/business" className={`${site.button} ${css.big} ${css.closeLight}`}>
              {start}
            </Link>
            <Link href="/app/business/templates" className={`${site.buttonQuiet} ${css.big} ${css.closeQuiet}`}>
              Order a sample
            </Link>
          </div>
        </section>
      </div>
    </SitePage>
  );
}

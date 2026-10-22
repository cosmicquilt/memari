// memari. for businesses - Home. Before there is a business: what it is,
// and its name. After: until they are done, the four first steps; then the
// to-do list (what wants you) first, as the research had it
// (handoff/research/B2B-findings-summary.md); and under it, once there is a
// client, the charts asked for on 2026-10-22 - four headline numbers, and
// who has pages until when, most urgent first. The research's "no charts"
// was against charts for their own sake: each here answers a question the
// to-dos raise (who runs out next? are books going up?).

import Link from "next/link";
import { businessHome, currentBusiness } from "@/lib/business";
import { businessStats } from "@/lib/businessStats";
import { ChartCard, StatTiles, Timeline, type StatTileData } from "./charts";
import { shortDate, stateWords } from "./chartWords";
import { StartBusinessForm } from "./forms";
import css from "./business.module.css";

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
const quarterName = (d: Date) => {
  const first = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 2, 1));
  const m = (x: Date) => x.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${m(first)} to ${m(last)}`;
};
/** "3 more than Jul to Sep", "1 fewer", "same as": the change in words. */
function change(now: number, before: number, period: string, say: (n: number) => string = String): StatTileData["change"] {
  if (now === before) return { dir: "same", text: `Same as ${period}` };
  return now > before ? { dir: "up", text: `${say(now - before)} more than ${period}` } : { dir: "down", text: `${say(before - now)} ${say === String ? "fewer" : "less"} than ${period}` };
}

export default async function BusinessHome() {
  const ctx = await currentBusiness();
  const business = ctx?.business;
  if (!business)
    return (
      <>
        <h1>
          memari. <span style={{ fontWeight: 400 }}>for businesses</span>
        </h1>
        <p className={css.dim}>For coaches and anyone who gives their clients a planner as part of the work.</p>
        <ul>
          <li>Design a template once, from one of your journals.</li>
          <li>Add your clients: where their books go, and when each one starts.</li>
          <li>Order each client&rsquo;s book, shipped straight to them.</li>
        </ul>
        <div className={css.card}>
          <StartBusinessForm />
        </div>
        {ctx?.owner.guest && <p className={css.dim}>You&rsquo;re trying Memari as a guest: sign in and your business comes with you.</p>}
      </>
    );
  const [{ steps, tasks }, stats] = await Promise.all([businessHome(business), businessStats(business.id, 12)]);
  const done = steps.filter((s) => s.done).length;
  const { headline: hl, currency } = stats;
  const lastQuarter = quarterName(new Date(Date.UTC(new Date().getUTCFullYear(), Math.floor(new Date().getUTCMonth() / 3) * 3 - 1, 1)));
  const tiles: StatTileData[] = [
    { label: "Current clients", value: String(hl.activeClients), note: `${stats.setup[4].count} with a book ordered`, href: "/app/business/clients" },
    {
      label: "Books this quarter",
      value: String(hl.books.now),
      change: change(hl.books.now, hl.books.before, lastQuarter),
      spark: stats.monthly.map((m) => m.books),
      sparkLabel: "Books ordered each month, the last 12 months",
      href: "/app/business/orders",
    },
    {
      label: "Spent this quarter",
      value: money(hl.spend.now, currency),
      change: change(hl.spend.now, hl.spend.before, lastQuarter, (n) => money(n, currency)),
      spark: stats.monthly.map((m) => m.spend / 100),
      sparkLabel: "Spent each month, the last 12 months",
      href: "/app/business/orders",
    },
    {
      label: "Running out",
      value: String(hl.runningOut),
      note: hl.runningOut ? "Within 30 days, or already out" : "Everyone has pages for 30 days",
      warn: hl.runningOut > 0,
      href: "#coming-up",
    },
  ];
  const rows = stats.coverage.map((r) => ({ key: r.clientId, name: r.name, href: `/app/business/clients/${r.clientId}`, books: r.books, state: r.state, coveredTo: r.coveredTo, firstStart: r.firstStart }));
  return (
    <>
      <div className={css.head}>
        <h1>Home</h1>
        <Link href="/app/business/clients/new" className={`${css.btn} ${css.primary}`}>
          Add client
        </Link>
      </div>
      {done < steps.length && (
        <div className={css.card}>
          <div className={css.head}>
            <h2 style={{ flex: 1 }}>Getting started</h2>
            <span className={css.dim}>
              {done} of {steps.length}
            </span>
          </div>
          <div className={css.progress} aria-hidden="true">
            <span style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <div className={css.steps}>
            {steps.map((s) => (
              <Link key={s.key} href={s.href} className={`${css.step} ${s.done ? css.done : ""}`}>
                <span className={css.tick} aria-hidden="true">
                  ✓
                </span>
                <span>
                  <span className={`${css.strong} ${css.stepLabel}`}>{s.label}</span>
                  <br />
                  <span className={css.dim}>{s.detail}</span>
                </span>
                <span className={css.dim} aria-hidden="true">
                  ›
                </span>
                <span className="sr-only">{s.done ? "Done" : "To do"}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <div className={css.card}>
        <h2>To do</h2>
        {tasks.length ? (
          <div className={css.steps}>
            {tasks.map((t) => (
              <Link key={t.key} href={t.href} className={css.step}>
                <span className={`${css.tag} ${css.tagWarn}`} aria-hidden="true" style={{ padding: "2px 6px" }}>
                  !
                </span>
                <span>
                  <span className={css.strong}>{t.label}</span>
                  <br />
                  <span className={css.dim}>{t.detail}</span>
                </span>
                <span className={css.dim} aria-hidden="true">
                  ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className={css.dim}>Nothing needs you right now.</p>
        )}
      </div>
      {hl.activeClients > 0 && (
        <>
          <StatTiles tiles={tiles} />
          <ChartCard
            id="coming-up"
            title="Who has pages, and until when"
            sub="Each client's books by month, the ones running out first. Grey books have ended."
            table={{
              head: ["Client", "Books", "Covered to", "State"],
              rows: rows.map((r) => [r.name, r.books.length, r.coveredTo ? shortDate(r.coveredTo) : "None", stateWords(r).text]),
            }}
          >
            <Timeline rows={rows} today={stats.today} />
          </ChartCard>
        </>
      )}
    </>
  );
}

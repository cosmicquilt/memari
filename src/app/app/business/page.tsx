// memari. for businesses - Home. Before there is a business: what it is,
// and its name. After: a to-do list (what wants you) and, until it is done,
// the four first steps. No charts (handoff/research/B2B-findings-summary.md).

import Link from "next/link";
import { businessHome, currentBusiness } from "@/lib/business";
import { StartBusinessForm } from "./forms";
import css from "./business.module.css";

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
  const { steps, tasks } = await businessHome(business);
  const done = steps.filter((s) => s.done).length;
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
    </>
  );
}

// The pilot page's view (page.tsx checks who may see it): see page.tsx.

import { prisma } from "@/lib/prisma";
import { GUEST_OWNER_PREFIX } from "@/lib/guest";
import { LISTED } from "@/lib/print/holdsDays";
import { NewLink } from "./NewLink";
import css from "@/app/app/business/business.module.css";

const date = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
/** Changed after it was built: a minute's grace for the building itself. */
const after = (d: Date | null | undefined, prepared: Date) => !!d && d.getTime() > prepared.getTime() + 60_000;

/** The page itself, apart from who may see it: /dev/pilot draws it too, for
 *  the check and the roadmap's photographs (signing in as an admin is not
 *  something a check can do). */
export async function PilotView() {
  const prepared = await prisma.business.findMany({
    where: { preparedAt: { not: null } },
    orderBy: { preparedAt: "desc" },
    include: {
      templates: { include: { planner: { select: { updatedAt: true } } } },
      clients: { select: { id: true, plannerId: true, createdAt: true, answersAt: true, archivedAt: true } },
      groups: { select: { id: true } },
      feedback: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  const journals = prepared.flatMap((b) => b.clients.flatMap((c) => (c.plannerId ? [c.plannerId] : [])));
  const books = journals.length ? await prisma.printOrder.findMany({ where: { plannerId: { in: journals }, OR: LISTED }, select: { plannerId: true, paidByClient: true } }) : [];
  const now = new Date();

  return (
    <main className={css.biz} data-mode="light" style={{ minHeight: "100vh", padding: "32px 16px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gap: 16 }}>
        <h1 style={{ margin: 0, fontSize: "var(--h1-size)", fontWeight: 700, lineHeight: 1.15 }}>The first coaches</h1>
        <p className={css.dim}>
          Every workspace prepared for a coach, and how far each has got. Claimed means an account has it; until then it&rsquo;s theirs in one browser, as a guest,
          or not opened yet.
        </p>
        {prepared.length === 0 && (
          <div className={css.card}>
            <p className={css.dim}>None yet. Build one with npm run build:coach-kit.</p>
          </div>
        )}
        {prepared.map((b) => {
          const at = b.preparedAt!;
          const theirs = b.clients.filter((c) => !c.archivedAt);
          const added = theirs.filter((c) => after(c.createdAt, at)).length;
          const answered = theirs.filter((c) => c.answersAt).length;
          const ids = new Set(theirs.flatMap((c) => (c.plannerId ? [c.plannerId] : [])));
          const ordered = books.filter((o) => o.plannerId && ids.has(o.plannerId));
          const account = !b.ownerId.startsWith(GUEST_OWNER_PREFIX);
          // a guest's workspace whose one-use link is spent was opened
          const opened = !b.claimTokenHash;
          const steps: Array<[string, boolean, string]> = [
            ["Claimed", account, account ? (b.claimedAt ? date(b.claimedAt) : "an account has it") : opened ? "opened, as a guest" : "not opened"],
            ["Made it theirs", b.templates.some((t) => after(t.planner.updatedAt, at)), "their journal changed"],
            ["A client", added > 0 || b.groups.length > 0, `${added} added${b.groups.length ? `, ${b.groups.length} ${b.groups.length === 1 ? "group" : "groups"}` : ""}`],
            ["An answer", answered > 0, `${answered} answered`],
            ["A book", ordered.length > 0, `${ordered.length} ordered${ordered.some((o) => o.paidByClient) ? ", some by clients" : ""}`],
          ];
          return (
            <article key={b.id} className={css.card} data-pilot={b.preparedKey ?? ""} style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", alignItems: "baseline" }}>
                <h2 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 20, fontWeight: 600 }}>{b.name}</h2>
                <span className={css.dim}>
                  {b.preparedKey} · prepared {date(at)} · last in {date(b.updatedAt)}
                </span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {steps.map(([name, done, detail]) => (
                  <span key={name} className={`${css.tag} ${done ? css.tagOk : ""}`} data-step={name}>
                    {done ? "✓ " : ""}
                    {name}
                    <span style={{ fontWeight: 400 }}> · {detail}</span>
                  </span>
                ))}
              </div>
              {b.feedback.length > 0 && (
                <div style={{ display: "grid", gap: 6 }}>
                  <strong>What they&rsquo;ve told us</strong>
                  {b.feedback.map((f) => (
                    <p key={f.id} style={{ margin: 0 }}>
                      <span className={css.dim}>
                        {date(f.createdAt)}
                        {f.page ? `, on ${f.page}` : ""}:
                      </span>{" "}
                      {f.message}
                    </p>
                  ))}
                </div>
              )}
              {!account && (
                <p className={css.dim} style={{ margin: 0 }}>
                  {opened ? "Opened as a guest: their link is used. If they've lost it before signing in, make a new one." : b.claimExpiresAt && b.claimExpiresAt > now ? `Their link works until ${date(b.claimExpiresAt)}.` : "Their link has run out."}
                </p>
              )}
              {!account && <NewLink businessId={b.id} />}
            </article>
          );
        })}
      </div>
    </main>
  );
}

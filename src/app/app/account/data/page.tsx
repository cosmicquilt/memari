// Data & account: take your journals with you (each as a print-ready PDF),
// sign out, or delete everything.

import Link from "next/link";
import { currentOwner } from "@/lib/owner";
import { prisma } from "@/lib/prisma";
import { GUEST_IDLE_DAYS } from "@/lib/guest";
import { cream } from "@/lib/cream";
import { DeleteAccount, SignOut } from "./DataActions";

const dateOnly = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function DataPage() {
  const owner = (await currentOwner())!;
  const journals = await prisma.planner.findMany({
    where: { ownerId: owner.id, isTemplate: false },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: { id: true, slug: true, title: true, startDate: true, endDate: true, updatedAt: true },
  });
  return (
    <>
      <h1>Data &amp; account</h1>

      <div className="acct-card">
        <h2>Your journals</h2>
        <p className="acct-dim">Each one as a print-ready PDF, the whole book - yours to keep, print at home or take anywhere.</p>
        {journals.length === 0 ? (
          <p className="acct-dim">
            No journals yet. <Link href="/app" style={{ color: cream(0.85) }}>Make one</Link>.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
            {journals.map((j) => {
              const start = dateOnly(j.startDate);
              const end = dateOnly(j.endDate);
              return (
                <li key={j.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: `1px solid ${cream(0.07)}`, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <Link href={`/app/j/${j.slug ?? j.id}`} style={{ color: cream(0.92), textDecoration: "none", fontWeight: 600, fontSize: 14 }}>
                      {j.title}
                    </Link>
                    <div className="acct-dim" style={{ fontSize: 12 }}>
                      {start && end ? `${start} to ${end}` : "Undated"} · edited {j.updatedAt.toISOString().slice(0, 10)}
                    </div>
                  </div>
                  <a className="acct-btn" href={`/app/export?journal=${encodeURIComponent(j.id)}`}>
                    Download PDF
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="acct-card">
        <h2>{owner.guest ? "Keep your work" : "Sign out"}</h2>
        {owner.guest ? (
          <>
            <p className="acct-dim">
              As a guest, your journals belong to this browser, and one left unopened for {GUEST_IDLE_DAYS} days is deleted. Sign in and they move to your account, here or on any device.
            </p>
            <div>
              <Link className="acct-btn acct-primary" href="/sign-in?redirect_url=%2Fapp%2Faccount%2Fdata">
                Sign in or create an account
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="acct-dim">Sign out of Memari on this browser. Your journals stay in your account.</p>
            <div>
              <SignOut />
            </div>
          </>
        )}
      </div>

      <div className="acct-card" style={{ borderColor: "rgba(255, 143, 122, 0.28)" }}>
        <h2>{owner.guest ? "Delete your guest work" : "Delete your account"}</h2>
        <p className="acct-dim">
          Deletes every journal, saved page and module, and calendar{owner.guest ? "" : ", and your account"}. It cannot be undone - download anything you want to keep first.
        </p>
        <DeleteAccount guest={owner.guest} />
      </div>
    </>
  );
}

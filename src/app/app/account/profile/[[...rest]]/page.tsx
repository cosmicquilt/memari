// Profile: name, photo, email addresses, password and connected accounts -
// Clerk's own account panel, which keeps sign-in and security in one place
// and correct, in the app's dark chrome. A guest has no account: they are
// told what that means and how to get one.

import Link from "next/link";
import { UserProfile } from "@clerk/nextjs";
import { currentOwner } from "@/lib/owner";
import { GUEST_IDLE_DAYS } from "@/lib/guest";
import { DARK_CLERK } from "@/lib/clerkAppearance";

export default async function ProfilePage() {
  const owner = await currentOwner();
  if (owner?.guest) {
    return (
      <>
        <h1>Profile</h1>
        <div className="acct-card">
          <h2>You&rsquo;re a guest</h2>
          <p className="acct-dim">
            Your journals are kept in this browser, and deleted after {GUEST_IDLE_DAYS} days unopened. Sign in to keep them
            for good and use them anywhere. Everything you made comes with you.
          </p>
          <div>
            <Link href="/sign-in?redirect_url=%2Fapp%2Faccount%2Fprofile" className="acct-btn acct-primary">
              Sign in or create an account
            </Link>
          </div>
        </div>
      </>
    );
  }
  return (
    <>
      <h1>Profile</h1>
      <UserProfile routing="path" path="/app/account/profile" appearance={DARK_CLERK} />
    </>
  );
}

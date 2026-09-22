import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { guestModeAvailable } from "@/lib/guest";

// memari.studio/sign-in - our own sign-in page, so it can offer "Continue as
// guest" (asked for 2026-09-21). Clerk's component does the signing in and
// signing up (withSignUp), including Google, and returns to ?redirect_url=.
// It used to be Clerk's hosted page at accounts.memari.studio, which cannot
// carry a button of ours.

/** Only paths on this site: a redirect_url of "https://elsewhere" or
 *  "//elsewhere" would make this page an open redirect. */
function safeReturn(value: string | string[] | undefined): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path && path.startsWith("/") && !path.startsWith("//") ? path : "/app";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const returnTo = safeReturn((await searchParams).redirect_url);
  const { userId } = await auth();
  if (userId) redirect(returnTo);

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#111113",
        color: "#f2f2f2",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
      }}
    >
      <div style={{ display: "grid", gap: 20, justifyItems: "center", width: "100%", maxWidth: 420 }}>
        <strong style={{ fontSize: 20 }}>
          Memari <span style={{ fontWeight: 200, fontSize: "0.8em", letterSpacing: "0.1em" }}>STUDIO</span>
        </strong>
        <SignIn
          routing="path"
          path="/sign-in"
          withSignUp
          fallbackRedirectUrl={returnTo}
          signUpFallbackRedirectUrl={returnTo}
          appearance={{ variables: { colorPrimary: "#4a5cff" } }}
        />
        {guestModeAvailable() && (
          <form action="/guest" method="post" style={{ display: "grid", gap: 8, justifyItems: "center", width: "100%" }}>
            <div
              aria-hidden="true"
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", color: "rgba(255,255,255,0.45)", fontSize: 12 }}
            >
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
              or
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.15)" }} />
            </div>
            <button
              type="submit"
              style={{
                borderRadius: 999,
                font: "inherit",
                fontSize: 14,
                fontWeight: 700,
                padding: "9px 22px",
                minHeight: 38,
                cursor: "pointer",
                border: "1.5px solid rgba(255,255,255,0.7)",
                background: "transparent",
                color: "#fff",
              }}
            >
              Continue as guest
            </button>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
              No account needed. Your journals stay in this browser, and signing in later keeps them.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { PREVIEW_COOKIE, hasPreview } from "@/lib/comingSoonPass";

/**
 * The site is off at its own address (Andrew, 2026-10-14: "turn off
 * memari.studio address and add a coming soon"): every page there shows
 * /coming-soon instead, at the address that was asked for. Still served:
 * the API (payment and sign-in webhooks, the renewal job), files, and the
 * legal pages, which a payment provider reviewing the business may ask for.
 * Everywhere else the site is as it was: this machine, and the deployments'
 * own vercel.app addresses. `false` turns memari.studio back on.
 *
 * A PASSWORD GETS PAST IT (2026-10-15: "add password on coming soon gate"):
 * the coming-soon page has a box for it, and the right one sets a cookie
 * that lets that browser see the whole site. The password is the
 * environment's, COMING_SOON_PASSWORD in Vercel - never the code's, which is
 * public - and with none set nobody gets past. See src/lib/comingSoonPass.ts.
 *
 * OFF since 2026-10-19 ("reopen memari.studio again no coming soon screen"):
 * the site is open; the page and the password stay for next time.
 */
const COMING_SOON = false;
const OFF_HOSTS = new Set(["memari.studio", "www.memari.studio"]);
const STILL_SERVED = /^\/(?:api|trpc|coming-soon|privacy|terms|legal|renewal)(?:\/|$)/;

export default clerkMiddleware(async (_auth, req) => {
  // the address the visitor asked for, as the platform passes it on
  // (nextUrl's hostname can be the server's own name instead)
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(",")[0].trim().replace(/:\d+$/, "").toLowerCase();
  if (!COMING_SOON || !OFF_HOSTS.has(host)) return;
  const path = req.nextUrl.pathname;
  if (STILL_SERVED.test(path)) return;
  if (/\.[a-z0-9]+$/i.test(path)) return; // a file (robots.txt, a picture), not a page
  if (await hasPreview(req.cookies.get(PREVIEW_COOKIE)?.value)) return; // has the password
  return NextResponse.rewrite(new URL("/coming-soon", req.url));
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

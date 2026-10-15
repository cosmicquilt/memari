// POST /coming-soon/enter - the coming-soon page's password box (page.tsx).
// The right password sets the preview cookie and goes back to the page that
// was asked for; a wrong one returns to the page saying so, a moment later,
// so guessing is slow. See src/lib/comingSoonPass.ts.

import { NextResponse, type NextRequest } from "next/server";
import { PREVIEW_COOKIE, PREVIEW_MAX_AGE, isPreviewPassword, previewToken } from "@/lib/comingSoonPass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The address the visitor is on, as the platform passes it on (the
 *  request's own URL can carry the server's name instead - see proxy.ts). */
function origin(request: NextRequest): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host).split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "")).split(",")[0].trim();
  return `${proto}://${host}`;
}

/** Back where they were: the page the form was on, if it was this site's. */
function backTo(request: NextRequest, base: string): string {
  const referer = request.headers.get("referer");
  if (!referer) return "/";
  try {
    const url = new URL(referer);
    if (url.origin !== base || url.pathname.startsWith("/coming-soon")) return "/";
    return url.pathname + url.search;
  } catch {
    return "/";
  }
}

export async function POST(request: NextRequest) {
  const base = origin(request);
  const form = await request.formData().catch(() => null);
  const given = String(form?.get("password") ?? "");
  if (!(await isPreviewPassword(given))) {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return NextResponse.redirect(`${base}/coming-soon?wrong=1`, 303);
  }
  const token = await previewToken();
  const response = NextResponse.redirect(`${base}${backTo(request, base)}`, 303);
  response.cookies.set(PREVIEW_COOKIE, token!, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: PREVIEW_MAX_AGE });
  return response;
}

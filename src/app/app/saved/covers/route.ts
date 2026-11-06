// HEARTS ON COVERS (2026-11-05), from /covers - beside app/saved/template,
// the other thing kept from the site. See lib/coverHearts.ts.
//
//   GET     this person's hearted covers, newest first, and whether they
//           are kept on an account (else on this browser, as a guest).
//   POST    heart one: { coverId }. Somebody new becomes a guest here
//           (lib/siteSave.ts), so the heart is theirs when they come back.
//   DELETE  take the heart off.
//
// Every answer carries the whole list, so the page shows what was kept
// rather than what it hoped for. JSON and same-origin only.

import { NextResponse, type NextRequest } from "next/server";
import { claimGuestWork, currentOwner } from "@/lib/owner";
import { ownerOrNewGuest, sameOrigin, setGuestCookie } from "@/lib/siteSave";
import { heartCover, heartedCoverOf, heartedCovers, unheartCover } from "@/lib/coverHearts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function coverOf(request: NextRequest) {
  return heartedCoverOf(await request.json().catch(() => null));
}

export async function GET() {
  const owner = await currentOwner();
  if (!owner) return json({ hearts: [], account: false });
  // SIGNED IN where they hearted as a guest: those hearts come along here, as
  // a journal does on /app, so somebody who signs in from /covers finds their
  // hearts on it - not only after they next open the app.
  if (!owner.guest) await claimGuestWork(owner.id);
  return json({ hearts: await heartedCovers(owner.id), account: !owner.guest });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Not from here." }, 403);
  const coverId = await coverOf(request);
  if (!coverId) return json({ error: "That isn't one of our covers." }, 400);
  const saver = await ownerOrNewGuest();
  if (!saver) return json({ error: "Sign in to keep hearts.", signIn: true }, 401);
  await heartCover(saver.owner.id, coverId);
  return setGuestCookie(json({ hearts: await heartedCovers(saver.owner.id), account: !saver.owner.guest }), saver.cookie);
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Not from here." }, 403);
  const coverId = await coverOf(request);
  if (!coverId) return json({ error: "That isn't one of our covers." }, 400);
  const owner = await currentOwner();
  if (!owner) return json({ hearts: [], account: false });
  await unheartCover(owner.id, coverId);
  return json({ hearts: await heartedCovers(owner.id), account: !owner.guest });
}

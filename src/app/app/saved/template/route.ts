// SAVE, from anywhere something of ours is shown (2026-10-21): the start
// dialog's details and zoom, the Layouts pages and their popup, the module
// pages. One address for all of them - see planner/templateSaving.ts for
// what saving each kind makes.
//
//   GET     what this person has saved of ours (source keys), to light the
//           buttons. Nobody yet: nothing.
//   POST    save it. Someone who has never used Memari becomes a guest
//           here, as Use this makes one (app/from/[key]), so a save from the
//           site is theirs when they open the app.
//   DELETE  un-save it.
//
// JSON, and same-origin only (lib/siteSave.ts, shared with hearts).

import { NextResponse, type NextRequest } from "next/server";
import { currentOwner } from "@/lib/owner";
import { ownerOrNewGuest, sameOrigin, setGuestCookie } from "@/lib/siteSave";
import { parseTemplateSave, saveTemplateItem, templateSavedKeys, unsaveTemplateItem } from "@/app/planner/templateSaving";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function bodyOf(request: NextRequest) {
  return parseTemplateSave(await request.json().catch(() => null));
}

export async function GET() {
  const owner = await currentOwner();
  return json({ keys: owner ? await templateSavedKeys(owner.id) : [] });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Not from here." }, 403);
  const save = await bodyOf(request);
  if (!save) return json({ error: "Nothing to save." }, 400);
  const saver = await ownerOrNewGuest();
  if (!saver) return json({ error: "Sign in to save.", signIn: true }, 401);
  const { owner } = saver;
  let saved: Awaited<ReturnType<typeof saveTemplateItem>>;
  try {
    saved = await saveTemplateItem(owner.id, save);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "It did not save." }, 400);
  }
  return setGuestCookie(json({ ...saved, keys: await templateSavedKeys(owner.id) }), saver.cookie);
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: "Not from here." }, 403);
  const save = await bodyOf(request);
  if (!save) return json({ error: "Nothing to remove." }, 400);
  const owner = await currentOwner();
  if (!owner) return json({ keys: [] });
  await unsaveTemplateItem(owner.id, save);
  return json({ keys: await templateSavedKeys(owner.id) });
}

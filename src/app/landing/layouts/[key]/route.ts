// One layout for the Layouts popup (LayoutViewer.tsx): its picture, what it
// is, and its similar layouts (similarLayouts.ts) with theirs. `key` is a
// layout ("student") or a variation of one ("student~2").

import { layoutPreview } from "../../spreads";
import { resolveLayout, similarTo } from "../../similarLayouts";
import { actionLabel, makesWhat } from "../../starterLayouts";
import type { LayoutDetail } from "../../layoutDetail";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const entry = resolveLayout(decodeURIComponent(key));
  if (!entry) return new Response("There is no such layout.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  const detail: LayoutDetail = {
    key: entry.key,
    baseKey: entry.baseKey,
    kind: entry.kind,
    title: entry.title,
    line: entry.line,
    hours: entry.hours,
    changes: entry.changes,
    action: actionLabel(entry.kind),
    makes: makesWhat(entry.kind),
    spread: layoutPreview(entry.def),
    similar: similarTo(entry.key).map((s) => ({ key: s.key, title: s.title, changes: s.changes, spread: layoutPreview(s.def) })),
  };
  return Response.json(detail, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
}

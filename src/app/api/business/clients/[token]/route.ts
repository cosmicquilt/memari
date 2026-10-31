// POST /api/business/clients/<token> - a new client for a coach, from
// Zapier, Make or any tool that can send a web request (clientIntake.ts).
// JSON or a form, one client a request:
//   { "name": "Maya Okafor", "email": "maya@example.com", "street": "120 Elm Street",
//     "city": "Jersey City", "state": "NJ", "zip": "07302", "country": "US",
//     "start_date": "2027-01-04", "months": 3, "template": "Clarity Quarterly" }
// Answers 201 with the client, 200 when they were already there, 400 with
// what is wrong, 404 for an address that isn't one, 429 past the day's
// limit.

import { NextResponse } from "next/server";
import { INTAKE_PER_DAY, addClients, businessForIntakeToken, clientFrom, clientsToday, firstTemplateOf } from "@/lib/clientIntake";

export const dynamic = "force-dynamic";

const answer = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const business = await businessForIntakeToken(token);
  if (!business) return answer(404, { ok: false, error: "This address doesn't add clients. Make a new one in memari. Settings." });
  let raw: Record<string, unknown>;
  try {
    const type = request.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      const body = await request.json();
      raw = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    } else raw = Object.fromEntries(await request.formData());
  } catch {
    return answer(400, { ok: false, error: "Send the client as JSON or a form." });
  }
  const read = clientFrom(raw);
  if (!read.ok) return answer(400, { ok: false, error: read.error });
  if ((await clientsToday(business.id)) >= INTAKE_PER_DAY) return answer(429, { ok: false, error: `This address adds at most ${INTAKE_PER_DAY} clients a day.` });
  const { added, skipped } = await addClients(business.id, [read.client], await firstTemplateOf(business.id));
  if (skipped.length) return answer(200, { ok: true, already: true, client: { name: read.client.name } });
  return answer(201, { ok: true, client: added[0] });
}

// Clerk's sign-in metadata, repeated at Memari's own address for assistants on
// older protocol versions, which look for it here rather than following
// oauth-protected-resource (Clerk's guide keeps it for them).

import { metadataCorsOptionsRequestHandler } from "mcp-handler";
import { METADATA_HEADERS, clerkIssuer } from "@/lib/connector/clerkIssuer";

export async function GET() {
  const answer = await fetch(`${clerkIssuer()}/.well-known/oauth-authorization-server`, { next: { revalidate: 3600 } });
  if (!answer.ok) return new Response("Sign-in details aren't available right now.", { status: 502 });
  return Response.json(await answer.json(), { headers: METADATA_HEADERS });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

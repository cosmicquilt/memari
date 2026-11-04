// What an assistant reads after /mcp answers 401: this resource's address, and
// where to sign in for it (RFC 9728). Public: it says nothing about anyone.

import { generateProtectedResourceMetadata, getPublicOrigin, metadataCorsOptionsRequestHandler } from "mcp-handler";
import { METADATA_HEADERS, clerkIssuer } from "@/lib/connector/clerkIssuer";

export function GET(request: Request) {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [clerkIssuer()],
    resourceUrl: `${getPublicOrigin(request)}/mcp`,
    additionalMetadata: { resource_name: "memari.", scopes_supported: ["profile", "email"] },
  });
  return Response.json(metadata, { headers: METADATA_HEADERS });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();

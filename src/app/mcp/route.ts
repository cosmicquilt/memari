// memari.studio/mcp - the address a person gives their own assistant to connect
// it to Memari (2026-11-02; the tools are src/lib/connector). The token is the
// only way in: Clerk issues it when the person signs in and approves the
// assistant, so it names an account, and a guest cannot connect. No token, a
// wrong one, or a session cookie gets a 401 pointing at how to sign in.

import { auth } from "@clerk/nextjs/server";
import { withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { connectorHandler } from "@/lib/connector/mcpServer";

export const dynamic = "force-dynamic";

async function verifyToken(_request: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const token = await auth({ acceptsToken: "oauth_token" });
  if (!token.isAuthenticated) return undefined;
  return { token: bearerToken, clientId: token.clientId, scopes: token.scopes, extra: { userId: token.userId } };
}

const connector = withMcpAuth(connectorHandler(), verifyToken, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp" });

export const GET = connector;
export const POST = connector;
export const DELETE = connector;

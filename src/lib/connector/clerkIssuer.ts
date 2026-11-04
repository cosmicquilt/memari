// The sign-in server a connecting assistant is sent to: Clerk's address for this
// instance, which the publishable key holds (pk_live_<base64 of "clerk.host$">).
// So production and this machine each name their own without a setting.

export function clerkIssuer(): string {
  const encoded = (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "").split("_")[2];
  if (!encoded) throw new Error("No Clerk publishable key.");
  return `https://${Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "")}`;
}

/** Metadata is read by assistants that may be running in a browser. */
export const METADATA_HEADERS = { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" };

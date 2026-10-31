"use server";

// The pilot page's one action: a new claim link for a prepared workspace
// nobody has claimed (src/lib/businessClaim.ts). Admins only.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentOwner } from "@/lib/owner";
import { isAdmin } from "@/lib/print/admin";
import { appUrl } from "@/lib/print/fileUrls";
import { claimUrl, makeClaimToken } from "@/lib/businessClaim";

export async function newClaimLink(businessId: string): Promise<{ url?: string; error?: string }> {
  const owner = await currentOwner();
  if (!owner || owner.guest || !isAdmin(owner.id)) return { error: "Not yours to do." };
  try {
    const token = await makeClaimToken(String(businessId));
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    revalidatePath("/app/admin/coaches");
    return { url: claimUrl(appUrl(host ? `${proto}://${host}` : undefined), token) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No link could be made." };
  }
}

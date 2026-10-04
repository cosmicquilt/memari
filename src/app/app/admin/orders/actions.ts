"use server";

// The admin page's two buttons. Each checks the person pressing it is an
// admin (ADMIN_OWNER_IDS) before doing anything - the page hiding them is
// not the guard.

import { headers } from "next/headers";
import { currentOwner } from "@/lib/owner";
import { isAdmin, refundOrder, retryOrder } from "@/lib/print/admin";
import { OrderError } from "@/lib/print/orders";
import { appUrl } from "@/lib/print/fileUrls";

type Result = { ok: true; message: string } | { ok: false; error: string };

async function admin(): Promise<boolean> {
  const owner = await currentOwner();
  return !!owner && !owner.guest && isAdmin(owner.id);
}

function said(error: unknown): Result {
  if (error instanceof OrderError) return { ok: false, error: error.message };
  console.error("[print admin]", error);
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export async function retryOrderAction(orderId: string): Promise<Result> {
  if (!(await admin())) return { ok: false, error: "Not allowed." };
  try {
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host");
    const proto = list.get("x-forwarded-proto") ?? "https";
    await retryOrder(orderId, appUrl(host ? `${proto}://${host}` : undefined));
    return { ok: true, message: "Sent to the printer again." };
  } catch (error) {
    return said(error);
  }
}

export async function refundOrderAction(orderId: string, why: string): Promise<Result> {
  if (!(await admin())) return { ok: false, error: "Not allowed." };
  try {
    const { printerCancelled } = await refundOrder(orderId, why.trim() || "refunded by Memari");
    return {
      ok: true,
      message:
        printerCancelled === false
          ? "Refunded - but the printer had already started, so the book may still arrive."
          : printerCancelled
            ? "Refunded, and the print job cancelled."
            : "Refunded.",
    };
  } catch (error) {
    return said(error);
  }
}

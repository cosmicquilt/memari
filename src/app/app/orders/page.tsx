import { redirect } from "next/navigation";

// The printed books moved into the account page (2026-10-08). Stripe's
// payment page and the order emails still link here, so this address
// forwards - with the order just placed, if there is one.
export default async function OrdersRedirect({ searchParams }: { searchParams: Promise<{ placed?: string }> }) {
  const { placed } = await searchParams;
  redirect(placed ? `/app/account/orders?placed=${encodeURIComponent(placed)}` : "/app/account/orders");
}

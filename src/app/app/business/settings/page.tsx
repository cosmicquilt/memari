// memari. for businesses - Settings: the business's name and logo, and who
// pays for clients' books (2026-10-22). Back from Stripe's payouts pages
// (?payouts=back or again), it asks Stripe how the account stands.

import { requireBusiness } from "@/lib/business";
import { refreshPayouts } from "@/lib/payouts";
import { orderingConfigured } from "@/lib/print/orders";
import { PAYOUT_COUNTRIES } from "@/lib/print/clientPays";
import { countryOptions } from "@/lib/print/countries";
import { BookPayerForm, SettingsForm } from "../forms";
import { BusinessMark } from "../WorkspaceSwitcher";
import css from "../business.module.css";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ payouts?: string }> }) {
  const ctx = await requireBusiness();
  const business = ctx.business;
  // asked of Stripe whenever there is an account: Stripe can clear one some
  // time after the coach comes back, or restrict it later (review,
  // 2026-10-23); ?payouts= is where Stripe's pages return to
  await searchParams;
  const ready = business.stripeAccountId ? await refreshPayouts(business.id) : business.payoutsReady;
  return (
    <>
      <h1>Settings</h1>
      <div className={css.card}>
        <div className={css.head}>
          <BusinessMark name={business.name} logoUrl={business.logoUrl} />
          <h2 style={{ flex: 1 }}>{business.name}</h2>
        </div>
        <SettingsForm name={business.name} logoUrl={business.logoUrl} />
      </div>
      <BookPayerForm clientsPay={business.clientsPay} markupCents={business.markupCents} payouts={ready ? "ready" : business.stripeAccountId ? "pending" : "none"} paymentsOn={orderingConfigured().ok} guest={ctx.owner.guest} countries={countryOptions().filter((c) => PAYOUT_COUNTRIES.includes(c.code))} />
    </>
  );
}

// memari. for businesses - Settings: the business's name and logo.

import { currentBusiness } from "@/lib/business";
import { SettingsForm } from "../forms";
import { BusinessMark } from "../WorkspaceSwitcher";
import css from "../business.module.css";

export default async function SettingsPage() {
  const business = (await currentBusiness())!.business!;
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
    </>
  );
}

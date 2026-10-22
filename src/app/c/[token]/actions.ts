"use server";

// A client's own page (src/lib/clientPortal.ts): what they may change from
// it - where their books go. The token is checked again here; nothing else
// about the client is trusted from the form.

import { revalidatePath } from "next/cache";
import { saveAddressFromPortal } from "@/lib/clientPortal";
import { COUNTRY_CODES } from "@/lib/print/countries";

export type AddressState = { error?: string; saved?: boolean } | null;

const text = (form: FormData, key: string, max = 200) => String(form.get(key) ?? "").trim().slice(0, max);

export async function saveMyAddress(token: string, _: AddressState, form: FormData): Promise<AddressState> {
  const address = {
    name: text(form, "name", 120),
    street1: text(form, "street1"),
    street2: text(form, "street2") || undefined,
    city: text(form, "city", 120),
    stateCode: text(form, "stateCode", 40) || undefined,
    postcode: text(form, "postcode", 20),
    countryCode: text(form, "countryCode", 2).toUpperCase(),
    phoneNumber: text(form, "phoneNumber", 40),
  };
  if (!address.name || !address.street1 || !address.city || !address.postcode || !address.phoneNumber) return { error: "Fill in your name, address, city, postcode and phone." };
  if (!COUNTRY_CODES.includes(address.countryCode)) return { error: "Choose a country from the list." };
  if (!(await saveAddressFromPortal(token, address))) return { error: "This link no longer works. Ask for a new one." };
  revalidatePath(`/c/${token}`);
  return { saved: true };
}

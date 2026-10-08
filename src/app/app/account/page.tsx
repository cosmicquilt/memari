import { redirect } from "next/navigation";

// /app/account opens on its first part.
export default function AccountPage() {
  redirect("/app/account/profile");
}

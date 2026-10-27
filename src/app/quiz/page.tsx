// /quiz: the otter's quiz at an address of its own (2026-10-26, the site
// map), so the header's Layouts menu, the footer and anything else can link
// to it. The quiz itself lives in the start dialog (/app?otter=1), as the
// landing page's post-it already sends people there.

import { redirect } from "next/navigation";

export default function Quiz() {
  redirect("/app?otter=1");
}

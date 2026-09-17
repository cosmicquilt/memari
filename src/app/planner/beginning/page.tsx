// The front matter - printed once, at the front. No locked spine, so the whole page is free: see matterLayout.
//
// The page itself is renderLevelPage, shared by every level - see that file.

import { renderLevelPage } from "../levelPage";

export default async function BeginningPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return renderLevelPage("FRONT_MATTER", searchParams);
}

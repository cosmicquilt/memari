// The back matter - printed once, at the back.
//
// The page itself is renderLevelPage, shared by every level - see that file.

import { renderLevelPage } from "../levelPage";

export default async function EndingPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return renderLevelPage("BACK_MATTER", searchParams);
}

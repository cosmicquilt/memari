// The weekly spread - the book's WEEKLY level. This route predates levels, which is why it is /next rather than /weekly.
//
// The page itself is renderLevelPage, shared by every level - see that file.

import { renderLevelPage } from "../levelPage";

export default async function NativePlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return renderLevelPage("WEEKLY", searchParams);
}

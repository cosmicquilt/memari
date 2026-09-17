// The daily page - ONE page, not a spread. See dayLayout on why a day is a day.
//
// The page itself is renderLevelPage, shared by every level - see that file.

import { renderLevelPage } from "../levelPage";

export default async function DayPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  return renderLevelPage("DAILY", searchParams);
}

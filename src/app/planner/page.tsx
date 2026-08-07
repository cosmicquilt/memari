import { auth } from "@clerk/nextjs/server";
import { getOrCreatePlanner } from "./actions";
import { PlannerEditor } from "./PlannerEditor";

export default async function PlannerPage() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn();
  }

  const planner = await getOrCreatePlanner();
  const page = planner.pages[0];

  const initialElements = page.moduleInstances
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((instance) => {
      const props = instance.propValues as { polotnoElement?: object };
      return props.polotnoElement ?? null;
    })
    .filter((el): el is object => el !== null);

  return <PlannerEditor pageId={page.id} initialElements={initialElements} />;
}

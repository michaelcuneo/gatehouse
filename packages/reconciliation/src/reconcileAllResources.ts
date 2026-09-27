import { listResources } from "@gatehouse/resources";

import { planReconciliation } from "./planReconciliation";
import { reconcilePlannedResource } from "./reconcileResource";

export async function reconcileAllResources(): Promise<void> {
  const resources = listResources();
  const plan = planReconciliation(resources);

  for (const resource of plan) {
    await reconcilePlannedResource(resource);
  }
}

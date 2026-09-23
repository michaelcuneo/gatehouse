import { listResources } from "@gatehouse/resources";

import { reconcileResource } from "./reconcileResource";

export async function reconcileAllResources(): Promise<void> {
  const resources = listResources();

  for (const resource of resources) {
    await reconcileResource(resource.id);
  }
}

import { getResource } from "@gatehouse/resources";
import { getProvider } from "@gatehouse/providers";

export async function reconcileResource(resourceId: string) {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource ${resourceId} not found`);
  }

  const provider = getProvider(resource.provider);

  if (!provider) {
    throw new Error(`Provider ${resource.provider} not found`);
  }

  await provider.reconcile(resource);
}

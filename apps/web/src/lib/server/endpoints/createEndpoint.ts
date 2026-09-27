import { reconcileResource } from '@gatehouse/reconciliation';
import { createResource } from '@gatehouse/resources';

export async function createEndpoint(resource: EndpointResource) {
  createResource(resource);

  if (resource.enabled) {
    await reconcileResource(resource.id);
  }

  return resource;
}

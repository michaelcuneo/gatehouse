import { reconcileEndpoint } from '$lib/server/nginx/reconcileEndpoint';

export async function reconcileResource(resource: Resource) {
  switch (resource.kind) {
    case 'endpoint':
      return reconcileEndpoint(resource);

    default:
      throw new Error(
        `Reconciliation is not implemented for resource kind: ${resource.kind}`
      );
  }
}

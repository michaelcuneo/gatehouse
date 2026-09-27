import { reconcileResource as reconcileManagedResource } from '@gatehouse/reconciliation';

export async function reconcileResource(resource: Resource) {
  return reconcileManagedResource(resource.id);
}

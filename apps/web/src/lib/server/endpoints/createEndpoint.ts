import { saveResource, updateResourceState } from '@gatehouse/db';

import { reconcileResource } from '$lib/server/reconciliation/reconcileResource';

export async function createEndpoint(resource: EndpointResource) {
  saveResource({
    id: resource.id,
    kind: resource.kind,
    name: resource.name,
    provider: resource.provider,
    enabled: resource.enabled,
    status: resource.status,
    version: resource.version,
    spec: resource.spec,
    metadata: resource.metadata,
    runtime: resource.runtime,
    createdAt: resource.createdAt,
    updatedAt: resource.updatedAt
  });

  if (!resource.enabled) {
    return resource;
  }

  updateResourceState(resource.id, {
    status: 'reconciling',
    runtime: {
      lastStatusMessage: 'Reconciling endpoint'
    }
  });

  try {
    await reconcileResource(resource);

    const now = new Date().toISOString();

    updateResourceState(resource.id, {
      status: 'ready',
      runtime: {
        lastReconciledAt: now,
        lastError: undefined,
        lastStatusMessage: 'Endpoint reconciled successfully',
        healthy: true
      },
      updatedAt: now
    });
  } catch (cause) {
    const now = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : String(cause);

    updateResourceState(resource.id, {
      status: 'error',
      runtime: {
        lastReconciledAt: now,
        lastError: message,
        lastStatusMessage: 'Endpoint reconciliation failed',
        healthy: false
      },
      updatedAt: now
    });

    throw cause;
  }

  return resource;
}

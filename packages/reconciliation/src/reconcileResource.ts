import { updateResourceState } from "@gatehouse/db";
import { getProvider } from "@gatehouse/providers";
import {
  getResource,
  listResources,
} from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

import { planReconciliation } from "./planReconciliation";

async function applyResource(resource: Resource): Promise<void> {
  const provider = getProvider(resource.provider);

  if (!provider) {
    throw new Error(`Provider "${resource.provider}" is not implemented`);
  }

  const startedAt = new Date().toISOString();

  updateResourceState(resource.id, {
    status: "reconciling",
    runtime: {
      lastError: undefined,
      lastStatusMessage: resource.enabled
        ? `Reconciling with ${resource.provider}`
        : `Removing disabled resource with ${resource.provider}`,
    },
    updatedAt: startedAt,
  });

  try {
    if (resource.enabled) {
      await provider.reconcile(resource);
    } else if (provider.destroy) {
      await provider.destroy(resource);
    }

    const completedAt = new Date().toISOString();

    updateResourceState(resource.id, {
      status: resource.enabled ? "ready" : "disabled",
      runtime: {
        lastReconciledAt: completedAt,
        lastError: undefined,
        lastStatusMessage: resource.enabled
          ? "Resource reconciled successfully"
          : "Disabled resource removed from runtime",
        healthy: resource.enabled,
      },
      updatedAt: completedAt,
    });
  } catch (cause) {
    const failedAt = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : String(cause);

    updateResourceState(resource.id, {
      status: "error",
      runtime: {
        lastReconciledAt: failedAt,
        lastError: message,
        lastStatusMessage: "Resource reconciliation failed",
        healthy: false,
      },
      updatedAt: failedAt,
    });

    throw cause;
  }
}

export async function reconcileResource(resourceId: string): Promise<void> {
  const target = getResource(resourceId);

  if (!target) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  const resources = listResources();
  const plan = planReconciliation(resources, [resourceId]);

  for (const resource of plan) {
    await applyResource(resource);
  }
}

export async function reconcilePlannedResource(
  resource: Resource,
): Promise<void> {
  await applyResource(resource);
}

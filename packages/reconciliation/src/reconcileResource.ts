import {
  finishDeployment,
  getLatestSuccessfulDeployment,
  startDeployment,
  updateResourceState,
  writeAuditLog,
} from "@gatehouse/db";
import {
  getProvider,
  resourceOwnership,
} from "@gatehouse/providers";
import {
  getResource,
  listResources,
} from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

import { fingerprintStaticSiteBuild } from "./artifactFingerprint";
import { planReconciliation } from "./planReconciliation";
import { providerContextForResource } from "./providerContext";

export interface ReconcileResourceOptions {
  forceDeployment?: boolean;
}

function isDeployableResource(
  resource: Resource,
): resource is Extract<Resource, { kind: "service" | "static_site" }> {
  return resource.kind === "service" || resource.kind === "static_site";
}

async function applyResource(
  resource: Resource,
  options: ReconcileResourceOptions = {},
): Promise<void> {
  const provider = getProvider(resource.provider);
  const context = providerContextForResource(resource.id);

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

  let deploymentId: string | null = null;
  let artifactFingerprint: string | undefined;
  let skipArtifactTransfer = false;

  try {
    const ownership = resourceOwnership(resource);

    if (ownership !== "gatehouse") {
      const completedAt = new Date().toISOString();

      updateResourceState(resource.id, {
        status: resource.enabled ? "ready" : "disabled",
        runtime: {
          lastReconciledAt: completedAt,
          lastError: undefined,
          lastStatusMessage:
            ownership === "observed"
              ? "Observed resource; GateHouse mutation intentionally disabled"
              : "Externally managed resource; GateHouse mutation intentionally disabled",
        },
        updatedAt: completedAt,
      });

      writeAuditLog({
        resourceId: resource.id,
        action: "reconcile",
        success: true,
        message:
          ownership === "observed"
            ? "Skipped mutation for observed resource"
            : "Skipped mutation for externally managed resource",
      });

      return;
    }
    if (resource.enabled && isDeployableResource(resource)) {
      deploymentId = startDeployment({
        resourceId: resource.id,
        resourceName: resource.name,
        resourceKind: resource.kind,
        provider: resource.provider,
        resourceVersion: resource.version,
        startedAt,
        message: `Deploying with ${resource.provider}`,
      }).id;

      if (resource.kind === "static_site") {
        artifactFingerprint = await fingerprintStaticSiteBuild(resource);

        const previous = getLatestSuccessfulDeployment(resource.id);

        skipArtifactTransfer =
          resource.spec.deployOnChange === true &&
          options.forceDeployment !== true &&
          previous?.artifactFingerprint === artifactFingerprint;

        context.deployment = {
          artifactFingerprint,
          skipArtifactTransfer,
        };
      }
    }

    let reconcileResult;

    if (resource.enabled) {
      reconcileResult = await provider.reconcile(resource, context);
    } else if (provider.destroy) {
      await provider.destroy(resource, context);
    }

    const completedAt = new Date().toISOString();

    if (deploymentId) {
      const skipped =
        resource.kind === "static_site" &&
        skipArtifactTransfer &&
        reconcileResult?.artifactTransferred === false;

      finishDeployment(deploymentId, {
        status: skipped ? "skipped" : "succeeded",
        completedAt,
        artifactFingerprint,
        message:
          reconcileResult?.message ??
          (skipped
            ? "Artifact unchanged; infrastructure reconciled without transfer"
            : `Deployment completed with ${resource.provider}`),
      });
    }

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

    writeAuditLog({
      resourceId: resource.id,
      action: "reconcile",
      success: true,
      message: resource.enabled
        ? `Reconciled with ${resource.provider}`
        : `Removed disabled resource with ${resource.provider}`,
    });
  } catch (cause) {
    const failedAt = new Date().toISOString();
    const message = cause instanceof Error ? cause.message : String(cause);

    if (deploymentId) {
      finishDeployment(deploymentId, {
        status: "failed",
        completedAt: failedAt,
        artifactFingerprint,
        message,
      });
    }

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

    writeAuditLog({
      resourceId: resource.id,
      action: "reconcile",
      success: false,
      message,
    });

    throw cause;
  }
}

export async function reconcileResource(
  resourceId: string,
  options: ReconcileResourceOptions = {},
): Promise<void> {
  const target = getResource(resourceId);

  if (!target) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  const resources = listResources();
  const plan = planReconciliation(resources, [resourceId]);

  for (const resource of plan) {
    await applyResource(resource, {
      forceDeployment:
        options.forceDeployment === true &&
        resource.id === resourceId,
    });
  }
}

export async function reconcilePlannedResource(
  resource: Resource,
): Promise<void> {
  await applyResource(resource);
}

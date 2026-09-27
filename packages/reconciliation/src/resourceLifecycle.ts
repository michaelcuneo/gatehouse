import {
  writeAuditLog,
} from "@gatehouse/db";
import {
  getProvider,
  resourceOwnership,
} from "@gatehouse/providers";
import {
  deleteResource,
  getResource,
  listResources,
  updateResource,
} from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

import { providerContextForResource } from "./providerContext";
import { resourceDependencyIds } from "./resourceDependencies";
import { reconcileResource } from "./reconcileResource";

function dependentsOf(resourceId: string): Resource[] {
  return listResources().filter((resource) =>
    resourceDependencyIds(resource).includes(resourceId),
  );
}

function requireNoDependents(resourceId: string): void {
  const dependents = dependentsOf(resourceId);

  if (!dependents.length) {
    return;
  }

  throw new Error(
    `Resource is still required by: ${dependents
      .map((resource) => resource.name)
      .join(", ")}`,
  );
}

export async function relinquishResource(
  resourceId: string,
): Promise<Resource> {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  if (resourceOwnership(resource) === "external") {
    return resource;
  }

  const updated = updateResource({
    ...resource,
    metadata: {
      ...(resource.metadata ?? {}),
      managed: false,
      ownership: {
        mode: "observed",
      },
    },
    status: "pending",
    runtime: {
      ...(resource.runtime ?? {}),
      lastStatusMessage:
        "GateHouse control relinquished; resource remains observed",
    },
  });

  await reconcileResource(updated.id);

  writeAuditLog({
    resourceId: updated.id,
    action: "relinquish",
    success: true,
    message: "Relinquished GateHouse ownership without mutating infrastructure",
  });

  return updated;
}

export async function forgetResource(
  resourceId: string,
): Promise<void> {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  if (resourceOwnership(resource) === "gatehouse") {
    throw new Error(
      "GateHouse-owned resources must be relinquished or destroyed before they can be forgotten",
    );
  }

  requireNoDependents(resourceId);

  deleteResource(resourceId);
}

export async function destroyResourceSafely(
  resourceId: string,
): Promise<void> {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  if (resourceOwnership(resource) !== "gatehouse") {
    throw new Error(
      "Only GateHouse-owned resources can be destroyed. Use Forget for observed or external resources.",
    );
  }

  requireNoDependents(resourceId);

  if (
    resource.kind === "static_site" &&
    resource.spec.contentMode === "external"
  ) {
    throw new Error(
      "This static site retains externally managed content/origin state. Relinquish it instead of destroying it.",
    );
  }

  const provider = getProvider(resource.provider);

  if (!provider?.destroy) {
    throw new Error(
      `Provider "${resource.provider}" does not expose a destructive workflow. Relinquish this resource instead.`,
    );
  }

  const context = providerContextForResource(resource.id);

  await provider.destroy(resource, context);

  writeAuditLog({
    resourceId: resource.id,
    action: "destroy",
    success: true,
    message: `Destroyed infrastructure with ${resource.provider}`,
  });

  deleteResource(resource.id);
}

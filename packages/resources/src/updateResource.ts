import { isDeepStrictEqual } from "node:util";

import {
  getResource as getStoredResource,
  saveResource,
  writeAuditLog,
} from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

import { validateResource } from "./validateResource";

function desiredState(resource: Resource) {
  return {
    kind: resource.kind,
    name: resource.name,
    provider: resource.provider,
    enabled: resource.enabled,
    metadata: resource.metadata,
    spec: resource.spec,
  };
}

export interface UpdateResourceOptions {
  forceDesiredStateChange?: boolean;
}

export function updateResource(
  resource: Resource,
  options: UpdateResourceOptions = {},
): Resource {
  validateResource(resource);

  const existing = getStoredResource<Resource["spec"]>(resource.id);

  if (!existing) {
    throw new Error(`Resource "${resource.id}" not found`);
  }

  const changed =
    options.forceDesiredStateChange === true ||
    !isDeepStrictEqual(
      desiredState(existing as Resource),
      desiredState(resource),
    );

  const updated: Resource = {
    ...resource,
    version: changed
      ? existing.version + 1
      : existing.version,
    status: changed
      ? "pending"
      : resource.status,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    runtime: changed
      ? {
          ...(resource.runtime ?? existing.runtime),
          lastStatusMessage: "Desired state changed; reconciliation pending",
        }
      : resource.runtime,
  };

  saveResource<Resource["spec"]>(updated);

  writeAuditLog({
    resourceId: updated.id,
    action: "update",
    success: true,
    message: changed
      ? `Updated ${updated.kind} resource "${updated.name}" to version ${updated.version}`
      : `Updated ${updated.kind} resource "${updated.name}" without desired-state changes`,
  });

  return updated;
}

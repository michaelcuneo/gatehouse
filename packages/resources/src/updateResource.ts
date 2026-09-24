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

export function updateResource(resource: Resource): Resource {
  validateResource(resource);

  const existing = getStoredResource<Resource["spec"]>(resource.id);

  if (!existing) {
    throw new Error(`Resource "${resource.id}" not found`);
  }

  const changed = !isDeepStrictEqual(
    desiredState(existing as Resource),
    desiredState(resource),
  );

  const updated: Resource = {
    ...resource,
    version: changed
      ? existing.version + 1
      : existing.version,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
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

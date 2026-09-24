import {
  getManagedStageById,
  listStageIdsForResource,
} from "@gatehouse/db";
import type { ProviderContext } from "@gatehouse/providers";
import {
  getResource,
} from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

function dependencyIds(resource: Resource): string[] {
  const ids = new Set(resource.metadata?.dependsOn ?? []);

  if (resource.kind === "static_site") {
    if (resource.spec.endpointId) ids.add(resource.spec.endpointId);
    if (resource.spec.storageId) ids.add(resource.spec.storageId);
  }

  return [...ids];
}

export function providerContextForResource(
  resourceId: string,
): ProviderContext {
  const resource = getResource(resourceId);

  if (!resource) {
    throw new Error(`Resource "${resourceId}" not found`);
  }

  const projectStages = listStageIdsForResource(resourceId)
    .map((stageId) => getManagedStageById(stageId))
    .filter((context) => context !== null);

  const dependencies = dependencyIds(resource)
    .map((dependencyId) => getResource(dependencyId))
    .filter((dependency) => dependency !== null);

  return {
    projectStages,
    dependencies,
  };
}

import {
  getManagedStageById,
  listStageIdsForResource,
} from "@gatehouse/db";
import type { ProviderContext } from "@gatehouse/providers";
import {
  getResource,
} from "@gatehouse/resources";
import type { Resource } from "@gatehouse/types";

import { resourceDependencyIds } from "./resourceDependencies";

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

  const dependencyIdList = resourceDependencyIds(resource);

  const dependencies = dependencyIdList
    .map((dependencyId) => getResource(dependencyId))
    .filter((dependency) => dependency !== null);

  const dependencyStages = Object.fromEntries(
    dependencyIdList.map((dependencyId) => [
      dependencyId,
      listStageIdsForResource(dependencyId)
        .map((stageId) => getManagedStageById(stageId))
        .filter((context) => context !== null),
    ]),
  );

  return {
    projectStages,
    dependencies,
    dependencyStages,
  };
}

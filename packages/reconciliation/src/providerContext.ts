import {
  getManagedStageById,
  listStageIdsForResource,
} from "@gatehouse/db";
import type { ProviderContext } from "@gatehouse/providers";

export function providerContextForResource(
  resourceId: string,
): ProviderContext {
  const projectStages = listStageIdsForResource(resourceId)
    .map((stageId) => getManagedStageById(stageId))
    .filter((context) => context !== null);

  return { projectStages };
}

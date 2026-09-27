import { listStageIdsForResource } from "@gatehouse/db";
import type { Resource } from "@gatehouse/types";

import { listResources } from "./listResources";

export function listImportedAwsResourcesForStage(
  stageId: string,
): Resource[] {
  return listResources().filter(
    (resource) =>
      resource.metadata?.importedFrom?.provider === "aws" &&
      listStageIdsForResource(resource.id).includes(stageId),
  );
}

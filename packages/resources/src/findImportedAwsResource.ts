import { listStageIdsForResource } from "@gatehouse/db";

import { listResources } from "./listResources";

export function findImportedAwsResource(
  stageId: string,
  discoveryId: string,
) {
  return (
    listResources().find(
      (resource) =>
        resource.metadata?.importedFrom?.provider === "aws" &&
        resource.metadata.importedFrom.discoveryId === discoveryId &&
        listStageIdsForResource(resource.id).includes(stageId),
    ) ?? null
  );
}

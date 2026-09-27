import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

export function validateDynamoDBResource(
  resource: Resource,
  context: ProviderContext,
): void {
  if (resource.kind !== "database_table") {
    throw new Error(
      `DynamoDB provider cannot manage resource kind "${resource.kind}"`,
    );
  }

  if (context.projectStages.length !== 1) {
    throw new Error(
      `DynamoDB table "${resource.name}" must be attached to exactly one project stage`,
    );
  }

  if (!resource.spec.tableName.trim()) {
    throw new Error("DynamoDB table name is required");
  }

  if (!resource.spec.region.trim()) {
    throw new Error("DynamoDB region is required");
  }

  if (!resource.spec.partitionKey.name.trim()) {
    throw new Error("DynamoDB partition key is required");
  }

  if (
    resource.spec.sortKey &&
    resource.spec.sortKey.name === resource.spec.partitionKey.name
  ) {
    throw new Error(
      "DynamoDB sort key must differ from the partition key",
    );
  }

  if (resource.spec.billingMode === "PROVISIONED") {
    if (
      !Number.isInteger(resource.spec.readCapacity) ||
      !Number.isInteger(resource.spec.writeCapacity) ||
      (resource.spec.readCapacity ?? 0) < 1 ||
      (resource.spec.writeCapacity ?? 0) < 1
    ) {
      throw new Error(
        "Provisioned DynamoDB tables require positive read and write capacity",
      );
    }
  }
}

import {
  describeDynamoDBTable,
  dynamoDBTableMatchesDesired,
  reconcileDynamoDBTable,
} from "@gatehouse/aws";
import type {
  DatabaseTableResource,
  Resource,
} from "@gatehouse/types";
import type { ProviderContext } from "../types";

import { validateDynamoDBResource } from "./validate";

function target(
  resource: Resource,
  context: ProviderContext,
): {
  resource: DatabaseTableResource;
  stage: ProviderContext["projectStages"][number]["stage"];
} {
  validateDynamoDBResource(resource, context);

  if (resource.kind !== "database_table") {
    throw new Error("DynamoDB provider requires a table resource");
  }

  const stage = context.projectStages[0]?.stage;

  if (!stage) {
    throw new Error(
      "DynamoDB provider requires an attached project stage",
    );
  }

  return {
    resource,
    stage,
  };
}

export async function reconcileDynamoDBResource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  const resolved = target(resource, context);

  await reconcileDynamoDBTable(
    resolved.stage,
    resolved.resource.spec,
  );
}

export async function healthDynamoDBResource(
  resource: Resource,
  context: ProviderContext,
) {
  const resolved = target(resource, context);
  const table = await describeDynamoDBTable(
    resolved.stage,
    resolved.resource.spec,
  );

  if (!table) {
    return {
      healthy: false,
      message: "DynamoDB table does not exist",
    };
  }

  if (table.TableStatus !== "ACTIVE") {
    return {
      healthy: false,
      message: `DynamoDB table status is ${table.TableStatus ?? "unknown"}`,
    };
  }

  const healthy = dynamoDBTableMatchesDesired(
    table,
    resolved.resource.spec,
  );

  return {
    healthy,
    message: healthy
      ? "DynamoDB table matches desired state"
      : "DynamoDB table differs from desired state",
  };
}

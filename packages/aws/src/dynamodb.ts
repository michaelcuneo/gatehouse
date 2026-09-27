import {
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTableCommand,
  type AttributeDefinition,
  type KeySchemaElement,
  type TableDescription,
} from "@aws-sdk/client-dynamodb";

import type { ManagedStage } from "@gatehouse/core";
import type {
  DynamoDBAttributeType,
  DynamoDBTableSpec,
} from "@gatehouse/types";

import { awsClientsForStage } from "./clients";

function client(stage: ManagedStage, region: string) {
  return awsClientsForStage(stage, region).dynamoDB;
}

function keySchema(spec: DynamoDBTableSpec): KeySchemaElement[] {
  return [
    {
      AttributeName: spec.partitionKey.name,
      KeyType: "HASH",
    },
    ...(spec.sortKey
      ? [
          {
            AttributeName: spec.sortKey.name,
            KeyType: "RANGE" as const,
          },
        ]
      : []),
  ];
}

function attributeDefinitions(
  spec: DynamoDBTableSpec,
): AttributeDefinition[] {
  return [
    {
      AttributeName: spec.partitionKey.name,
      AttributeType: spec.partitionKey.type,
    },
    ...(spec.sortKey
      ? [
          {
            AttributeName: spec.sortKey.name,
            AttributeType: spec.sortKey.type,
          },
        ]
      : []),
  ];
}

export async function describeDynamoDBTable(
  stage: ManagedStage,
  spec: Pick<DynamoDBTableSpec, "tableName" | "region">,
): Promise<TableDescription | null> {
  try {
    const result = await client(stage, spec.region).send(
      new DescribeTableCommand({
        TableName: spec.tableName,
      }),
    );

    return result.Table ?? null;
  } catch (cause) {
    const name =
      cause && typeof cause === "object" && "name" in cause
        ? String((cause as { name?: unknown }).name)
        : "";

    if (name === "ResourceNotFoundException") {
      return null;
    }

    throw cause;
  }
}

function attributeType(
  table: TableDescription,
  name: string,
): DynamoDBAttributeType | null {
  const definition = table.AttributeDefinitions?.find(
    (candidate) => candidate.AttributeName === name,
  );

  const value = definition?.AttributeType;

  return value === "S" || value === "N" || value === "B"
    ? value
    : null;
}

export function dynamoDBTableMatchesIdentity(
  table: TableDescription,
  spec: DynamoDBTableSpec,
): boolean {
  const hash = table.KeySchema?.find(
    (entry) => entry.KeyType === "HASH",
  );
  const range = table.KeySchema?.find(
    (entry) => entry.KeyType === "RANGE",
  );

  if (
    hash?.AttributeName !== spec.partitionKey.name ||
    attributeType(table, spec.partitionKey.name) !== spec.partitionKey.type
  ) {
    return false;
  }

  if (!spec.sortKey) {
    return !range;
  }

  return (
    range?.AttributeName === spec.sortKey.name &&
    attributeType(table, spec.sortKey.name) === spec.sortKey.type
  );
}

export function dynamoDBTableMatchesDesired(
  table: TableDescription,
  spec: DynamoDBTableSpec,
): boolean {
  if (!dynamoDBTableMatchesIdentity(table, spec)) {
    return false;
  }

  if ((table.GlobalSecondaryIndexes?.length ?? 0) > 0) {
    return false;
  }

  if ((table.LocalSecondaryIndexes?.length ?? 0) > 0) {
    return false;
  }

  const billingMode =
    table.BillingModeSummary?.BillingMode ??
    (table.ProvisionedThroughput ? "PROVISIONED" : "PAY_PER_REQUEST");

  if (billingMode !== spec.billingMode) {
    return false;
  }

  if (
    Boolean(table.DeletionProtectionEnabled) !==
    Boolean(spec.deletionProtection)
  ) {
    return false;
  }

  if (spec.billingMode === "PROVISIONED") {
    if (
      table.ProvisionedThroughput?.ReadCapacityUnits !==
        spec.readCapacity ||
      table.ProvisionedThroughput?.WriteCapacityUnits !==
        spec.writeCapacity
    ) {
      return false;
    }
  }

  return true;
}

export async function reconcileDynamoDBTable(
  stage: ManagedStage,
  spec: DynamoDBTableSpec,
): Promise<void> {
  const dynamoDB = client(stage, spec.region);
  const existing = await describeDynamoDBTable(stage, spec);

  if (!existing) {
    await dynamoDB.send(
      new CreateTableCommand({
        TableName: spec.tableName,
        AttributeDefinitions: attributeDefinitions(spec),
        KeySchema: keySchema(spec),
        BillingMode: spec.billingMode,
        ProvisionedThroughput:
          spec.billingMode === "PROVISIONED"
            ? {
                ReadCapacityUnits: spec.readCapacity ?? 1,
                WriteCapacityUnits: spec.writeCapacity ?? 1,
              }
            : undefined,
        DeletionProtectionEnabled:
          spec.deletionProtection ?? false,
      }),
    );

    return;
  }

  if (!dynamoDBTableMatchesIdentity(existing, spec)) {
    throw new Error(
      `Refusing to change DynamoDB primary-key schema for table "${spec.tableName}"`,
    );
  }

  if (
    (existing.GlobalSecondaryIndexes?.length ?? 0) > 0 ||
    (existing.LocalSecondaryIndexes?.length ?? 0) > 0
  ) {
    throw new Error(
      `Refusing to reconcile DynamoDB table "${spec.tableName}" because index management is not implemented yet`,
    );
  }

  const currentBilling =
    existing.BillingModeSummary?.BillingMode ??
    (existing.ProvisionedThroughput
      ? "PROVISIONED"
      : "PAY_PER_REQUEST");

  const billingChanged = currentBilling !== spec.billingMode;
  const throughputChanged =
    spec.billingMode === "PROVISIONED" &&
    (existing.ProvisionedThroughput?.ReadCapacityUnits !==
      spec.readCapacity ||
      existing.ProvisionedThroughput?.WriteCapacityUnits !==
      spec.writeCapacity);

  if (billingChanged || throughputChanged) {
    await dynamoDB.send(
      new UpdateTableCommand({
        TableName: spec.tableName,
        BillingMode: spec.billingMode,
        ProvisionedThroughput:
          spec.billingMode === "PROVISIONED"
            ? {
                ReadCapacityUnits: spec.readCapacity ?? 1,
                WriteCapacityUnits: spec.writeCapacity ?? 1,
              }
            : undefined,
      }),
    );
  }

  if (
    Boolean(existing.DeletionProtectionEnabled) !==
    Boolean(spec.deletionProtection)
  ) {
    await dynamoDB.send(
      new UpdateTableCommand({
        TableName: spec.tableName,
        DeletionProtectionEnabled:
          spec.deletionProtection ?? false,
      }),
    );
  }
}

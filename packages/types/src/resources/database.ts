import type { BaseResource } from "../core/resource";

export type DynamoDbAttributeType = "S" | "N" | "B";
export type DynamoDbBillingMode = "PAY_PER_REQUEST" | "PROVISIONED";

export interface DynamoDbKeyAttribute {
  name: string;
  type: DynamoDbAttributeType;
}

export interface DynamoDbTableSpec {
  provider: "dynamodb";
  tableName: string;
  region: string;
  partitionKey: DynamoDbKeyAttribute;
  sortKey?: DynamoDbKeyAttribute;
  billingMode: DynamoDbBillingMode;
  readCapacity?: number;
  writeCapacity?: number;
  deletionProtectionEnabled?: boolean;
}

export type DatabaseTableResource = BaseResource<
  "database_table",
  DynamoDbTableSpec
>;

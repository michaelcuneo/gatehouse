import type { BaseResource } from "../core/resource";

export type DynamoDBAttributeType = "S" | "N" | "B";
export type DynamoDBBillingMode = "PAY_PER_REQUEST" | "PROVISIONED";

export interface DynamoDBKeyAttribute {
  name: string;
  type: DynamoDBAttributeType;
}

export interface DynamoDBTableSpec {
  tableName: string;
  region: string;
  partitionKey: DynamoDBKeyAttribute;
  sortKey?: DynamoDBKeyAttribute;
  billingMode: DynamoDBBillingMode;
  readCapacity?: number;
  writeCapacity?: number;
  deletionProtection?: boolean;
}

export type DynamoDBTableResource = BaseResource<
  "dynamodb_table",
  DynamoDBTableSpec
>;

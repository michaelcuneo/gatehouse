import type { Provider } from "../types";

import {
  healthDynamoDBResource,
  reconcileDynamoDBResource,
} from "./reconcile";

export const dynamodbProvider: Provider = {
  name: "dynamodb",
  reconcile: reconcileDynamoDBResource,
  health: healthDynamoDBResource,
};

export * from "./validate";
export * from "./reconcile";

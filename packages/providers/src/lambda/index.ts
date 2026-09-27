import type { Provider } from "../types";

import {
  healthLambdaResource,
  reconcileLambdaResource,
} from "./reconcile";

export const lambdaProvider: Provider = {
  name: "lambda",
  reconcile: reconcileLambdaResource,
  health: healthLambdaResource,
};

export * from "./validate";
export * from "./reconcile";

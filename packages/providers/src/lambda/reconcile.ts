import {
  getLambdaFunctionConfiguration,
  lambdaConfigurationMatchesDesired,
  reconcileLambdaFunctionConfiguration,
} from "@gatehouse/aws";
import type {
  FunctionResource,
  Resource,
} from "@gatehouse/types";
import type { ProviderContext } from "../types";

import { validateLambdaResource } from "./validate";

function target(
  resource: Resource,
  context: ProviderContext,
): {
  resource: FunctionResource;
  stage: ProviderContext["projectStages"][number]["stage"];
} {
  validateLambdaResource(resource, context);

  if (resource.kind !== "function") {
    throw new Error("Lambda provider requires a function resource");
  }

  const stage = context.projectStages[0]?.stage;

  if (!stage) {
    throw new Error(
      "Lambda provider requires an attached project stage",
    );
  }

  return {
    resource,
    stage,
  };
}

export async function reconcileLambdaResource(
  resource: Resource,
  context: ProviderContext,
): Promise<void> {
  const resolved = target(resource, context);

  await reconcileLambdaFunctionConfiguration(
    resolved.stage,
    resolved.resource.spec,
  );
}

export async function healthLambdaResource(
  resource: Resource,
  context: ProviderContext,
) {
  const resolved = target(resource, context);
  const config = await getLambdaFunctionConfiguration(
    resolved.stage,
    resolved.resource.spec,
  );

  if (!config) {
    return {
      healthy: false,
      message: "Lambda function does not exist",
    };
  }

  const state = config.State ?? "Active";

  if (state !== "Active") {
    return {
      healthy: false,
      message: `Lambda function state is ${state}`,
    };
  }

  const healthy = lambdaConfigurationMatchesDesired(
    config,
    resolved.resource.spec,
  );

  return {
    healthy,
    message: healthy
      ? "Lambda configuration matches desired state"
      : "Lambda configuration differs from desired state",
  };
}

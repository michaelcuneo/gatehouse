import {
  GetFunctionConfigurationCommand,
  UpdateFunctionConfigurationCommand,
  type FunctionConfiguration,
} from "@aws-sdk/client-lambda";

import type { ManagedStage } from "@gatehouse/core";
import type { LambdaFunctionSpec } from "@gatehouse/types";

import { awsClientsForStage } from "./clients";

export async function getLambdaFunctionConfiguration(
  stage: ManagedStage,
  spec: Pick<LambdaFunctionSpec, "functionName" | "region">,
): Promise<FunctionConfiguration | null> {
  const lambda = awsClientsForStage(stage, spec.region).lambda;

  try {
    return await lambda.send(
      new GetFunctionConfigurationCommand({
        FunctionName: spec.functionName,
      }),
    );
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

export function lambdaConfigurationMatchesDesired(
  config: FunctionConfiguration,
  spec: LambdaFunctionSpec,
): boolean {
  const architecture = config.Architectures?.[0] ?? "x86_64";

  return (
    config.FunctionName === spec.functionName &&
    (config.Runtime ?? undefined) === (spec.runtime ?? undefined) &&
    (config.Handler ?? undefined) === (spec.handler ?? undefined) &&
    (config.MemorySize ?? 128) === spec.memorySize &&
    (config.Timeout ?? 3) === spec.timeout &&
    architecture === spec.architecture &&
    (config.Role ?? undefined) === (spec.roleArn ?? undefined)
  );
}

export async function reconcileLambdaFunctionConfiguration(
  stage: ManagedStage,
  spec: LambdaFunctionSpec,
): Promise<void> {
  const lambda = awsClientsForStage(stage, spec.region).lambda;
  const current = await getLambdaFunctionConfiguration(stage, spec);

  if (!current) {
    throw new Error(
      `Lambda function "${spec.functionName}" does not exist. GateHouse does not create Lambda code packages yet.`,
    );
  }

  if (lambdaConfigurationMatchesDesired(current, spec)) {
    return;
  }

  if (spec.roleArn && current.Role !== spec.roleArn) {
    throw new Error(
      "GateHouse does not change Lambda execution roles during safe adoption",
    );
  }

  await lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: spec.functionName,
      Runtime: spec.runtime as never,
      Handler: spec.handler,
      MemorySize: spec.memorySize,
      Timeout: spec.timeout,
    }),
  );
}

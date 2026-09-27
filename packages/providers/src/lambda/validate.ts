import type { Resource } from "@gatehouse/types";
import type { ProviderContext } from "../types";

export function validateLambdaResource(
  resource: Resource,
  context: ProviderContext,
): void {
  if (resource.kind !== "function") {
    throw new Error(
      `Lambda provider cannot manage resource kind "${resource.kind}"`,
    );
  }

  if (resource.spec.provider !== "lambda") {
    throw new Error("Function resource must use the Lambda provider");
  }

  if (resource.spec.codeMode !== "external") {
    throw new Error(
      "GateHouse only supports externally managed Lambda code packages currently",
    );
  }

  if (context.projectStages.length !== 1) {
    throw new Error(
      `Lambda function "${resource.name}" must belong to exactly one project stage`,
    );
  }

  if (!resource.spec.functionName.trim()) {
    throw new Error("Lambda function name is required");
  }

  if (!resource.spec.region.trim()) {
    throw new Error("Lambda region is required");
  }

  if (
    !Number.isInteger(resource.spec.memorySize) ||
    resource.spec.memorySize < 128
  ) {
    throw new Error("Lambda memory must be at least 128 MB");
  }

  if (
    !Number.isInteger(resource.spec.timeout) ||
    resource.spec.timeout < 1 ||
    resource.spec.timeout > 900
  ) {
    throw new Error("Lambda timeout must be between 1 and 900 seconds");
  }
}

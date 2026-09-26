import {
  DeleteStackCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
  UpdateStackCommand,
  type Capability,
  type Parameter,
} from "@aws-sdk/client-cloudformation";

import type { ManagedStage } from "@gatehouse/core";

import { awsClientsForStage } from "./clients";

export type CloudFormationMigrationPhase =
  | "ready"
  | "retention_update_pending"
  | "retention_applied"
  | "detach_pending"
  | "detached";

type TemplateResource = {
  Type?: string;
  DeletionPolicy?: string;
  UpdateReplacePolicy?: string;
  [key: string]: unknown;
};

type JsonTemplate = {
  Resources?: Record<string, TemplateResource>;
  Transform?: unknown;
  [key: string]: unknown;
};

function cloudFormation(
  stage: ManagedStage,
  region: string,
) {
  return awsClientsForStage(stage, region).cloudFormation;
}

function parseJsonTemplate(body: string | undefined): JsonTemplate {
  if (!body) {
    throw new Error("CloudFormation template body is unavailable");
  }

  try {
    const parsed = JSON.parse(body) as JsonTemplate;

    if (!parsed || typeof parsed !== "object") {
      throw new Error("CloudFormation template is not an object");
    }

    return parsed;
  } catch (cause) {
    throw new Error(
      `GateHouse automatic detach currently requires a JSON CloudFormation template: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

function assertPlainTemplate(template: JsonTemplate): Record<string, TemplateResource> {
  if (template.Transform) {
    throw new Error(
      "GateHouse will not automatically detach CloudFormation templates that use Transform/macros",
    );
  }

  const resources = template.Resources;

  if (!resources || !Object.keys(resources).length) {
    throw new Error("CloudFormation template has no resources");
  }

  for (const [logicalId, resource] of Object.entries(resources)) {
    const type = String(resource.Type ?? "");

    if (
      type === "AWS::CloudFormation::Stack" ||
      type === "AWS::CloudFormation::CustomResource" ||
      type.startsWith("Custom::")
    ) {
      throw new Error(
        `GateHouse will not automatically detach stack resource "${logicalId}" of type "${type}"`,
      );
    }
  }

  return resources;
}

function withRetention(template: JsonTemplate): JsonTemplate {
  const resources = assertPlainTemplate(template);

  return {
    ...template,
    Resources: Object.fromEntries(
      Object.entries(resources).map(([logicalId, resource]) => [
        logicalId,
        {
          ...resource,
          DeletionPolicy: "Retain",
          UpdateReplacePolicy: "Retain",
        },
      ]),
    ),
  };
}

function parametersUsingPreviousValue(
  parameters: Parameter[] | undefined,
): Parameter[] | undefined {
  if (!parameters?.length) {
    return undefined;
  }

  return parameters
    .filter((parameter) => parameter.ParameterKey)
    .map((parameter) => ({
      ParameterKey: parameter.ParameterKey,
      UsePreviousValue: true,
    }));
}

function capabilities(
  values: string[] | undefined,
): Capability[] | undefined {
  if (!values?.length) {
    return undefined;
  }

  return values as Capability[];
}

async function describeStack(
  stage: ManagedStage,
  region: string,
  stackId: string,
) {
  try {
    const result = await cloudFormation(stage, region).send(
      new DescribeStacksCommand({
        StackName: stackId,
      }),
    );

    return result.Stacks?.[0] ?? null;
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : String(cause);

    if (
      message.includes("does not exist") ||
      message.includes("does not exist")
    ) {
      return null;
    }

    throw cause;
  }
}

export async function applyCloudFormationRetention(
  stage: ManagedStage,
  region: string,
  stackId: string,
): Promise<void> {
  const cf = cloudFormation(stage, region);
  const described = await describeStack(stage, region, stackId);

  if (!described) {
    throw new Error("CloudFormation stack does not exist");
  }

  if (described.EnableTerminationProtection) {
    throw new Error(
      "CloudFormation termination protection must be disabled before GateHouse can prepare detach",
    );
  }

  const templateResult = await cf.send(
    new GetTemplateCommand({
      StackName: stackId,
      TemplateStage: "Original",
    }),
  );
  const template = withRetention(
    parseJsonTemplate(templateResult.TemplateBody),
  );

  await cf.send(
    new UpdateStackCommand({
      StackName: stackId,
      TemplateBody: JSON.stringify(template),
      Parameters: parametersUsingPreviousValue(described.Parameters),
      Capabilities: capabilities(described.Capabilities),
      RoleARN: described.RoleARN,
      NotificationARNs: described.NotificationARNs,
      Tags: described.Tags,
    }),
  );
}

export async function verifyCloudFormationRetention(
  stage: ManagedStage,
  region: string,
  stackId: string,
): Promise<{
  ready: boolean;
  status?: string;
}> {
  const cf = cloudFormation(stage, region);
  const described = await describeStack(stage, region, stackId);

  if (!described) {
    return {
      ready: false,
    };
  }

  if (described.StackStatus !== "UPDATE_COMPLETE") {
    return {
      ready: false,
      status: described.StackStatus,
    };
  }

  const templateResult = await cf.send(
    new GetTemplateCommand({
      StackName: stackId,
      TemplateStage: "Processed",
    }),
  );
  const template = parseJsonTemplate(templateResult.TemplateBody);
  const resources = assertPlainTemplate(template);

  const ready = Object.values(resources).every(
    (resource) =>
      resource.DeletionPolicy === "Retain" &&
      resource.UpdateReplacePolicy === "Retain",
  );

  return {
    ready,
    status: described.StackStatus,
  };
}

export async function detachCloudFormationStack(
  stage: ManagedStage,
  region: string,
  stackId: string,
): Promise<void> {
  const verified = await verifyCloudFormationRetention(
    stage,
    region,
    stackId,
  );

  if (!verified.ready) {
    throw new Error(
      `CloudFormation retention update is not verified yet${verified.status ? ` (stack status: ${verified.status})` : ""}`,
    );
  }

  const described = await describeStack(stage, region, stackId);

  if (!described) {
    throw new Error("CloudFormation stack no longer exists");
  }

  if (described.EnableTerminationProtection) {
    throw new Error(
      "CloudFormation termination protection must be disabled before detach",
    );
  }

  await cloudFormation(stage, region).send(
    new DeleteStackCommand({
      StackName: stackId,
      RoleARN: described.RoleARN,
    }),
  );
}

export async function cloudFormationStackExists(
  stage: ManagedStage,
  region: string,
  stackId: string,
): Promise<boolean> {
  return Boolean(
    await describeStack(stage, region, stackId),
  );
}

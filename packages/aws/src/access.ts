import { GetCallerIdentityCommand } from "@aws-sdk/client-sts";

import type { ManagedStage } from "@gatehouse/core";

import { awsClientsForStage } from "./clients";

export interface AwsStageIdentity {
  accountId: string;
  arn: string | null;
  userId: string | null;
  matchesConfiguredAccount: boolean;
}

export async function getAwsStageIdentity(
  stage: ManagedStage,
): Promise<AwsStageIdentity> {
  const { sts } = awsClientsForStage(stage);

  const result = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = result.Account ?? "";

  if (!accountId) {
    throw new Error(
      `AWS did not return an account ID for stage "${stage.name}"`,
    );
  }

  return {
    accountId,
    arn: result.Arn ?? null,
    userId: result.UserId ?? null,
    matchesConfiguredAccount: accountId === stage.accountId,
  };
}

export async function assertAwsStageAccess(stage: ManagedStage) {
  const identity = await getAwsStageIdentity(stage);

  if (!identity.matchesConfiguredAccount) {
    throw new Error(
      `AWS account mismatch for stage "${stage.name}": configured ${stage.accountId}, resolved ${identity.accountId}`,
    );
  }

  return identity;
}

import {
  AssumeRoleCommand,
  STSClient,
} from "@aws-sdk/client-sts";

import type { ManagedStage } from "@gatehouse/core";

type StageCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration?: Date;
};

type CachedCredentials = {
  credentials: StageCredentials;
  expiresAt: number;
};

const cache = new Map<string, CachedCredentials>();
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

function cacheKey(stage: ManagedStage) {
  if (stage.access.mode === "default") {
    return `default:${stage.accountId}:${stage.primaryRegion}`;
  }

  return [
    "assume-role",
    stage.accountId,
    stage.primaryRegion,
    stage.access.roleArn,
    stage.access.externalId ?? "",
    stage.access.sourceIdentity ?? "",
  ].join(":");
}

export function credentialsForStage(stage: ManagedStage) {
  if (stage.access.mode === "default") {
    return undefined;
  }

  return async () => {
    const key = cacheKey(stage);
    const cached = cache.get(key);

    if (cached && cached.expiresAt - Date.now() > REFRESH_WINDOW_MS) {
      return cached.credentials;
    }

    const sts = new STSClient({
      region: stage.primaryRegion,
    });

    const response = await sts.send(
      new AssumeRoleCommand({
        RoleArn: stage.access.roleArn,
        RoleSessionName: `gatehouse-${stage.id}`.slice(0, 64),
        ExternalId: stage.access.externalId,
        SourceIdentity: stage.access.sourceIdentity ?? "gatehouse-console",
        DurationSeconds: 3600,
      }),
    );

    const assumed = response.Credentials;

    if (
      !assumed?.AccessKeyId ||
      !assumed.SecretAccessKey ||
      !assumed.SessionToken
    ) {
      throw new Error(
        `STS AssumeRole did not return complete credentials for stage "${stage.name}"`,
      );
    }

    const credentials: StageCredentials = {
      accessKeyId: assumed.AccessKeyId,
      secretAccessKey: assumed.SecretAccessKey,
      sessionToken: assumed.SessionToken,
      expiration: assumed.Expiration,
    };

    cache.set(key, {
      credentials,
      expiresAt:
        assumed.Expiration?.getTime() ?? Date.now() + 55 * 60 * 1000,
    });

    return credentials;
  };
}

export function clearStageCredentialCache(stage?: ManagedStage) {
  if (!stage) {
    cache.clear();
    return;
  }

  cache.delete(cacheKey(stage));
}
